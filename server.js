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
    
    if (users.some(u => u.userId === userId)) return res.json({ success: false, message: "이미 존재하는 아이디입니다." });
    if (users.some(u => u.nickname === nickname)) return res.json({ success: false, message: "이미 존재하는 닉네임입니다." });

    const newUser = { 
        userId: userId.trim(), 
        password: password.trim(), 
        nickname: nickname.trim(), 
        role: userId.trim() === "Mint_pocky" ? "주인장" : "멤버", // 주인장 권한 고정
        profileImg: "", 
        profileDesc: "반갑습니다!", 
        bgImg: "" 
    };

    users.push(newUser);
    fs.writeFileSync(USER_FILE, JSON.stringify(users, null, 2));
    res.json({ success: true });
});

// 로그인
app.post('/api/login', (req, res) => {
    const { userId, password } = req.body;
    const user = users.find(u => u.userId === userId && u.password === password);
    
    if (user) {
        // 로그인 시점에 다시 한 번 역할 체크 (보안)
        user.role = (user.userId === "Mint_pocky") ? "주인장" : (cafeConfig.staffList.includes(user.nickname) ? "점원" : "멤버");
        res.json({ success: true, user });
    } else {
        res.json({ success: false, message: "아이디 또는 비밀번호가 올바르지 않습니다." });
    }
});

// 프로필 수정
app.post('/api/update-profile', (req, res) => {
    const { userId, nickname, profileImg, profileDesc, bgImg } = req.body;
    const idx = users.findIndex(u => u.userId === userId);
    
    if (idx !== -1) {
        // 본인 제외 닉네임 중복 체크
        if(users.some((u, i) => u.nickname === nickname && i !== idx)) {
            return res.json({ success: false, message: "이미 사용 중인 닉네임입니다." });
        }
        
        users[idx].nickname = nickname;
        users[idx].profileImg = profileImg;
        users[idx].profileDesc = profileDesc;
        users[idx].bgImg = bgImg;

        fs.writeFileSync(USER_FILE, JSON.stringify(users, null, 2));
        io.emit('update_users', users); // 실시간 반영
        res.json({ success: true, user: users[idx] });
    } else {
        res.json({ success: false, message: "유저 정보를 찾을 수 없습니다." });
    }
});

io.on('connection', (socket) => {
    socket.emit('load_all', { posts, config: cafeConfig, users });
    // ... (포스트 작성, 좋아요 등 기존 소켓 로직 동일)
});

server.listen(3000, "0.0.0.0", () => console.log("Server running on port 3000"));