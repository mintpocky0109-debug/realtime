const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { 
    maxHttpBufferSize: 5e7,
    cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(express.static(path.join(__dirname)));
app.use(express.json({ limit: '50mb' }));

const DATA_FILE = './data.json';
const CONFIG_FILE = './config.json';
const USER_FILE = './users.json';

// ⭐ 이 부분을 본인이 사용할 아이디로 정확히 수정하세요! (예: "myid123")
const ADMIN_ID = "Mint_pocky"; 

const loadJson = (file, defaultVal) => {
    try {
        return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf-8')) : defaultVal;
    } catch (e) { return defaultVal; }
};

let posts = loadJson(DATA_FILE, []);
let users = loadJson(USER_FILE, []);
let cafeConfig = loadJson(CONFIG_FILE, {
    themeColor: "#2db400",
    cafeName: "☕ 카페 에스프레소",
    boards: ["자유게시판", "공지사항", "가입인사"],
    ownerNick: null,
    staffList: []
});

app.get('/write', (req, res) => {
    res.sendFile(path.join(__dirname, 'write.html'));
});

// 회원가입
app.post('/api/signup', (req, res) => {
    const { userId, password, nickname } = req.body;
    if (users.some(u => u.userId === userId)) return res.json({ success: false, msg: "이미 존재하는 아이디입니다." });
    
    // 가입할 때 아이디가 ADMIN_ID면 주인장으로 저장
    let role = (userId === ADMIN_ID) ? "주인장" : "멤버";
    const newUser = { userId, password, nickname, role };
    users.push(newUser);
    
    if(role === "주인장") {
        cafeConfig.ownerNick = nickname;
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(cafeConfig, null, 2));
    }
    fs.writeFileSync(USER_FILE, JSON.stringify(users, null, 2));
    res.json({ success: true });
});

// 로그인 (여기서 한 번 더 강제로 주인장 권한 부여)
app.post('/api/login', (req, res) => {
    const { userId, password } = req.body;
    const user = users.find(u => u.userId === userId && u.password === password);
    if (user) {
        // ⭐ 핵심: 데이터베이스에 상관없이 아이디가 일치하면 무조건 주인장으로 로그인됨
        let finalRole = (user.userId === ADMIN_ID) ? "주인장" : user.role;
        res.json({ success: true, user: { nickname: user.nickname, role: finalRole } });
    } else {
        res.json({ success: false, msg: "아이디 또는 비밀번호가 틀렸습니다." });
    }
});

io.on('connection', (socket) => {
    socket.emit('load_all', { posts, config: cafeConfig, users });

    socket.on('new_post', (data) => {
        const user = users.find(u => u.nickname === data.nickname);
        // 글 쓸 때도 아이디를 다시 체크해서 역할 부여
        let currentRole = "멤버";
        if (user) {
            currentRole = (user.userId === ADMIN_ID) ? "주인장" : user.role;
        }
        
        const newPost = { 
            id: Date.now(), board: data.board, nickname: data.nickname, 
            role: currentRole, content: data.content, 
            image: data.image, time: new Date().toLocaleString(), 
            likedBy: [], comments: [] 
        };
        posts.push(newPost);
        fs.writeFileSync(DATA_FILE, JSON.stringify(posts, null, 2));
        io.emit('update_posts', posts);
    });

    socket.on('new_comment', (data) => {
        const post = posts.find(p => p.id === data.postId);
        if(post) {
            const commentObj = {
                id: Date.now(), nickname: data.nickname,
                content: data.content, time: new Date().toLocaleTimeString(),
                replies: []
            };
            if (data.parentId) {
                const parent = post.comments.find(c => c.id === data.parentId);
                if (parent) parent.replies.push(commentObj);
            } else {
                post.comments.push(commentObj);
            }
            fs.writeFileSync(DATA_FILE, JSON.stringify(posts, null, 2));
            io.emit('update_posts', posts);
        }
    });

    socket.on('like_post', (data) => {
        const post = posts.find(p => p.id === data.postId);
        if(post) {
            const idx = post.likedBy.indexOf(data.nickname);
            if(idx === -1) post.likedBy.push(data.nickname);
            else post.likedBy.splice(idx, 1);
            fs.writeFileSync(DATA_FILE, JSON.stringify(posts));
            io.emit('update_posts', posts);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => console.log(`Server running on port ${PORT}`));