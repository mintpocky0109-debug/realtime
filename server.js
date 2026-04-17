const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    maxHttpBufferSize: 5e7 
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname))); 

const DATA_FILE = path.join(__dirname, 'data.json');

let messages = [];
if (fs.existsSync(DATA_FILE)) {
    try {
        const fileData = fs.readFileSync(DATA_FILE, 'utf-8');
        messages = JSON.parse(fileData);
    } catch (e) {
        messages = [];
    }
}

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/write', (req, res) => res.sendFile(path.join(__dirname, 'write.html')));

io.on('connection', (socket) => {
    socket.emit('load_history', messages);

    socket.on('new_post', (data) => {
        // [추가] 관리자 닉네임 설정 (여기서 '운영자'를 원하는 이름으로 바꾸세요)
        const isAdmin = data.nickname === '운영자'; 

        const messageData = {
            nickname: data.nickname,
            content: data.content,
            image: data.image, 
            role: isAdmin ? '관리자' : '멤버', // 역할 지정
            time: new Date().toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul' })
        };
        messages.push(messageData);
        fs.writeFileSync(DATA_FILE, JSON.stringify(messages, null, 2));
        io.emit('show_post', messageData);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
    console.log(`서버 실행 중: 포트 ${PORT}`);
});