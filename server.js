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

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/write', (req, res) => res.sendFile(path.join(__dirname, 'write.html')));

const DATA_FILE = './data.json';
const CONFIG_FILE = './config.json';

const loadJson = (file, defaultVal) => {
    try {
        return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf-8')) : defaultVal;
    } catch (e) { return defaultVal; }
};

let messages = loadJson(DATA_FILE, []);
let cafeConfig = loadJson(CONFIG_FILE, {
    themeColor: "#2db400",
    bgColor: "#f2f4f7",
    cafeName: "🚀 내 전용 커뮤니티"
});

let userRoles = {};

io.on('connection', (socket) => {
    socket.emit('load_history', messages);
    socket.emit('update_config', cafeConfig);

    socket.on('new_post', (data) => {
        let role = "멤버";
        let finalNick = data.nickname;

        if (data.nickname.includes('#master123')) {
            finalNick = data.nickname.replace('#master123', '');
            userRoles[finalNick] = "주인장";
            role = "주인장";
        } else if (userRoles[data.nickname] === "주인장") {
            role = "주인장";
        }

        const messageData = {
            nickname: finalNick,
            content: data.content,
            image: data.image,
            role: role,
            time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
        };

        messages.push(messageData);
        fs.writeFileSync(DATA_FILE, JSON.stringify(messages, null, 2));
        io.emit('load_history', messages);
    });

    socket.on('update_cafe_settings', (data) => {
        cafeConfig = { ...cafeConfig, ...data.settings };
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(cafeConfig, null, 2));
        io.emit('update_config', cafeConfig);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => console.log(`Server running on port ${PORT}`));