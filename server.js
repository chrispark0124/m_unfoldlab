// 환경 변수 로드 (.env → Secrets Manager 순으로 채움)
require('dotenv').config({ override: true });
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

const app = express();
const PORT = process.env.PORT || 3000;
// 인증 전용 DB (로그인 계정)
const AUTH_DB = process.env.MONGO_DB_AUTH || process.env.MONGO_DB || 'm_application';
// 커뮤니티 등 앱 데이터 DB (기본: 인증 DB와 동일, 필요 시 override)
const APP_DB = process.env.MONGO_DB_APP || AUTH_DB || 'm_application';
// 전문가 프로필 DB (요청: Cluster0/legalai_pro/users)
const EXPERT_DB = process.env.MONGO_DB_EXPERT || 'legalai_pro';
const AWS_REGION = process.env.AWS_REGION || 'ap-northeast-2';
const SECRET_NAME = process.env.AWS_SECRETS_NAME || 'munfoldlab/prod/runtime';
const DEFAULT_PROFILE_IMAGE = process.env.DEFAULT_PROFILE_IMAGE || '';

// --------- Secrets Manager (옵션) ---------
const secretsClient = new SecretsManagerClient({ region: AWS_REGION });
async function loadSecretsIfNeeded() {
    if (process.env.MONGODB_URI) return;
    try {
        const data = await secretsClient.send(new GetSecretValueCommand({ SecretId: SECRET_NAME }));
        const parsed = JSON.parse(data.SecretString || '{}');
        Object.entries(parsed).forEach(([k, v]) => {
            if (!process.env[k]) process.env[k] = v;
        });
        console.log('✅ Secrets Manager 로드 완료');
    } catch (err) {
        console.warn('⚠️ Secrets Manager 로드 실패 (env 사용 예정):', err.message);
    }
}

// --------- 기본 미들웨어 ---------
const allowedOrigins = [
    'https://munfoldlab.com',
    'https://www.munfoldlab.com',
    'https://munfoldlab-legalpro.com',
    'https://app.unfoldlab-legalpro.com',
    'http://localhost',
    'http://localhost:3000',
    'capacitor://localhost'
];

app.use(cors({
    origin: (origin, cb) => {
        if (!origin) return cb(null, true);
        if (allowedOrigins.includes(origin) || origin.endsWith('.munfoldlab.com')) return cb(null, true);
        return cb(null, true); // 넓게 허용
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));
app.use(express.json({ limit: '30mb' }));
app.use(express.static(path.join(__dirname, 'www')));

// --------- Mongoose 스키마 ---------
const userSchema = new mongoose.Schema({
    email: { type: String, required: true, trim: true, lowercase: true },
    password: { type: String, required: true },
    firstName: { type: String, default: '' },
    lastName: { type: String, default: '' },
    phoneNumber: { type: String, default: '' },
    referralCode: { type: String, default: () => generateReferralCode() },
    profileImage: { type: String, default: () => DEFAULT_PROFILE_IMAGE || '' },
    role: { type: String, default: 'client' },
    lastLogin: { type: Date, default: null }
}, { collection: 'users', timestamps: true });
// referralCode 유니크 (sparse: 빈값/누락은 인덱싱 제외)
userSchema.index({ referralCode: 1 }, { unique: true, sparse: true });

const postSchema = new mongoose.Schema({
    title: String,
    content: String,
    authorId: String,
    authorName: String,
    authorAvatar: String,
    anonymous: { type: Boolean, default: false },
    poll: {
        question: String,
        allowsMultiple: { type: Boolean, default: false },
        options: [{
            id: String,
            text: String,
            votes: { type: Number, default: 0 }
        }]
    }
}, { collection: 'communityposts', timestamps: true });

const likeSchema = new mongoose.Schema({
    postId: String,
    userId: String
}, { collection: 'communitylikes', timestamps: true });

const commentSchema = new mongoose.Schema({
    postId: String,
    authorId: String,
    authorName: String,
    authorAvatar: String,
    anonymous: { type: Boolean, default: false },
    text: String
}, { collection: 'communitycomments', timestamps: true });

const voteSchema = new mongoose.Schema({
    postId: String,
    userId: String,
    optionId: String
}, { collection: 'communityvotes', timestamps: true });

const expertSchema = new mongoose.Schema({
    firstName: String,
    lastName: String,
    name: String,
    category: String,
    tag: String,
    profileImage: String,
    desc: String,
    role: String
}, { collection: 'users' });

let User, Post, Like, Comment, Vote, Expert;
let authConn, appConn, expertConn;

function generateReferralCode() {
    // 10자리 영문/숫자 고정, 대문자
    return crypto.randomBytes(8).toString('base64').replace(/[^A-Za-z0-9]/g, '').slice(0, 10).toUpperCase();
}

async function backfillUsers() {
    try {
        const col = authConn.collection('users');
        // 기존 인덱스 제거 시도
        try { await col.dropIndex('referralCode_1'); } catch (_e) {}

        const docs = await col.find({
            $or: [
                { referralCode: { $exists: false } },
                { referralCode: null },
                { referralCode: '' },
            ]
        }).toArray();

        let updated = 0;
        for (const doc of docs) {
            let code = generateReferralCode();
            while (await col.findOne({ referralCode: code })) {
                code = generateReferralCode();
            }
            const emailLocal = (doc.email || '').split('@')[0] || '회원';
            const firstName = (doc.firstName || '').trim() || emailLocal;
            await col.updateOne(
                { _id: doc._id },
                { $set: { referralCode: code, firstName } }
            );
            updated++;
        }
        if (updated) console.log(`✅ referralCode/firstName 백필 완료: ${updated}건`);

        // 고유 인덱스 재생성 (sparse: null/빈 문자열 제외)
        try {
            await col.createIndex({ referralCode: 1 }, { unique: true, sparse: true });
        } catch (e) {
            console.warn('⚠️ referralCode 인덱스 생성 실패:', e.message);
        }
    } catch (err) {
        console.warn('⚠️ 사용자 백필 실패:', err.message);
    }
}

async function initDb() {
    await loadSecretsIfNeeded();
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error('MONGODB_URI 가 설정되지 않았습니다.');
    // 인증 전용 커넥션 (m_application)
    authConn = await mongoose.createConnection(uri, { dbName: AUTH_DB });
    User = authConn.model('User', userSchema);

    // 앱 데이터 커넥션 (커뮤니티)
    appConn = await mongoose.createConnection(uri, { dbName: APP_DB });
    Post = appConn.model('CommunityPost', postSchema);
    Like = appConn.model('CommunityLike', likeSchema);
    Comment = appConn.model('CommunityComment', commentSchema);
    Vote = appConn.model('CommunityVote', voteSchema);

    // 전문가 DB 커넥션 (기본 legalai_pro/users)
    if (EXPERT_DB === APP_DB) {
        expertConn = appConn;
    } else if (EXPERT_DB === AUTH_DB) {
        expertConn = authConn;
    } else {
        expertConn = await mongoose.createConnection(uri, { dbName: EXPERT_DB });
    }
    Expert = expertConn.model('Expert', expertSchema);

    console.log('✅ MongoDB 연결 성공', { authDb: AUTH_DB, appDb: APP_DB, expertDb: EXPERT_DB });
}

// --------- 유틸 ---------
async function attachCounts(post, userId) {
    const postId = String(post._id);
    const [likeCount, commentCount, isLiked] = await Promise.all([
        Like.countDocuments({ postId }),
        Comment.countDocuments({ postId }),
        userId ? Like.exists({ postId, userId }) : false
    ]);

    let poll = null;
    if (post.poll && Array.isArray(post.poll.options)) {
        const voteAgg = await Vote.aggregate([
            { $match: { postId } },
            { $group: { _id: '$optionId', votes: { $sum: 1 } } }
        ]);
        const voteMap = new Map(voteAgg.map(v => [String(v._id), v.votes]));
        poll = {
            question: post.poll.question || '',
            allowsMultiple: !!post.poll.allowsMultiple,
            options: post.poll.options.map(opt => ({
                id: opt.id || String(opt._id || ''),
                text: opt.text,
                votes: voteMap.get(String(opt.id || opt._id || '')) || 0
            }))
        };
    }

    return { ...post, likeCount, commentCount, isLiked: !!isLiked, poll };
}

// --------- API ---------
app.get('/api/health', (req, res) => res.json({ ok: true }));

// 로그인 (기본 이메일/비밀번호 매칭)
app.post(['/auth/login', '/api/login'], async (req, res) => {
    try {
        const { email, password } = req.body || {};
        if (!email || !password) return res.status(400).json({ message: 'email/password 필요' });
        const user = await User.findOne({
            email: email.toString().trim().toLowerCase(),
        });
        if (!user) return res.status(401).json({ message: '정보가 일치하지 않습니다.' });

        const plainPw = password.toString();
        const dbPw = user.password || '';
        const passwordMatches = (dbPw === plainPw) || (await bcrypt.compare(plainPw, dbPw).catch(() => false));
        if (!passwordMatches) return res.status(401).json({ message: '정보가 일치하지 않습니다.' });

        // lastLogin 갱신
        user.lastLogin = new Date();
        await user.save();

        res.json({
            email: user.email,
            firstName: user.firstName || '',
            lastName: user.lastName || '',
            phoneNumber: user.phoneNumber || '',
            profileImage: user.profileImage || '',
            role: user.role || 'client',
            referralCode: user.referralCode || '',
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
            lastLogin: user.lastLogin
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: '로그인 실패' });
    }
});

// 프로필 조회 (이메일 기준)
app.get(['/api/user', '/api/profile'], async (req, res) => {
    try {
        const email = (req.query.email || '').toString().trim().toLowerCase();
        if (!email) return res.status(400).json({ message: 'email 필요' });
        const user = await User.findOne({ email }).lean();
        if (!user) return res.status(404).json({ message: 'not found' });
        res.json({
            email: user.email,
            firstName: user.firstName || '',
            lastName: user.lastName || '',
            phoneNumber: user.phoneNumber || '',
            profileImage: user.profileImage || '',
            role: user.role || 'client',
            referralCode: user.referralCode || '',
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
            lastLogin: user.lastLogin
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: '프로필 조회 실패' });
    }
});

// 프로필 업데이트 (이름/이미지)
app.put('/api/profile', async (req, res) => {
    try {
        const { email, firstName, lastName, profileImage } = req.body || {};
        if (!email) return res.status(400).json({ message: 'email 필요' });
        const normEmail = email.toString().trim().toLowerCase();
        const update = {
            firstName: (firstName || '').toString(),
            lastName: (lastName || '').toString(),
        };
        if (typeof profileImage === 'string') {
            update.profileImage = profileImage;
        }
        const updated = await User.findOneAndUpdate(
            { email: normEmail },
            { $set: update },
            { new: true, lean: true }
        );
        if (!updated) return res.status(404).json({ message: 'not found' });
        res.json({
            email: updated.email,
            firstName: updated.firstName || '',
            lastName: updated.lastName || '',
            phoneNumber: updated.phoneNumber || '',
            profileImage: updated.profileImage || '',
            role: updated.role || 'client',
            referralCode: updated.referralCode || '',
            createdAt: updated.createdAt,
            updatedAt: updated.updatedAt,
            lastLogin: updated.lastLogin
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: '프로필 수정 실패' });
    }
});

// 회원가입 (m_application.users)
app.post(['/auth/signup', '/api/signup'], async (req, res) => {
    try {
        const { email, password, firstName, lastName, phoneNumber, role } = req.body || {};
        if (!email || !password) return res.status(400).json({ message: 'email/password 필요' });
        const normEmail = email.toString().trim().toLowerCase();
        const exists = await User.findOne({ email: normEmail }).lean();
        if (exists) return res.status(409).json({ message: '이미 가입된 이메일입니다.' });

        const hashed = await bcrypt.hash(password.toString(), 10);
        // referralCode 중복 방지를 위해 필요 시 재시도
        let referralCode = generateReferralCode();
        for (let i = 0; i < 10; i++) {
            const dup = await User.findOne({ referralCode }).lean();
            if (!dup) break;
            referralCode = generateReferralCode();
        }

        const emailLocal = normEmail.split('@')[0] || '회원';
        const fn = (firstName || '').toString().trim() || emailLocal;
        const ln = (lastName || '').toString().trim();

        const doc = await User.create({
            email: normEmail,
            password: hashed,
            firstName: fn,
            lastName: ln,
            phoneNumber: (phoneNumber || '').toString(),
            role: (role || 'client').toString(),
            referralCode,
            profileImage: (req.body?.profileImage || DEFAULT_PROFILE_IMAGE || '').toString(),
        });

        res.status(201).json({
            ok: true,
            email: doc.email,
            firstName: doc.firstName || '',
            lastName: doc.lastName || '',
            phoneNumber: doc.phoneNumber || '',
            profileImage: doc.profileImage || '',
            role: doc.role || 'client',
            referralCode: doc.referralCode || '',
            createdAt: doc.createdAt,
            updatedAt: doc.updatedAt
        });
    } catch (err) {
        console.error(err);
        if (err?.code === 11000) {
            return res.status(409).json({ message: '중복된 사용자 정보가 있습니다.' });
        }
        res.status(500).json({ message: '회원가입 실패' });
    }
});

// 커뮤니티 목록
app.get('/api/community', async (req, res) => {
    try {
        const userId = (req.query.userId || '').toString();
        const posts = await Post.find().sort({ createdAt: -1 }).lean();
        const items = [];
        for (const p of posts) {
            items.push(await attachCounts(p, userId));
        }
        res.json({ items });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'community 목록 조회 실패' });
    }
});

// 커뮤니티 상세
app.get('/api/community/:id', async (req, res) => {
    try {
        const post = await Post.findById(req.params.id).lean();
        if (!post) return res.status(404).json({ message: 'post not found' });
        const comments = await Comment.find({ postId: req.params.id }).sort({ createdAt: -1 }).lean();
        const enriched = await attachCounts(post, (req.query.userId || '').toString());
        res.json({ post: enriched, comments, poll: enriched.poll || null });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'community 상세 조회 실패' });
    }
});

// 글 작성
app.post('/api/community', async (req, res) => {
    try {
        const { title, content, authorId, authorName, authorAvatar, anonymous, poll } = req.body;
        const payload = { title, content, authorId, authorName, authorAvatar, anonymous: !!anonymous };
        if (poll && poll.question && Array.isArray(poll.options) && poll.options.length >= 2) {
            payload.poll = {
                question: poll.question,
                allowsMultiple: !!poll.allowsMultiple,
                options: poll.options.map((opt) => ({
                    id: opt.id || opt._id || new mongoose.Types.ObjectId().toString(),
                    text: opt.text,
                    votes: 0
                }))
            };
        }
        const saved = await Post.create(payload);
        res.json(saved);
    } catch (err) {
        console.error(err);
        res.status(400).json({ message: 'community 작성 실패' });
    }
});

// 글 삭제
app.delete('/api/community/:id', async (req, res) => {
    try {
        const { authorId } = req.body || {};
        const post = await Post.findById(req.params.id);
        if (!post) return res.status(404).json({ message: 'post not found' });
        if (authorId && post.authorId && post.authorId !== authorId) {
            return res.status(403).json({ message: '삭제 권한이 없습니다.' });
        }
        await Promise.all([
            Post.deleteOne({ _id: req.params.id }),
            Like.deleteMany({ postId: req.params.id }),
            Comment.deleteMany({ postId: req.params.id }),
            Vote.deleteMany({ postId: req.params.id })
        ]);
        res.json({ ok: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'community 삭제 실패' });
    }
});

// 좋아요 토글
app.post('/api/community/:id/like', async (req, res) => {
    try {
        const { userId } = req.body || {};
        if (!userId) return res.status(400).json({ message: 'userId 필요' });
        const postId = req.params.id;
        const exists = await Like.findOne({ postId, userId });
        if (exists) {
            await Like.deleteOne({ _id: exists._id });
        } else {
            await Like.create({ postId, userId });
        }
        const likeCount = await Like.countDocuments({ postId });
        res.json({ liked: !exists, likeCount });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'like 처리 실패' });
    }
});

// 투표
app.post('/api/community/:id/vote', async (req, res) => {
    try {
        const { userId, choiceIds = [] } = req.body || {};
        if (!userId || !Array.isArray(choiceIds) || choiceIds.length === 0) {
            return res.status(400).json({ message: 'userId / choiceIds 필요' });
        }
        const postId = req.params.id;
        // 단일 선택만 허용 (중복 방지)
        await Vote.deleteMany({ postId, userId });
        await Vote.create({ postId, userId, optionId: choiceIds[0] });
        res.json({ ok: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'vote 처리 실패' });
    }
});

// 댓글 등록
app.post('/api/community/:id/comments', async (req, res) => {
    try {
        const { authorId, authorName, authorAvatar, anonymous, text } = req.body || {};
        if (!text) return res.status(400).json({ message: 'text 필요' });
        const saved = await Comment.create({
            postId: req.params.id,
            authorId,
            authorName: authorName || '익명',
            authorAvatar: authorAvatar || '',
            anonymous: !!anonymous,
            text
        });
        res.json(saved);
    } catch (err) {
        console.error(err);
        res.status(400).json({ message: '댓글 등록 실패' });
    }
});

// 댓글 삭제
app.delete('/api/community/comments/:commentId', async (req, res) => {
    try {
        const { authorId } = req.body || {};
        const comment = await Comment.findById(req.params.commentId);
        if (!comment) return res.status(404).json({ message: 'comment not found' });
        if (authorId && comment.authorId && comment.authorId !== authorId) {
            return res.status(403).json({ message: '삭제 권한이 없습니다.' });
        }
        await Comment.deleteOne({ _id: comment._id });
        res.json({ ok: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: '댓글 삭제 실패' });
    }
});

// 전문가 리스트
app.get('/api/experts', async (_req, res) => {
    try {
        const experts = await Expert.find({}).lean();
        res.json(experts || []);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: '전문가 목록 조회 실패' });
    }
});

// SPA fallback
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'www', 'index.html')));

// --------- 부팅 ---------
initDb()
    .then(() => {
        // 기존 사용자 firstName/referralCode 백필 (비동기)
        backfillUsers();
        app.listen(PORT, '0.0.0.0', () => console.log(`🚀 서버 가동: ${PORT}`));
    })
    .catch((err) => {
        console.error('❌ 서버 시작 실패:', err);
        process.exit(1);
    });