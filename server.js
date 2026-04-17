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

// ⭐ 주인장 아이디 설정 (본인이 가입할 아이디로 바꾸세요)
const ADMIN_ID = "Mintpocky"; 

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

// 라우팅: /write 접속 시 write.html 제공
app.get('/write', (req, res) => {
    res.sendFile(path.join(__dirname, 'write.html'));
});

// 회원가입: 중복 체크 및 어드민 고정
app.post('/api/signup', (req, res) => {
    const { userId, password, nickname } = req.body;
    if (users.some(u => u.userId === userId)) return res.json({ success: false, msg: "이미 존재하는 아이디입니다." });
    
    let role = (userId === ADMIN_ID) ? "주인장" : "멤버";
    users.push({ userId, password, nickname, role });
    
    if(role === "주인장") {
        cafeConfig.ownerNick = nickname;
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(cafeConfig, null, 2));
    }
    fs.writeFileSync(USER_FILE, JSON.stringify(users, null, 2));
    res.json({ success: true });
});

// 로그인
app.post('/api/login', (req, res) => {
    const { userId, password } = req.body;
    const user = users.find(u => u.userId === userId && u.password === password);
    if (user) {
        const role = (user.userId === ADMIN_ID) ? "주인장" : user.role;
        res.json({ success: true, user: { nickname: user.nickname, role: role } });
    } else {
        res.json({ success: false, msg: "아이디 또는 비밀번호가 틀렸습니다." });
    }
});

io.on('connection', (socket) => {
    socket.emit('load_all', { posts, config: cafeConfig, users });

    socket.on('new_post', (data) => {
        const user = users.find(u => u.nickname === data.nickname);
        const newPost = { 
            id: Date.now(), board: data.board, nickname: data.nickname, 
            role: user ? user.role : "멤버", content: data.content, 
            image: data.image, time: new Date().toLocaleString(), 
            likedBy: [], comments: [] 
        };
        posts.push(newPost);
        fs.writeFileSync(DATA_FILE, JSON.stringify(posts, null, 2));
        io.emit('update_posts', posts);
    });

    // 댓글 및 답글 통합 로직
    socket.on('new_comment', (data) => {
        const post = posts.find(p => p.id === data.postId);
        if(post) {
            const commentObj = {
                id: Date.now(),
                nickname: data.nickname,
                content: data.content,
                time: new Date().toLocaleTimeString(),
                replies: [] // 답글을 담을 배열
            };

            if (data.parentId) {
                // 답글인 경우
                const parentComment = post.comments.find(c => c.id === data.parentId);
                if (parentComment) parentComment.replies.push(commentObj);
            } else {
                // 일반 댓글인 경우
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