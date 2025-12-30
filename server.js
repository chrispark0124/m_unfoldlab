require('dotenv').config({ override: true });
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const fs = require('fs');

const app = express();
const port = process.env.PORT || 3000;

// JSON/폼 기본 본문 한도: 30MB로 상향 (OCR 라우트는 내부에서 별도 8MB 제한 유지)
app.use(express.json({ limit: '30mb' }));
app.use(express.urlencoded({ extended: true, limit: '30mb' }));

// 요청 경로/메서드 간단 로깅 (본문은 제외)
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// CORS 허용 - 모든 origin 허용 (로컬호스트 포함)
// OPTIONS 요청을 먼저 처리
app.options('*', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24시간
  res.sendStatus(200);
});

// 모든 요청에 대해 CORS 헤더 설정
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
  res.setHeader('Access-Control-Allow-Credentials', 'false');
  
  next();
});

// 정적 자산 서빙 (www 폴더)
app.use(express.static(path.join(__dirname, 'www')));

// MongoDB Atlas 연결 문자열 (Cluster1)
// 비밀번호의 ^ 문자는 URL 인코딩하여 %5E%5E 로 표기
const mongoURI = 'mongodb+srv://gtae3045:gtae3045%5E%5E@cluster1.ick6ad.mongodb.net/?appName=Cluster1';

// DB 이름 분리: 인증/회원은 m_application, 전문가 조회는 legalai_pro
const AUTH_DB_NAME = process.env.MONGO_DB_AUTH || 'm_application';
const EXPERT_DB_NAME = process.env.MONGO_DB_EXPERT || 'legalai_pro';

// 공통 옵션
const commonMongooseOptions = {
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
};

// 기본 커넥션: 회원/로그인 용 (mongoose 기본 커넥션 사용)
mongoose.connect(mongoURI, { ...commonMongooseOptions, dbName: AUTH_DB_NAME })
  .then(() => {
    console.log(`MongoDB Atlas(회원/로그인) 연결: ${AUTH_DB_NAME}`);
  })
  .catch(err => {
    console.error('MongoDB 연결 오류(회원/로그인):', err);
    console.error('연결 문자열:', mongoURI.replace(/:[^:@]+@/, ':****@')); // 비밀번호 숨김
  });

// 전문가 전용 커넥션
const expertConn = mongoose.createConnection(mongoURI, { ...commonMongooseOptions, dbName: EXPERT_DB_NAME });
expertConn.on('connected', () => console.log(`MongoDB Atlas(전문가) 연결: ${EXPERT_DB_NAME}`));
expertConn.on('error', (err) => console.error('MongoDB 연결 오류(전문가):', err));
expertConn.on('disconnected', () => console.log('MongoDB(전문가) 연결 해제'));

// MongoDB 연결 상태 모니터링 (회원/로그인)
mongoose.connection.on('connected', () => {
  console.log('Mongoose 기본 연결(회원/로그인)이 MongoDB에 연결되었습니다.');
});

mongoose.connection.on('error', (err) => {
  console.error('Mongoose 기본 연결 오류(회원/로그인):', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('Mongoose 기본 연결(회원/로그인)이 끊어졌습니다.');
});

// 서버 시작 (MongoDB 연결 여부와 관계없이 시작)
app.listen(port, '0.0.0.0', () => {
  console.log(`서버가 http://localhost:${port} 에서 실행 중입니다.`);
  console.log(`회원/로그인 DB 상태: ${mongoose.connection.readyState === 1 ? '연결됨' : '연결 안됨'}`);
  console.log(`전문가 DB 상태: ${expertConn.readyState === 1 ? '연결됨' : '연결 안됨'}`);
});

// User 모델 정의 (MongoDB의 'users' 컬렉션과 연결)
const UserSchema = new mongoose.Schema({
  firstName: { type: String, required: true },
  lastName: { type: String, required: false, default: '' },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true }, // 저장 시 해시 적용
  profileImage: { type: String },
  phoneNumber: { type: String, required: true },
  role: { type: String, required: true, default: 'client' }, // 예: 'client', 'lawyer', 'firm_admin'
  category: { type: String }, // 전문가의 전문 분야 (예: '형사', '이혼', '부동산')
  tag: { type: String }, // 전문가의 태그 (예: '강력범죄/성범죄 전문')
  desc: { type: String }, // 전문가 설명
  referralCode: { type: String, required: true, unique: true }, // 고정 추천인 코드
}, { timestamps: true });

UserSchema.index({ email: 1 }, { unique: true });
UserSchema.index({ referralCode: 1 }, { unique: true });

// 기본 커넥션(회원/로그인)과 전문가 커넥션에 각각 모델 바인딩
const User = mongoose.model('User', UserSchema);
const ExpertUser = expertConn.model('User', UserSchema);

function generateReferralCode(length = 8) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(length);
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return code;
}

async function createUniqueReferralCode() {
  let code = '';
  // 충돌 방지를 위해 존재 여부 체크 반복
  // (코드 길이가 길어 충돌 확률은 낮지만 안전하게 보장)
  // 최대 10회 시도 후 마지막 값 사용
  for (let i = 0; i < 10; i++) {
    code = generateReferralCode();
    // eslint-disable-next-line no-await-in-loop
    const exists = await User.exists({ referralCode: code });
    if (!exists) return code;
  }
  return code || generateReferralCode();
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 120000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(rawPassword = '', stored = '') {
  if (!rawPassword || !stored) return false;
  // 구버전(plain text 저장) 호환
  if (!stored.includes(':')) return rawPassword === stored;
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const verifyHash = crypto.pbkdf2Sync(rawPassword, salt, 120000, 64, 'sha512').toString('hex');
  return hash === verifyHash;
}

function escapeRegex(str = '') {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------------- 커뮤니티 스키마 ----------------
const CommunityPostSchema = new mongoose.Schema({
  title: { type: String, required: true },
  content: { type: String, required: true },
  authorId: { type: String, required: true },
  authorName: { type: String, default: '' },
  authorAvatar: { type: String, default: '' },
  anonymous: { type: Boolean, default: false },
  category: { type: String, default: '' },
  tags: [{ type: String }],
  poll: {
    question: String,
    allowsMultiple: { type: Boolean, default: false },
    options: [{
      _id: { type: String, default: () => crypto.randomBytes(6).toString('hex') },
      text: String
    }]
  },
  likeCount: { type: Number, default: 0 },
  commentCount: { type: Number, default: 0 },
}, { timestamps: true });

const CommunityCommentSchema = new mongoose.Schema({
  postId: { type: mongoose.Schema.Types.ObjectId, ref: 'CommunityPost', required: true },
  authorId: { type: String, required: true },
  authorName: { type: String, default: '' },
  authorAvatar: { type: String, default: '' },
  anonymous: { type: Boolean, default: false },
  text: { type: String, required: true },
}, { timestamps: true });

const CommunityVoteSchema = new mongoose.Schema({
  postId: { type: mongoose.Schema.Types.ObjectId, ref: 'CommunityPost', required: true },
  userId: { type: String, required: true },
  choiceIds: [{ type: String, required: true }],
}, { timestamps: true });
CommunityVoteSchema.index({ postId: 1, userId: 1 }, { unique: true });

const CommunityLikeSchema = new mongoose.Schema({
  postId: { type: mongoose.Schema.Types.ObjectId, ref: 'CommunityPost', required: true },
  userId: { type: String, required: true },
}, { timestamps: true });
CommunityLikeSchema.index({ postId: 1, userId: 1 }, { unique: true });

const CommunityPost = mongoose.model('CommunityPost', CommunityPostSchema);
const CommunityComment = mongoose.model('CommunityComment', CommunityCommentSchema);
const CommunityVote = mongoose.model('CommunityVote', CommunityVoteSchema);
const CommunityLike = mongoose.model('CommunityLike', CommunityLikeSchema);

// 전문가 목록을 가져오는 API 엔드포인트
app.get('/api/experts', async (req, res) => {
  try {
    // MongoDB 연결 상태 확인
    if (mongoose.connection.readyState !== 1) {
      console.error('MongoDB 연결이 끊어져 있습니다. 연결 상태:', mongoose.connection.readyState);
      return res.status(503).json({ 
        message: '데이터베이스 연결이 끊어져 있습니다.',
        error: 'DATABASE_CONNECTION_ERROR'
      });
    }

    if (expertConn.readyState !== 1) {
      console.error('전문가 DB 연결이 끊어져 있습니다. 연결 상태:', expertConn.readyState);
      return res.status(503).json({
        message: '전문가 DB 연결이 끊어져 있습니다.',
        error: 'EXPERT_DB_CONNECTION_ERROR'
      });
    }

    // 전문가 역할 풀: 변호사/컨설턴트/관리자 등 포함
    const allowedExpertRoles = [
      'lawyer',
      'consultant',
      'firm_admin',
      'rm_lawyer',
      'rm_staff',
      'rm_manager',
      'attorney',
      'associate' // Atlas에 있는 associate 역할도 허용
    ];

    const query = { role: { $in: allowedExpertRoles } };
    if (req.query.status) {
      query.status = req.query.status;
    }

    const experts = await ExpertUser.find(query, '-password'); // 비밀번호는 제외
    console.log(`전문가 ${experts.length}명을 조회했습니다. (roles: ${allowedExpertRoles.join(',')})`);
    res.json(experts);
  } catch (error) {
    console.error('전문가 데이터를 가져오는 중 오류 발생:', error);
    res.status(500).json({ 
      message: '서버 오류가 발생했습니다.',
      error: error.message
    });
  }
});

// 기본 라우트: 정적 파일 index.html 반환
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'www', 'index.html'));
});

// 데이터베이스 연결 상태 확인 엔드포인트
app.get('/api/health', (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  res.json({
    status: dbStatus === 'connected' ? 'healthy' : 'unhealthy',
    database: dbStatus,
    timestamp: new Date().toISOString()
  });
});

// 회원가입: 모든 입력을 저장하고 추천인 코드를 생성
app.post('/api/signup', async (req, res) => {
  try {
    const {
      name,
      firstName,
      lastName,
      email,
      password,
      phoneNumber,
      profileImage,
      role,
    } = req.body || {};

    const phoneDigits = (phoneNumber || '').toString().replace(/\D/g, '');
    const safeFirst = (firstName || name || '').trim();
    const safeLast = (lastName || '').trim();
    const normalizedEmail = (email || '').trim().toLowerCase();

    if (!safeFirst || !normalizedEmail || !password || !phoneDigits) {
      return res.status(400).json({ message: '필수 입력값이 누락되었습니다.' });
    }

    const existing = await User.findOne({
      email: { $regex: `^${escapeRegex(normalizedEmail)}$`, $options: 'i' },
    });
    if (existing) {
      return res.status(409).json({ message: '이미 사용 중인 이메일입니다.' });
    }

    const referralCode = await createUniqueReferralCode();
    const user = await User.create({
      firstName: safeFirst,
      lastName: safeLast,
      email: normalizedEmail,
      password: hashPassword(password),
      phoneNumber: phoneDigits,
      role: role || 'client',
      profileImage: profileImage || '',
      referralCode,
    });

    console.log('[signup] created user', email, 'code', referralCode);

    return res.status(201).json({
      id: user._id,
      email: user.email,
      referralCode: user.referralCode,
    });
  } catch (error) {
    console.error('회원가입 처리 중 오류:', error);
    return res.status(500).json({
      message: '회원가입 처리 중 서버 오류가 발생했습니다.',
      error: error.message,
    });
  }
});

// 로그인: 가입된 이메일/비밀번호 확인
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const normalizedEmail = (email || '').trim().toLowerCase();
    const logPrefix = `[login] ${normalizedEmail || email || 'no-email'}`;
    if (!email || !password) {
      return res.status(400).json({ message: '이메일과 비밀번호를 입력하세요.' });
    }

    const user = await User.findOne({
      email: { $regex: `^${escapeRegex(normalizedEmail)}$`, $options: 'i' },
    });
    if (!user) {
      console.warn(`${logPrefix} user not found`);
      return res.status(401).json({ message: '이메일 또는 비밀번호가 올바르지 않습니다.' });
    }

    const ok = verifyPassword(password, user.password);
    if (!ok) {
      console.warn(`${logPrefix} password mismatch (plain:${!user.password.includes(':')})`);
      return res.status(401).json({ message: '이메일 또는 비밀번호가 올바르지 않습니다.' });
    }

    // 구버전 plain-text 저장 사용자의 경우 로그인 시 해시로 자동 교체
    if (!user.password.includes(':')) {
      try {
        user.password = hashPassword(password);
        await user.save();
        console.log(`${logPrefix} upgraded password hash`);
      } catch (e) {
        console.warn(`${logPrefix} 구버전 패스워드 해시 갱신 실패:`, e);
      }
    }

    console.log(`${logPrefix} login success`);

    return res.json({
      id: user._id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phoneNumber: user.phoneNumber,
      profileImage: user.profileImage || '',
      referralCode: user.referralCode,
    });
  } catch (error) {
    console.error('로그인 처리 중 오류:', error);
    return res.status(500).json({ message: '로그인 처리 중 서버 오류가 발생했습니다.', error: error.message });
  }
});

// 프로필 업데이트 (이름/프로필 이미지)
app.put('/api/profile', async (req, res) => {
  try {
    const {
      email,
      firstName,
      lastName,
      profileImage,
    } = req.body || {};

    const normalizedEmail = (email || '').trim().toLowerCase();
    if (!normalizedEmail) {
      return res.status(400).json({ message: '이메일이 필요합니다.' });
    }

    const user = await User.findOne({ email: { $regex: `^${escapeRegex(normalizedEmail)}$`, $options: 'i' } });
    if (!user) {
      return res.status(404).json({ message: '사용자를 찾을 수 없습니다.' });
    }

    if (firstName) user.firstName = firstName.trim();
    if (typeof lastName === 'string') user.lastName = lastName.trim();
    if (typeof profileImage === 'string') user.profileImage = profileImage;

    await user.save();

    return res.json({
      id: user._id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phoneNumber: user.phoneNumber,
      profileImage: user.profileImage || '',
      referralCode: user.referralCode,
    });
  } catch (error) {
    console.error('프로필 업데이트 중 오류:', error);
    return res.status(500).json({ message: '프로필 업데이트 중 서버 오류가 발생했습니다.', error: error.message });
  }
});

// ---------------- 커뮤니티 API ----------------

// 글 생성
app.post('/api/community', async (req, res) => {
  try {
    const {
      title,
      content,
      authorId,
      authorName = '',
      authorAvatar = '',
      anonymous = false,
      category = '',
      tags = [],
      poll
    } = req.body || {};
    if (!title || !content || !authorId) {
      return res.status(400).json({ message: 'title, content, authorId는 필수입니다.' });
    }
    let pollPayload = null;
    if (poll && poll.question && Array.isArray(poll.options) && poll.options.length > 0) {
      pollPayload = {
        question: poll.question,
        allowsMultiple: !!poll.allowsMultiple,
        options: poll.options.map(opt => ({
          _id: opt._id || crypto.randomBytes(6).toString('hex'),
          text: opt.text || ''
        })).filter(o => o.text)
      };
    }
    const post = await CommunityPost.create({
      title,
      content,
      authorId,
      authorName,
      authorAvatar,
      anonymous: !!anonymous,
      category,
      tags: Array.isArray(tags) ? tags : [],
      poll: pollPayload,
    });
    return res.status(201).json(post);
  } catch (error) {
    console.error('커뮤니티 글 생성 오류:', error);
    return res.status(500).json({ message: '글 생성 중 오류가 발생했습니다.', error: error.message });
  }
});

// 목록
app.get('/api/community', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const sort = req.query.sort === 'popular' ? { likeCount: -1, createdAt: -1 } : { createdAt: -1 };
    const userId = (req.query.userId || '').trim();

    const posts = await CommunityPost.find({})
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const ids = posts.map(p => p._id);
    const idStrings = ids.map(id => id.toString());

    // 좋아요 집계
    const likesAgg = await CommunityLike.aggregate([
      { $match: { postId: { $in: ids } } },
      { $group: { _id: '$postId', count: { $sum: 1 } } }
    ]);
    const likeMap = {};
    likesAgg.forEach(l => { likeMap[l._id.toString()] = l.count; });

    // 현재 유저 좋아요 여부
    let likedSet = new Set();
    if (userId) {
      const liked = await CommunityLike.find({ postId: { $in: ids }, userId }).select('postId');
      likedSet = new Set(liked.map(l => l.postId.toString()));
    }

    // 댓글 집계 (ObjectId/문자열 혼용 데이터까지 포함)
    const commentsAgg = await CommunityComment.aggregate([
      { $match: { $expr: { $in: [{ $toString: '$postId' }, idStrings] } } },
      { $group: { _id: { $toString: '$postId' }, count: { $sum: 1 } } }
    ]);
    const commentMap = {};
    commentsAgg.forEach(c => { commentMap[c._id] = c.count; });

    // 투표 집계
    const votesAgg = await CommunityVote.aggregate([
      { $match: { postId: { $in: ids } } },
      { $unwind: '$choiceIds' },
      { $group: { _id: { postId: '$postId', choiceId: '$choiceIds' }, count: { $sum: 1 } } }
    ]);
    const voteMap = {};
    votesAgg.forEach(v => {
      const pid = v._id.postId.toString();
      const cid = v._id.choiceId;
      if (!voteMap[pid]) voteMap[pid] = {};
      voteMap[pid][cid] = v.count;
    });

    const total = await CommunityPost.countDocuments({});

    const items = posts.map(p => {
      const pid = p._id.toString();
      const likeCount = likeMap[pid] || 0;
      let pollResult = null;
      if (p.poll && Array.isArray(p.poll.options)) {
        pollResult = {
          question: p.poll.question,
          allowsMultiple: p.poll.allowsMultiple,
          options: p.poll.options.map((opt, idx) => {
            const oid = opt?._id || `opt_${idx}`;
            return {
              _id: oid,
              text: opt?.text || '',
              votes: (voteMap[pid] && voteMap[pid][oid]) ? voteMap[pid][oid] : 0,
            };
          })
        };
      }
      return {
        ...p,
        likeCount,
        isLiked: likedSet.has(pid),
        commentCount: commentMap[pid] ?? p.commentCount ?? 0,
        poll: pollResult,
      };
    });

    return res.json({
      page,
      limit,
      total,
      items,
    });
  } catch (error) {
    console.error('커뮤니티 목록 오류:', error);
    return res.status(500).json({ message: '목록 조회 중 오류가 발생했습니다.', error: error.message });
  }
});

// 상세
app.get('/api/community/:id', async (req, res) => {
  try {
    const postId = req.params.id;
    const post = await CommunityPost.findById(postId).lean();
    if (!post) return res.status(404).json({ message: '게시글을 찾을 수 없습니다.' });

    const comments = await CommunityComment.find({ postId }).sort({ createdAt: -1 }).lean();
    const votes = await CommunityVote.find({ postId }).lean();
    const likesCount = await CommunityLike.countDocuments({ postId });

    // 투표 집계
    let pollResult = null;
    if (post.poll && Array.isArray(post.poll.options)) {
      const counts = {};
      votes.forEach(v => {
        (v.choiceIds || []).forEach(c => {
          counts[c] = (counts[c] || 0) + 1;
        });
      });
      pollResult = {
        question: post.poll.question,
        allowsMultiple: post.poll.allowsMultiple,
        options: post.poll.options.map(o => ({
          _id: o._id,
          text: o.text,
          votes: counts[o._id] || 0,
        })),
        totalVotes: votes.length,
      };
    }

    return res.json({
      post: { ...post, likeCount: likesCount },
      comments,
      poll: pollResult,
    });
  } catch (error) {
    console.error('커뮤니티 상세 오류:', error);
    return res.status(500).json({ message: '상세 조회 중 오류가 발생했습니다.', error: error.message });
  }
});

// 글 수정
app.put('/api/community/:id', async (req, res) => {
  try {
    const postId = req.params.id;
    const { authorId, title, content, category = '', tags = [] } = req.body || {};
    if (!authorId) return res.status(400).json({ message: 'authorId가 필요합니다.' });

    const post = await CommunityPost.findById(postId);
    if (!post) return res.status(404).json({ message: '게시글을 찾을 수 없습니다.' });
    if (post.authorId !== authorId) return res.status(403).json({ message: '수정 권한이 없습니다.' });

    if (title) post.title = title;
    if (content) post.content = content;
    post.category = category;
    post.tags = Array.isArray(tags) ? tags : [];
    await post.save();

    return res.json(post);
  } catch (error) {
    console.error('커뮤니티 수정 오류:', error);
    return res.status(500).json({ message: '수정 중 오류가 발생했습니다.', error: error.message });
  }
});

// 글 삭제
app.delete('/api/community/:id', async (req, res) => {
  try {
    const postId = req.params.id;
    const { authorId } = req.body || {};
    if (!authorId) return res.status(400).json({ message: 'authorId가 필요합니다.' });

    const post = await CommunityPost.findById(postId);
    if (!post) return res.status(404).json({ message: '게시글을 찾을 수 없습니다.' });
    if (post.authorId !== authorId) return res.status(403).json({ message: '삭제 권한이 없습니다.' });

    await CommunityPost.deleteOne({ _id: postId });
    await CommunityComment.deleteMany({ postId });
    await CommunityVote.deleteMany({ postId });
    await CommunityLike.deleteMany({ postId });

    return res.json({ message: '삭제되었습니다.' });
  } catch (error) {
    console.error('커뮤니티 삭제 오류:', error);
    return res.status(500).json({ message: '삭제 중 오류가 발생했습니다.', error: error.message });
  }
});

// 댓글 작성
app.post('/api/community/:id/comments', async (req, res) => {
  try {
    const postId = req.params.id;
    const { authorId, authorName = '', authorAvatar = '', anonymous = false, text } = req.body || {};
    if (!authorId || !text) return res.status(400).json({ message: 'authorId와 text는 필수입니다.' });

    const post = await CommunityPost.findById(postId);
    if (!post) return res.status(404).json({ message: '게시글을 찾을 수 없습니다.' });

    const comment = await CommunityComment.create({
      postId,
      authorId,
      authorName,
      authorAvatar,
      anonymous: !!anonymous,
      text,
    });
    await CommunityPost.updateOne({ _id: postId }, { $inc: { commentCount: 1 } });
    return res.status(201).json(comment);
  } catch (error) {
    console.error('댓글 작성 오류:', error);
    return res.status(500).json({ message: '댓글 작성 중 오류가 발생했습니다.', error: error.message });
  }
});

// 댓글 삭제
app.delete('/api/community/comments/:commentId', async (req, res) => {
  try {
    const { commentId } = req.params;
    const { authorId } = req.body || {};
    if (!authorId) return res.status(400).json({ message: 'authorId가 필요합니다.' });

    const comment = await CommunityComment.findById(commentId);
    if (!comment) return res.status(404).json({ message: '댓글을 찾을 수 없습니다.' });
    if (comment.authorId !== authorId) return res.status(403).json({ message: '삭제 권한이 없습니다.' });

    await CommunityComment.deleteOne({ _id: commentId });
    await CommunityPost.updateOne({ _id: comment.postId }, { $inc: { commentCount: -1 } });

    return res.json({ message: '댓글이 삭제되었습니다.' });
  } catch (error) {
    console.error('댓글 삭제 오류:', error);
    return res.status(500).json({ message: '댓글 삭제 중 오류가 발생했습니다.', error: error.message });
  }
});

// 투표
app.post('/api/community/:id/vote', async (req, res) => {
  try {
    const postId = req.params.id;
    const { userId, choiceIds = [] } = req.body || {};
    if (!userId) return res.status(400).json({ message: 'userId가 필요합니다.' });

    const post = await CommunityPost.findById(postId);
    if (!post || !post.poll || !Array.isArray(post.poll.options)) {
      return res.status(400).json({ message: '투표가 없는 게시글입니다.' });
    }
    const validOptionIds = new Set(post.poll.options.map((o, idx) => o._id || `opt_${idx}`));
    const selected = (Array.isArray(choiceIds) ? choiceIds : [choiceIds]).filter(id => validOptionIds.has(id));
    if (selected.length === 0) return res.status(400).json({ message: '유효한 선택지가 없습니다.' });
    if (!post.poll.allowsMultiple && selected.length > 1) {
      return res.status(400).json({ message: '단일 선택 투표입니다.' });
    }

    await CommunityVote.findOneAndUpdate(
      { postId, userId },
      { $set: { choiceIds: selected } },
      { upsert: true, new: true }
    );

    return res.json({ message: '투표가 반영되었습니다.' });
  } catch (error) {
    console.error('투표 처리 오류:', error);
    return res.status(500).json({ message: '투표 처리 중 오류가 발생했습니다.', error: error.message });
  }
});

// 좋아요 토글
app.post('/api/community/:id/like', async (req, res) => {
  try {
    const postId = req.params.id;
    const { userId } = req.body || {};
    if (!userId) return res.status(400).json({ message: 'userId가 필요합니다.' });

    const post = await CommunityPost.findById(postId);
    if (!post) return res.status(404).json({ message: '게시글을 찾을 수 없습니다.' });

    const existing = await CommunityLike.findOne({ postId, userId });
    if (existing) {
      await CommunityLike.deleteOne({ _id: existing._id });
      await CommunityPost.updateOne({ _id: postId }, { $inc: { likeCount: -1 } });
      const likeCount = await CommunityLike.countDocuments({ postId });
      return res.json({ liked: false, likeCount });
    } else {
      await CommunityLike.create({ postId, userId });
      await CommunityPost.updateOne({ _id: postId }, { $inc: { likeCount: 1 } });
      const likeCount = await CommunityLike.countDocuments({ postId });
      return res.json({ liked: true, likeCount });
    }
  } catch (error) {
    console.error('좋아요 처리 오류:', error);
    return res.status(500).json({ message: '좋아요 처리 중 오류가 발생했습니다.', error: error.message });
  }
});

// TODO: 여기에 다른 API 라우트와 비즈니스 로직을 추가합니다.
// 예: app.use('/api/users', require('./routes/userRoutes'));

// ---------------- Gemini Proxy ----------------
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

app.post('/api/gemini', async (req, res) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).send('GEMINI_API_KEY is missing on server');
    }

    const { messages = [] } = req.body || {};
    const payload = {
      contents: messages.map(m => ({
        role: m.role === 'model' ? 'model' : 'user',
        parts: [{ text: m.text }]
      })),
      generationConfig: { temperature: 0.4, maxOutputTokens: 512 }
    };

    const r = await fetch(GEMINI_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify(payload)
    });

    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      return res.status(500).send(txt || `Gemini error ${r.status}`);
    }

    const data = await r.json().catch(() => ({}));
    const answer = data?.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
    return res.json({ answer });
  } catch (e) {
    console.error('Gemini proxy error', e);
    return res.status(500).send('Gemini proxy error');
  }
});

// ---------------- Google Vision OCR (서비스 계정) ----------------
const GCP_VISION_SA_B64 = process.env.GCP_VISION_SA || '';
const GCP_VISION_SA_FILE = process.env.GCP_VISION_SA_FILE || '';
const GCP_VISION_SA_FILE_FALLBACK = path.join(__dirname, 'gcp-sa.json');
let cachedSa = null;
let cachedJwtExp = 0;
let cachedAccessToken = '';

// 디버그: 서비스 계정 Base64 길이(내용은 미노출)
if (GCP_VISION_SA_B64) {
  console.log('GCP_VISION_SA length', GCP_VISION_SA_B64.length);
}

// Base64 헤더 제거 (data:image/..)
function stripBase64Header(str = '') {
  return str.replace(/^data:image\/\w+;base64,/, '');
}

// OCR 전처리: 회전 교정, 축소(7MP 이하), 그레이스케일, 대비/노이즈 완화
async function preprocessImageForOcr(inputBuffer) {
  const MAX_PIXELS = 7_000_000; // 약 7MP 권장치 (Cloud Vision 가이드)
  const meta = await sharp(inputBuffer).metadata();
  const width = meta.width || 0;
  const height = meta.height || 0;
  let resizeOption = null;

  if (width && height && width * height > MAX_PIXELS) {
    const scale = Math.sqrt(MAX_PIXELS / (width * height));
    resizeOption = {
      width: Math.max(1, Math.round(width * scale)),
      height: Math.max(1, Math.round(height * scale)),
    };
  }

  let pipeline = sharp(inputBuffer, { limitInputPixels: 120_000_000 }).rotate();
  if (resizeOption) {
    pipeline = pipeline.resize(resizeOption);
  }

  const processedBuffer = await pipeline
    .grayscale()
    .normalize() // 대비/밝기 자동 보정
    .median(1)   // 경계선/점 노이즈 완화
    .gamma(1.05) // 약한 감마 보정으로 글자 진하게
    .toFormat('png', { compressionLevel: 9 })
    .toBuffer();

  return processedBuffer.toString('base64');
}

function parseServiceAccount() {
  // 1순위: 파일 (env 지정 or 기본 gcp-sa.json)
  const filePath = GCP_VISION_SA_FILE || GCP_VISION_SA_FILE_FALLBACK;
  if (filePath && fs.existsSync(filePath)) {
    try {
      const fileContent = fs.readFileSync(filePath, 'utf8').trim();
      if (fileContent.startsWith('{')) {
        console.log('Using service account JSON file', path.basename(filePath));
        return JSON.parse(fileContent);
      }
      console.log('Using service account base64 file', path.basename(filePath));
      const json = Buffer.from(fileContent, 'base64').toString('utf8');
      return JSON.parse(json);
    } catch (e) {
      console.error('GCP_VISION_SA_FILE 읽기/파싱 실패', e);
      // 파일 실패 시 환경변수로 폴백
    }
  }

  // 2순위: 환경변수 base64
  if (!GCP_VISION_SA_B64) return null;
  try {
    const json = Buffer.from(GCP_VISION_SA_B64, 'base64').toString('utf8');
    return JSON.parse(json);
  } catch (e) {
    console.error('GCP_VISION_SA 파싱 실패', e);
    return null;
  }
}

async function getGcpAccessToken() {
  if (!cachedSa) cachedSa = parseServiceAccount();
  if (!cachedSa) throw new Error('GCP_VISION_SA 환경변수가 없습니다.');

  const now = Math.floor(Date.now() / 1000);
  if (cachedAccessToken && cachedJwtExp - 30 > now) {
    return cachedAccessToken;
  }

  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: cachedSa.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };

  const encode = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const toSign = `${encode(header)}.${encode(payload)}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(toSign);
  signer.end();
  const signature = signer.sign(cachedSa.private_key, 'base64url');
  const jwt = `${toSign}.${signature}`;

  const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!tokenResp.ok) {
    const txt = await tokenResp.text().catch(() => '');
    throw new Error(`Token error ${tokenResp.status} ${txt}`);
  }
  const tokenJson = await tokenResp.json();
  cachedAccessToken = tokenJson.access_token;
  cachedJwtExp = now + (tokenJson.expires_in || 3600);
  return cachedAccessToken;
}

// Vision 호출 공통 함수
async function callVision(imageBase64, skipPreprocess) {
  try {
    const cleanedBase64 = stripBase64Header(imageBase64 || '');
    if (!cleanedBase64) throw new Error('imageBase64 required');

    let inputBuffer;
    try {
      inputBuffer = Buffer.from(cleanedBase64, 'base64');
    } catch (_e) {
      throw new Error('invalid base64');
    }

    // 원본 바이너리 기준 12MB 초과는 거절 (너무 큰 입력 보호)
    if (!inputBuffer || !inputBuffer.length) {
      throw new Error('invalid image buffer');
    }
    if (inputBuffer.length > 12 * 1024 * 1024) {
      const err = new Error('image too large');
      err.status = 413;
      throw err;
    }

    // 전처리 시도 (skipPreprocess=true 로 건너뛸 수 있음)
    let payloadBase64 = cleanedBase64;
    if (skipPreprocess !== true) {
      try {
        payloadBase64 = await preprocessImageForOcr(inputBuffer);
      } catch (preErr) {
        console.warn('OCR 전처리 실패 - 원본 사용', preErr);
      }
    }

    const accessToken = await getGcpAccessToken();
    const body = {
      requests: [
        {
          image: { content: payloadBase64 },
          features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
          imageContext: { languageHints: ['ko', 'en'] },
        },
      ],
    };

    const visionResp = await fetch('https://vision.googleapis.com/v1/images:annotate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    });
    if (!visionResp.ok) {
      const txt = await visionResp.text().catch(() => '');
      throw new Error(`Vision error ${visionResp.status} ${txt}`);
    }
    const data = await visionResp.json();
    const resp = data?.responses?.[0] || {};
    const text = resp?.fullTextAnnotation?.text || '';

    // --- 바운딩 박스 기반 재정렬 로직 ---
    let orderedText = '';
    if (Array.isArray(resp?.textAnnotations) && resp.textAnnotations.length > 1) {
      const tokens = resp.textAnnotations.slice(1); // [0]은 full text
      const withPos = tokens.map(t => {
        const v = t.boundingPoly?.vertices || [];
        const ys = v.map(p => p.y || 0);
        const xs = v.map(p => p.x || 0);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const avgY = ys.reduce((a, b) => a + b, 0) / ys.length;
        const height = Math.max(1, maxY - minY);
        const width = Math.max(1, maxX - minX);
        return { text: t.description || '', x: minX, y: minY, cy: avgY, h: height, w: width };
      });

      // 라인 클러스터링 파라미터
      const medianH = withPos.map(t => t.h || 0).sort((a, b) => a - b)[Math.floor(withPos.length / 2)] || 20;
      const lineGap = Math.max(12, medianH * 0.8);

      // y 중심→x 정렬
      withPos.sort((a, b) => (a.cy - b.cy) || (a.x - b.x));
      const lines = [];
      let current = [];
      let currentY = withPos.length ? withPos[0].cy : 0;
      withPos.forEach(t => {
        if (Math.abs(t.cy - currentY) > lineGap) {
          if (current.length) lines.push(current);
          current = [t];
          currentY = t.cy;
        } else {
          current.push(t);
        }
      });
      if (current.length) lines.push(current);

      // 행 내 열 간격을 고려해 붙이기 (큰 간격엔 탭)
      const mergedLines = lines.map(line => {
        const sorted = line.sort((a, b) => a.x - b.x);
        const xs = sorted.map(t => t.x);
        const gaps = [];
        for (let i = 1; i < xs.length; i++) gaps.push(xs[i] - xs[i - 1]);
        const medianGap = gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)] || 0;
        const tabGap = Math.max(40, medianGap * 2.5);
        let row = '';
        sorted.forEach((t, idx) => {
          if (idx > 0 && (t.x - sorted[idx - 1].x) > tabGap) {
            row += '\t';
          } else if (idx > 0) {
            row += ' ';
          }
          row += t.text;
        });
        return row;
      });

      orderedText = mergedLines.join('\n');
    }

    // --- 블록/문단 기반 재정렬 (fullTextAnnotation 사용) ---
    let blockOrderedText = '';
    if (Array.isArray(resp?.fullTextAnnotation?.pages)) {
      const blocks = [];
      resp.fullTextAnnotation.pages.forEach(page => {
        (page.blocks || []).forEach(block => {
          const v = block.boundingBox?.vertices || [];
          const ys = v.map(p => p.y || 0);
          const xs = v.map(p => p.x || 0);
          const cy = ys.reduce((a, b) => a + b, 0) / Math.max(1, ys.length);
          const cx = xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
          // 블록 내 텍스트 복원
          const paragraphs = block.paragraphs || [];
          const paraTexts = paragraphs.map(p => {
            const words = (p.words || []).map(w => {
              const symbols = (w.symbols || []).map(s => s.text || '').join('');
              return symbols;
            });
            return words.join(' ');
          });
          // 문단마다 줄바꿈, 블록마다 빈 줄
          const blockText = paraTexts.join('\n');
          if (blockText && blockText.trim()) {
            blocks.push({ text: blockText.trim(), cy, cx });
          }
        });
      });
      if (blocks.length) {
        blocks.sort((a, b) => (a.cy - b.cy) || (a.cx - b.cx));
        blockOrderedText = blocks.map(b => b.text).join('\n\n');
      }
    }

    return { text, orderedText, blockOrderedText };
  } catch (e) {
    throw e;
  }
}

// 메인 OCR 라우트
app.post('/api/ocr/vision', async (req, res) => {
  try {
    const { imageBase64 } = req.body || {};
    const result = await callVision(imageBase64, req.query?.skipPreprocess === 'true');
    return res.json(result);
  } catch (e) {
    const status = e.status || 500;
    console.error('Vision OCR error', e);
    return res.status(status).json({ error: 'vision_failed', message: e.message });
  }
});

// 프론트 호환용: AI Fact / Doc Classify -> OCR 재사용
app.post('/api/ai-fact', async (req, res) => {
  try {
    const { imageBase64 } = req.body || {};
    const result = await callVision(imageBase64, req.query?.skipPreprocess === 'true');
    return res.json(result);
  } catch (e) {
    const status = e.status || 500;
    console.error('AI Fact error', e);
    return res.status(status).json({ error: 'vision_failed', message: e.message });
  }
});

app.post('/api/doc-classify', async (req, res) => {
  try {
    const { imageBase64 } = req.body || {};
    const result = await callVision(imageBase64, req.query?.skipPreprocess === 'true');
    return res.json(result);
  } catch (e) {
    const status = e.status || 500;
    console.error('Doc Classify error', e);
    return res.status(status).json({ error: 'vision_failed', message: e.message });
  }
});
