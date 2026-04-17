const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// 브라우저가 접속하면 index.html 파일을 보여줍니다.
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 사용자가 접속(Connect)했을 때 실행되는 코드
io.on('connection', (socket) => {
    console.log('누군가 접속했어요!');

    // 누군가 'new_post'라는 이름으로 메시지를 보내면
socket.on('new_post', (data) => {
        const messageData = {
            nickname: data.nickname,
            content: data.content,
            time: new Date().toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul' })
        };
        io.emit('show_post', messageData);
    });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {
    console.log(`서버 실행 중: 포트 ${PORT}`);
});