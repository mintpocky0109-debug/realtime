const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);

// [설정] Socket.io 전송 용량을 50MB로 설정 (사진 전송용)
const io = new Server(server, {
    maxHttpBufferSize: 5e7 
});

// [설정] 서버가 큰 데이터(Base64 이미지)를 처리할 수 있도록 설정
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
// server.js 상단 (app 설정 부분)
app.use(express.static(path.join(__dirname))); // 현재 폴더의 모든 파일(CSS 등)을 웹에서 쓸 수 있게 허용

const DATA_FILE = path.join(__dirname, 'data.json');

// 서버 시작 시 기존 데이터 불러오기
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

// --- 페이지 경로 설정 ---

// 1. 메인 게시판 페이지 (index.html)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 2. 글쓰기 전용 페이지 (write.html)
// 이제 주소창에 /write 를 입력하면 글쓰기 창이 뜹니다.
app.get('/write', (req, res) => {
    res.sendFile(path.join(__dirname, 'write.html'));
});

// --- 소켓 통신 설정 ---

io.on('connection', (socket) => {
    // 접속한 사람에게 기존 게시글 목록 전송
    socket.emit('load_history', messages);

    // 새 게시글이 들어왔을 때 실행
    socket.on('new_post', (data) => {
        const messageData = {
            nickname: data.nickname,
            content: data.content,
            image: data.image, 
            time: new Date().toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul' })
        };

        messages.push(messageData);
        
        // JSON 파일에 영구 저장
        fs.writeFileSync(DATA_FILE, JSON.stringify(messages, null, 2));

        // 실시간으로 모든 접속자에게 새 글 알림
        io.emit('show_post', messageData);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
    console.log(`서버 실행 중: 포트 ${PORT}`);
});