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

let posts = loadJson(DATA_FILE, []);
let cafeConfig = loadJson(CONFIG_FILE, {
    themeColor: "#2db400",
    cafeName: "☕ 카페 에스프레소",
    boards: ["자유게시판", "공지사항", "가입인사"],
    ownerNick: null, // 주인장은 단 한 명
    staffList: []    // 점원 목록
});

io.on('connection', (socket) => {
    // 최초 접속 시 권한 정보 포함 전송
    socket.emit('load_all', { posts, config: cafeConfig });

    // 글 작성 및 권한 부여
    socket.on('new_post', (data) => {
        let role = "멤버";
        let nick = data.nickname;

        // 주인장 최초 등록 또는 인증 (비밀코드 #admin777 가정)
        if (nick.includes('#admin777')) {
            nick = nick.replace('#admin777', '');
            if (!cafeConfig.ownerNick || cafeConfig.ownerNick === nick) {
                cafeConfig.ownerNick = nick; // 주인장 영구 등록
                role = "주인장";
                fs.writeFileSync(CONFIG_FILE, JSON.stringify(cafeConfig, null, 2));
            }
        } else if (nick === cafeConfig.ownerNick) {
            role = "주인장";
        } else if (cafeConfig.staffList.includes(nick)) {
            role = "점원";
        }

        const newPost = {
            id: Date.now(),
            board: data.board,
            nickname: nick,
            role: role,
            content: data.content,
            image: data.image,
            time: new Date().toLocaleString(),
            likes: 0,
            comments: []
        };
        posts.push(newPost);
        fs.writeFileSync(DATA_FILE, JSON.stringify(posts, null, 2));
        io.emit('update_posts', posts);
    });

    // 커피(좋아요)
    socket.on('like_post', (postId) => {
        const post = posts.find(p => p.id === postId);
        if(post) { post.likes++; io.emit('update_posts', posts); fs.writeFileSync(DATA_FILE, JSON.stringify(posts)); }
    });

    // 댓글/답글
    socket.on('new_comment', (data) => {
        const post = posts.find(p => p.id === data.postId);
        if(post) {
            post.comments.push({
                id: Date.now(),
                nickname: data.nickname,
                content: data.content,
                parentId: data.parentId || null,
                time: new Date().toLocaleTimeString()
            });
            io.emit('update_posts', posts);
            fs.writeFileSync(DATA_FILE, JSON.stringify(posts));
        }
    });

    // 관리자 기능 (보안 강화)
    socket.on('admin_action', (data) => {
        const isOwner = data.adminNick === cafeConfig.ownerNick;
        const isStaff = cafeConfig.staffList.includes(data.adminNick);

        if (data.type === 'hire' && isOwner) { // 점원 고용은 주인장만 가능
            if (!cafeConfig.staffList.includes(data.targetNick)) {
                cafeConfig.staffList.push(data.targetNick);
                fs.writeFileSync(CONFIG_FILE, JSON.stringify(cafeConfig, null, 2));
                io.emit('update_config', cafeConfig);
            }
        } else if (data.type === 'config' && (isOwner || isStaff)) { // 디자인은 둘 다 가능
            cafeConfig = { ...cafeConfig, ...data.config };
            fs.writeFileSync(CONFIG_FILE, JSON.stringify(cafeConfig, null, 2));
            io.emit('update_config', cafeConfig);
        } else if (data.type === 'delete_all' && isOwner) { // 전체 삭제는 주인장만
            posts = [];
            fs.writeFileSync(DATA_FILE, JSON.stringify(posts));
            io.emit('update_posts', posts);
        }
    });
});

const PORT = 3000;
server.listen(PORT, "0.0.0.0", () => console.log(`http://localhost:${PORT}`));