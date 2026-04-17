const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 5e7 });

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname))); 

const DATA_FILE = path.join(__dirname, 'data.json');
const CONFIG_FILE = path.join(__dirname, 'config.json');

let messages = fs.existsSync(DATA_FILE) ? JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')) : [];
// 초기 카페 설정
let cafeConfig = fs.existsSync(CONFIG_FILE) ? JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8')) : {
    themeColor: "#2db400", // 기본 네이버 그린
    cafeName: "🚀 우리들의 비밀 커뮤니티"
};

let userRoles = { "주인장": "주인장" };

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/write', (req, res) => res.sendFile(path.join(__dirname, 'write.html')));

io.on('connection', (socket) => {
    socket.emit('load_history', messages);
    socket.emit('update_role_list', userRoles);
    socket.emit('update_config', cafeConfig); // 접속 시 카페 설정 전달

    // 역할 변경
    socket.on('change_role', (data) => {
        const actorRole = userRoles[data.adminNick];
        if (actorRole === '주인장' || (actorRole === '점원' && data.newRole === '멤버')) {
            userRoles[data.targetNick] = data.newRole;
            io.emit('update_role_list', userRoles);
        }
    });

    // [신규] 카페 테마/이름 변경
    socket.on('update_cafe_settings', (data) => {
        if (userRoles[data.adminNick] === '주인장' || userRoles[data.adminNick] === '점원') {
            cafeConfig.themeColor = data.themeColor || cafeConfig.themeColor;
            cafeConfig.cafeName = data.cafeName || cafeConfig.cafeName;
            fs.writeFileSync(CONFIG_FILE, JSON.stringify(cafeConfig));
            io.emit('update_config', cafeConfig);
        }
    });

    socket.on('clear_all_posts', (adminNick) => {
        if (userRoles[adminNick] === '주인장') {
            messages = [];
            fs.writeFileSync(DATA_FILE, JSON.stringify(messages));
            io.emit('load_history', messages);
        }
    });

    socket.on('new_post', (data) => {
        let role = userRoles[data.nickname] || "멤버";
        if (data.nickname.includes('#master123')) {
            const realNick = data.nickname.split('#')[0];
            userRoles[realNick] = "주인장";
            data.nickname = realNick;
            role = "주인장";
        }
        const messageData = {
            nickname: data.nickname, content: data.content, image: data.image, 
            role: role, isNotice: data.isNotice,
            time: new Date().toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul' })
        };
        messages.push(messageData);
        fs.writeFileSync(DATA_FILE, JSON.stringify(messages, null, 2));
        io.emit('show_post', messageData);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => console.log(`서버 작동 중: ${PORT}`));