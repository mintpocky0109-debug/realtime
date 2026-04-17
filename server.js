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

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/write', (req, res) => res.sendFile(path.join(__dirname, 'write.html')));

app.post('/api/signup', (req, res) => {
    const { userId, password, nickname } = req.body;
    if (users.some(u => u.userId === userId)) return res.json({ success: false });
    let role = (userId === "Mint_pocky") ? "주인장" : "멤버";
    users.push({ userId, password, nickname, role, profileImg: "", profileDesc: "", bgImg: "" });
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
    const user = users.find(u => u.userId === userId);
    if (user) {
        user.nickname = nickname; user.profileImg = profileImg; user.profileDesc = profileDesc; user.bgImg = bgImg;
        fs.writeFileSync(USER_FILE, JSON.stringify(users, null, 2));
        res.json({ success: true, user });
    }
});

io.on('connection', (socket) => {
    socket.emit('load_all', { posts, config: cafeConfig, users });
    
    socket.on('new_post', (data) => {
        const user = users.find(u => u.nickname === data.nickname);
        const newPost = { id: Date.now(), ...data, role: user?user.role:"멤버", time: new Date().toLocaleString(), likedBy: [], comments: [] };
        posts.push(newPost);
        fs.writeFileSync(DATA_FILE, JSON.stringify(posts, null, 2));
        io.emit('update_posts', posts);
    });

    socket.on('update_config', (data) => {
        if (data.adminNick !== "Mint_pocky") return; // 보안상 주인장만 가능
        cafeConfig = { ...cafeConfig, ...data.newConfig };
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(cafeConfig, null, 2));
        io.emit('update_config', cafeConfig);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => console.log(`Server running on ${PORT}`));