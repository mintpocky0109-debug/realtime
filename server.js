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
let messages = fs.existsSync(DATA_FILE) ? JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')) : [];

// 유저 역할 DB (실제 운영시에는 별도 파일 저장을 권장)
let userRoles = { "주인장": "주인장" };

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/write', (req, res) => res.sendFile(path.join(__dirname, 'write.html')));

io.on('connection', (socket) => {
    socket.emit('load_history', messages);
    socket.emit('update_role_list', userRoles);

    // 역할 변경 처리
    socket.on('change_role', (data) => {
        const actorRole = userRoles[data.adminNick];
        // 권한 체크: 주인장은 다 가능, 점원은 멤버만 변경 가능
        if (actorRole === '주인장' || (actorRole === '점원' && data.newRole === '멤버')) {
            userRoles[data.targetNick] = data.newRole;
            io.emit('role_updated', { nick: data.targetNick, role: data.newRole });
        } else {
            socket.emit('alert', '권한이 부족합니다.');
        }
    });

    socket.on('new_post', (data) => {
        let role = userRoles[data.nickname] || "멤버";
        
        // 마스터 인증
        if (data.nickname.includes('#master123')) {
            const realNick = data.nickname.split('#')[0];
            userRoles[realNick] = "주인장";
            data.nickname = realNick;
            role = "주인장";
        }

        const messageData = {
            nickname: data.nickname,
            content: data.content,
            image: data.image, 
            role: role,
            isNotice: data.isNotice && (role === '주인장' || role === '점원'), // 권한 확인 후 공지 설정
            time: new Date().toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul' })
        };
        
        messages.push(messageData);
        fs.writeFileSync(DATA_FILE, JSON.stringify(messages, null, 2));
        io.emit('show_post', messageData);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => console.log(`서버 작동 중: ${PORT}`));