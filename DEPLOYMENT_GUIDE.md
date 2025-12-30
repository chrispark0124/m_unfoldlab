# Android 앱 배포 가이드

## 1단계: 백엔드 서버 배포 (필수)

### 온라인 서버에 백엔드 배포

현재 백엔드 서버는 `https://app.unfoldlab-legalpro.com`에 배포되어야 합니다.

**필요한 파일:**
- `server.js` (수정된 버전)
- `package.json`
- `node_modules` (또는 `npm install` 실행)

**배포 방법:**
1. 온라인 서버에 SSH로 접속하거나 FTP로 파일 업로드
2. `server.js` 파일을 최신 버전으로 교체
3. 서버에서 `npm install` 실행 (의존성 설치)
4. 서버 재시작:
   ```bash
   pm2 restart server.js
   # 또는
   node server.js
   ```

**확인:**
- `https://app.unfoldlab-legalpro.com/api/health` 접속하여 데이터베이스 연결 상태 확인
- `https://app.unfoldlab-legalpro.com/api/experts` 접속하여 데이터 확인

---

## 2단계: Android 앱 빌드

### A. Capacitor 동기화

프로젝트 루트 폴더(`C:\b2c\`)에서 터미널을 열고:

```bash
npx cap sync android
```

### B. Android Studio에서 빌드

1. **Android Studio 열기**
   - `android` 폴더를 Android Studio에서 엽니다

2. **Release 빌드 설정**
   - `Build` → `Generate Signed Bundle / APK` 선택
   - `Android App Bundle` 또는 `APK` 선택

3. **키스토어 생성 (처음인 경우)**
   - `Create new...` 클릭
   - 키스토어 정보 입력:
     - Key store path: 키스토어 파일 저장 위치
     - Password: 키스토어 비밀번호
     - Key alias: 키 별칭
     - Key password: 키 비밀번호
     - Validity: 25년 (권장)
     - Certificate 정보 입력

4. **빌드 타입 선택**
   - `release` 선택
   - `Finish` 클릭

5. **빌드 완료**
   - 빌드된 파일 위치:
     - **AAB**: `android/app/build/outputs/bundle/release/app-release.aab`
     - **APK**: `android/app/build/outputs/apk/release/app-release.apk`

---

## 3단계: 배포 옵션

### 옵션 A: Google Play Store 배포 (공식 배포)

1. **Google Play Console 접속**
   - https://play.google.com/console 접속
   - 개발자 계정 생성 (한 번만 $25)

2. **앱 생성**
   - "앱 만들기" 클릭
   - 앱 정보 입력 (이름, 기본 언어 등)

3. **프로덕션 트랙에 업로드**
   - "프로덕션" → "새 버전 만들기"
   - `.aab` 파일 업로드
   - 스토어 등록정보 작성:
     - 앱 설명
     - 스크린샷
     - 아이콘
     - 개인정보처리방침 URL (필요시)

4. **검토 제출**
   - 모든 필수 정보 입력 후 검토 제출
   - 승인까지 1-3일 소요

### 옵션 B: 직접 배포 (APK 파일)

1. **APK 파일 생성**
   - Android Studio에서 `APK` 선택하여 빌드

2. **배포 방법**
   - 웹사이트에 APK 파일 업로드
   - 사용자가 직접 다운로드하여 설치
   - **주의**: "알 수 없는 출처" 설치 허용 필요

3. **보안 고려사항**
   - APK 서명 확인
   - HTTPS로 배포
   - 악성 소프트웨어 스캔

---

## 4단계: 배포 전 체크리스트

### 백엔드 확인
- [ ] `https://app.unfoldlab-legalpro.com/api/health` 정상 작동
- [ ] `https://app.unfoldlab-legalpro.com/api/experts` 데이터 정상 반환
- [ ] CORS 설정 정상 (모든 origin 허용)
- [ ] MongoDB 연결 정상

### 앱 확인
- [ ] `www/index.html`의 `API_BASE_URL`이 `https://app.unfoldlab-legalpro.com`로 설정됨
- [ ] `capacitor.config.json`에 로컬 서버 설정 없음
- [ ] 앱 아이콘 및 이름 설정 완료
- [ ] AndroidManifest.xml 권한 설정 확인

### 테스트
- [ ] 실제 Android 기기에서 테스트
- [ ] 전문가 데이터 로드 확인
- [ ] 모든 화면 정상 작동 확인
- [ ] 네트워크 오류 처리 확인

---

## 5단계: 배포 후 모니터링

### 로그 확인
- 백엔드 서버 로그 모니터링
- MongoDB 연결 상태 확인
- API 요청/응답 로그 확인

### 사용자 피드백
- 크래시 리포트 모니터링 (Google Play Console)
- 사용자 리뷰 확인
- 성능 모니터링

---

## 문제 해결

### CORS 오류
- 백엔드 서버의 CORS 설정 확인
- `server.js`의 CORS 미들웨어 확인

### 데이터베이스 연결 오류
- MongoDB Atlas IP 화이트리스트 확인
- 연결 문자열 확인
- `/api/health` 엔드포인트로 상태 확인

### 앱 빌드 오류
- `npx cap sync android` 재실행
- Android Studio에서 "Clean Project" 실행
- Gradle 동기화

---

## 추가 리소스

- [Capacitor 공식 문서](https://capacitorjs.com/docs)
- [Google Play Console 도움말](https://support.google.com/googleplay/android-developer)
- [Android 앱 서명 가이드](https://developer.android.com/studio/publish/app-signing)

