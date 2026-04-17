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

const loadJson = (file, def) => { try { return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf-8')) : def; } catch { return def; } };

let posts = loadJson(DATA_FILE, []);
let users = loadJson(USER_FILE, []);
let cafeConfig = loadJson(CONFIG_FILE, { cafeName: "☕ 카페 에스프레소", boards: ["자유게시판", "공지사항", "가입인사"], staffList: [] });

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/write', (req, res) => res.sendFile(path.join(__dirname, 'write.html')));

app.post('/api/signup', (req, res) => {
    const { userId, password, nickname } = req.body;
    if (users.some(u => u.userId === userId)) return res.json({ success: false });
    users.push({ userId, password, nickname, role: userId === "Mint_pocky" ? "주인장" : "멤버", profileImg: "", profileDesc: "안녕하세요!", bgImg: "" });
    fs.writeFileSync(USER_FILE, JSON.stringify(users, null, 2));
    res.json({ success: true });
});

app.post('/api/login', (req, res) => {
    const { userId, password } = req.body;
    const user = users.find(u => u.userId === userId && u.password === password);
    if (user) {
        user.role = (user.userId === "Mint_pocky") ? "주인장" : (cafeConfig.staffList.includes(user.nickname) ? "점원" : "멤버");
        res.json({ success: true, user });
    } else res.json({ success: false });
});

app.post('/api/update-profile', (req, res) => {
    const { userId, nickname, profileImg, profileDesc, bgImg } = req.body;
    const idx = users.findIndex(u => u.userId === userId);
    if (idx !== -1) {
        users[idx] = { ...users[idx], nickname, profileImg, profileDesc, bgImg };
        fs.writeFileSync(USER_FILE, JSON.stringify(users, null, 2));
        res.json({ success: true, user: users[idx] });
    } else res.json({ success: false });
});

io.on('connection', (socket) => {
    socket.emit('load_all', { posts, config: cafeConfig, users });

    socket.on('new_post', (data) => {
        const user = users.find(u => u.nickname === data.nickname);
        const newPost = { id: Date.now(), ...data, role: user?user.role:"멤버", profileImg: user?user.profileImg:"", time: new Date().toLocaleString(), likedBy: [], comments: [] };
        posts.push(newPost);
        fs.writeFileSync(DATA_FILE, JSON.stringify(posts, null, 2));
        io.emit('update_posts', posts);
    });

    // 1번 요청: 커피 쏘기 토글 로직
    socket.on('toggle_like', ({ postId, userId }) => {
        const post = posts.find(p => p.id === postId);
        if (!post) return;
        if (!post.likedBy) post.likedBy = [];
        const idx = post.likedBy.indexOf(userId);
        if (idx === -1) post.likedBy.push(userId); // 처음 누르면 추가
        else post.likedBy.splice(idx, 1); // 다시 누르면 삭제
        fs.writeFileSync(DATA_FILE, JSON.stringify(posts, null, 2));
        io.emit('update_posts', posts);
    });

    socket.on('update_config', (data) => {
        cafeConfig = { ...cafeConfig, ...data.newConfig };
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(cafeConfig, null, 2));
        io.emit('update_config', cafeConfig);
    });
});

server.listen(process.env.PORT || 3000, "0.0.0.0", () => console.log("Server running"));