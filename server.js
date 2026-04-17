const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 5e7, cors: { origin: "*" } });

app.use(express.static(path.join(__dirname)));
app.use(express.json({ limit: '50mb' }));

const DATA_FILE = './data.json';
const CONFIG_FILE = './config.json';
const USER_FILE = './users.json';

// JSON 로드 유틸리티
const loadJson = (file, def) => { 
    try { return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf-8')) : def; } 
    catch { return def; } 
};

let posts = loadJson(DATA_FILE, []);
let users = loadJson(USER_FILE, []);
let cafeConfig = loadJson(CONFIG_FILE, { cafeName: "☕ 카페 에스프레소", boards: ["자유게시판", "공지사항", "가입인사"], staffList: [] });

// 회원가입
app.post('/api/signup', (req, res) => {
    const { userId, password, nickname } = req.body;
    if (!userId || !password || !nickname) return res.json({ success: false, message: "모든 항목을 입력해주세요." });
    if (users.some(u => u.userId === userId)) return res.json({ success: false, message: "이미 사용 중인 아이디입니다." });
    if (users.some(u => u.nickname === nickname)) return res.json({ success: false, message: "이미 사용 중인 닉네임입니다." });
    
    users.push({ 
        userId, password, nickname, 
        role: userId === "Mint_pocky" ? "주인장" : "멤버", 
        profileImg: "", profileDesc: "안녕하세요!", bgImg: "" 
    });
    fs.writeFileSync(USER_FILE, JSON.stringify(users, null, 2));
    res.json({ success: true });
});

// 로그인
app.post('/api/login', (req, res) => {
    const { userId, password } = req.body;
    const user = users.find(u => u.userId === userId && u.password === password);
    if (user) {
        user.role = (user.userId === "Mint_pocky") ? "주인장" : (cafeConfig.staffList.includes(user.nickname) ? "점원" : "멤버");
        res.json({ success: true, user });
    } else res.json({ success: false, message: "아이디 또는 비밀번호가 틀립니다." });
});

// 프로필 수정 (핵심 해결 부분)
app.post('/api/update-profile', (req, res) => {
    const { userId, nickname, profileImg, profileDesc, bgImg } = req.body;
    
    if (!userId) return res.json({ success: false, message: "유저 아이디가 누락되었습니다." });

    // 1. userId로 먼저 찾고, 없으면 nickname으로 검색 (안전장치)
    let idx = users.findIndex(u => u.userId === userId);
    if (idx === -1) idx = users.findIndex(u => u.nickname === nickname);
    
    if (idx !== -1) {
        // 2. 닉네임 중복 체크 (본인 제외)
        const isDup = users.some((u, i) => u.nickname === nickname && i !== idx);
        if(isDup) return res.json({ success: false, message: "이미 사용 중인 닉네임입니다." });
        
        // 3. 데이터 업데이트
        users[idx].nickname = nickname;
        users[idx].profileImg = profileImg;
        users[idx].profileDesc = profileDesc;
        users[idx].bgImg = bgImg;

        fs.writeFileSync(USER_FILE, JSON.stringify(users, null, 2));
        
        // 4. 전체 유저에게 업데이트 알림 (실시간 반영용)
        io.emit('update_users', users);
        
        res.json({ success: true, user: users[idx] });
    } else {
        res.json({ success: false, message: "서버에서 해당 유저를 찾을 수 없습니다." });
    }
});

io.on('connection', (socket) => {
    socket.emit('load_all', { posts, config: cafeConfig, users });

    socket.on('new_post', (data) => {
        const user = users.find(u => u.nickname === data.nickname);
        const newPost = { 
            id: Date.now(), ...data, 
            role: user ? user.role : "멤버", 
            profileImg: user ? user.profileImg : "", 
            time: new Date().toLocaleString(), 
            likedBy: [], comments: [] 
        };
        posts.push(newPost);
        fs.writeFileSync(DATA_FILE, JSON.stringify(posts, null, 2));
        io.emit('update_posts', posts);
    });

    socket.on('toggle_like', ({ postId, userId }) => {
        const post = posts.find(p => p.id === postId);
        if (!post) return;
        if (!post.likedBy) post.likedBy = [];
        const idx = post.likedBy.indexOf(userId);
        if (idx === -1) post.likedBy.push(userId);
        else post.likedBy.splice(idx, 1);
        fs.writeFileSync(DATA_FILE, JSON.stringify(posts, null, 2));
        io.emit('update_posts', posts);
    });
});

server.listen(process.env.PORT || 3000, "0.0.0.0", () => console.log("Server running on port 3000"));