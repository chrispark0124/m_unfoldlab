# 새 서버 설정 가이드

## 현재 상황
- 현재 API URL: `https://app.unfoldlab-legalpro.com`
- 다른 애플리케이션과 서버를 공유하고 있어서 새로운 서버가 필요함

## 새 서버 URL 옵션

### 옵션 1: 서브도메인 사용 (권장)
- `https://api.unfoldlab-legalpro.com`
- `https://backend.unfoldlab-legalpro.com`
- `https://b2c-api.unfoldlab-legalpro.com`

**장점:**
- 깔끔한 URL
- SSL 인증서 재사용 가능
- 도메인 관리가 쉬움

**설정 방법:**
1. 도메인 관리 패널에서 서브도메인 추가
2. DNS A 레코드 또는 CNAME 레코드 설정
3. 서버에 새 서브도메인으로 접속하도록 설정

### 옵션 2: 다른 포트 사용
- `https://app.unfoldlab-legalpro.com:3001`
- `https://app.unfoldlab-legalpro.com:8080`

**주의:**
- HTTPS는 기본적으로 443 포트만 사용
- 다른 포트 사용 시 SSL 인증서 설정 필요
- 방화벽에서 포트 열기 필요

### 옵션 3: 완전히 다른 도메인
- 새로운 도메인 구매 및 설정

---

## 새 서버 배포 단계

### 1단계: 새 서버 URL 결정
위 옵션 중 하나를 선택하세요.

### 2단계: 서버 설정
새 서버에 다음 파일 업로드:
- `server.js`
- `package.json`

### 3단계: 프론트엔드 코드 수정
`www/index.html` 파일의 414번째 줄:
```javascript
const API_BASE_URL = 'YOUR_NEW_SERVER_URL'; // 새 서버 URL로 변경
```

### 4단계: Capacitor 동기화
```bash
npx cap sync android
```

### 5단계: 앱 재빌드
Android Studio에서 앱을 다시 빌드

---

## 서버 배포 체크리스트

### 서버 준비
- [ ] 새 서버 URL 결정
- [ ] DNS 설정 (서브도메인인 경우)
- [ ] SSL 인증서 설정 (HTTPS 사용 시)
- [ ] 방화벽 포트 열기 (필요 시)

### 파일 배포
- [ ] `server.js` 업로드
- [ ] `package.json` 업로드
- [ ] `npm install` 실행
- [ ] 서버 시작 (`node server.js` 또는 `pm2 start server.js`)

### 확인
- [ ] `https://YOUR_NEW_SERVER_URL/api/health` 접속 테스트
- [ ] `https://YOUR_NEW_SERVER_URL/api/experts` 접속 테스트
- [ ] MongoDB 연결 확인

### 프론트엔드 업데이트
- [ ] `www/index.html`의 `API_BASE_URL` 변경
- [ ] `npx cap sync android` 실행
- [ ] 앱 재빌드 및 테스트

---

## 빠른 시작

1. **새 서버 URL을 결정하세요**
   예: `https://api.unfoldlab-legalpro.com`

2. **서버에 파일 배포**
   - `server.js`
   - `package.json`
   - `npm install` 실행
   - 서버 시작

3. **프론트엔드 코드 수정**
   - `www/index.html` 414번째 줄의 `API_BASE_URL` 변경

4. **테스트**
   - 새 서버 URL로 API 접속 테스트
   - 앱에서 데이터 로드 확인

---

## 질문
새 서버 URL을 결정하셨나요? URL을 알려주시면 바로 코드에 반영해드리겠습니다!

