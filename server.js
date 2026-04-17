const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);

// [수정] Socket.io 전송 용량을 50MB로 대폭 늘립니다.
const io = new Server(server, {
    maxHttpBufferSize: 5e7 // 50MB 설정
});

// [추가] Express 서버도 큰 데이터를 주고받을 수 있게 설정합니다.
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const DATA_FILE = path.join(__dirname, 'data.json');

let messages = [];
if (fs.existsSync(DATA_FILE)) {
    try {
        const fileData = fs.readFileSync(DATA_FILE, 'utf-8');
        messages = JSON.parse(fileData);
    } catch (e) {
        console.log("데이터를 읽어오는 중 오류 발생:", e);
        messages = [];
    }
}

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

io.on('connection', (socket) => {
    // 기존 내역 보내기
    socket.emit('load_history', messages);

    socket.on('new_post', (data) => {
        const messageData = {
            nickname: data.nickname,
            content: data.content,
            image: data.image, // [중요] 이미지 데이터를 객체에 포함!
            time: new Date().toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul' })
        };

        messages.push(messageData);
        
        // 파일에 저장 (사진이 포함되어 파일이 커질 수 있습니다)
        fs.writeFileSync(DATA_FILE, JSON.stringify(messages, null, 2));

        // 모든 사용자에게 전송
        io.emit('show_post', messageData);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
    console.log(`서버 실행 중: 포트 ${PORT}`);
});