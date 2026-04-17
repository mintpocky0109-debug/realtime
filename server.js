const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);

// Render 배포 시 maxHttpBufferSize를 설정해줘야 큰 이미지 전송 시 끊기지 않습니다.
const io = new Server(server, { 
    maxHttpBufferSize: 5e7,
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(express.static(path.join(__dirname)));
app.use(express.json({ limit: '50mb' }));

const DATA_FILE = '/opt/render/project/src/data.json'; // Render의 지속성 디스크 경로 예시 (없으면 './data.json')
const CONFIG_FILE = './config.json';
const USER_FILE = './users.json';

// 파일 로드 함수 (파일이 없으면 빈 배열/객체 생성)
const loadJson = (file, defaultVal) => {
    try {
        if (fs.existsSync(file)) {
            return JSON.parse(fs.readFileSync(file, 'utf-8'));
        } else {
            fs.writeFileSync(file, JSON.stringify(defaultVal));
            return defaultVal;
        }
    } catch (e) { return defaultVal; }
};

let posts = loadJson('./data.json', []);
let users = loadJson(USER_FILE, []);
let cafeConfig = loadJson(CONFIG_FILE, {
    themeColor: "#2db400",
    cafeName: "☕ 카페 에스프레소",
    boards: ["자유게시판", "공지사항", "가입인사"],
    ownerNick: null,
    staffList: []
});

// API 경로 설정
app.post('/api/signup', (req, res) => {
    const { userId, password, nickname } = req.body;
    if (users.find(u => u.userId === userId)) return res.json({ success: false, msg: "이미 존재하는 아이디입니다." });
    let finalNick = nickname, role = "멤버";
    if (nickname.includes('#admin777')) {
        finalNick = nickname.replace('#admin777', '');
        if (!cafeConfig.ownerNick) {
            cafeConfig.ownerNick = finalNick;
            role = "주인장";
            fs.writeFileSync(CONFIG_FILE, JSON.stringify(cafeConfig, null, 2));
        }
    }
    users.push({ userId, password, nickname: finalNick, role });
    fs.writeFileSync(USER_FILE, JSON.stringify(users, null, 2));
    res.json({ success: true });
});

app.post('/api/login', (req, res) => {
    const { userId, password } = req.body;
    const user = users.find(u => u.userId === userId && u.password === password);
    if (user) res.json({ success: true, user: { nickname: user.nickname, role: user.role } });
    else res.json({ success: false, msg: "아이디 또는 비밀번호가 틀렸습니다." });
});

io.on('connection', (socket) => {
    socket.emit('load_all', { posts, config: cafeConfig, users });

    socket.on('new_post', (data) => {
        const user = users.find(u => u.nickname === data.nickname);
        const role = user ? (cafeConfig.ownerNick === user.nickname ? "주인장" : (cafeConfig.staffList.includes(user.nickname) ? "점원" : "멤버")) : "멤버";
        const newPost = { id: Date.now(), board: data.board, nickname: data.nickname, role: role, content: data.content, image: data.image, time: new Date().toLocaleString(), likedBy: [], comments: [] };
        posts.push(newPost);
        fs.writeFileSync('./data.json', JSON.stringify(posts, null, 2));
        io.emit('update_posts', posts);
    });

    socket.on('like_post', (data) => {
        const post = posts.find(p => p.id === data.postId);
        if(post && data.nickname) {
            const index = post.likedBy.indexOf(data.nickname);
            if(index === -1) post.likedBy.push(data.nickname);
            else post.likedBy.splice(index, 1);
            io.emit('update_posts', posts);
            fs.writeFileSync('./data.json', JSON.stringify(posts));
        }
    });

    socket.on('new_comment', (data) => {
        const post = posts.find(p => p.id === data.postId);
        if(post) {
            post.comments.push({ id: Date.now(), nickname: data.nickname, content: data.content, time: new Date().toLocaleTimeString() });
            io.emit('update_posts', posts);
            fs.writeFileSync('./data.json', JSON.stringify(posts));
        }
    });

    socket.on('admin_action', (data) => {
        const isOwner = data.adminNick === cafeConfig.ownerNick;
        if (data.type === 'config' && (isOwner || cafeConfig.staffList.includes(data.adminNick))) {
            cafeConfig = { ...cafeConfig, ...data.config };
            fs.writeFileSync(CONFIG_FILE, JSON.stringify(cafeConfig, null, 2));
            io.emit('update_config', cafeConfig);
        }
    });
});

// Render 배포 핵심: process.env.PORT 사용
const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is running on port ${PORT}`);
});