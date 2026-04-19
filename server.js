// server.js
process.env.TZ = 'Asia/Seoul';
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

const DEFAULT_PF = "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23DBDBDB'%3E%3Crect width='24' height='24' fill='%23F0F0F0'/%3E%3Cpath d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'/%3E%3C/svg%3E";

const loadJson = (file, def) => { 
    try { 
        if (fs.existsSync(file)) {
            return JSON.parse(fs.readFileSync(file, 'utf-8'));
        }
        return def;
    } catch (err) { 
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

// 파일 저장 함수
const saveAll = () => {
    fs.writeFileSync(DATA_FILE, JSON.stringify(posts, null, 2));
    fs.writeFileSync(USER_FILE, JSON.stringify(users, null, 2));
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cafeConfig, null, 2));
};

app.get('/write', (req, res) => { 
    res.sendFile(path.join(__dirname, 'write.html')); 
});

app.post('/api/signup', (req, res) => {
    const { userId, password, nickname } = req.body;
    if (!userId || !password || !nickname) return res.json({ success: false, message: "모든 항목을 입력해주세요." });
    
    if (users.some(u => u.userId === userId.trim())) {
        return res.json({ success: false, message: "이미 존재하는 아이디입니다." });
    }
    if (users.some(u => u.nickname === nickname.trim())) {
        return res.json({ success: false, message: "이미 사용 중인 닉네임입니다." });
    }
    
    const newUser = { 
        userId: userId.trim(), 
        password: password.trim(), 
        nickname: nickname.trim(), 
        role: userId.trim() === "Mint_pocky" ? "주인장" : "멤버", 
        profileImg: DEFAULT_PF, 
        profileDesc: "반갑습니다!", 
        bgImg: "" 
    };
    users.push(newUser);
    saveAll();
    res.json({ success: true });
});

app.post('/api/login', (req, res) => {
    const { userId, password } = req.body;
    const user = users.find(u => u.userId === userId && u.password === password);
    if (user) {
        // 접속 시 실시간 역할 갱신 (주인장 아이디는 무조건 주인장)
        user.role = (user.userId === "Mint_pocky") ? "주인장" : (cafeConfig.staffList.includes(user.userId) ? "점원" : "멤버");
        res.json({ success: true, user });
    } else {
        res.json({ success: false, message: "아이디 또는 비밀번호가 틀렸습니다." });
    }
});

app.post('/api/update-profile', (req, res) => {
    const { userId, nickname, profileImg, profileDesc, bgImg } = req.body;
    const idx = users.findIndex(u => u.userId === userId);
    if (idx !== -1) {
        if (users.some((u, i) => i !== idx && u.nickname === nickname.trim())) {
            return res.json({ success: false, message: "이미 사용 중인 닉네임입니다." });
        }
        users[idx].nickname = nickname;
        users[idx].profileImg = profileImg || DEFAULT_PF;
        users[idx].profileDesc = profileDesc;
        users[idx].bgImg = bgImg;
        saveAll();
        io.emit('update_users', users);
        res.json({ success: true, user: users[idx] });
    } else {
        res.json({ success: false });
    }
});

app.post('/api/admin/manage-user', (req, res) => {
    const { adminId, targetId, action } = req.body;
    const admin = users.find(u => u.userId === adminId);
    if (!admin || (admin.role !== '주인장' && admin.role !== '점원')) return res.json({ success: false });

    const targetIdx = users.findIndex(u => u.userId === targetId);
    if (targetIdx === -1) return res.json({ success: false });

    if (action === 'promote' && admin.role === '주인장') { 
        if (!cafeConfig.staffList.includes(targetId)) cafeConfig.staffList.push(targetId);
    } else if (action === 'demote' && admin.role === '주인장') { 
        cafeConfig.staffList = cafeConfig.staffList.filter(id => id !== targetId); 
    } else if (action === 'kick') { 
        if (users[targetIdx].userId !== "Mint_pocky") users.splice(targetIdx, 1);
    }
    saveAll();
    io.emit('update_users', users);
    res.json({ success: true });
});

io.on('connection', (socket) => {
    socket.emit('load_all', { posts, config: cafeConfig, users });
    
    socket.on('new_post', (data) => {
        const newPost = { 
            id: Date.now(), 
            ...data, 
            time: new Date().toLocaleString(), 
            likedBy: [], 
            comments: [] 
        };
        posts.push(newPost);
        saveAll();
        io.emit('update_posts', posts);
    });

    socket.on('edit_post', ({ postId, userId, newContent }) => {
        const post = posts.find(p => p.id === postId);
        if (post && post.userId === userId) {
            post.content = newContent;
            saveAll();
            io.emit('update_posts', posts);
        }
    });

    socket.on('delete_post', ({ postId, userId }) => {
        const idx = posts.findIndex(p => p.id === postId);
        if (idx !== -1 && (posts[idx].userId === userId || userId === "Mint_pocky")) {
            posts.splice(idx, 1);
            saveAll();
            io.emit('update_posts', posts);
        }
    });

    socket.on('toggle_like', ({ postId, userId }) => {
        const post = posts.find(p => p.id === postId);
        if (post && userId) {
            if (!post.likedBy) post.likedBy = [];
            const idx = post.likedBy.indexOf(userId);
            if (idx === -1) post.likedBy.push(userId);
            else post.likedBy.splice(idx, 1);
            saveAll();
            io.emit('update_posts', posts);
        }
    });

    socket.on('new_comment', ({ postId, commentId, data }) => {
        const post = posts.find(p => p.id === postId);
        if (!post) return;
        if (!post.comments) post.comments = [];
        
        if (commentId) {
            const parent = post.comments.find(c => c.id === commentId);
            if (parent) {
                if (!parent.replies) parent.replies = [];
                parent.replies.push({ id: Date.now(), ...data, time: new Date().toLocaleString(), likedBy: [] });
            }
        } else {
            post.comments.push({ id: Date.now(), ...data, time: new Date().toLocaleString(), likedBy: [], replies: [] });
        }
        saveAll();
        io.emit('update_posts', posts);
    });

    socket.on('toggle_comment_like', ({ postId, commentId, replyId, userId }) => {
        const post = posts.find(p => p.id === postId);
        if (!post || !userId) return;
        const comment = post.comments.find(c => c.id === commentId);
        if (!comment) return;
        let target = replyId ? (comment.replies || []).find(r => r.id === replyId) : comment;
        if (target) {
            if (!target.likedBy) target.likedBy = [];
            const idx = target.likedBy.indexOf(userId);
            if (idx === -1) target.likedBy.push(userId);
            else target.likedBy.splice(idx, 1);
            saveAll();
            io.emit('update_posts', posts);
        }
    });
});

server.listen(3000, "0.0.0.0", () => {
    console.log("Server is running on http://0.0.0.0:3000");
});