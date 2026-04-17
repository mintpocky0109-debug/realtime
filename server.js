const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
// 파일 업로드(이미지)를 위해 용량 제한을 50mb로 설정
const io = new Server(server, { maxHttpBufferSize: 5e7, cors: { origin: "*" } });

app.use(express.static(path.join(__dirname)));
app.use(express.json({ limit: '50mb' }));

const DATA_FILE = './data.json';
const CONFIG_FILE = './config.json';
const USER_FILE = './users.json';

// JSON 파일 로드 함수
const loadJson = (file, def) => { 
    try { 
        return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf-8')) : def; 
    } catch { 
        return def; 
    } 
};

let posts = loadJson(DATA_FILE, []);
let users = loadJson(USER_FILE, []);
let cafeConfig = loadJson(CONFIG_FILE, { 
    cafeName: "☕ 카페 에스프레소", 
    boards: ["자유게시판", "공지사항", "가입인사"], 
    staffList: [] 
});

// 기본 경로 설정
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/write', (req, res) => res.sendFile(path.join(__dirname, 'write.html')));

// --- 2번 요청: 회원가입 로직 (검증 강화) ---
app.post('/api/signup', (req, res) => {
    const { userId, password, nickname } = req.body;
    
    // 빈칸 검사
    if (!userId || !password || !nickname) {
        return res.json({ success: false, message: "아이디, 비밀번호, 닉네임을 모두 입력해주세요." });
    }
    
    // 아이디 중복 검사
    if (users.some(u => u.userId === userId)) {
        return res.json({ success: false, message: "이미 존재하는 아이디입니다." });
    }
    
    // 닉네임 중복 검사
    if (users.some(u => u.nickname === nickname)) {
        return res.json({ success: false, message: "이미 존재하는 닉네임입니다." });
    }

    const newUser = { 
        userId, 
        password, 
        nickname, 
        role: userId === "Mint_pocky" ? "주인장" : "멤버", 
        profileImg: "", 
        profileDesc: "안녕하세요!", 
        bgImg: "" 
    };
    
    users.push(newUser);
    fs.writeFileSync(USER_FILE, JSON.stringify(users, null, 2));
    res.json({ success: true });
});

// --- 2번 요청: 로그인 로직 (역할 갱신 포함) ---
app.post('/api/login', (req, res) => {
    const { userId, password } = req.body;
    const user = users.find(u => u.userId === userId && u.password === password);
    
    if (user) {
        // 최신 권한 정보 갱신 (주인장/점원/멤버)
        user.role = (user.userId === "Mint_pocky") ? "주인장" : (cafeConfig.staffList.includes(user.nickname) ? "점원" : "멤버");
        res.json({ success: true, user });
    } else {
        res.json({ success: false, message: "아이디 또는 비밀번호가 올바르지 않습니다." });
    }
});

// --- 1번 요청: 프로필 업데이트 로직 ---
app.post('/api/update-profile', (req, res) => {
    const { userId, nickname, profileImg, profileDesc, bgImg } = req.body;
    const idx = users.findIndex(u => u.userId === userId);
    
    if (idx !== -1) {
        // 닉네임 변경 시 기존 닉네임과 중복 여부 확인 (본인 제외)
        if (users.some((u, i) => u.nickname === nickname && i !== idx)) {
            return res.json({ success: false, message: "이미 존재하는 닉네임입니다." });
        }

        // 유저 정보 업데이트
        users[idx] = { ...users[idx], nickname, profileImg, profileDesc, bgImg };
        fs.writeFileSync(USER_FILE, JSON.stringify(users, null, 2));
        
        // 전체 유저 정보가 바뀌었으므로 모든 접속자에게 알림 (프로필 실시간 반영을 위함)
        io.emit('update_users', users);
        res.json({ success: true, user: users[idx] });
    } else {
        res.json({ success: false, message: "유저를 찾을 수 없습니다." });
    }
});

// --- 실시간 통신 (Socket.io) ---
io.on('connection', (socket) => {
    // 최초 접속 시 전체 데이터 전송
    socket.emit('load_all', { posts, config: cafeConfig, users });

    // 새 글 등록
    socket.on('new_post', (data) => {
        const user = users.find(u => u.nickname === data.nickname);
        const newPost = { 
            id: Date.now(), 
            ...data, 
            role: user ? user.role : "멤버", 
            profileImg: user ? user.profileImg : "", 
            time: new Date().toLocaleString(), 
            likedBy: [], 
            comments: [] 
        };
        posts.push(newPost);
        fs.writeFileSync(DATA_FILE, JSON.stringify(posts, null, 2));
        io.emit('update_posts', posts);
    });

    // 커피 쏘기 (좋아요) 토글
    socket.on('toggle_like', ({ postId, userId }) => {
        const post = posts.find(p => p.id === postId);
        if (!post) return;
        
        if (!post.likedBy) post.likedBy = [];
        const idx = post.likedBy.indexOf(userId);
        
        if (idx === -1) {
            post.likedBy.push(userId); // 좋아요 추가
        } else {
            post.likedBy.splice(idx, 1); // 좋아요 취소
        }
        
        fs.writeFileSync(DATA_FILE, JSON.stringify(posts, null, 2));
        io.emit('update_posts', posts);
    });

    // 카페 설정 변경 (카페 이름, 게시판 목록, 점원 목록 등)
    socket.on('update_config', (data) => {
        cafeConfig = { ...cafeConfig, ...data.newConfig };
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(cafeConfig, null, 2));
        
        // 권한 정보가 바뀌었을 수 있으므로 전체 공지
        io.emit('update_config', cafeConfig);
    });
});

// 서버 실행
const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => console.log(`Server running on port ${PORT}`));