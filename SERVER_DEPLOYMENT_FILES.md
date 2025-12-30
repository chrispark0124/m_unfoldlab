# 서버 배포 파일 목록

## 필수 파일 (반드시 업로드)

### 1. `server.js`
- 메인 서버 파일
- Express 서버 설정, MongoDB 연결, API 엔드포인트 포함

### 2. `package.json`
- Node.js 의존성 정의 파일
- 서버에서 `npm install` 실행 시 필요한 패키지 목록

---

## 서버에서 실행할 명령어

### 1단계: 파일 업로드 후
서버에 SSH로 접속하거나 터미널에서:

```bash
# 의존성 설치
npm install

# 또는 프로덕션 모드로 설치 (권장)
npm install --production
```

### 2단계: 서버 실행

**방법 A: PM2 사용 (권장 - 자동 재시작)**
```bash
# PM2 설치 (처음 한 번만)
npm install -g pm2

# 서버 시작
pm2 start server.js --name "b2c-backend"

# 서버 재시작
pm2 restart b2c-backend

# 로그 확인
pm2 logs b2c-backend
```

**방법 B: 직접 실행**
```bash
node server.js
```

**방법 C: 백그라운드 실행**
```bash
nohup node server.js > server.log 2>&1 &
```

---

## 서버 폴더 구조 예시

```
/home/user/b2c-backend/  (또는 서버의 프로젝트 폴더)
├── server.js          ← 필수
├── package.json       ← 필수
└── node_modules/      ← npm install 후 자동 생성됨
```

---

## 확인 방법

### 1. 서버 상태 확인
브라우저에서 접속:
```
https://app.unfoldlab-legalpro.com/
```
응답 예시:
```json
{
  "message": "백엔드 서버가 실행 중입니다.",
  "database": "연결됨",
  "timestamp": "2025-12-05T..."
}
```

### 2. 데이터베이스 연결 확인
```
https://app.unfoldlab-legalpro.com/api/health
```
응답 예시:
```json
{
  "status": "healthy",
  "database": "connected",
  "timestamp": "2025-12-05T..."
}
```

### 3. API 엔드포인트 확인
```
https://app.unfoldlab-legalpro.com/api/experts
```
응답: 전문가 데이터 배열 (JSON)

---

## 주의사항

1. **환경 변수 (PORT)**
   - 서버에서 `PORT` 환경 변수가 설정되어 있으면 그 포트 사용
   - 없으면 기본값 3000 사용
   - 예: `PORT=3000 node server.js`

2. **MongoDB 연결**
   - MongoDB Atlas 연결 문자열이 `server.js`에 하드코딩되어 있음
   - 별도 설정 파일 불필요

3. **CORS 설정**
   - 모든 origin 허용 (`*`)
   - 프로덕션에서는 특정 도메인만 허용하도록 수정 권장

4. **보안**
   - MongoDB 비밀번호가 코드에 포함되어 있음
   - 프로덕션에서는 환경 변수 사용 권장

---

## 문제 해결

### npm install 오류
```bash
# 캐시 정리 후 재시도
npm cache clean --force
npm install
```

### 포트 이미 사용 중
```bash
# 포트 사용 중인 프로세스 확인
lsof -i :3000
# 또는
netstat -tulpn | grep :3000

# 프로세스 종료
kill -9 [PID]
```

### MongoDB 연결 실패
- MongoDB Atlas의 Network Access에서 서버 IP 허용 확인
- 연결 문자열 확인

