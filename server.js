const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 5e7 });

app.use(express.static(path.join(__dirname)));
app.use(express.json({ limit: '50mb' }));

const DATA_FILE = './data.json';
const CONFIG_FILE = './config.json';

let messages = fs.existsSync(DATA_FILE) ? JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')) : [];
let cafeConfig = fs.existsSync(CONFIG_FILE) ? JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8')) : {
    themeColor: "#2db400",
    bgColor: "#1e1f22",
    cafeName: "🚀 내 전용 커뮤니티"
};

let userRoles = { "주인장": "주인장" };
let blackList = []; // 차단된 유저 목록

io.on('connection', (socket) => {
    socket.emit('load_history', messages);
    socket.emit('update_role_list', userRoles);
    socket.emit('update_config', cafeConfig);

    socket.on('new_post', (data) => {
        const pureNick = data.nickname.split('#')[0];
        if (blackList.includes(pureNick)) return socket.emit('alert', '차단된 유저입니다.');

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
        fs.writeFileSync(DATA_FILE, JSON.stringify(messages));
        io.emit('show_post', messageData);
    });

    socket.on('update_cafe_settings', (data) => {
        if (userRoles[data.adminNick] === '주인장') {
            cafeConfig = { ...cafeConfig, ...data.settings };
            fs.writeFileSync(CONFIG_FILE, JSON.stringify(cafeConfig));
            io.emit('update_config', cafeConfig);
        }
    });

    socket.on('clear_all', (adminNick) => {
        if (userRoles[adminNick] === '주인장') {
            messages = [];
            fs.writeFileSync(DATA_FILE, JSON.stringify(messages));
            io.emit('load_history', messages);
        }
    });
});

const PORT = 3000;
server.listen(PORT, "0.0.0.0", () => console.log(`http://localhost:${PORT}`));