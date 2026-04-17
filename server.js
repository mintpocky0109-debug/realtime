const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs'); // 파일을 읽고 쓰기 위한 도구

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// 데이터가 저장될 파일 경로
const DATA_FILE = path.join(__dirname, 'data.json');

// 서버가 켜질 때 기존 데이터를 파일에서 읽어오기
let messages = [];
if (fs.existsSync(DATA_FILE)) {
    const fileData = fs.readFileSync(DATA_FILE, 'utf-8');
    messages = JSON.parse(fileData);
}

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

io.on('connection', (socket) => {
    // 1. 새로운 사람이 접속하면 기존에 저장된 메시지들을 싹 보내주기
    socket.emit('load_history', messages);

    socket.on('new_post', (data) => {
        const messageData = {
            nickname: data.nickname,
            content: data.content,
            time: new Date().toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul' })
        };

        // 2. 새 메시지를 목록에 추가하고 파일에 저장하기
        messages.push(messageData);
        fs.writeFileSync(DATA_FILE, JSON.stringify(messages, null, 2));

        io.emit('show_post', messageData);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
    console.log(`서버 실행 중: 포트 ${PORT}`);
});