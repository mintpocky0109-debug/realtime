const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { 
    maxHttpBufferSize: 5e7, 
    cors: { origin: "*" } 
});

app.use(express.static(path.join(__dirname)));
app.use(express.json({ limit: '50mb' }));

const DATA_FILE = './data.json';
const CONFIG_FILE = './config.json';
const USER_FILE = './users.json';

// ⭐ 이 아이디로 가입하면 무조건 주인장이 됩니다. (본인 아이디로 수정 가능)
const ADMIN_ID = "Mint_pocky"; 

const loadJson = (file, defaultVal) => {
    try { return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf-8')) : defaultVal; }
    catch (e) { return defaultVal; }
};

let posts = loadJson(DATA_FILE, []);
let users = loadJson(USER_FILE, []);
let cafeConfig = loadJson(CONFIG_FILE, {
    themeColor: "#2db400",
    cafeName: "☕ 카페 에스프레소",
    boards: ["자유게시판", "공지사항", "가입인사"],
    staffList: [] 
});

// Render 배포용 라우팅
app.get('/write', (req, res) => res.sendFile(path.join(__dirname, 'write.html')));

// 회원가입 (중복 아이디 체크 + 프로필 초기화)
app.post('/api/signup', (req, res) => {
    const { userId, password, nickname } = req.body;
    if (users.some(u => u.userId === userId)) return res.json({ success: false, msg: "이미 존재하는 아이디입니다." });
    
    let role = (userId === ADMIN_ID) ? "주인장" : "멤버";
    const newUser = { 
        userId, password, nickname, role,
        profileImg: "", profileDesc: "반갑습니다!", bgImg: "" 
    };
    users.push(newUser);
    fs.writeFileSync(USER_FILE, JSON.stringify(users, null, 2));
    res.json({ success: true });
});

// 로그인 (권한 실시간 갱신)
app.post('/api/login', (req, res) => {
    const { userId, password } = req.body;
    const user = users.find(u => u.userId === userId && u.password === password);
    if (user) {
        user.role = (user.userId === ADMIN_ID) ? "주인장" : (cafeConfig.staffList.includes(user.nickname) ? "점원" : "멤버");
        res.json({ success: true, user });
    } else res.json({ success: false, msg: "정보가 올바르지 않습니다." });
});

// 내 프로필 업데이트
app.post('/api/update-profile', (req, res) => {
    const { userId, nickname, profileImg, profileDesc, bgImg } = req.body;
    const user = users.find(u => u.userId === userId);
    if (user) {
        user.nickname = nickname;
        user.profileImg = profileImg;
        user.profileDesc = profileDesc;
        user.bgImg = bgImg;
        fs.writeFileSync(USER_FILE, JSON.stringify(users, null, 2));
        res.json({ success: true, user });
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
            time: new Date().toLocaleString(), likedBy: [], comments: [] 
        };
        posts.push(newPost);
        fs.writeFileSync(DATA_FILE, JSON.stringify(posts, null, 2));
        io.emit('update_posts', posts);
    });

    socket.on('new_comment', (data) => {
        const post = posts.find(p => p.id === data.postId);
        if(post) {
            const user = users.find(u => u.nickname === data.nickname);
            const commentObj = { 
                id: Date.now(), nickname: data.nickname, 
                profileImg: user ? user.profileImg : "",
                content: data.content, time: new Date().toLocaleTimeString(), 
                replies: [] 
            };
            if (data.parentId) {
                const parent = post.comments.find(c => c.id === data.parentId);
                if (parent) parent.replies.push(commentObj);
            } else post.comments.push(commentObj);
            fs.writeFileSync(DATA_FILE, JSON.stringify(posts, null, 2));
            io.emit('update_posts', posts);
        }
    });

    socket.on('update_config', (data) => {
        const user = users.find(u => u.nickname === data.adminNick);
        if (!user || (user.role !== '주인장' && user.role !== '점원')) return;
        if (user.role === '점원') delete data.newConfig.staffList; // 점원은 점원관리 불가
        cafeConfig = { ...cafeConfig, ...data.newConfig };
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(cafeConfig, null, 2));
        io.emit('update_config', cafeConfig);
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

// Render 배포 핵심 설정
const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => console.log(`Server is running on port ${PORT}`));