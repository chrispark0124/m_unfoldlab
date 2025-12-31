require('dotenv').config({ override: true });
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");

const app = express();
const port = process.env.PORT || 3000;


app.use(cors({
    origin: '*', // 테스트를 위해 모든 접속을 허용합니다.
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));
app.use(express.json({ limit: '30mb' }));
app.use(express.static(path.join(__dirname, 'www')));

const MAIN_DB = 'm_application';
const EXPERT_DB = 'legalai_pro';

let User, Expert, CommunityPost, CommunityLike, CommunityComment, CommunityVote;
let mainConn, expertConn;

const secretsClient = new SecretsManagerClient({ region: "ap-northeast-2" });

async function startServer() {
    try {
        const response = await secretsClient.send(new GetSecretValueCommand({ SecretId: "munfoldlab/prod/runtime" }));
        const secrets = JSON.parse(response.SecretString);
        const mongoUri = secrets.MONGODB_URI;

        // 1. m_application 연결 및 개별 컬렉션 모델 정의
        mainConn = await mongoose.createConnection(mongoUri, { dbName: MAIN_DB });
        
        CommunityPost = mainConn.model('CommunityPost', new mongoose.Schema({
            title: String, content: String, authorId: String, authorName: String, options: Array
        }, { timestamps: true, collection: 'communityposts' }));

        CommunityLike = mainConn.model('CommunityLike', new mongoose.Schema({
            postId: mongoose.Schema.Types.ObjectId, userId: String
        }, { timestamps: true, collection: 'communitylikes' }));

        CommunityComment = mainConn.model('CommunityComment', new mongoose.Schema({
            postId: mongoose.Schema.Types.ObjectId, userId: String, userName: String, content: String
        }, { timestamps: true, collection: 'communitycomments' }));

        CommunityVote = mainConn.model('CommunityVote', new mongoose.Schema({
            postId: mongoose.Schema.Types.ObjectId, userId: String, optionId: String
        }, { timestamps: true, collection: 'communityvotes' }));

        // 2. legalai_pro 연결 (전문가 데이터)
        expertConn = await mongoose.createConnection(mongoUri, { dbName: EXPERT_DB });
        Expert = expertConn.model('Expert', new mongoose.Schema({
            firstName: String, lastName: String, email: String, role: String
        }, { collection: 'users' }));

        console.log(`✅ 데이터베이스 연결 성공 및 서버 준비 완료`);
        app.listen(port, '0.0.0.0', () => console.log(`🚀 서버 실행 중: ${port}`));

    } catch (err) {
        console.error("❌ 서버 시작 에러:", err);
    }
}

// --- API 라우트 ---

// 전문가 목록 (legalai_pro)
app.get('/api/experts', async (req, res) => {
    try {
        const experts = await Expert.find({}).lean();
        res.json(experts);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 커뮤니티 목록 조회 (개별 컬렉션 데이터 합산)
app.get('/api/community', async (req, res) => {
    try {
        const posts = await CommunityPost.find().sort({ createdAt: -1 }).lean();
        const enriched = await Promise.all(posts.map(async (p) => {
            const likeCount = await CommunityLike.countDocuments({ postId: p._id });
            const commentCount = await CommunityComment.countDocuments({ postId: p._id });
            const votes = await CommunityVote.find({ postId: p._id });
            return { ...p, likeCount, commentCount, votes };
        }));
        res.json({ items: enriched });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// [중요] 게시글 상세 데이터 (app.js 221번 에러 해결용)
app.get('/api/community/:id', async (req, res) => {
    try {
        const post = await CommunityPost.findById(req.params.id).lean();
        if (!post) return res.status(404).json({ error: "게시글을 찾을 수 없습니다." });
        
        const comments = await CommunityComment.find({ postId: req.params.id }).sort({ createdAt: -1 });
        const likes = await CommunityLike.find({ postId: req.params.id });
        
        res.json({ ...post, comments, likes });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 좋아요 토글
app.post('/api/community/:id/like', async (req, res) => {
    try {
        const { userId } = req.body;
        const exists = await CommunityLike.findOne({ postId: req.params.id, userId });
        if (exists) {
            await CommunityLike.deleteOne({ _id: exists._id });
            res.json({ liked: false });
        } else {
            await new CommunityLike({ postId: req.params.id, userId }).save();
            res.json({ liked: true });
        }
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 댓글 등록 (앱의 /comments 요청 수용)
app.post('/api/community/:id/comments', async (req, res) => {
    try {
        const comment = new CommunityComment({
            postId: req.params.id,
            userId: req.body.userId,
            userName: req.body.userName || '익명',
            content: req.body.content
        });
        await comment.save();
        res.json(comment);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 투표 처리
app.post('/api/community/:id/vote', async (req, res) => {
    try {
        const { userId, optionId } = req.body;
        // 기존 투표 삭제 후 새 투표 등록
        await CommunityVote.deleteMany({ postId: req.params.id, userId });
        const vote = new CommunityVote({ postId: req.params.id, userId, optionId });
        await vote.save();
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'www', 'index.html')));

startServer();