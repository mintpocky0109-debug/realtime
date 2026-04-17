const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 5e7 }); // 50MB 제한

app.use(express.static(path.join(__dirname)));
app.use(express.json({ limit: '50mb' }));

// --- 라우팅 설정 (중요: 이 부분이 없으면 /write 접근 시 에러 발생) ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/write', (req, res) => {
    res.sendFile(path.join(__dirname, 'write.html'));
});

const DATA_FILE = './data.json';
const CONFIG_FILE = './config.json';

// 데이터 파일 초기화 및 로드
const loadJson = (file, defaultVal) => {
    try {
        return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf-8')) : defaultVal;
    } catch (e) { return defaultVal; }
};

let messages = loadJson(DATA_FILE, []);
let cafeConfig = loadJson(CONFIG_FILE, {
    themeColor: "#2db400",
    bgColor: "#1e1f22",
    cafeName: "🚀 내 전용 커뮤니티"
});

let userRoles = {}; // { 닉네임: 역할 }

io.on('connection', (socket) => {
    // 접속한 유저에게 초기 데이터 전송
    socket.emit('load_history', messages);
    socket.emit('update_config', cafeConfig);

    // 새 게시글 처리
    socket.on('new_post', (data) => {
        let role = "멤버";
        let finalNick = data.nickname;

        // 주인장 비밀번호 로직 (#master123 포함 시 주인장 승격)
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
            time: new Date().toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit' })
        };

        messages.push(messageData);
        fs.writeFileSync(DATA_FILE, JSON.stringify(messages, null, 2));
        io.emit('load_history', messages); // 모든 유저에게 즉시 갱신
    });

    // 카페 디자인 변경
    socket.on('update_cafe_settings', (data) => {
        // 실제 운영 시에는 여기서 주인장인지 체크하는 로직이 필요합니다.
        cafeConfig = { ...cafeConfig, ...data.settings };
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(cafeConfig, null, 2));
        io.emit('update_config', cafeConfig);
    });

    // 전체 삭제
    socket.on('clear_all', (adminNick) => {
        messages = [];
        fs.writeFileSync(DATA_FILE, JSON.stringify(messages));
        io.emit('load_history', messages);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
    console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
});