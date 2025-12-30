
    let previousScreen = 'expert';
    let currentChatId = null;
    let currentAiType = null;
    const chatHistoryStore = {}; 
    const savedCoupons = []; 
    let isDarkMode = false;
    // 최근 결과 존재 여부 플래그
    let hasRecentResultFlag = false;
    // 마지막 업로드 이미지 시그니처
    let lastImageSignature = '';
    const LAST_RESULT_SIG_KEY = 'lastResultSignature';
    const LAST_RESULT_NAME_KEY = 'lastResultFileName';
    const LAST_RESULT_FLAG_KEY = 'lastResultAvailable';
    let lastFileName = '';

    function setLastResultSignature(sig) {
        lastImageSignature = sig || '';
        try { localStorage.setItem(LAST_RESULT_SIG_KEY, lastImageSignature); } catch (_e) {}
    }
    function getLastResultSignature() {
        if (lastImageSignature) return lastImageSignature;
        try {
            const s = localStorage.getItem(LAST_RESULT_SIG_KEY) || '';
            lastImageSignature = s;
            return s;
        } catch (_e) {
            return '';
        }
    }

    function setLastFileName(name) {
        lastFileName = name || '';
        try { localStorage.setItem(LAST_RESULT_NAME_KEY, lastFileName); } catch (_e) {}
    }
    function getLastFileName() {
        if (lastFileName) return lastFileName;
        try {
            const n = localStorage.getItem(LAST_RESULT_NAME_KEY) || '';
            lastFileName = n;
            return n;
        } catch (_e) {
            return '';
        }
    }
    
    // [History] 탭 이동 히스토리 관리
    const tabHistory = [];
    let isBackNav = false;

    const getApiBaseUrl = () => {
        return "https://munfoldlab.com"; // 👈 여기를 절대 비워두거나 localhost로 두지 마세요.
    };
    const API_BASE_URL = getApiBaseUrl();

    // ---- 강제 캐시/서비스워커 갱신 (배포 버전 구분용) ----
    const APP_VERSION = '2025-12-29-comment-count-v2';
    (function ensureFreshAssets() {
        try {
            const stored = localStorage.getItem('appVersion');
            if (stored === APP_VERSION) return;
            localStorage.setItem('appVersion', APP_VERSION);

            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(r => r.unregister()));
            }
            if (window.caches) {
                caches.keys().then(keys => keys.forEach(k => caches.delete(k)));
            }
            // 캐시 정리 후 한 번 새로고침
            setTimeout(() => window.location.reload(), 300);
        } catch (_e) {
            // 캐시 정리 실패 시 무시하고 계속 진행
        }
    })();

    // MongoDB에서 불러온 전문가 데이터 (임시 하드코딩 제거)
    let expertsData = [];
    
    // Gemini 프록시 엔드포인트 (백엔드에서 키를 숨긴 채 호출)
    // API_BASE_URL 기준으로 맞춤
    const GEMINI_PROXY_URL = `${API_BASE_URL}/api/gemini`;

    let communityPosts = [];

    let currentCommunityPostIndex = null;
    let editCommunityPostIndex = null;
    let communityAnonEnabled = true;
    let commentAnonEnabled = true;
    let notificationEnabled = true;
    const USER_ID_KEY = 'appUserId';
    function getUserId() {
        // 로그인 이메일 기반으로 계정 고유 ID를 사용 (기기 공통)
        try {
            const authEmail = (localStorage.getItem('authEmail') || '').trim().toLowerCase();
            if (authEmail) return `email:${authEmail}`;
        } catch (_e) {}

        try {
            const stored = localStorage.getItem(USER_ID_KEY);
            if (stored) return stored;
            const generated = `user-${Math.random().toString(36).slice(2, 10)}`;
            localStorage.setItem(USER_ID_KEY, generated);
            return generated;
        } catch (e) {
            // 스토리지 접근 불가 시 임시 ID
            return `user-${Math.random().toString(36).slice(2, 10)}`;
        }
    }

    // ----- 투표 중복 방지 (로컬 저장) -----
    function hasVoted(postId = '') {
        if (!postId) return false;
        const uid = getUserId();
        try {
            return localStorage.getItem(`vote:${uid}:${postId}`) === '1';
        } catch (_e) {
            return false;
        }
    }
    function markVoted(postId = '') {
        if (!postId) return;
        const uid = getUserId();
        try { localStorage.setItem(`vote:${uid}:${postId}`, '1'); } catch (_e) {}
    }
    function getVoteChoice(postId = '') {
        if (!postId) return '';
        const uid = getUserId();
        try { return localStorage.getItem(`voteChoice:${uid}:${postId}`) || ''; } catch (_e) { return ''; }
    }
    function setVoteChoice(postId = '', choiceId = '') {
        if (!postId || !choiceId) return;
        const uid = getUserId();
        try { localStorage.setItem(`voteChoice:${uid}:${postId}`, choiceId); } catch (_e) {}
    }

    const optimisticLikeCache = {};

    function hasLikedLocal(postId = '') {
        if (!postId) return false;
        const uid = getUserId();
        try { return localStorage.getItem(`like:${uid}:${postId}`) === '1'; } catch (_e) { return false; }
    }
    function setLikedLocal(postId = '', liked = false) {
        if (!postId) return;
        const uid = getUserId();
        try {
            if (liked) localStorage.setItem(`like:${uid}:${postId}`, '1');
            else localStorage.removeItem(`like:${uid}:${postId}`);
        } catch (_e) {}
    }

    async function fetchCommunity() {
        const prevMap = new Map(
            communityPosts
                .filter(p => p && p._id)
                .map(p => [p._id, { comments: p.comments, commentList: p.commentList }])
        );
        try {
            const res = await fetch(`${API_BASE_URL}/api/community?userId=${encodeURIComponent(getUserId())}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            communityPosts = Array.isArray(data?.items) ? data.items.map(p => {
                const prev = prevMap.get(p._id) || {};
                const opts = (p.poll?.options || []);
                const optA = opts[0] || {};
                const optB = opts[1] || {};
                const optAId = optA._id || optA.id || 'opt_0';
                const optBId = optB._id || optB.id || 'opt_1';
                const voted = hasVoted(p._id);
                const savedChoice = getVoteChoice(p._id);
                let userChoice = '';
                if (savedChoice === optAId) userChoice = 'left';
                if (savedChoice === optBId) userChoice = 'right';
                return {
                    user: p.anonymous ? '익명' : (p.authorName || '익명'),
                    avatar: p.anonymous ? '👤' : (p.authorAvatar || getDisplayAvatar()),
                    time: p.createdAt ? formatKST(p.createdAt) : '',
                    title: p.title,
                    content: p.content,
                    likes: p.likeCount || 0,
                    comments: (typeof p.commentCount === 'number')
                        ? p.commentCount
                        : (typeof prev.comments === 'number' ? prev.comments : 0),
                    leftVotes: optA.votes || 0,
                    rightVotes: optB.votes || 0,
                    leftLabel: optA.text || '선택1',
                    rightLabel: optB.text || '선택2',
                    leftOptionId: optAId,
                    rightOptionId: optBId,
                    voteTitle: p.poll ? (p.poll.question || '') : '',
                    authorId: p.authorId,
                    _id: p._id,
                    isLiked: optimisticLikeCache[p._id]?.isLiked ?? (!!p.isLiked || hasLikedLocal(p._id)),
                    // 서버가 늦게 따라올 수 있으므로 낙관적 카운트 우선
                    likes: typeof optimisticLikeCache[p._id]?.likes === 'number'
                        ? optimisticLikeCache[p._id].likes
                        : (p.likeCount || 0),
                    commentList: Array.isArray(prev.commentList) ? prev.commentList : undefined,
                    isVoted: voted,
                    userChoice,
                };
            }) : [];
            renderCommunity();
            backfillCommentCounts();
        } catch (e) {
            console.error('[community] fetch failed', e);
        }
    }

    async function fetchCommunityDetail(postId = '') {
        if (!postId) return null;
        try {
            const res = await fetch(`${API_BASE_URL}/api/community/${postId}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.json();
        } catch (e) {
            console.error('[community] detail fetch failed', e);
            return null;
        }
    }

    function transformComments(comments = []) {
        return comments.map((c) => {
            const name = c.anonymous ? '익명' : (c.authorName || '익명');
            const trimmed = typeof name === 'string' ? name.trim() : '';
            return {
                _id: c._id,
                user: name,
                avatar: c.anonymous ? '👤' : (c.authorAvatar || getProfileImageUrl() || (trimmed ? trimmed.charAt(0) : '👤')),
                time: c.createdAt ? formatKST(c.createdAt) : '방금 전',
                text: c.text || '',
                authorId: c.authorId,
            };
        });
    }

    async function backfillCommentCounts() {
        const targets = communityPosts
            .map((p, idx) => ({ p, idx }))
            .filter(({ p }) => (!p.comments || p.comments === 0) && p._id);
        if (!targets.length) return;

        await Promise.all(targets.map(async ({ p, idx }) => {
            try {
                const detail = await fetchCommunityDetail(p._id);
                if (!detail || !communityPosts[idx]) return;
                const mapped = Array.isArray(detail.comments) ? transformComments(detail.comments) : [];
                const count = mapped.length || detail.post?.commentCount || 0;
                communityPosts[idx].comments = count;
                if (mapped.length) communityPosts[idx].commentList = mapped;
            } catch (e) {
                console.error('[community] backfill comment count failed', e);
            }
        }));

        renderCommunity();
    }

    // 초기 로딩 시 커뮤니티 목록 가져오기
    document.addEventListener('DOMContentLoaded', () => {
        fetchCommunity().then(() => renderCommunity());
    });

    function isMyPost(post) {
        // 글 삭제/수정 권한은 authorId 일치로만 판단 (닉네임/익명으로는 불가)
        const uid = getUserId();
        if (!post) return false;
        return post.authorId === uid;
    }

    function isMyComment(comment) {
        const uid = getUserId();
        if (!comment) return false;
        if (comment.authorId) return comment.authorId === uid;
        const myName = getDisplayName();
        if (comment.user && myName && comment.user === myName) {
            comment.authorId = uid;
            return true;
        }
        return false;
    }

    function getCurrentTimeStr() {
        return new Date().toLocaleTimeString('ko-KR', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
            timeZone: 'Asia/Seoul'
        });
    }

    function formatChatText(text, iconHtml = '') {
        const clean = (text ?? '').trim().replace(/\n/g, '<br>');
        return iconHtml + clean;
    }

    function formatKST(dateInput) {
        if (!dateInput) return '';
        const d = new Date(dateInput);
        if (!isFinite(d)) return '';
        return d.toLocaleString('ko-KR', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Asia/Seoul'
        });
    }

    function showToast(msg) {
        const toast = document.getElementById('toast-msg');
        document.getElementById('toast-text').innerText = msg;
        toast.style.display = 'block';
        toast.style.animation = 'none';
        toast.offsetHeight; 
        toast.style.animation = null; 
        setTimeout(() => { toast.style.display = 'none'; }, 2000);
    }

    // 분석 로딩 오버레이 제어
    function showAnalyzingOverlay({ title = '분석 중입니다…', desc = '데이터를 해석하고 있어요. 잠시만 기다려주세요.', progress = 18 } = {}) {
        const overlay = document.getElementById('analyzing-overlay');
        if (!overlay) return;
        const titleEl = document.getElementById('analyzing-title');
        const descEl = document.getElementById('analyzing-desc');
        if (titleEl && title) titleEl.textContent = title;
        if (descEl && desc) descEl.textContent = desc;
        if (typeof progress === 'number') setAnalyzingProgress(progress);
        overlay.classList.add('active');
    }

    function hideAnalyzingOverlay() {
        const overlay = document.getElementById('analyzing-overlay');
        if (!overlay) return;
        overlay.classList.remove('active');
    }

    function setAnalyzingProgress(pct = 0) {
        const bar = document.getElementById('analyzing-progress');
        if (!bar) return;
        const clamped = Math.max(0, Math.min(100, Number.isFinite(pct) ? pct : 0));
        bar.style.width = `${clamped}%`;
    }

    /* ----------------------------
       앱 락 (PIN) 간단 구현
       - 최초 진입 시 PIN 설정/입력 오버레이 표시
       - 로컬 스토리지에 PIN 저장
    ----------------------------- */
    const APP_LOCK_KEY = 'appLockPin';
    const APP_LOCK_ENABLED_KEY = 'appLockEnabled';
    let appLockOverlay = null;
    let isAppPinEnabled = false;
    let appLockPendingEnable = false;
    let appLockPendingDisable = false;
    let appLockMode = 'access'; // access | enable | disable
    let appLockRequireOnReturn = false;
    let appLockReturnGuardBound = false;
    let isHistoryNavigating = false;
    let screenStack = [];
    let currentScreenId = null;
    let historyReady = false;
    let lastBackPress = 0;
    let webBackGuardBound = false;
    let historyGuardBound = false;
    let appLockSuppressUntil = 0; // 파일 선택/카메라 호출 시 잠금 억제

    function ensureAppLockOverlay() {
        if (appLockOverlay) return appLockOverlay;
        appLockOverlay = document.createElement('div');
        appLockOverlay.id = 'app-lock-overlay';
        appLockOverlay.innerHTML = `
            <div class="app-lock-card">
                <div class="app-lock-hero">
                    <div class="app-lock-username" id="app-lock-user"></div>
                    <div class="app-lock-title">비밀번호 입력</div>
                    <div class="app-lock-sub" id="app-lock-sub">PIN을 입력하세요.</div>
                    <div class="app-lock-error" id="app-lock-error"></div>
                </div>
                <input id="app-lock-input" class="app-lock-input" type="password" inputmode="numeric" maxlength="6" autocomplete="one-time-code" readonly autofocus />
                <div class="app-lock-dots" id="app-lock-dots">
                    ${Array.from({length: 6}).map(() => '<span class="app-lock-dot"></span>').join('')}
                </div>
                <div class="app-lock-pad-wrap">
                    <div class="app-lock-pad-top" id="app-lock-pad-top"></div>
                    <div class="app-lock-pad" id="app-lock-pad"></div>
                </div>
            </div>
        `;
        document.body.appendChild(appLockOverlay);

        const input = appLockOverlay.querySelector('#app-lock-input');
        input.onkeypress = (e) => { if (e.key === 'Enter') handleAppLockConfirm(input); };
        return appLockOverlay;
    }

    let appLockCaptureBypassUntil = 0; // 카메라/파일 업로드 중 복귀 잠금 무시용

    function beginCaptureBypass(ms = 120000) {
        appLockCaptureBypassUntil = Date.now() + ms;
        suppressAppLock(ms);
    }

    function isCaptureBypassActive() {
        return Date.now() < appLockCaptureBypassUntil;
    }

    function markAppLockRequire(force = false) {
        if (!isAppPinEnabled) return;
        if (isCaptureBypassActive()) return;
        if (!force && Date.now() < appLockSuppressUntil) return;
        if (force) appLockSuppressUntil = 0; // 즉시 잠금 요구
        // 복귀 시 생체 자동 시도를 다시 허용
        biometricPromptedThisSession = false;
        appLockRequireOnReturn = true;
    }

    function maybeShowAppLockOnReturn() {
        if (!isAppPinEnabled && !appLockPendingEnable && !appLockPendingDisable) return;
        const active = appLockOverlay && appLockOverlay.classList.contains('active');
        if (active) return;
        if (Date.now() < appLockSuppressUntil) return;
        if (isCaptureBypassActive()) return;
        if (appLockPendingEnable || appLockPendingDisable || appLockRequireOnReturn) {
            appLockRequireOnReturn = false;
            showAppLock();
        }
    }

    function suppressAppLock(ms = 90000) {
        appLockSuppressUntil = Date.now() + ms;
    }

    function shuffle(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    function renderPinPad() {
        const padTop = document.getElementById('app-lock-pad-top');
        const pad = document.getElementById('app-lock-pad');
        const input = document.getElementById('app-lock-input');
        if (!pad || !input || !padTop) return;

        // 상단 네비 버튼 숨김 처리 (사용자 요청)
        padTop.innerHTML = '';
        padTop.style.display = 'none';

        // 숫자 0~9를 랜덤 배치하고, 마지막 줄 좌측(슬롯 9)은 '전체삭제', 우측(슬롯 11)은 '←' 고정
        const nums = shuffle(['0','1','2','3','4','5','6','7','8','9']);
        const slots = Array(12).fill(null);
        let idx = 0;
        for (let i = 0; i < 12; i++) {
            if (i === 9 || i === 11) continue; // 고정 슬롯
            slots[i] = nums[idx++];
        }
        slots[9] = '전체삭제';
        slots[11] = '←';

        const ordered = slots;
        pad.innerHTML = ordered.map(k => {
            const isBlank = !k;
            const isErase = k === '←' || k === '전체삭제';
            const label = isBlank ? '' : k;
            const cls = isBlank ? 'blank' : isErase ? 'action' : '';
            return `<button type="button" class="app-lock-key ${cls}" data-key="${label}">${label}</button>`;
        }).join('');

        const handleInput = (key) => {
            let val = input.value || '';
            if (key === '지우기' || key === '전체삭제') {
                val = '';
            } else if (key === '←' || key === 'backspace') {
                val = val.slice(0, -1);
            } else if (key === 'shuffle') {
                renderPinPad();
                return;
            } else if (key && key.length === 1 && /[0-9]/.test(key)) {
                if (val.length >= (input.maxLength || 6)) return;
                val += key;
            }
            input.value = val;
            updatePinDots(val.length);
            if (val.length === (input.maxLength || 6)) {
                handleAppLockConfirm(input);
            }
        };

        pad.onclick = (e) => {
            const target = e.target.closest('.app-lock-key');
            if (!target) return;
            const key = target.dataset.key;
            if (!key) return;
            handleInput(key);
        };

        // 하단 네비 인셋 반영 (일부 기기에서 키패드가 가려지는 문제)
        if (typeof getComputedStyle === 'function') {
            const wrap = document.querySelector('.app-lock-pad-wrap');
            if (wrap) {
                const safeBottom = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-bottom')) || 0;
                wrap.style.paddingBottom = `calc(18px + ${safeBottom}px)`;
            }
        }
    }

    function updatePinDots(len = 0) {
        const dots = document.querySelectorAll('#app-lock-dots .app-lock-dot');
        dots.forEach((dot, idx) => {
            if (idx < len) dot.classList.add('filled');
            else dot.classList.remove('filled');
        });
    }

    function handleAppLockConfirm(inputEl) {
        const pin = (inputEl.value || '').trim();
        if (!pin) { setLockError('PIN을 입력해주세요.'); return; }
        if (!/^\d{6}$/.test(pin)) { setLockError('PIN은 숫자 6자리여야 합니다.'); return; }
        const saved = localStorage.getItem(APP_LOCK_KEY);
        // 새 PIN 설정
        if (!saved) {
            if (!appLockPendingEnable && !isAppPinEnabled) {
                setLockError('PIN을 설정하려면 잠금을 켜주세요.');
                return;
            }
            localStorage.setItem(APP_LOCK_KEY, pin);
            setLockError('');
            isAppPinEnabled = true;
            localStorage.setItem(APP_LOCK_ENABLED_KEY, 'true');
            updatePinUI();
            updateBiometricStateByPin();
            showToast('PIN이 설정되었습니다.');
            appLockPendingEnable = false;
            appLockPendingDisable = false;
            appLockMode = 'access';
            appLockRequireOnReturn = false;
            hideAppLock();
            return;
        }

        // 기존 PIN 확인
        if (pin === saved) {
            setLockError('');
            if (appLockPendingDisable) {
                isAppPinEnabled = false;
                localStorage.setItem(APP_LOCK_ENABLED_KEY, 'false');
                localStorage.removeItem(APP_LOCK_KEY);
                updatePinUI();
                updateBiometricStateByPin();
                showToast('앱 잠금이 꺼졌습니다.');
            } else if (appLockPendingEnable) {
                isAppPinEnabled = true;
                localStorage.setItem(APP_LOCK_ENABLED_KEY, 'true');
                updatePinUI();
                updateBiometricStateByPin();
                showToast('앱 잠금이 켜졌습니다.');
            }
            appLockPendingEnable = false;
            appLockPendingDisable = false;
            appLockMode = 'access';
            appLockRequireOnReturn = false;
            biometricFailCount = 0;
            biometricLastCancelled = false;
            suppressAppLock(BIOMETRIC_GRACE_MS); // PIN 성공 시에도 일정 시간 재인증 면제
            hideAppLock();
        } else {
            setLockError('PIN이 일치하지 않습니다.');
            inputEl.value = '';
            updatePinDots(0);
            inputEl.focus();
        }
    }

    async function tryBiometricUnlock() {
        if (!isBiometricEnabled) return;
        if (biometricPromptedThisSession) return; // 세션당 자동 생체 인증 1회만
        if (appLockMode !== 'access') return; // 설정/해제 모드에서는 PIN만 사용
        if (biometricFailCount >= BIOMETRIC_MAX_FAILS) {
            setLockError(`생체 인증 ${BIOMETRIC_MAX_FAILS}회 실패. PIN을 입력하세요.`);
            return;
        }
        biometricPromptedThisSession = true;
        const { ok, cancelled } = await requestBiometricAuth('생체 인증으로 잠금을 해제합니다.');
        biometricLastCancelled = cancelled;
        if (ok) {
            biometricFailCount = 0;
            setLockError('');
            appLockPendingEnable = false;
            appLockPendingDisable = false;
            appLockMode = 'access';
            appLockRequireOnReturn = false;
            suppressAppLock(BIOMETRIC_GRACE_MS); // 일정 시간 재인증 면제
            hideAppLock();
            return;
        }
        biometricFailCount = Math.min(BIOMETRIC_MAX_FAILS, biometricFailCount + 1);
        if (cancelled) {
            biometricFailCount = BIOMETRIC_MAX_FAILS;
            setLockError('생체 인증을 취소했습니다. PIN을 입력하세요.');
            return;
        }
        if (biometricFailCount >= BIOMETRIC_MAX_FAILS) {
            setLockError(`생체 인증 ${BIOMETRIC_MAX_FAILS}회 실패. PIN을 입력하세요.`);
        } else {
            setLockError(`생체 인증 실패 (${biometricFailCount}/${BIOMETRIC_MAX_FAILS}). PIN 또는 생체 인증을 다시 시도하세요.`);
        }
    }

    function showAppLock() {
        // 잠금이 꺼져 있어도 설정/해제 요청 중이면 오버레이 표시
        if (!isAppPinEnabled && !appLockPendingEnable && !appLockPendingDisable) return;
        const overlay = ensureAppLockOverlay();
        const usernameEl = document.getElementById('app-lock-user');
        const hasPin = !!localStorage.getItem(APP_LOCK_KEY);
        document.getElementById('app-lock-sub').innerText = hasPin ? 'PIN을 입력하세요.' : '새 PIN을 설정해주세요.';
        if (usernameEl) {
            const name = typeof getDisplayName === 'function' ? getDisplayName() : '회원';
            usernameEl.innerText = `${name}님의`;
        }
        overlay.classList.add('active');
        document.body.classList.add('app-locking');
        const input = document.getElementById('app-lock-input');
        input.value = '';
        setLockError('');
        updatePinDots(0);
        renderPinPad();
        setTimeout(() => input.focus(), 50);
        setTimeout(() => tryBiometricUnlock(), 80);
    }

    function hideAppLock() {
        if (appLockOverlay) appLockOverlay.classList.remove('active');
        document.body.classList.remove('app-locking');
    }

    function initAppLockReturnGuard() {
        if (appLockReturnGuardBound) return;
        appLockReturnGuardBound = true;
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                markAppLockRequire(true);
            } else {
                maybeShowAppLockOnReturn();
            }
        });
        window.addEventListener('blur', () => markAppLockRequire(true));
        window.addEventListener('focus', maybeShowAppLockOnReturn);
        window.addEventListener('pageshow', maybeShowAppLockOnReturn);
        window.addEventListener('pagehide', () => markAppLockRequire(true));

        // 네이티브 앱 포그라운드/백그라운드 감지 (Capacitor App 플러그인)
        const CapApp = (window.Capacitor && (window.Capacitor.App || (window.Capacitor.Plugins && window.Capacitor.Plugins.App))) || null;
        if (CapApp && typeof CapApp.addListener === 'function') {
            CapApp.addListener('appStateChange', ({ isActive }) => {
                if (isActive) {
                    maybeShowAppLockOnReturn();
                } else {
                    markAppLockRequire(true);
                }
            });
            CapApp.addListener('resume', maybeShowAppLockOnReturn);
            CapApp.addListener('pause', () => markAppLockRequire(true));
        }
    }

    function toggleAppPin() {
        if (isAppPinEnabled) {
            appLockPendingDisable = true;
            appLockPendingEnable = false;
            appLockMode = 'disable';
            showToast('PIN을 입력하면 앱 잠금이 해제됩니다.');
            showAppLock();
        } else {
            appLockPendingEnable = true;
            appLockPendingDisable = false;
            appLockMode = 'enable';
            showToast('PIN을 설정하세요.');
            showAppLock();
        }
    }

    function updatePinUI() {
        const track = document.getElementById('pin-track');
        const knob = document.getElementById('pin-knob');
        if (!track || !knob) return;
        if (isAppPinEnabled) {
            track.classList.remove('bg-slate-200');
            track.classList.add('bg-emerald-500');
            knob.style.transform = 'translateX(16px)';
        } else {
            track.classList.add('bg-slate-200');
            track.classList.remove('bg-emerald-500');
            knob.style.transform = 'translateX(0px)';
        }
    }

    function initAppPin() {
        const enabled = localStorage.getItem(APP_LOCK_ENABLED_KEY);
        isAppPinEnabled = enabled === 'true';
        updatePinUI();
        updateBiometricStateByPin();
        initAppLockReturnGuard();
        if (isAppPinEnabled) showAppLock();
    }
    function updateBiometricStateByPin() {
        if (!isAppPinEnabled) {
            isBiometricEnabled = false;
            localStorage.setItem('useBiometric', 'false');
        }
        updateBiometricUI();
    }

    function setLockError(msg) {
        const el = document.getElementById('app-lock-error');
        if (!el) return;
        el.innerText = msg || '';
    }

    // 간단한 인증 체크: 자동로그인 + 로그인 상태일 때만 통과
    function enforceLoginGuard() {
        const path = window.location.pathname.toLowerCase();
        const isIndex = path.endsWith('index.html') || path === '/' || path.endsWith('/index');
        if (!isIndex) return;
        const auto = localStorage.getItem('authAutoLogin') === 'true';
        const logged = localStorage.getItem('authLoggedIn') === 'true';
        const sessionLogged = sessionStorage.getItem('authLoggedInSession') === 'true';
        if (auto && logged) {
            // 자동로그인 유지 시 세션 플래그도 세팅
            sessionStorage.setItem('authLoggedInSession', 'true');
            return;
        }
        if (sessionLogged) return;
        window.location.href = 'auth.html#login';
    }

    // PIN 재설정 (설정 화면 전용)

    function toggleVipBtn(show) {
        const btn = document.getElementById('vip-btn');
        if (show) btn.classList.remove('hidden-btn');
        else btn.classList.add('hidden-btn');
    }

    function setActiveTabByScreenId(screenId) {
        // 하단 탭 버튼 상태만 업데이트 (히스토리/스택은 건드리지 않음)
        const tabMap = {
            'screen-home': 'home',
            'screen-case': 'case',
            'screen-expert': 'expert',
            'screen-community': 'community',
            'screen-menu': 'menu'
        };
        const tabName = tabMap[screenId];
        if (!tabName) return;
        document.querySelectorAll('.nav-item').forEach(n => {
            n.classList.remove('active', 'text-emerald-600', 'font-bold');
            n.classList.add('text-slate-400');
        });
        const activeNav = document.getElementById('nav-' + tabName);
        if (activeNav) {
            activeNav.classList.add('active', 'text-emerald-600', 'font-bold');
            activeNav.classList.remove('text-slate-400');
        }
    }

    function switchTab(tabName) {
        // 현재 활성화된 탭 파악 (히스토리 저장용)
        if (!isBackNav) {
            const currentTabBtn = document.querySelector('.nav-item.active');
            if (currentTabBtn) {
                const currentTabName = currentTabBtn.id.replace('nav-', '');
                // 같은 탭을 또 누른 게 아니고, 유효한 탭이라면 스택에 저장
                if (currentTabName && currentTabName !== tabName) {
                    tabHistory.push(currentTabName);
                    // 스택이 너무 커지지 않게 제한 (선택사항, 여기선 20개)
                    if(tabHistory.length > 20) tabHistory.shift();
                }
            }
        }

        document.querySelectorAll('.nav-item').forEach(n => {
            n.classList.remove('active', 'text-emerald-600', 'font-bold');
            n.classList.add('text-slate-400');
        });
        
        const activeNav = document.getElementById('nav-' + tabName);
        if(activeNav) {
            activeNav.classList.add('active', 'text-emerald-600', 'font-bold');
            activeNav.classList.remove('text-slate-400');
        }

        document.querySelectorAll('.screen').forEach(s => {
            s.style.display = 'none';
            s.classList.remove('fade-in');
            s.classList.remove('active');
        });
        
        const screenId = 'screen-' + tabName;
        setScreen(screenId, { mode: 'clear' });

        if (tabName === 'home') toggleVipBtn(true);
        else toggleVipBtn(false);

        if (tabName === 'expert') filterExperts('전체');
        if (tabName === 'community') fetchCommunity().then(() => renderCommunity());
        if (tabName === 'menu') renderReferralCode();
        
        // 이동 완료 후 플래그 초기화
        isBackNav = false;
    }

    function goToSubMenu(page) {
        document.querySelectorAll('.screen').forEach(s => {
            s.style.display = 'none';
            s.classList.remove('active');
        });
        const target = document.getElementById('screen-' + page);
        target.style.display = 'flex';
        target.classList.add('fade-in');
        target.classList.add('active');
        toggleVipBtn(screenId === 'screen-home');
        if(page === 'coupons') renderCoupons();
        if(page === 'menu') renderReferralCode();
    }

    function backToMenu() { switchTab('menu'); }

    function getDisplayName() {
        // 우선: 계정별 스코프 저장값 → 서버에서 받은 사용자명 → (레거시) 전역 저장값
        const scoped = (getScopedItem('profileName') || getScopedItem('serverUserName') || '').trim();
        if (scoped) return scoped;

        // 레거시 전역 값이 남아 있으면 스코프 키로 옮겨주기
        if (window.localStorage) {
            const legacy = (localStorage.getItem('profileName') || '').trim();
            if (legacy) {
                setScopedItem('profileName', legacy);
                return legacy;
            }
        }
        return '익명';
    }

    function getProfileImageUrl() {
        // 계정별 프로필 이미지 우선
        const scopedImg = (getScopedItem('profileImage') || getScopedItem('serverUserImage') || '').trim();
        if (scopedImg) return scopedImg;
        // 레거시 전역 이미지 승격
        if (window.localStorage) {
            const legacy = (localStorage.getItem('profileImage') || '').trim();
            if (legacy) {
                setScopedItem('profileImage', legacy);
                return legacy;
            }
        }
        return '';
    }

    function getDisplayAvatar() {
        // 이미지가 있으면 이미지 우선
        const img = getProfileImageUrl();
        if (img) return img;

        // 계정별 이모지 우선
        const scopedEmoji = (getScopedItem('profileEmoji') || '').trim();
        if (scopedEmoji) return scopedEmoji;

        // 레거시 전역 이모지가 있으면 스코프로 승격
        if (window.localStorage) {
            const legacyEmoji = (localStorage.getItem('profileEmoji') || '').trim();
            if (legacyEmoji) {
                setScopedItem('profileEmoji', legacyEmoji);
                return legacyEmoji;
            }
        }

        // 이름 첫 글자 fallback
        const name = getDisplayName();
        return name ? name.trim().charAt(0) : '👤';
    }

    function buildAvatarHTML(avatar = '', userName = '', size = 32) {
        const sizePx = `${size}px`;
        const isImg = typeof avatar === 'string' && (/^https?:\/\//i.test(avatar) || /^data:image\//i.test(avatar) || /^blob:/i.test(avatar));
        if (isImg) {
            return `<img src="${avatar}" alt="${userName || 'avatar'}" class="w-[${sizePx}] h-[${sizePx}] rounded-full object-cover bg-slate-100 border border-slate-200" />`;
        }
        const display = avatar || (userName ? userName.trim().charAt(0) : '👤');
        return `<div class="w-[${sizePx}] h-[${sizePx}] rounded-full bg-slate-200 flex items-center justify-center text-xs">${display}</div>`;
    }

    function normalizeUser(name, defaultName) {
        if (!name) return defaultName;
        const trimmed = name.trim();
        return trimmed || defaultName;
    }

    function normalizeAvatar(avatar, defaultAvatar, userName) {
        if (!avatar) {
            if (userName === '익명') return '👤';
            return defaultAvatar;
        }
        return avatar;
    }

    function renderCommunity() {
        const feed = document.getElementById('community-feed');
        feed.innerHTML = '';
        const defaultName = '익명';
        const defaultAvatar = '👤';
        communityPosts.forEach((post, index) => {
            if (!post.authorId) post.authorId = 'seed';
            const baseCommentCount = typeof post.commentCount === 'number'
                ? post.commentCount
                : (typeof post.comments === 'number' ? post.comments : 0);
            if (!post.commentList) {
                post.commentList = [];
                post.comments = baseCommentCount;
            } else {
                post.comments = post.commentList.length;
            }
            const userName = normalizeUser(post.user, defaultName);
            const avatar = normalizeAvatar(post.avatar, defaultAvatar, userName);

            const hasVote = post.voteTitle && post.leftLabel && post.rightLabel;

            // 투표 비율 계산 (표 수 기준)
            let voteBlock = '';
            if (hasVote) {
                let leftVotes = typeof post.leftVotes === 'number' ? post.leftVotes : 0;
                let rightVotes = typeof post.rightVotes === 'number' ? post.rightVotes : 0;

                const total = leftVotes + rightVotes;
                let leftPct = 0;
                let rightPct = 0;

                if (total > 0) {
                    leftPct = Math.round((leftVotes / total) * 100);
                    rightPct = 100 - leftPct;
                }

                // 상태를 다시 저장해서 상세 화면과 동기화
                post.leftVotes = leftVotes;
                post.rightVotes = rightVotes;
                post.leftPct = leftPct;
                post.rightPct = rightPct;

                const votedClass = post.isVoted ? 'opacity-60 pointer-events-none' : '';
                const leftSelected = post.userChoice === 'left' ? 'border-emerald-400 text-emerald-600 font-bold' : '';
                const rightSelected = post.userChoice === 'right' ? 'border-emerald-400 text-emerald-600 font-bold' : '';
                voteBlock = `
                <div class="bg-slate-50 p-3 rounded-xl mb-3">
                    <p class="text-[10px] text-slate-500 font-bold mb-2 text-center">🗳️ ${post.voteTitle}</p>
                    <div class="flex items-center gap-2 text-[10px] font-bold text-slate-600 mb-1">
                        <button class="px-2 py-1 rounded-full bg-white border text-slate-700 ${votedClass} ${leftSelected}" onclick="submitVote(${index}, '${post.leftOptionId || ''}'); event.stopPropagation();">${post.leftLabel}</button>
                        <span class="ml-auto"></span>
                        <button class="px-2 py-1 rounded-full bg-white border text-slate-700 ${votedClass} ${rightSelected}" onclick="submitVote(${index}, '${post.rightOptionId || ''}'); event.stopPropagation();">${post.rightLabel}</button>
                    </div>
                    <div class="h-2 w-full bg-slate-200 rounded-full overflow-hidden flex">
                        <div class="h-full bg-emerald-400 vote-bar" style="width: ${leftPct}%"></div>
                        <div class="h-full bg-red-400 vote-bar" style="width: ${rightPct}%"></div>
                    </div>
                    <div class="flex justify-between text-[9px] text-slate-400 mt-1">
                        <span>${leftPct}%</span>
                        <span>${rightPct}%</span>
                    </div>
                    ${post.isVoted ? '<div class="text-[10px] text-emerald-600 font-bold mt-1">투표 완료</div>' : ''}
                </div>`;
            }

            const isOwner = isMyPost(post);

            feed.innerHTML += `
            <div class="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm relative">
                ${isOwner ? `
                <div class="absolute top-3 right-3">
                    <button class="card-menu-btn" onclick="toggleCardMenu(${index}, event)" aria-label="글 메뉴">
                        <i class="fas fa-ellipsis-v"></i>
                    </button>
                    <div id="card-menu-${index}" class="community-menu-dropdown" style="display:none">
                        <button type="button" class="community-menu-item" onclick="startEditCommunity(${index}); hideAllCardMenus();">수정</button>
                        <button type="button" class="community-menu-item text-red-500" onclick="deleteCommunityPost(${index}); hideAllCardMenus();">삭제</button>
                    </div>
                </div>` : ''}
                <div class="flex items-center gap-2 mb-3">
                    ${buildAvatarHTML(avatar, userName, 32)}
                    <div><p class="text-xs font-bold text-slate-800">${userName}</p><p class="text-[10px] text-slate-400">${post.time || ''}</p></div>
                </div>
                <h3 class="font-bold text-slate-800 mb-1">${post.title || ''}</h3>
                <p class="text-xs text-slate-600 leading-relaxed mb-4 whitespace-pre-wrap break-words">${post.content || ''}</p>
                
                ${voteBlock}

                <div class="flex gap-4 text-xs text-slate-400 border-t border-slate-50 pt-3">
                    <button class="flex items-center gap-1 hover:text-red-500" onclick="toggleLike(${index})">
                        <i class="${post.isLiked ? 'fas fa-heart text-red-500' : 'far fa-heart text-slate-400'}" id="like-icon-${index}"></i> 
                        <span id="like-count-${index}" class="${post.isLiked ? 'text-red-500' : 'text-slate-400'}">${post.likes}</span>
                    </button>
                    <button class="flex items-center gap-1 hover:text-blue-500" onclick="openCommunityDetail(${index})">
                        <i class="far fa-comment"></i> 
                        <span id="comment-count-${index}">${post.comments}</span>
                    </button>
                    <button class="ml-auto" onclick="shareCommunityPost(${index})">
                        <i class="fas fa-share-alt"></i>
                    </button>
                </div>
            </div>`;
        });
    }

    function updateCommunityDeleteButton() {
        const btn = document.getElementById('community-menu-btn');
        if (!btn) return;
        if (currentCommunityPostIndex === null) {
            btn.style.display = 'none';
            return;
        }
        const post = communityPosts[currentCommunityPostIndex];
        const isMine = isMyPost(post);
        btn.style.display = 'inline-flex';
        setCommunityMenuState(isMine);
    }

    function deleteCommunityPost(index, fromDetail = false) {
        const post = communityPosts[index];
        if (!post) return;
        if (!isMyPost(post)) {
            showToast('본인이 작성한 글만 삭제할 수 있습니다.');
            return;
        }
        if (!confirm('이 글을 삭제할까요?')) return;

        const id = post._id;
        const authorId = getUserId();
        (async () => {
            try {
                if (id) {
                    const resp = await fetch(`${API_BASE_URL}/api/community/${id}`, {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ authorId }),
                    });
                    if (!resp.ok) {
                        const msg = await resp.text();
                        throw new Error(msg || `삭제 실패 (${resp.status})`);
                    }
                }
            } catch (e) {
                console.error('[community] delete failed', e);
                showToast('삭제 권한이 없습니다.');
                return;
            } finally {
                await fetchCommunity();
                renderCommunity();
                updateCommunityDeleteButton();
                if (fromDetail) {
                    setScreen('screen-community', { push: false, replace: true });
                }
                showToast('삭제되었습니다.');
            }
        })();
    }

    function hideCommunityMenu() {
        const menu = document.getElementById('community-menu-dropdown');
        if (menu) menu.style.display = 'none';
    }

    function hideAllCardMenus() {
        document.querySelectorAll('.community-menu-dropdown[id^="card-menu-"]').forEach(el => el.style.display = 'none');
    }

    function toggleCardMenu(index, e) {
        e?.stopPropagation?.();
        hideAllCardMenus();
        const menu = document.getElementById(`card-menu-${index}`);
        if (!menu) return;
        menu.style.display = menu.style.display === 'none' || !menu.style.display ? 'block' : 'none';
    }

    function setCommunityMenuState(isOwner) {
        const menu = document.getElementById('community-menu-dropdown');
        if (!menu) return;
        const items = menu.querySelectorAll('.community-menu-item');
        items.forEach((el) => {
            if (isOwner) {
                el.classList.remove('disabled');
            } else {
                el.classList.add('disabled');
            }
        });
    }

    function toggleCommunityMenu(e) {
        e?.stopPropagation?.();
        const menu = document.getElementById('community-menu-dropdown');
        if (!menu) return;
        menu.style.display = menu.style.display === 'none' || !menu.style.display ? 'block' : 'none';
    }

    document.addEventListener('click', (ev) => {
        const menu = document.getElementById('community-menu-dropdown');
        const btn = document.getElementById('community-menu-btn');
        if (!menu || !btn) return;
        if (!menu.contains(ev.target) && !btn.contains(ev.target)) {
            hideCommunityMenu();
        }
        // 카드별 메뉴도 외부 클릭 시 닫기
        hideAllCardMenus();
    });

    function editCurrentCommunity() {
        if (currentCommunityPostIndex === null) return;
        const post = communityPosts[currentCommunityPostIndex];
        if (!isMyPost(post)) {
            showToast('본인이 작성한 글만 수정할 수 있습니다.');
            hideCommunityMenu();
            return;
        }
        startEditCommunity(currentCommunityPostIndex);
        hideCommunityMenu();
    }

    function deleteCurrentCommunity() {
        if (currentCommunityPostIndex === null) return;
        deleteCommunityPost(currentCommunityPostIndex, true);
        hideCommunityMenu();
    }

    function startEditCommunity(index) {
        const post = communityPosts[index];
        if (!post) return;
        editCommunityPostIndex = index;
        setScreen('screen-community-write', { mode: 'push' });

        const titleEl = document.getElementById('community-write-title');
        const contentEl = document.getElementById('community-write-content');
        const voteTitleEl = document.getElementById('community-write-vote-title');
        const voteLeftEl = document.getElementById('community-write-vote-left');
        const voteRightEl = document.getElementById('community-write-vote-right');
        if (titleEl) titleEl.value = post.title || '';
        if (contentEl) contentEl.value = post.content || '';
        if (voteTitleEl) voteTitleEl.value = post.voteTitle || '';
        if (voteLeftEl) voteLeftEl.value = post.leftLabel || '';
        if (voteRightEl) voteRightEl.value = post.rightLabel || '';
    }

    async function toggleLike(index) {
        const post = communityPosts[index];
        if (!post || !post._id) return;
        const prevLiked = !!post.isLiked;
        const prevCount = typeof post.likes === 'number' ? post.likes : 0;
        try {
            const resp = await fetch(`${API_BASE_URL}/api/community/${post._id}/like`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: getUserId() }),
            });
            if (resp.ok) {
                const data = await resp.json().catch(() => ({}));
                if (typeof data.likeCount === 'number') post.likes = data.likeCount;
                if (typeof data.liked === 'boolean') post.isLiked = data.liked;
                optimisticLikeCache[post._id] = {
                    isLiked: post.isLiked,
                    likes: post.likes,
                };
                setLikedLocal(post._id, post.isLiked);
            } else {
                throw new Error(`HTTP ${resp.status}`);
            }
        } catch (e) {
            console.error('[community] like failed', e);
            showToast('좋아요 처리 중 오류가 발생했습니다.');
            // 실패 시 롤백
            post.isLiked = prevLiked;
            post.likes = prevCount;
            optimisticLikeCache[post._id] = {
                isLiked: post.isLiked,
                likes: post.likes,
            };
            setLikedLocal(post._id, post.isLiked);
        } finally {
            renderCommunity();
            // 서버 최신 상태와 동기화
            fetchCommunity().catch(() => {});
        }
    }

    async function submitVote(index, optionId) {
        const post = communityPosts[index];
        if (!post || !post._id) {
            console.warn('[community] vote: post missing', post);
            return;
        }
        if (!optionId) {
            const fallback = post.leftOptionId || post.rightOptionId || '';
            if (!fallback) {
                console.warn('[community] vote: optionId missing', post);
                showToast('투표 옵션을 불러오지 못했습니다. 다시 시도해 주세요.');
                return;
            }
            optionId = fallback;
        }
        if (post.isVoted) {
            showToast('이미 투표한 글입니다.');
            return;
        }
        try {
            const resp = await fetch(`${API_BASE_URL}/api/community/${post._id}/vote`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: getUserId(), choiceIds: [optionId] }),
            });
            if (!resp.ok) {
                const txt = await resp.text().catch(() => '');
                console.error('[community] vote failed', resp.status, txt);
                showToast(`투표 실패 (HTTP ${resp.status})`);
                return;
            }
        } catch (e) {
            console.error('[community] vote failed', e);
            showToast('투표 중 오류가 발생했습니다.');
        } finally {
            const prevId = post?._id;
            await fetchCommunity();
            renderCommunity();
            if (prevId) {
                const newIdx = communityPosts.findIndex(p => p._id === prevId);
                if (newIdx >= 0) {
                    currentCommunityPostIndex = newIdx;
                    if (optionId === communityPosts[newIdx].leftOptionId) communityPosts[newIdx].userChoice = 'left';
                    if (optionId === communityPosts[newIdx].rightOptionId) communityPosts[newIdx].userChoice = 'right';
                    communityPosts[newIdx].isVoted = true;
                    markVoted(prevId);
                    setVoteChoice(prevId, optionId);
                    renderCommunityDetailVote();
                }
            }
        }
    }

    // 고민 공유
    async function shareCommunityPost(index) {
        const post = communityPosts[index];
        if (!post) return;

        const shareText = `[고민 공유]\n${post.title}\n\n${post.content}`;

        try {
            // Web Share API가 있으면 기본 공유 시트 사용
            if (navigator.share) {
                await navigator.share({
                    title: post.title,
                    text: shareText
                });
            } else {
                // 없으면 텍스트만 클립보드로 복사
                await navigator.clipboard.writeText(shareText);
                showToast('고민 내용이 복사되었습니다. 원하는 곳에 붙여넣기 하세요.');
            }
        } catch (err) {
            console.error('공유 중 오류:', err);
            showToast('공유 중 오류가 발생했습니다.');
        }
    }

    function updateCommunityAnonUI() {
        const track = document.getElementById('community-anon-track');
        const knob = document.getElementById('community-anon-knob');
        if (!track || !knob) return;

        if (communityAnonEnabled) {
            track.style.backgroundColor = '#10B981';
            knob.style.transform = 'translateX(16px)';
        } else {
            track.style.backgroundColor = '#CBD5E1';
            knob.style.transform = 'translateX(0px)';
        }
    }

    function toggleCommunityAnon() {
        communityAnonEnabled = !communityAnonEnabled;
        updateCommunityAnonUI();
    }

    function openCommunityWrite() {
        setScreen('screen-community-write', { mode: 'push' });
    }

    function backToCommunityFromWrite() {
        editCommunityPostIndex = null;
        setScreen('screen-community', { mode: 'replace' });
    }

    async function submitCommunityWrite() {
        const title = document.getElementById('community-write-title')?.value.trim();
        const content = document.getElementById('community-write-content')?.value.trim();
        const voteTitle = document.getElementById('community-write-vote-title')?.value.trim();
        const voteLeft = document.getElementById('community-write-vote-left')?.value.trim();
        const voteRight = document.getElementById('community-write-vote-right')?.value.trim();

        if (!title || !content) {
            showToast('제목과 내용을 모두 입력해주세요.');
            return;
        }

        const displayName = getDisplayName();
        const userId = getUserId();
        const profileImage = communityAnonEnabled ? '' : getProfileImageUrl();
        const payload = {
            title,
            content,
            authorId: userId,
            authorName: communityAnonEnabled ? '' : displayName,
            authorAvatar: profileImage,
            anonymous: communityAnonEnabled,
        };
        if (voteTitle && voteLeft && voteRight) {
            payload.poll = {
                question: voteTitle,
                allowsMultiple: false,
                options: [
                    { text: voteLeft },
                    { text: voteRight },
                ]
            };
        }

        try {
            const res = await fetch(`${API_BASE_URL}/api/community`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!res.ok) {
                const txt = await res.text().catch(() => '');
                throw new Error(`HTTP ${res.status} ${txt}`);
            }
            document.getElementById('community-write-title').value = '';
            document.getElementById('community-write-content').value = '';
            if (document.getElementById('community-write-vote-title')) {
                document.getElementById('community-write-vote-title').value = '';
                document.getElementById('community-write-vote-left').value = '';
                document.getElementById('community-write-vote-right').value = '';
            }
            backToCommunityFromWrite();
            showToast('고민이 등록되었습니다.');
            await fetchCommunity();
            renderCommunity();
        } catch (e) {
            console.error('[community] submit failed', e);
            showToast('등록에 실패했습니다. 다시 시도해주세요.');
        }
    }

    // 히스토리 기반 뒤로가기 대신 내부 스택으로만 처리
    function pushScreenState(screenId) {
        return;
    }

    function pushHistory(screenId) {
        if (!window.history || typeof history.pushState !== 'function') return;
        const state = { screen: screenId, ts: Date.now() };
        if (!historyReady) {
            // 최초 한 번은 replace로 덮고, 곧바로 push해서 popstate가 반드시 발생하도록 2단계 스택 생성
            history.replaceState(state, '');
            history.pushState(state, '');
            historyReady = true;
            return;
        }
        history.pushState(state, '');
    }

    function setScreen(screenId, { mode = 'replace' } = {}) {
        if (!screenId) return;
        if (mode === 'push' && currentScreenId && currentScreenId !== screenId) {
            screenStack.push(currentScreenId);
        } else if (mode === 'clear') {
            screenStack = [];
        }

        document.querySelectorAll('.screen').forEach(s => {
            s.style.display = 'none';
            s.classList.remove('active');
        });
        const target = document.getElementById(screenId);
        if (target) {
            target.style.display = 'flex';
            target.classList.add('fade-in');
            target.classList.add('active');
        }
        toggleVipBtn(screenId === 'screen-home');
        if (screenId === 'screen-community') renderCommunity();
        setActiveTabByScreenId(screenId);
        currentScreenId = screenId;
        // 채팅 외 화면에서는 하단 네비를 보이도록 복구
        const nav = document.querySelector('.top-nav');
        if (nav) {
            nav.style.display = screenId === 'screen-chat' ? 'none' : 'flex';
        }
        if (!isHistoryNavigating) {
            pushHistory(screenId);
        }
    }

    function showScreenById(screenId) {
        setScreen(screenId, { mode: 'replace' });
    }

    async function openCommunityDetail(index) {
        currentCommunityPostIndex = index;
        editCommunityPostIndex = null;
        const post = communityPosts[index];
        if (!post.commentList) post.commentList = [];
        if (!post.authorId) post.authorId = 'seed';

        setScreen('screen-community-detail', { mode: 'push' });

        const nameForDetail = normalizeUser(post.user, '익명');
        document.getElementById('community-detail-user').innerText = nameForDetail;
        document.getElementById('community-detail-time').innerText = post.time;
        document.getElementById('community-detail-title').innerText = post.title;
        document.getElementById('community-detail-content').innerText = post.content;

        renderCommunityComments();
        renderCommunityDetailVote();
        updateCommunityDeleteButton();
        hideCommunityMenu();

        if (!post._id) return;

        try {
            const detail = await fetchCommunityDetail(post._id);
            if (!detail || currentCommunityPostIndex !== index) return;

            const { post: detailPost, comments = [], poll } = detail;

            if (detailPost && typeof detailPost.likeCount === 'number') {
                post.likes = detailPost.likeCount;
            }

            if (Array.isArray(comments)) {
                post.commentList = transformComments(comments);
                post.comments = post.commentList.length;
                const countSpan = document.getElementById(`comment-count-${index}`);
                if (countSpan) countSpan.innerText = post.comments;
            }

            if (poll && Array.isArray(poll.options)) {
                const leftOpt = poll.options[0];
                const rightOpt = poll.options[1];
                post.voteTitle = poll.question || post.voteTitle || '';
                if (leftOpt) {
                    post.leftOptionId = leftOpt._id || post.leftOptionId;
                    post.leftLabel = leftOpt.text || post.leftLabel;
                    post.leftVotes = leftOpt.votes || 0;
                }
                if (rightOpt) {
                    post.rightOptionId = rightOpt._id || post.rightOptionId;
                    post.rightLabel = rightOpt.text || post.rightLabel;
                    post.rightVotes = rightOpt.votes || 0;
                }
            }

            renderCommunityComments();
            renderCommunityDetailVote();
        } catch (e) {
            console.error('[community] detail load failed', e);
        }
    }

    function renderCommunityComments() {
        if (currentCommunityPostIndex === null) return;
        const post = communityPosts[currentCommunityPostIndex];
        if (!post.commentList) post.commentList = [];

        // authorId가 없는 댓글은 작성자명과 현재 사용자명을 비교해 보완
        post.commentList.forEach((c) => {
            if (!c.authorId && isMyComment(c)) {
                c.authorId = getUserId();
            }
        });

        const listEl = document.getElementById('community-comment-list');
        const countEl = document.getElementById('community-detail-comment-count');
        if (!listEl || !countEl) return;

        listEl.innerHTML = '';
        const defaultName = '익명';
        const defaultAvatar = '👤';
        const postIndex = currentCommunityPostIndex;
        post.commentList.forEach((c, cIdx) => {
            listEl.innerHTML += `
                <div class="flex items-start gap-2 relative">
                    ${buildAvatarHTML(c.avatar, c.user || defaultName, 28)}
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2 mb-0.5">
                            <p class="text-[11px] font-bold text-slate-700">${normalizeUser(c.user, defaultName)}</p>
                            <span class="text-[10px] text-slate-400 flex-shrink-0">${c.time}</span>
                        </div>
                        <p class="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap break-words">${c.text}</p>
                    </div>
                    ${isMyComment(c) ? `<button class="comment-delete-btn" onclick="deleteCommunityComment(${postIndex}, ${cIdx})" aria-label="댓글 삭제"><i class="fas fa-trash"></i></button>` : ''}
                </div>
            `;
        });

        post.comments = post.commentList.length;
        countEl.innerText = post.comments;

        const countSpan = document.getElementById(`comment-count-${currentCommunityPostIndex}`);
        if (countSpan) countSpan.innerText = post.comments;

        updateCommunityDeleteButton();
        hideCommunityMenu();
    }

    async function deleteCommunityComment(postIndex, commentIndex) {
        const post = communityPosts[postIndex];
        if (!post || !post.commentList || !post.commentList[commentIndex]) return;
        const comment = post.commentList[commentIndex];
        if (!isMyComment(comment)) {
            showToast('본인이 작성한 댓글만 삭제할 수 있습니다.');
            return;
        }
        if (!confirm('이 댓글을 삭제할까요?')) return;

        const authorId = getUserId();
        try {
            if (comment._id) {
                const resp = await fetch(`${API_BASE_URL}/api/community/comments/${comment._id}`, {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ authorId }),
                });
                if (!resp.ok) {
                    const msg = await resp.text();
                    throw new Error(msg || `댓글 삭제 실패 (${resp.status})`);
                }
            }
            post.commentList.splice(commentIndex, 1);
            post.comments = post.commentList.length;
            renderCommunityComments();
            renderCommunity();
            showToast('댓글이 삭제되었습니다.');
        } catch (e) {
            console.error('[community] comment delete failed', e);
            showToast('댓글 삭제 중 오류가 발생했습니다.');
        }
    }

    // 고민 상세에서 투표 영역 렌더링
    function renderCommunityDetailVote() {
        const container = document.getElementById('community-detail-vote');
        if (!container || currentCommunityPostIndex === null) return;

        const post = communityPosts[currentCommunityPostIndex];

        // 투표 정보가 없는 글이면 영역 비우기
        if (!post.voteTitle || !post.leftLabel || !post.rightLabel) {
            container.innerHTML = '';
            return;
        }

        if (typeof post.leftVotes !== 'number') post.leftVotes = 0;
        if (typeof post.rightVotes !== 'number') post.rightVotes = 0;

        const total = post.leftVotes + post.rightVotes;
        post.leftPct = total > 0 ? Math.round((post.leftVotes / total) * 100) : 0;
        post.rightPct = total > 0 ? 100 - post.leftPct : 0;

        const votedClass = post.isVoted ? 'opacity-60 pointer-events-none' : '';
        const leftSelected = post.userChoice === 'left' ? 'border-emerald-400 text-emerald-600 font-bold' : '';
        const rightSelected = post.userChoice === 'right' ? 'border-emerald-400 text-emerald-600 font-bold' : '';
        const leftBtnAttrs = `class="px-2 py-1 rounded-full bg-white border border-slate-200 hover:border-emerald-400 hover:text-emerald-600 active:scale-95 transition text-left ${votedClass} ${leftSelected}" onclick="submitVote(${currentCommunityPostIndex}, '${post.leftOptionId || ''}'); event.stopPropagation();"`;
        const rightBtnAttrs = `class="ml-auto px-2 py-1 rounded-full bg-white border border-slate-200 hover:border-emerald-400 hover:text-emerald-600 active:scale-95 transition text-right ${votedClass} ${rightSelected}" onclick="submitVote(${currentCommunityPostIndex}, '${post.rightOptionId || ''}'); event.stopPropagation();"`;

        container.innerHTML = `
            <div class="bg-slate-50 p-3 rounded-xl mt-1">
                <p class="text-[10px] text-slate-500 font-bold mb-2 text-center">🗳️ ${post.voteTitle}</p>
                <div class="flex items-center gap-2 text-[10px] font-bold text-slate-600 mb-1">
                    <button ${leftBtnAttrs}>
                        ${post.leftLabel}
                    </button>
                    <button ${rightBtnAttrs}>
                        ${post.rightLabel}
                    </button>
                </div>
                <div class="h-2 w-full bg-slate-200 rounded-full overflow-hidden flex mt-1">
                    <div class="h-full bg-emerald-400 vote-bar" style="width: ${post.leftPct}%"></div>
                    <div class="h-full bg-red-400 vote-bar" style="width: ${post.rightPct}%"></div>
                </div>
                <div class="flex justify-between text-[9px] text-slate-400 mt-1">
                    <span>${post.leftPct}%</span>
                    <span>${post.rightPct}%</span>
                </div>
                ${post.isVoted ? '<div class="text-[10px] text-emerald-600 font-bold mt-1">내 투표: ' + (post.userChoice === 'left' ? post.leftLabel : post.userChoice === 'right' ? post.rightLabel : '') + '</div>' : ''}
            </div>
        `;

        updateCommunityDeleteButton();
    }

    function voteCurrentPost(side) {
        // 상세 화면 막대나 기존 영역을 눌렀을 때도 투표가 되도록 보존
        if (currentCommunityPostIndex === null) return;
        const post = communityPosts[currentCommunityPostIndex];
        if (!post) return;
        const optionId = side === 'left' ? post.leftOptionId : post.rightOptionId;
        if (!optionId) {
            showToast('투표 옵션을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
            return;
        }
        submitVote(currentCommunityPostIndex, optionId);
    }

    function backToCommunityFromDetail() {
        setScreen('screen-community', { push: false, replace: true });
    }

    async function submitCommunityComment() {
        if (currentCommunityPostIndex === null) return;
        const input = document.getElementById('community-comment-input');
        if (!input) return;
        const text = input.value.trim();
        if (!text) return;

        const post = communityPosts[currentCommunityPostIndex];
        if (!post || !post._id) {
            showToast('댓글을 등록할 게시글을 찾지 못했습니다.');
            return;
        }

        const authorId = getUserId();
        const authorName = commentAnonEnabled ? '' : getDisplayName();
        const profileImage = commentAnonEnabled ? '' : (getScopedItem('profileImage') || '');

        try {
            const resp = await fetch(`${API_BASE_URL}/api/community/${post._id}/comments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    authorId,
                    authorName,
                    authorAvatar: profileImage,
                    anonymous: !!commentAnonEnabled,
                    text,
                }),
            });
            if (!resp.ok) {
                const msg = await resp.text();
                throw new Error(msg || `댓글 등록 실패 (${resp.status})`);
            }
            const saved = await resp.json();
            if (!post.commentList) post.commentList = [];
                const timeStr = saved.createdAt ? formatKST(saved.createdAt) : '방금 전';
            post.commentList.push({
                _id: saved._id,
                user: commentAnonEnabled ? '익명' : (saved.authorName || getDisplayName()),
                avatar: commentAnonEnabled ? '👤' : (saved.authorAvatar || getProfileImageUrl() || getDisplayAvatar()),
                time: timeStr,
                text: saved.text || text,
                authorId,
            });
            post.comments = post.commentList.length;
            const countSpan = document.getElementById(`comment-count-${currentCommunityPostIndex}`);
            if (countSpan) countSpan.innerText = post.comments;
            input.value = '';
            renderCommunityComments();
            hideCommunityMenu();
        } catch (e) {
            console.error('[community] comment failed', e);
            showToast('댓글 등록 중 오류가 발생했습니다.');
        }
    }

    function syncCommentAnonUI() {
        const toggle = document.getElementById('comment-anon-toggle');
        const thumb = document.getElementById('comment-anon-thumb');
        if (!toggle || !thumb) return;
        if (commentAnonEnabled) {
            toggle.classList.add('on');
            thumb.style.transform = 'translateX(24px)';
        } else {
            toggle.classList.remove('on');
            thumb.style.transform = 'translateX(0px)';
        }
    }

    function toggleCommentAnon() {
        commentAnonEnabled = !commentAnonEnabled;
        syncCommentAnonUI();
    }

    document.addEventListener('DOMContentLoaded', syncCommentAnonUI);

    // 알림 설정 토글
    function syncNotificationUI() {
        const track = document.getElementById('notif-track');
        const knob = document.getElementById('notif-knob');
        if (!track || !knob) return;
        if (notificationEnabled) {
            track.classList.add('on');
            knob.style.transform = 'translateX(16px)';
        } else {
            track.classList.remove('on');
            knob.style.transform = 'translateX(0px)';
        }
    }

    function toggleNotification() {
        notificationEnabled = !notificationEnabled;
        syncNotificationUI();
        showToast(notificationEnabled ? '알림이 켜졌습니다.' : '알림이 꺼졌습니다.');
    }

    document.addEventListener('DOMContentLoaded', syncNotificationUI);

    function renderCoupons() {
        const list = document.getElementById('coupon-list');
        list.innerHTML = '';
        if(savedCoupons.length === 0) {
            list.innerHTML = `<div class="text-center text-slate-400 mt-10 text-sm">저장된 쿠폰이 없습니다.</div>`;
            return;
        }
        savedCoupons.forEach(c => {
            list.innerHTML += `
            <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex justify-between items-center">
                <div><h3 class="font-bold text-slate-800">${c.title}</h3><p class="text-xs text-slate-500">${c.desc}</p></div>
                <div class="text-right"><span class="block text-indigo-600 font-bold text-lg">${c.code}</span><span class="text-[10px] text-slate-400">2024.12.31 만료</span></div>
            </div>`;
        });
    }

    function setLastResultAvailable(v) {
        hasRecentResultFlag = !!v;
        try { localStorage.setItem(LAST_RESULT_FLAG_KEY, hasRecentResultFlag ? '1' : '0'); } catch (_e) {}
        syncRecentResultButton();
    }

    function hasRecentResult() {
        if (hasRecentResultFlag) return true;
        try {
            const s = localStorage.getItem(LAST_RESULT_FLAG_KEY);
            return s === '1';
        } catch (_e) {
            return false;
        }
    }

    function syncRecentResultButton() {
        const btn = document.getElementById('recent-result-btn');
        if (!btn) return;
        const available = hasRecentResult();
        btn.disabled = !available;
        btn.setAttribute('aria-disabled', available ? 'false' : 'true');
        btn.style.opacity = available ? '1' : '0.5';
        btn.style.cursor = available ? 'pointer' : 'not-allowed';
    }

    document.addEventListener('DOMContentLoaded', syncRecentResultButton);

    // 같은 이미지로 판단 시 바로 결과 화면으로 이동
    function showRecentResultIfSame(sig, fileName) {
        const storedSig = getLastResultSignature();
        const storedName = getLastFileName();
        const sameName = fileName && storedName && fileName === storedName;
        const sameSig = sig && storedSig && sig === storedSig;
        if (hasRecentResult() && (sameName || sameSig)) {
            showToast('같은 이미지로 최근 결과를 보여드립니다.');
            setScreen('screen-result', { mode: 'push' });
            return true;
        }
        return false;
    }

    function makeImageSignature(dataUrl = '') {
        if (!dataUrl) return '';
        const len = dataUrl.length;
        const head = dataUrl.slice(0, 50);
        const tail = dataUrl.slice(-50);
        return `${len}:${head}:${tail}`;
    }

    function goToHome() { switchTab('home'); }
    function goToCase() { switchTab('case'); }
    function goToResult() {
        if (!hasRecentResult()) {
            showToast('최근 결과가 없습니다. 먼저 스캔해 주세요.');
            return;
        }
        setScreen('screen-result', { mode: 'push' });
    }

    function goToRecommendation() {
        document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
        const target = document.getElementById('screen-recommendation');
        target.style.display = 'flex';
        target.classList.add('fade-in');
        toggleVipBtn(false);
        showToast("AI가 최적의 전문가를 매칭했습니다.");

        const container = document.getElementById('rec-list-container');
        container.innerHTML = '';
        const recExperts = expertsData.slice(0, 5);
        recExperts.forEach((l, index) => {
            container.innerHTML += `
            <div class="bg-white p-4 rounded-2xl shadow-[0_2px_10px_rgba(0,0,0,0.03)] border border-slate-100 flex gap-4 items-center">
                <div class="w-12 h-12 rounded-full bg-slate-100 overflow-hidden"><img src="${l.img}" class="w-full h-full object-cover"></div>
                <div class="flex-1">
                    <h3 class="font-bold text-slate-800 text-sm">${l.name} 변호사 <i class="fas fa-check-circle text-blue-500 text-[10px]"></i></h3>
                    <p class="text-[11px] text-slate-500 mt-0.5">${l.category} • ${l.tag}</p>
                </div>
                <button onclick="startChat('EXPERT', ${index}, 'recommendation')" class="bg-emerald-50 text-emerald-600 px-4 py-2 rounded-xl text-xs font-bold hover:bg-emerald-500 hover:text-white transition-colors">선택</button>
            </div>`;
        });
    }

    function closeRecommendation() {
        setScreen('screen-case', { mode: 'replace' });
    }

    function openCaseAiChat() { startChat('CASE_AI', null, 'case'); }
    function openContractAiChat() { startChat('CONTRACT_AI', null, 'result'); }

    function startChat(type, identifier, from) {
        currentAiType = type;
        // 호출자가 명시하지 않으면 현재 활성 화면을 기반으로 복귀 지점 저장
        const activeId = getActiveScreenId();
        previousScreen = from || (activeId ? activeId.replace('screen-', '') : 'home');
        let chatName, imgUrl, isAi, bgColorClass, uniqueId;

        if (type === 'EXPERT') {
            const expert = expertsData[identifier];
            chatName = expert.name + ' 변호사';
            imgUrl = expert.img;
            isAi = false;
            uniqueId = 'EXPERT_' + identifier; 
        } else if (type === 'CASE_AI') {
            chatName = '사건 전담 AI 변호사';
            isAi = true;
            bgColorClass = 'bg-emerald-500';
            uniqueId = 'CASE_AI';
        } else if (type === 'CONTRACT_AI') {
            chatName = '법률 도우미 AI';
            isAi = true;
            bgColorClass = 'bg-indigo-500';
            uniqueId = 'CONTRACT_AI';
        }

        currentChatId = uniqueId;

        // [중요] 채팅 화면을 Body의 바로 아래 자식으로 이동
        const chatScreen = document.getElementById('screen-chat');
        if (chatScreen.parentElement !== document.body) {
            document.body.appendChild(chatScreen);
        }

        // 일관된 화면 전환/히스토리 처리를 위해 공통 setScreen 사용
        setScreen('screen-chat', { mode: 'push' });
        
        document.getElementById('chat-name').innerText = chatName;
        const img = document.getElementById('chat-profile-img');
        const icon = document.getElementById('chat-profile-icon');
        const imgContainer = img.parentElement;

        if (isAi) {
            img.style.display = 'none';
            icon.classList.remove('hidden');
            imgContainer.className = `w-10 h-10 rounded-full flex items-center justify-center text-white ${bgColorClass}`;
        } else {
            img.style.display = 'block';
            img.src = imgUrl;
            icon.classList.add('hidden');
            imgContainer.className = "w-10 h-10 rounded-full bg-slate-200 overflow-hidden border border-slate-100 flex items-center justify-center";
        }

        const chatBody = document.getElementById('chat-body');
        chatBody.innerHTML = '';

        if (!chatHistoryStore[currentChatId]) {
            let initialMsg = "";
            if(type === 'CASE_AI') {
                initialMsg = "안녕하세요. 김대표님의 '전세금 반환 소송(2023가단54xx)'을 전담하고 있는 AI 변호사입니다.\n현재 사건 진행률은 75%이며, 상대방 답변서에 대한 반박 준비서면을 작성 중입니다. 궁금한 점이 있으신가요?";
            }
            else if(type === 'CONTRACT_AI') {
                const fact = document.getElementById('fact-ai-text')?.textContent?.trim() || '';
                const docKind = docClassResult?.trim() || '계약서';
                const promptQ = document.getElementById('ai-solution-q')?.textContent?.replace(/"/g,'').trim() || '';
                const lines = [];
                lines.push(`방금 분석한 ${docKind}에 대해 궁금하신 점이 있나요?`);
                if (fact) lines.push(fact);
                if (promptQ) lines.push(`예) ${promptQ}`);
                initialMsg = lines.join('\n') || "방금 진단한 계약서에 대해 궁금한 점이 있으신가요?";
            }
            else initialMsg = "안녕하세요! Unfold 분석 결과 보고 연락드립니다. 무엇을 도와드릴까요?";

            const firstTime = getCurrentTimeStr();
            chatHistoryStore[currentChatId] = [
                { type: 'date', text: '오늘' },
                { type: isAi ? 'ai' : 'you', text: initialMsg, time: firstTime }
            ];
        }
        renderChat();
    }

    function renderChat() {
        const chatBody = document.getElementById('chat-body');
        chatBody.innerHTML = '<div class="flex-1 min-h-0"></div>'; // 상단 여백 (메시지 하단 정렬용)
        
        chatHistoryStore[currentChatId].forEach(msg => {
            if (msg.type !== 'date' && !msg.time) {
                msg.time = getCurrentTimeStr(); // 기존 데이터에 시간이 없을 때 1회만 세팅
            }
            if(msg.type === 'date') {
                chatBody.innerHTML += `<div class="text-center text-[10px] text-slate-400 my-4 bg-slate-100 inline-block mx-auto px-3 py-1 rounded-full">${msg.text}</div>`;
            } else if(msg.type === 'me') {
                const timeStr = msg.time;
                const bubbleText = formatChatText(msg.text);
                chatBody.innerHTML += `<div class="chat-row me"><span class="chat-time">${timeStr}</span><div class="chat-bubble chat-me">${bubbleText}</div></div>`;
            } else {
                const bubbleClass = msg.type === 'ai' ? 'chat-ai' : 'chat-you';
                const rowClass = 'you'; // AI도 왼쪽 정렬(you) 사용
                const iconHtml = msg.type === 'ai' ? '<i class="fas fa-robot mr-1 text-emerald-600 text-xs"></i>' : '';
                const timeStr = msg.time;
                const bubbleText = formatChatText(msg.text, iconHtml);
                
                chatBody.innerHTML += `<div class="chat-row ${rowClass}"><div class="chat-bubble ${bubbleClass}">${bubbleText}</div><span class="chat-time">${timeStr}</span></div>`;
            }
        });
        setTimeout(() => { chatBody.scrollTop = chatBody.scrollHeight; }, 50);
    }

    function backToPrevFromChat() {
        // 하단 탭바 복구
        const nav = document.querySelector('.top-nav');
        if (nav) nav.style.display = 'flex';

        const chatScreen = document.getElementById('screen-chat');
        chatScreen.classList.remove('active');
        chatScreen.style.display = 'none'; // 확실하게 숨김 처리

        // 스택 기반 우선 복귀
        if (screenStack.length > 0) {
            const prevId = screenStack.pop();
            setScreen(prevId, { mode: 'replace' });
            return;
        }

        // fallback: 이전 화면 힌트 기반
        if (previousScreen === 'recommendation') {
            goToRecommendation();
        } else if (previousScreen === 'case') {
            switchTab('case');
        } else if (previousScreen === 'expert') {
            switchTab('expert');
        } else if (previousScreen === 'community') {
            switchTab('community');
        } else if (previousScreen === 'menu') {
            switchTab('menu');
        } else if (previousScreen === 'result') { 
            document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
            document.getElementById('screen-result').style.display = 'flex';
            currentScreenId = 'screen-result';
        } else {
            switchTab('home');
        }
    }

    function buildGeminiMessages(userText) {
        const history = chatHistoryStore[currentChatId] || [];
        const mapped = history.map(m => ({
            role: m.type === 'ai' ? 'model' : 'user',
            text: m.text
        }));
        mapped.push({ role: 'user', text: userText });
        return mapped;
    }

    function appendMyMessage(bubbleText, timeStr) {
        const chatBody = document.getElementById('chat-body');
        chatBody.innerHTML += `<div class="chat-row me"><span class="chat-time">${timeStr}</span><div class="chat-bubble chat-me">${bubbleText}</div></div>`;
    }

    function appendAiMessage(reply, timeStr) {
        const chatBody = document.getElementById('chat-body');
        const bubbleClass = 'chat-ai';
        const rowClass = 'you';
        const iconHtml = '<i class="fas fa-robot mr-1 text-emerald-600 text-xs"></i>';
        const replyBubbleText = formatChatText(reply, iconHtml);
        chatBody.innerHTML += `<div class="chat-row ${rowClass}"><div class="chat-bubble ${bubbleClass}">${replyBubbleText}</div><span class="chat-time">${timeStr}</span></div>`;
    }

    async function sendMessage() {
        const input = document.getElementById('chat-input');
        const text = input.value.trim();
        if (!text) return;

        const chatBody = document.getElementById('chat-body');
        
        // 현재 시간 (실제 데이터)
        const timeStr = getCurrentTimeStr();

        const bubbleText = formatChatText(text);
        appendMyMessage(bubbleText, timeStr);
        
        if(!chatHistoryStore[currentChatId]) chatHistoryStore[currentChatId] = [];
        chatHistoryStore[currentChatId].push({ type: 'me', text: text, time: timeStr });
        
        input.value = '';
        input.focus();
        chatBody.scrollTop = chatBody.scrollHeight;

        // 사람 전문가 채팅이면 AI 호출 없이 종료
        if (currentAiType === 'EXPERT') {
            showToast('전문가에게 메시지를 보냈어요. 빠르게 답변을 전달받겠습니다.');
            return;
        }

        // 로딩 상태 표시
        const pendingId = `pending-${Date.now()}`;
        chatBody.innerHTML += `<div id="${pendingId}" class="chat-row you"><div class="chat-bubble chat-ai"><i class="fas fa-robot mr-1 text-emerald-600 text-xs"></i>생각 중...</div><span class="chat-time">${timeStr}</span></div>`;
        chatBody.scrollTop = chatBody.scrollHeight;

        try {
            const messages = buildGeminiMessages(text);
            const resp = await fetch(GEMINI_PROXY_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages })
            });

            if (!resp.ok) {
                const errText = await resp.text().catch(() => '');
                throw new Error(`HTTP ${resp.status} ${errText}`);
            }

            const data = await resp.json().catch(() => ({}));
            const reply = data?.answer || data?.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '응답을 불러오지 못했습니다.';
            document.getElementById(pendingId)?.remove();

            const replyTimeStr = getCurrentTimeStr();
            appendAiMessage(reply, replyTimeStr);
            chatHistoryStore[currentChatId].push({ type: 'ai', text: reply, time: replyTimeStr });
            chatBody.scrollTop = chatBody.scrollHeight;
        } catch (err) {
            console.error('[Gemini]', err);
            document.getElementById(pendingId)?.remove();
            const failReply = 'AI 응답 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.';
            const replyTimeStr = getCurrentTimeStr();
            appendAiMessage(failReply, replyTimeStr);
            chatHistoryStore[currentChatId].push({ type: 'ai', text: failReply, time: replyTimeStr });
            chatBody.scrollTop = chatBody.scrollHeight;
        }
    }

    async function fetchExpertsData() {
        try {
            const res = await fetch(`${API_BASE_URL}/api/experts`, {
                method: 'GET',
                mode: 'cors',
            });
            if (!res.ok) {
                const text = await res.text().catch(() => '');
                throw new Error(`HTTP ${res.status} ${res.statusText} ${text}`);
            }
            const data = await res.json();

            if (!Array.isArray(data) || data.length === 0) {
                console.warn('MongoDB 전문가 데이터가 비어 있습니다.');
                expertsData = [];
            } else {
                expertsData = data.map(e => ({
                    id: e._id,
                    name: `${e.firstName ?? ''} ${e.lastName ?? ''}`.trim() || e.name || '이름 미상',
                    category: e.category || '기타',
                    tag: e.tag || '',
                    img: e.profileImage || "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?fit=crop&w=200&h=200",
                    desc: e.desc || ''
                }));
            }

            console.log('전문가 데이터 로드 완료 (MongoDB):', expertsData.length, '명');
        } catch (err) {
            console.error('전문가 데이터 불러오기 실패 (MongoDB):', err);
            expertsData = [];

            // 전문가 페이지 안에서 바로 에러 메시지 보여주기
            const container = document.getElementById('expert-list-area');
            if (container) {
                container.innerHTML = `
                    <div class="bg-red-50 border border-red-100 text-red-600 rounded-2xl p-4 text-sm leading-relaxed mt-2">
                        <p class="font-bold mb-1">전문가 데이터를 불러오는 중 문제가 발생했습니다.</p>
                        <p class="text-[11px] text-red-500 mb-1">
                            데이터가 없거나 네트워크/CORS 제한이 있을 수 있습니다.
                        </p>
                        <p class="text-[11px] text-red-400">
                            관리자에게 데이터 및 CORS(<span class="font-mono">Access-Control-Allow-Origin</span>) 설정을 확인해 달라고 요청해 주세요.
                        </p>
                    </div>
                `;
            }

            showToast('전문가 데이터를 불러오지 못했습니다. (빈 데이터/네트워크/CORS)');
        }
    }

    function filterExperts(category) {
        // 탭 토글 스타일
        const btns = document.querySelectorAll('.filter-btn');
        btns.forEach(btn => {
            const isActive = btn.dataset.cat === category;
            btn.classList.remove('active', 'bg-slate-900', 'text-white', 'shadow');
            btn.classList.remove('bg-slate-100', 'text-slate-500');
            if (isActive) {
                btn.classList.add('active', 'bg-slate-900', 'text-white', 'shadow');
            } else {
                btn.classList.add('bg-slate-100', 'text-slate-500');
            }
            btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });

        const container = document.getElementById('expert-list-area');
        container.innerHTML = `<p class="text-[11px] font-bold text-emerald-600 mb-3 px-1 animate-pulse">● ${category} 전문 파트너 실시간 연결 가능</p>`;
        
        expertsData.forEach((expert, index) => {
            if(category !== '전체' && expert.category !== category) return;
            container.innerHTML += `
            <div class="bg-white border border-slate-100 rounded-2xl p-4 flex gap-4 items-start shadow-sm mb-3">
                <div class="w-12 h-12 rounded-full bg-slate-100 overflow-hidden flex-shrink-0"><img src="${expert.img}" class="w-full h-full object-cover"></div>
                <div class="flex-1">
                    <div class="flex items-center gap-1 mb-1"><h3 class="font-bold text-slate-800 text-sm">${expert.name}</h3><i class="fas fa-check-circle text-blue-500 text-[10px]"></i></div>
                    <span class="inline-block bg-slate-100 text-slate-600 text-[10px] font-bold px-2 py-0.5 rounded mb-2">${expert.category} 전문</span>
                    <p class="text-xs text-slate-400 line-clamp-1">"${expert.desc}"</p>
                    <div class="flex gap-2 mt-3">
                        <button onclick="startChat('EXPERT', ${index}, 'expert')" class="flex-1 bg-slate-50 text-slate-600 py-2 rounded-lg text-xs font-bold hover:bg-emerald-50 hover:text-emerald-600 transition-colors">채팅</button>
                        <button onclick="if(confirm('안심번호로 연결하시겠습니까?')) showToast('전화 연결 중...')" class="flex-1 bg-emerald-50 text-emerald-600 py-2 rounded-lg text-xs font-bold hover:bg-emerald-500 hover:text-white transition-colors">전화</button>
                    </div>
                </div>
            </div>`;
        });
    }

    let aiSolutionReqText = ``;
    function selfTreat() {
        const factText = document.getElementById('fact-ai-text')?.textContent?.trim() || '';
        const textToCopy = (aiSolutionReqText && aiSolutionReqText.trim()) || factText;
        if (!textToCopy || !textToCopy.trim()) {
            showToast('AI 요청문이 아직 준비되지 않았습니다. OCR 후 다시 시도해 주세요.');
            return;
        }

        const textArea = document.createElement("textarea");
        textArea.value = textToCopy.trim();
        document.body.appendChild(textArea);
        textArea.select();
        try {
            document.execCommand("Copy");
            showToast("요청 텍스트가 복사되었습니다!");
        } catch (err) {
            showToast("복사에 실패했습니다. 잠시 후 다시 시도해 주세요.");
        }
        textArea.remove();
    }

    function uploadEvidence() {
        beginCaptureBypass(120000);
        document.getElementById('file-input').click();
    }

    // 날짜를 'YYYY.MM.DD' 형식으로 변환 (예: 2025.12.08)
    function formatDateKR(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}.${m}.${d}`;
    }

    function handleFileSelect(input) {
        if (input.files && input.files[0]) {
            const file = input.files[0];
            const list = document.getElementById('evidence-list');
            const dateStr = formatDateKR(new Date());
            showToast('파일이 안전하게 암호화되어 업로드되었습니다.');
            list.innerHTML += `<div class="flex items-center gap-3 p-2 hover:bg-slate-50 rounded-lg transition-colors">
                <div class="w-8 h-8 bg-slate-100 text-slate-500 rounded flex items-center justify-center text-xs">
                    <i class="fas fa-file"></i>
                </div>
                <div class="flex-1 min-w-0">
                    <p class="text-xs font-bold text-slate-700 truncate">${file.name}</p>
                    <p class="text-[10px] text-slate-400">${dateStr} 업로드</p>
                </div>
                <div class="w-4 h-4 rounded-full border border-slate-300 flex items-center justify-center">
                    <div class="w-2 h-2 bg-emerald-500 rounded-full"></div>
                </div>
            </div>`;
        }
    }

    // 스캔 화면 배경을 사용자가 선택한 이미지로 교체
    const scanBgEl = document.getElementById('scan-bg');
    const DEFAULT_SCAN_BG = (scanBgEl && (scanBgEl.getAttribute('data-default-src') || scanBgEl.getAttribute('src'))) || 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=800&q=80';

    function setScanBackground(src) {
        const target = document.getElementById('scan-bg');
        if (!target) return;
        target.src = src || DEFAULT_SCAN_BG;
    }

    function applyAdaptiveThreshold(imageData, width, height, radius = 8, offset = 5) {
        // 적응형 평균 임계값 (간단한 integral image)
        const integral = new Uint32Array((width + 1) * (height + 1));
        const d = imageData.data;
        for (let y = 1; y <= height; y++) {
            let rowSum = 0;
            for (let x = 1; x <= width; x++) {
                const idx = ((y - 1) * width + (x - 1)) * 4;
                const g = d[idx]; // 이미 그레이스케일 가정
                rowSum += g;
                const integralIdx = y * (width + 1) + x;
                integral[integralIdx] = integral[integralIdx - (width + 1)] + rowSum;
            }
        }
        const out = new Uint8ClampedArray(d.length);
        const area = (radius * 2 + 1) ** 2;
        for (let y = 0; y < height; y++) {
            const y0 = Math.max(0, y - radius);
            const y1 = Math.min(height - 1, y + radius);
            for (let x = 0; x < width; x++) {
                const x0 = Math.max(0, x - radius);
                const x1 = Math.min(width - 1, x + radius);
                const A = integral[y0 * (width + 1) + x0];
                const B = integral[y0 * (width + 1) + (x1 + 1)];
                const C = integral[(y1 + 1) * (width + 1) + x0];
                const D = integral[(y1 + 1) * (width + 1) + (x1 + 1)];
                const sum = D - B - C + A;
                const mean = sum / ((x1 - x0 + 1) * (y1 - y0 + 1));
                const idx = (y * width + x) * 4;
                const g = d[idx];
                const bin = g < mean - offset ? 0 : 255;
                out[idx] = out[idx + 1] = out[idx + 2] = bin;
                out[idx + 3] = 255;
            }
        }
        return new ImageData(out, width, height);
    }

    // OCR 정확도 개선 전처리: 업샘플 + 그레이스케일/대비 + 적응형 이진화
    async function generateOcrVariants(dataUrl) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                try {
                    const TARGET_WIDTH = 1400; // 해상도 확보 (메모리 부담 완화)
                    const scale = img.width > TARGET_WIDTH ? TARGET_WIDTH / img.width : Math.max(1, TARGET_WIDTH / img.width);
                    const w = Math.max(1, Math.round(img.width * scale));
                    const h = Math.max(1, Math.round(img.height * scale));

                    const canvas = document.createElement('canvas');
                    canvas.width = w;
                    canvas.height = h;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, w, h);

                    const baseData = ctx.getImageData(0, 0, w, h);
                    const d = baseData.data;
                    const contrast = 1.2;
                    for (let i = 0; i < d.length; i += 4) {
                        // 그레이스케일
                        let g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
                        // 대비 보정
                        g = (g - 128) * contrast + 128;
                        g = Math.max(0, Math.min(255, g));
                        d[i] = d[i + 1] = d[i + 2] = g;
                    }
                    ctx.putImageData(baseData, 0, 0);
                    const grayUrl = canvas.toDataURL('image/png');

                    // 적응형 이진화
                    const binData = applyAdaptiveThreshold(baseData, w, h, 8, 6);
                    const binCanvas = document.createElement('canvas');
                    binCanvas.width = w;
                    binCanvas.height = h;
                    const binCtx = binCanvas.getContext('2d');
                    binCtx.putImageData(binData, 0, 0);
                    const binUrl = binCanvas.toDataURL('image/png');

                    resolve([grayUrl, binUrl]);
                } catch (e) {
                    console.error('[OCR Enhance]', e);
                    resolve([dataUrl]); // 실패 시 원본만
                }
            };
            img.onerror = reject;
            img.src = dataUrl;
        });
    }

    function pickBetterOcrText(textA, textB) {
        const cleanA = (textA || '').trim();
        const cleanB = (textB || '').trim();
        if (cleanA && cleanB) {
            return cleanA.length >= cleanB.length ? cleanA : cleanB;
        }
        return cleanA || cleanB || '';
    }

    function pickLongestOcrText(texts = []) {
        let best = '';
        texts.forEach(t => {
            const c = (t || '').trim();
            if (c && c.length > best.length) best = c;
        });
        return best;
    }

    function openOcrModal() {
        const modal = document.getElementById('ocr-modal');
        if (modal) {
            modal.classList.remove('hidden');
            modal.classList.add('active');
        }
    }
    function closeOcrModal() {
        const modal = document.getElementById('ocr-modal');
        if (modal) {
            modal.classList.add('hidden');
            modal.classList.remove('active');
        }
    }
    function resetOcrUiBeforeScan() {
        const card = document.getElementById('ocr-card');
        const textEl = document.getElementById('ocr-text');
        const modalText = document.getElementById('ocr-modal-text');
        if (card && textEl && modalText) {
            card.classList.remove('hidden');
            card.style.display = 'block';
            textEl.textContent = '추출 중...';
            modalText.textContent = '추출 중...';
        }
        // 이전 AI 결과를 비워서 직전 결과가 그대로 남지 않도록 초기화
        runAiFactCheck('');
        runAiSolutions('');
        classifyDocument('');
        setLastResultAvailable(false);
        setLastResultSignature('');
        setLastFileName('');
    }

    function cleanupOcrText(raw) {
        if (!raw) return '';
        const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        const cleaned = [];
        for (let i = 0; i < lines.length; i++) {
            let s = lines[i];
            // 불필요한 기호 정규화
            s = s.replace(/[·•]+/g, '·').replace(/[\.]{2,}/g, '.').replace(/[~]{2,}/g, '~');
            s = s.replace(/[｜│]/g, '|').replace(/[‧∙]/g, '·');
            // 다중 공백 축소
            s = s.replace(/\s{2,}/g, ' ');
            // 한글/숫자/영문 외 특수문자 제거(기본 구두점은 유지)
            s = s.replace(/[^A-Za-z0-9가-힣\s\.\,\-\:\;\(\)\[\]\{\}\|·]/g, '');
            // 한글/숫자 사이 불필요한 공백 제거 (단어 분절 개선)
            s = s.replace(/([가-힣0-9])\s+([가-힣0-9])/g, '$1$2');
            s = s.replace(/([가-힣0-9])\s+([가-힣0-9])/g, '$1$2'); // 두 번 적용해 연속 케이스 보정
            // 내용 비율 체크
            const letters = (s.match(/[\p{L}\p{N}]/gu) || []).length;
            const punct = s.length - letters;
            if (letters < 2) continue;
            const len = Math.max(1, s.length);
            if (letters / len < 0.35) continue;          // 글자 비율 너무 낮으면 제외
            if (punct / len > 0.65) continue;            // 기호 비율 너무 높으면 제외
            // 이전 줄과 자연스럽게 이어지는 경우 병합
            const prev = cleaned[cleaned.length - 1];
            if (prev && /[가-힣A-Za-z0-9]$/.test(prev) && /^[가-힣a-z0-9]/.test(s) && prev.length < 50) {
                cleaned[cleaned.length - 1] = `${prev} ${s}`;
            } else {
                cleaned.push(s);
            }
        }
        return cleaned.join('\n').trim();
    }

    function setOcrResult(text, opts = {}) {
        const card = document.getElementById('ocr-card');
        const textEl = document.getElementById('ocr-text');
        const modalText = document.getElementById('ocr-modal-text');
        if (!card || !textEl || !modalText) return;

        const clean = opts.skipCleanup ? (text || '').trim() : cleanupOcrText(text || '');
        const hasText = !!clean;
        if (hasText) {
            textEl.textContent = clean;
            modalText.textContent = clean;
            card.classList.remove('hidden');
            card.style.display = 'block';
            // OCR 결과를 기반으로 AI 팩트체크 호출
            runAiFactCheck(clean);
            runAiSolutions(clean);
            classifyDocument(clean);
            setLastResultAvailable(true);
            if (lastImageSignature) setLastResultSignature(lastImageSignature);
        } else {
            card.classList.add('hidden');
            card.style.display = 'none';
            textEl.textContent = '';
            modalText.textContent = '';
            setLastResultAvailable(false);
            setLastResultSignature('');
            setLastFileName('');
        }
    }

    async function runAiFactCheck(ocrText) {
        const wrap = document.getElementById('fact-ai-wrap');
        const textEl = document.getElementById('fact-ai-text');
        const empty = document.getElementById('fact-empty');
        if (!wrap || !textEl || !empty) return;
        if (!ocrText) {
            wrap.classList.add('hidden');
            textEl.textContent = '';
            empty.classList.remove('hidden');
            return;
        }
        wrap.classList.remove('hidden');
        empty.classList.add('hidden');
        textEl.textContent = '분석 중...';

        try {
            const prompt = `다음 계약서/문서 내용을 보고 세입자에게 불리한 핵심 위험을 3줄로 간결하게 요약해줘. 불필요한 말 없이 핵심만 bullet 없이 문장으로.\n\n${ocrText}`;
            const body = {
                messages: [
                    { role: 'user', text: prompt }
                ]
            };
            const resp = await fetch(GEMINI_PROXY_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            const reply = data?.answer || data?.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
            const hasReply = !!reply?.trim();
            if (hasReply) {
                textEl.textContent = reply.trim();
            } else {
                wrap.classList.add('hidden');
                textEl.textContent = '';
                empty.classList.remove('hidden');
                empty.textContent = 'AI 결과를 가져오지 못했습니다.';
            }
        } catch (err) {
            console.error('[AI Fact]', err);
            wrap.classList.add('hidden');
            textEl.textContent = '';
            empty.classList.remove('hidden');
            empty.textContent = 'AI 분석 중 오류가 발생했습니다.';
        }
    }

    async function runAiSolutions(ocrText) {
        const descEl = document.getElementById('ai-solution-req-desc');
        const qEl = document.getElementById('ai-solution-q');
        if (!descEl || !qEl) return;
        if (!ocrText) {
            descEl.textContent = 'AI 요청문을 준비 중입니다.';
            qEl.textContent = 'AI가 분석 중입니다.';
            aiSolutionReqText = '';
            docClassResult = '';
            return;
        }

        // 1) 수정 요청문 생성
        try {
            const promptReq = `다음 계약서/문서 내용을 보고, 임대인에게 보낼 정중하고 명확한 특약 수정 요청 메시지를 한국어로 4줄 이내로 작성해줘. 핵심만, 존중하는 어투로.\n\n${ocrText}`;
            const bodyReq = { messages: [ { role: 'user', text: promptReq } ] };
            const respReq = await fetch(GEMINI_PROXY_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(bodyReq)
            });
            if (respReq.ok) {
                const data = await respReq.json();
                const reply = data?.answer || data?.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
                if (reply?.trim()) {
                    aiSolutionReqText = reply.trim();
                    descEl.textContent = reply.trim().split('\n')[0] || 'AI가 작성한 요청문을 복사하세요.';
                } else {
                    descEl.textContent = 'AI 요청문 생성 실패';
                }
            } else {
                descEl.textContent = 'AI 요청문 생성 실패';
            }
        } catch (err) {
            console.error('[AI Solution Req]', err);
            descEl.textContent = 'AI 요청문 생성 실패';
        }

        // 2) AI에게 물어볼 질문 제안
        try {
            const promptQ = `다음 계약서/문서 내용을 보고, AI에게 추가로 물어볼 만한 핵심 질문 1개를 한국어로 15자 이내로 제안해줘.\n\n${ocrText}`;
            const bodyQ = { messages: [ { role: 'user', text: promptQ } ] };
            const respQ = await fetch(GEMINI_PROXY_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(bodyQ)
            });
            if (respQ.ok) {
                const data = await respQ.json();
                const reply = data?.answer || data?.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
                if (reply?.trim()) {
                    qEl.textContent = `"${reply.trim()}"`;
                    // 문서 분류 결과를 템플릿 다운로드 안내에 반영
                    const templateDesc = document.getElementById('ai-solution-template-desc');
                    if (templateDesc) {
                        const kind = docClassResult?.trim() || '표준 계약서';
                        templateDesc.textContent = `${kind}에 맞는 표준 계약서 양식을 확인하세요.`;
                    }
                }
            }
        } catch (err) {
            console.error('[AI Solution Q]', err);
        }
    }

    async function classifyDocument(ocrText) {
        const card = document.getElementById('doc-classify-card');
        const textEl = document.getElementById('doc-classify-text');
        if (!card || !textEl) return;
        if (!ocrText) {
            card.classList.add('hidden');
            textEl.textContent = '';
            return;
        }
        card.classList.remove('hidden');
        textEl.textContent = '분석 중...';

        try {
            const prompt = `다음 문서가 어떤 종류인지 한 줄로 알려줘. 예: 임대차계약서, 영수증, 세금계산서, 내용증명 등.\n\n${ocrText}`;
            const body = { messages: [ { role: 'user', text: prompt } ] };
            const resp = await fetch(GEMINI_PROXY_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            const reply = data?.answer || data?.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
            if (reply?.trim()) {
                textEl.textContent = reply.trim();
                docClassResult = reply.trim();
                const templateDesc = document.getElementById('ai-solution-template-desc');
                if (templateDesc) {
                    templateDesc.textContent = `${docClassResult}에 맞는 표준 계약서 양식을 확인하세요.`;
                }
            } else {
                card.classList.add('hidden');
                textEl.textContent = '';
            }
        } catch (err) {
            console.error('[Doc Classify]', err);
            card.classList.add('hidden');
            textEl.textContent = '';
        }
    }

    function startUniversalScan() {
        toggleVipBtn(false);
        document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
        document.getElementById('screen-scan').style.display = 'flex';
        setScanStatus("문서 윤곽 인식...", '<span class="text-slate-400 text-xs">AI가 문서를 분석 중입니다.</span>');
    }

    function setScanStatus(titleText, detailHtml) {
        const detail = document.getElementById('scan-detail');
        const title = document.getElementById('scan-title');
        if (title) title.innerText = titleText || '';
        if (detail) detail.innerHTML = detailHtml || '';
    }

    function showScanResultScreen() {
        document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
        const resultScreen = document.getElementById('screen-result');
        if (resultScreen) resultScreen.style.display = 'flex';
        setTimeout(() => { 
            const popup = document.getElementById('coupon-popup');
            if (popup) popup.style.display = 'flex'; 
        }, 2000); 
    }

    function exitScanFlow() {
        document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
        const home = document.getElementById('screen-home') || document.getElementById('screen-main');
        if (home) home.style.display = 'flex';
    }

    // 스캔 소스 선택 모달 열기
    function openScanSourceChooser() {
        const modal = document.getElementById('scan-source-modal');
        if (modal) modal.style.display = 'flex';
    }

    function closeScanSourceModal() {
        const modal = document.getElementById('scan-source-modal');
        if (modal) modal.style.display = 'none';
    }

    function chooseScanSource(source) {
        closeScanSourceModal();
        openCameraAndScan(source);
    }

    // 실제 카메라/갤러리에서 이미지를 선택한 뒤 스캔 플로우로 연결
    function openCameraAndScan(source) {
        // 웹 표준 input을 사용해 카메라 또는 갤러리 호출 (모바일에서 카메라/앨범 선택)
        let input = document.getElementById('scan-file-input');
        if (!input) {
            input = document.createElement('input');
            input.type = 'file';
            input.id = 'scan-file-input';
            input.style.display = 'none';

            input.addEventListener('change', (e) => {
                const file = e.target.files && e.target.files[0];
                if (!file) return;

                // 여기에서 파일을 서버로 업로드하거나, 추후 AI 분석 로직에 넘길 수 있음
                console.log('선택된 파일:', file);

                showToast('사진이 선택되었습니다. AI가 분석을 시작합니다.');
                const launchScan = () => {
                    startUniversalScan();
                    e.target.value = '';
                };

                const handleOcr = async (dataUrl, psm = '4', lang = 'kor+eng') => {
                    if (!window.Tesseract) return null;
                    try {
                        const { data: { text } } = await Tesseract.recognize(dataUrl, lang, {
                            langPath: 'https://tessdata.projectnaptha.com/4.0.0_best', // 한국어 best 데이터 사용
                            tessedit_pageseg_mode: psm,          // PSM 가변
                            preserve_interword_spaces: '1',       // 공백 유지
                            user_defined_dpi: '300',               // DPI 힌트
                            oem: 1,                                // LSTM 전용
                            logger: m => console.log('[OCR]', m)   // 진행 로그
                        });
                        return text?.trim();
                    } catch (err) {
                        console.error('[OCR]', err);
                        return null;
                    }
                };

                async function performBestOcr(originalDataUrl, variantUrls) {
                    const urls = [originalDataUrl, ...(variantUrls || [])];
                    const limited = urls.slice(0, 2); // 메모리/동시성 제한
                    const jobs = [];
                    limited.forEach((u, idx) => {
                        jobs.push(handleOcr(u, '4', 'kor+eng'));
                        jobs.push(handleOcr(u, '4', 'kor'));      // 한국어 우선
                        if (idx === 0) {
                            jobs.push(handleOcr(u, '6', 'kor+eng'));
                            jobs.push(handleOcr(u, '6', 'kor'));  // 한국어+단일열
                        }
                    });
                    const results = await Promise.all(jobs);
                    return pickLongestOcrText(results);
                }

                function scoreTextQuality(str) {
                    const s = (str || '').trim();
                    if (!s) return 0;
                    const letters = (s.match(/[\p{L}\p{N}]/gu) || []).length;
                    const len = s.length;
                    const ratio = letters / Math.max(1, len);
                    return letters * ratio; // 길이와 유효문자 비율을 함께 고려
                }

                async function callCloudVision(dataUrl) {
                    try {
                        const base64 = (dataUrl || '').split(',')[1];
                        if (!base64) return null;
                        const resp = await fetch(`${API_BASE_URL}/api/ocr/vision`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ imageBase64: base64 }),
                        });
                        if (!resp.ok) {
                            const txt = await resp.text().catch(() => '');
                            throw new Error(`HTTP ${resp.status} ${txt.slice(0, 200)}`);
                        }
                        const ctype = resp.headers.get('content-type') || '';
                        if (!ctype.includes('application/json')) {
                            const txt = await resp.text().catch(() => '');
                            throw new Error(`Non-JSON response: ${txt.slice(0, 200)}`);
                        }
                        const data = await resp.json();
                        const plain = data?.text || '';
                        const ordered = data?.orderedText || '';
                        const blockOrdered = data?.blockOrderedText || '';
                        const candidates = [
                            { text: blockOrdered, fromCloud: true },
                            { text: ordered, fromCloud: true },
                            { text: plain, fromCloud: true },
                        ];
                        const bestObj = candidates.sort((a, b) => scoreTextQuality(b.text) - scoreTextQuality(a.text))[0] || { text: '' };
                        bestObj.text = (bestObj.text || '').trim();
                        return bestObj;
                    } catch (err) {
                        console.error('[Cloud OCR]', err);
                        return null;
                    }
                }

                if (file.type && file.type.startsWith('image/')) {
                    const reader = new FileReader();
                    reader.onload = async (ev) => {
                        beginCaptureBypass(120000);
                        const originalDataUrl = ev.target?.result || DEFAULT_SCAN_BG;
                        const sig = makeImageSignature(originalDataUrl);
                        if (showRecentResultIfSame(sig, file?.name)) return;

                        resetOcrUiBeforeScan();
                        const variants = await generateOcrVariants(originalDataUrl);
                        const bgUrl = variants[0] || originalDataUrl;
                        const finalSig = sig || makeImageSignature(bgUrl);
                        setLastResultSignature(finalSig);
                        if (file && file.name) setLastFileName(file.name);
                        setScanBackground(bgUrl);
                        startUniversalScan();
                        setScanStatus("OCR 분석 중...", '<span class="text-slate-400 text-xs">문서 내용을 인식하고 있습니다...</span>');

                        // Cloud Vision만 사용 (Tesseract 폴백 제거)
                        const cloudObj = await callCloudVision(bgUrl);
                        const best = cloudObj && cloudObj.text;
                        if (best && best.trim()) {
                            setOcrResult(best, { skipCleanup: true });
                            showScanResultScreen();
                        } else {
                            setScanStatus("OCR 인식 실패", '<span class="text-red-400 text-xs">문서를 다시 촬영해 주세요.</span>');
                            showToast('OCR 인식에 실패했습니다. 문서를 다시 촬영해 주세요.');
                            setTimeout(() => exitScanFlow(), 1200);
                        }
                    };
                    reader.onerror = () => {
                        beginCaptureBypass(120000);
                        resetOcrUiBeforeScan();
                        setScanBackground(DEFAULT_SCAN_BG);
                        startUniversalScan();
                        setScanStatus("이미지 로드 실패", '<span class="text-red-400 text-xs">다시 시도해 주세요.</span>');
                        showToast('이미지를 불러오지 못했습니다. 다시 시도해 주세요.');
                    };
                    reader.readAsDataURL(file);
                    return;
                }

                // 이미지가 아닌 파일은 기본 배경 유지
                beginCaptureBypass(120000);
                resetOcrUiBeforeScan();
                setScanBackground(DEFAULT_SCAN_BG);
                startUniversalScan();
                setScanStatus("이미지 파일이 아닙니다", '<span class="text-red-400 text-xs">이미지로 다시 올려주세요.</span>');
                showToast('이미지 파일을 선택해 주세요.');
            });

            document.body.appendChild(input);
        }

        // 소스에 따라 capture / accept 속성 설정
         if (source === 'camera') {
            // 카메라로 바로 촬영: 이미지 전용 + 후면 카메라 권장
            input.accept = 'image/*';
            input.capture = 'environment';
        } else {
            // 파일에서 선택: 사진, 문서, 녹음파일 등 어떤 타입이든 허용
            input.accept = '';
            input.removeAttribute('capture');
        }

         suppressAppLock(120000);
         input.click();
    }

    // 전역 바인딩 (HTML onclick 호환)
    window.openScanSourceChooser = openScanSourceChooser;
    window.chooseScanSource = chooseScanSource;

    function closePopup() { document.getElementById('coupon-popup').style.display = 'none'; }
    function copyCoupon() { navigator.clipboard.writeText("MOVE-2026").then(() => showToast("쿠폰 코드가 복사되었습니다!")); }
    function saveCoupon() { savedCoupons.push({ title: "이삿짐 센터 5만원 할인", desc: "Unfold 파트너 전용", code: "MOVE-2026" }); showToast('쿠폰함에 저장되었습니다.'); closePopup(); }

    // --- 사용자별 로컬 스토리지 스코프 ---
    function currentUserScopedKey(key = '') {
        const email = (localStorage.getItem('authEmail') || '').trim().toLowerCase();
        return email ? `${key}:${email}` : key;
    }
    function getScopedItem(key = '') {
        try {
            const scoped = localStorage.getItem(currentUserScopedKey(key));
            if (scoped !== null && scoped !== undefined) return scoped;
            return '';
        } catch (_e) {
            return '';
        }
    }
    function setScopedItem(key = '', value = '') {
        try { localStorage.setItem(currentUserScopedKey(key), value); } catch (_e) {}
    }
    function removeScopedItem(key = '') {
        try { localStorage.removeItem(currentUserScopedKey(key)); } catch (_e) {}
    }

    // --- 프로필 관리 ---
    const emojis = ['😎', '😊', '🤔', '🧐', '🤠', '🤓', '🤖', '👻', '🐶', '🐱'];
    let currentEmojiIndex = 0;
    let isProfileImageMode = false;
    let tempProfileImage = null;

    function initProfile() {
        const savedName = getScopedItem('profileName');
        const savedEmoji = getScopedItem('profileEmoji');
        const savedImage = getScopedItem('profileImage');
        
        // 서버에서 내려온 사용자 정보 반영 (예: 로그인 응답에 firstName/lastName/profileImage/role)
        const serverName = getScopedItem('serverUserName'); // firstName + lastName 등을 묶어서 저장했다고 가정
        const serverImage = getScopedItem('serverUserImage'); // 서버 프로필 URL이 있다면 저장
        
        const finalName = savedName || serverName || '회원님';
        document.getElementById('profile-name-display').innerText = finalName;
        
        // 이미지 > 서버 이미지 > 저장된 이미지 > 이모지 순서로 우선 적용
        const imageToUse = savedImage || serverImage || '';
        
        if (imageToUse) {
            document.getElementById('profile-icon').style.display = 'none';
            const img = document.getElementById('profile-img');
            img.src = imageToUse;
            img.classList.remove('hidden');
            
            // 수정 화면 프로필 (초기값 세팅)
            document.getElementById('edit-profile-icon').style.display = 'none';
            const editImg = document.getElementById('edit-profile-img');
            editImg.src = imageToUse;
            editImg.classList.remove('hidden');
            
            isProfileImageMode = true;
        } else {
            // 이모지 모드
            if (savedEmoji) {
                document.getElementById('profile-icon').innerText = savedEmoji;
                currentEmojiIndex = emojis.indexOf(savedEmoji);
                if(currentEmojiIndex === -1) currentEmojiIndex = 0;
            }
            
            // 메인 프로필
            document.getElementById('profile-icon').style.display = 'block';
            document.getElementById('profile-img').classList.add('hidden');
            
            isProfileImageMode = false;
        }
    }

    function changeProfileEmoji() {
        // 이모지 모드로 전환
        isProfileImageMode = false;
        tempProfileImage = null; // 임시 이미지 초기화
        
        document.getElementById('edit-profile-img').classList.add('hidden');
        const icon = document.getElementById('edit-profile-icon');
        icon.style.display = 'block';
        
        // 랜덤 선택 (현재와 다른 이모지가 나오도록)
        let newIndex;
        do {
            newIndex = Math.floor(Math.random() * emojis.length);
        } while (newIndex === currentEmojiIndex && emojis.length > 1);

        currentEmojiIndex = newIndex;
        icon.innerText = emojis[currentEmojiIndex];
    }
    
    function uploadProfileImage() {
        suppressAppLock(120000);
        document.getElementById('profile-upload-input').click();
    }
    
    function handleProfileImageChange(input) {
        if (input.files && input.files[0]) {
            const file = input.files[0];
            const reader = new FileReader();
            
            reader.onload = function(e) {
                // 이미지 모드로 전환 및 미리보기
                isProfileImageMode = true;
                tempProfileImage = e.target.result;
                
                const editImg = document.getElementById('edit-profile-img');
                editImg.src = tempProfileImage;
                editImg.classList.remove('hidden');
                
                document.getElementById('edit-profile-icon').style.display = 'none';
            }
            
            reader.readAsDataURL(file);
        }
    }

    async function saveProfile() {
        const nameInput = document.getElementById('edit-profile-name');
        const newName = nameInput.value.trim();
        const authEmail = (localStorage.getItem('authEmail') || '').trim().toLowerCase();

        if (!newName) {
            showToast('이름을 입력해주세요.');
            return;
        }

        // 이름 저장
        setScopedItem('profileName', newName);
        document.getElementById('profile-name-display').innerText = newName;
        setScopedItem('serverUserName', newName); // 서버 반영 전까지 로컬 우선 반영

        // 이미지 vs 이모지 저장 분기
        if (isProfileImageMode) {
            // 현재 화면에 떠있는 이미지가 있다면 저장 (temp가 없으면 기존꺼 유지)
            // tempProfileImage가 있다는 건 새로 업로드했다는 뜻
            // tempProfileImage가 없고 isProfileImageMode가 true면 기존 이미지를 유지한다는 뜻(별도 저장 불필요하나 로직 통일 위해)
            
            const currentSrc = document.getElementById('edit-profile-img').src;
            if(currentSrc && currentSrc !== window.location.href) { // src가 비어있지 않다면
                 try {
                    setScopedItem('profileImage', currentSrc);
                    removeScopedItem('profileEmoji'); // 이미지가 있으면 이모지 삭제
                     
                     // 메인 화면 반영
                     const mainImg = document.getElementById('profile-img');
                     mainImg.src = currentSrc;
                     mainImg.classList.remove('hidden');
                     document.getElementById('profile-icon').style.display = 'none';
                 } catch (e) {
                     showToast('이미지 용량이 너무 커서 저장되지 않았습니다.');
                     console.error(e);
                     return;
                 }
            }
        } else {
            // 이모지 저장
            const newEmoji = document.getElementById('edit-profile-icon').innerText;
            setScopedItem('profileEmoji', newEmoji);
            removeScopedItem('profileImage'); // 이모지면 이미지 삭제
            
            // 메인 화면 반영
            const mainIcon = document.getElementById('profile-icon');
            mainIcon.innerText = newEmoji;
            mainIcon.style.display = 'block';
            document.getElementById('profile-img').classList.add('hidden');
        }

        // 서버 반영 (로그인 상태일 때만)
        if (authEmail) {
            const profileImage = isProfileImageMode ? (document.getElementById('edit-profile-img')?.src || '') : '';
            try {
                const resp = await fetch(`${API_BASE_URL}/api/profile`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        email: authEmail,
                        firstName: newName,
                        lastName: '',
                        profileImage,
                    }),
                });
                const data = await resp.json().catch(() => ({}));
                if (!resp.ok) {
                    console.error('[profile update failed]', resp.status, data);
                    showToast(data?.message || '프로필 저장에 실패했습니다.');
                } else {
                    if (data?.profileImage) {
                        setScopedItem('serverUserImage', data.profileImage);
                        setScopedItem('profileImage', data.profileImage);
                    }
                    if (data?.firstName) {
                        setScopedItem('serverUserName', data.firstName);
                        setScopedItem('profileName', data.firstName);
                        document.getElementById('profile-name-display').innerText = data.firstName;
                    }
                    showToast('프로필이 수정되었습니다.');
                }
            } catch (err) {
                console.error('[profile update error]', err);
                showToast('프로필 저장 중 네트워크 오류가 발생했습니다.');
            }
        } else {
            showToast('프로필이 수정되었습니다.');
        }

        backToMenu();
    }

    // ---------------- 추천 코드 표시 ----------------
    let referralVisible = false;
    function getReferralCode() {
        return getScopedItem('referralCode') || '';
    }
    function renderReferralCode() {
        const codeEl = document.getElementById('referral-code-text');
        const btn = document.getElementById('referral-visibility-btn');
        if (!codeEl || !btn) return;
        const code = getReferralCode();
        if (!code) {
            codeEl.innerText = '코드가 없습니다';
            btn.innerText = '보기';
            return;
        }
        const masked = code.replace(/.(?=.{2})/g, '*');
        codeEl.innerText = referralVisible ? code : masked;
        btn.innerText = referralVisible ? '숨기기' : '보기';
    }
    function toggleReferralVisibility() {
        referralVisible = !referralVisible;
        renderReferralCode();
    }
    function copyReferralCode() {
        const code = getReferralCode();
        if (!code) {
            showToast('추천 코드가 없습니다.');
            return;
        }
        navigator.clipboard.writeText(code).then(() => showToast('추천 코드가 복사되었습니다.'));
    }
    window.toggleReferralVisibility = toggleReferralVisibility;
    window.copyReferralCode = copyReferralCode;

    function goToSubMenu(page) {
        // 기존 originalGoToSubMenu 로직 대체 (함수 재정의 방식 문제 방지 위해 직접 구현)
        document.querySelectorAll('.screen').forEach(s => {
            s.style.display = 'none';
            s.classList.remove('active');
        });

        const target = document.getElementById('screen-' + page);
        if(target) {
            target.style.display = 'flex';
            target.classList.add('fade-in');
            target.classList.add('active');
        }

        toggleVipBtn(false);
        if(page === 'coupons') renderCoupons();

        if (page === 'profile-edit') {
            // 현재 메인 화면 상태를 그대로 수정 화면으로 복사
            const savedImage = getScopedItem('profileImage') || getScopedItem('serverUserImage');
            const savedEmoji = getScopedItem('profileEmoji');
            const savedName = getScopedItem('profileName') || getScopedItem('serverUserName');
            
            if (savedName) document.getElementById('edit-profile-name').value = savedName;
            
            if (savedImage) {
                // 이미지 모드 초기화
                isProfileImageMode = true;
                const editImg = document.getElementById('edit-profile-img');
                editImg.src = savedImage;
                editImg.classList.remove('hidden');
                document.getElementById('edit-profile-icon').style.display = 'none';
            } else {
                // 이모지 모드 초기화
                isProfileImageMode = false;
                document.getElementById('edit-profile-img').classList.add('hidden');
                const editIcon = document.getElementById('edit-profile-icon');
                editIcon.style.display = 'block';
                if(savedEmoji) editIcon.innerText = savedEmoji;
            }
            
            // 파일 입력 초기화
            document.getElementById('profile-upload-input').value = '';
            tempProfileImage = null;
        }
    }

    function logout() {
        // 간단한 로그아웃: 추후 토큰/세션 정리 로직을 추가하고, 현재는 로그인 화면으로만 이동
        localStorage.setItem('authLoggedIn', 'false');
        localStorage.setItem('authAutoLogin', 'false');
        sessionStorage.removeItem('authLoggedInSession');
        window.location.href = 'auth.html';
    }

    // 현재 활성화된 화면 ID를 반환
    function getActiveScreenId() {
        const screens = Array.from(document.querySelectorAll('.screen'));
        const active = screens.find(s => s.style.display === 'flex' || s.classList.contains('active'));
        if (active) return active.id;
        if (currentScreenId) return currentScreenId;
        if (screenStack.length > 0) return screenStack[screenStack.length - 1];
        return null;
    }

    // 안드로이드 하드웨어 뒤로가기 동작 처리
    function handleBackNavigation() {
        const activeId = getActiveScreenId();
        console.log('[back] handleBackNavigation', { activeId, stack: [...screenStack], currentScreenId, isHistoryNavigating, lastBackPress });
        if (!activeId) return true; // 화면 정보 없으면 종료로 가지 않도록 소비

        // 스택 기반 뒤로
        if (screenStack.length > 0) {
            const prev = screenStack.pop();
            setScreen(prev, { mode: 'replace' });
            return true;
        }

        // 커뮤니티 상세/작성 → 목록
        if (activeId === 'screen-community-detail' || activeId === 'screen-community-write') {
            setScreen('screen-community', { push: false, replace: true });
            return true;
        }

        // 채팅 → 이전 화면
        if (activeId === 'screen-chat') {
            backToPrevFromChat();
            return true;
        }

        // 메뉴 서브 → 메인 메뉴
        if (activeId === 'screen-coupons' || activeId === 'screen-payment' || activeId === 'screen-settings' || activeId === 'screen-profile-edit') {
            backToMenu();
            setActiveTabByScreenId('screen-menu');
            return true;
        }

        // 추천/스캔/결과 → 홈
        if (activeId === 'screen-recommendation' || activeId === 'screen-scan' || activeId === 'screen-result') {
            goToHome();
            setActiveTabByScreenId('screen-home');
            return true;
        }

        // 탭 화면/홈: 두 번 연속(2.2초 이내) 뒤로 시 종료
        if (activeId === 'screen-home' || activeId === 'screen-case' || activeId === 'screen-expert' || activeId === 'screen-community' || activeId === 'screen-menu') {
            console.log('[back] at home/tab, lastBackPress=', lastBackPress);
            const now = Date.now();
            const threshold = 1500;
            if (now - lastBackPress < threshold) {
                // 종료 시도 우선순위: 네이티브 브리지 → Capacitor → Cordova → window.close
                if (window.AndroidBridge?.exitApp) {
                    console.log('[back] exit via AndroidBridge.exitApp');
                    window.AndroidBridge.exitApp();
                } else {
                    const CapApp = window.Capacitor?.App || window.Capacitor?.Plugins?.App || null;
                    if (CapApp && typeof CapApp.exitApp === 'function') {
                        console.log('[back] exit via Capacitor.App.exitApp');
                        CapApp.exitApp();
                    } else if (navigator?.app?.exitApp) {
                        console.log('[back] exit via navigator.app.exitApp');
                        navigator.app.exitApp();
                    } else {
                        console.log('[back] exit fallback window.close');
                        window.close();
                    }
                }
            } else {
                lastBackPress = now;
                showToast('한 번 더 누르면 종료됩니다.');
            }
            return true;
        }

        return true;
    }

    function bindWebBackGuard() {
        if (webBackGuardBound) return;
        webBackGuardBound = true;
        const handler = (e) => {
            e?.preventDefault?.();
            console.log('[back] backbutton event');
            isHistoryNavigating = true;
            handleBackNavigation();
            isHistoryNavigating = false;
        };
        // 안드로이드 onBackPressed에서 window.dispatchEvent로 쏘므로 window/document 모두 리스닝
        window.addEventListener('backbutton', handler, false);
        document.addEventListener('backbutton', handler, false);
    }

    function bindHistoryGuard() {
        if (historyGuardBound) return;
        historyGuardBound = true;
        window.addEventListener('popstate', (ev) => {
            ev.preventDefault?.();
            console.log('[back] popstate', ev.state);
            isHistoryNavigating = true;
            handleBackNavigation();
            isHistoryNavigating = false;
            // 홈이 아닐 때만 히스토리 재적재 (홈에서 두 번 뒤로 종료 가능하도록)
            if (currentScreenId !== 'screen-home' && window.history && typeof history.pushState === 'function') {
                history.pushState({ screen: currentScreenId, ts: Date.now() }, '');
            }
        });
    }

    // --- 채팅 화면 키보드 대응 ---
    function setupChatKeyboardHandling() {
        const chatInput = document.getElementById('chat-input');
        const chatBody = document.getElementById('chat-body');
        if (!chatInput || !chatBody) return;

        const updateKeyboardOffset = () => {
            let inset = 0;
            if (window.visualViewport) {
                const vv = window.visualViewport;
                inset = Math.max(0, window.innerHeight - vv.height - Math.max(vv.offsetTop, 0));
            }
            document.documentElement.style.setProperty('--kb-offset', `${inset}px`);
        };

        const scrollToBottom = () => {
            chatBody.scrollTop = chatBody.scrollHeight;
        };

        chatInput.addEventListener('focus', () => {
            updateKeyboardOffset();
            setTimeout(() => { updateKeyboardOffset(); scrollToBottom(); }, 120);
            setTimeout(() => { updateKeyboardOffset(); scrollToBottom(); }, 280);
        });

        chatInput.addEventListener('blur', () => {
            setTimeout(updateKeyboardOffset, 50);
        });

        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', () => { updateKeyboardOffset(); scrollToBottom(); });
            window.visualViewport.addEventListener('scroll', () => { updateKeyboardOffset(); });
        }
        window.addEventListener('resize', () => { updateKeyboardOffset(); scrollToBottom(); });

        // 헤더 밀림 방지: body 스크롤 강제 0
        window.addEventListener('scroll', () => {
            if (window.scrollY !== 0) window.scrollTo(0, 0);
        });

        // 초기화
        updateKeyboardOffset();
    }

    let baseViewportHeight = (typeof window !== 'undefined' && (window.innerHeight || document.documentElement.clientHeight)) || 0;

    function getKeyboardInset() {
        const viewport = window.visualViewport;
        const currentHeight = viewport ? viewport.height : (window.innerHeight || document.documentElement.clientHeight || 0);
        const offsetTop = viewport ? Math.max(viewport.offsetTop, 0) : 0;

        // 기준 높이를 늘려가며 유지 (회전/주소창 노출 등으로 인한 최대치 반영)
        const candidateBase = currentHeight + offsetTop;
        if (candidateBase > baseViewportHeight) {
            baseViewportHeight = candidateBase;
        }

        const inset = Math.max(0, baseViewportHeight - currentHeight - offsetTop);
        return inset < 8 ? 0 : inset;
    }

    function updateViewportHeight() {
        let appHeight = (window.innerHeight || document.documentElement.clientHeight || 0);
        if (window.visualViewport) {
            const vv = window.visualViewport;
            appHeight = vv.height + Math.max(vv.offsetTop, 0);
        }
        document.documentElement.style.setProperty('--app-height', `${appHeight}px`);
    }

    function setupKeyboardInsets() {
        const update = () => {
            const inset = getKeyboardInset();
            document.documentElement.style.setProperty('--kb-offset', `${inset}px`);
            updateViewportHeight();
        };

        if (window.visualViewport) {
            const viewport = window.visualViewport;
            viewport.addEventListener('resize', update);
            viewport.addEventListener('scroll', update);
        }
        window.addEventListener('resize', update);
        window.addEventListener('focusout', () => setTimeout(update, 150));
        update();
    }

    function keepBottomNavAboveKeyboard() {
        const nav = document.querySelector('.top-nav');
        if (!nav) return;
        const inset = getKeyboardInset();
        nav.style.bottom = `${inset}px`;
    }

    function observeBottomNavForKeyboard() {
        const nav = document.querySelector('.top-nav');
        if (!nav) return;

        const resetNav = () => {
            nav.style.bottom = '0px';
        };

        const applyInset = () => keepBottomNavAboveKeyboard();

        if (window.visualViewport) {
            const viewport = window.visualViewport;
            viewport.addEventListener('resize', applyInset);
            viewport.addEventListener('scroll', applyInset);
        } else {
            window.addEventListener('resize', applyInset);
        }

        document.addEventListener('focusin', () => setTimeout(applyInset, 60));
        document.addEventListener('focusout', () => setTimeout(resetNav, 60));

        const keyboardPlugin = window.Capacitor?.Plugins?.Keyboard;
        if (keyboardPlugin && typeof keyboardPlugin.addListener === 'function') {
            keyboardPlugin.addListener('keyboardWillShow', info => {
                nav.style.bottom = `${info.keyboardHeight ?? getKeyboardInset()}px`;
            });
            keyboardPlugin.addListener('keyboardWillHide', () => resetNav());
        }
    }

    let isBiometricEnabled = false;
    let docClassResult = '';
    const BIOMETRIC_MAX_FAILS = 5;
    const BIOMETRIC_GRACE_MS = 5 * 60 * 1000; // 생체/핀 성공 후 5분 동안 재인증 면제
    let biometricFailCount = 0;
    let biometricLastCancelled = false;
    let biometricPromptedThisSession = false; // 세션 동안 자동 생체 인증은 한 번만 시도

    // --- 생체 인증 (Biometric) ---
    // 실제 기기 연동을 위해서는 '@capacitor-community/native-biometric' 플러그인 설치 필요
    // 현재는 UI 및 설정값 저장 로직만 구현
    
    async function initBiometric() {
        const saved = localStorage.getItem('useBiometric');
        isBiometricEnabled = saved === 'true';
        updateBiometricUI();
        
        if (isBiometricEnabled) {
            const { ok } = await requestBiometricAuth('앱 잠금 해제에 생체 인증을 사용합니다. 인증하시겠습니까?');
            if (!ok) {
                isBiometricEnabled = false;
                localStorage.setItem('useBiometric', 'false');
                updateBiometricUI();
                showToast('생체 인증이 실패하여 해제되었습니다.');
            }
        }
    }

    async function toggleBiometric() {
        if (!isAppPinEnabled) {
            showToast('PIN을 켜야 생체 인증을 사용할 수 있습니다.');
            return;
        }
        const nextState = !isBiometricEnabled;
        if (nextState) {
            const { ok } = await requestBiometricAuth('생체 인증을 설정하고 앞으로 잠금 해제에 사용합니다. 인증하시겠습니까?');
            if (!ok) {
                showToast('생체 인증 인증에 실패했습니다.');
                updateBiometricUI();
                return;
            }
            biometricFailCount = 0;
            biometricLastCancelled = false;
        }
        isBiometricEnabled = nextState;
        localStorage.setItem('useBiometric', isBiometricEnabled);
        updateBiometricUI();
        showToast(isBiometricEnabled ? '생체 인증이 설정되었습니다.' : '생체 인증이 해제되었습니다.');
    }

    function updateBiometricUI() {
        const track = document.getElementById('biometric-track');
        const knob = document.getElementById('biometric-knob');
        const toggle = document.getElementById('biometric-toggle');
        if (!track || !knob) return;
        if (!isAppPinEnabled) {
            track.classList.add('bg-slate-200');
            track.classList.remove('bg-emerald-500');
            knob.style.transform = 'translateX(0px)';
            track.classList.add('toggle-disabled');
            knob.classList.add('toggle-disabled');
            if (toggle) toggle.classList.add('toggle-disabled');
            return;
        }
        track.classList.remove('toggle-disabled');
        knob.classList.remove('toggle-disabled');
        if (toggle) toggle.classList.remove('toggle-disabled');

        if (isBiometricEnabled) {
            track.classList.remove('bg-slate-200');
            track.classList.add('bg-emerald-500');
            knob.style.transform = 'translateX(16px)';
        } else {
            track.classList.add('bg-slate-200');
            track.classList.remove('bg-emerald-500');
            knob.style.transform = 'translateX(0px)';
        }
    }

    function isBiometricCancelError(err) {
        const txt = (err?.code || err?.message || '').toString().toLowerCase();
        return txt.includes('cancel');
    }

    // JS 레벨에서 매 호출마다 플러그인을 재확인 (초기 로드 시 Capacitor 로딩 타이밍 문제 방지)
    let bioPluginKeysLogged = false;
    let bioPluginMissingLogged = false;
    function getBiometricBridge() {
        if (typeof Capacitor === 'undefined') return null;
        const plugins = Capacitor.Plugins || {};
        if (!bioPluginKeysLogged) {
            console.log('[Bio] Capacitor plugins', Object.keys(plugins), 'registerPlugin', typeof Capacitor.registerPlugin);
            bioPluginKeysLogged = true;
        }
        // registerPlugin 이 있으면 무조건 프록시를 만들어 호출 시도 -> 실패하면 catch에서 처리
        const bridge = (Capacitor.registerPlugin ? Capacitor.registerPlugin('BiometricBridge') : null) || plugins.BiometricBridge || null;
        if (!bridge) {
            if (!bioPluginMissingLogged) {
                console.warn('[Bio] BiometricBridge not available yet. plugins=', Object.keys(plugins), 'registerPlugin', typeof Capacitor.registerPlugin);
                bioPluginMissingLogged = true;
            }
            return null;
        }
        return bridge;
    }

    // 생체 인증 요청 (가능하면 네이티브 BiometricPrompt, 없으면 실패로 간주하여 PIN 처리)
    async function requestBiometricAuth(message) {
        const BiometricBridge = getBiometricBridge();
        const NativeBiometric = (window.Capacitor && (Capacitor.Plugins?.NativeBiometric || Capacitor.Plugins?.Biometric)) || null;
        let cancelled = false;

        // 우선 순위 1: 네이티브 BiometricPrompt (DEVICE_CREDENTIAL 포함)
        if (BiometricBridge?.authenticate) {
            try {
                const res = await BiometricBridge.authenticate({
                    title: '생체 인증',
                    subtitle: '잠금 해제',
                    description: message || '생체 인증 또는 기기 PIN/패턴으로 잠금을 해제합니다.'
                });
                return { ok: !!res?.ok, cancelled: !!res?.cancelled };
            } catch (err) {
                cancelled = isBiometricCancelError(err);
                console.error('[Bio] bridge auth failed', err);
                return { ok: false, cancelled };
            }
        }

        // 우선 순위 2: 커뮤니티 NativeBiometric 플러그인
        if (NativeBiometric?.isAvailable && NativeBiometric?.verifyIdentity) {
            try {
                const available = await NativeBiometric.isAvailable();
                if (!available?.isAvailable) {
                    console.log('[Bio] not available', available);
                    throw new Error('biometric not available');
                }
                const result = await NativeBiometric.verifyIdentity({
                    reason: message || '생체 인증을 진행합니다',
                    title: '생체 인증',
                    subtitle: '잠금 해제',
                    description: '등록된 생체 정보를 인증해 주세요.'
                });
                return { ok: !!result, cancelled: false };
            } catch (err) {
                cancelled = isBiometricCancelError(err);
                console.error('[Bio] native auth failed', err);
                return { ok: false, cancelled };
            }
        }

        // 네이티브 플러그인 없음 → 실패 처리하여 PIN으로 유도
        const pluginKeys = (typeof Capacitor !== 'undefined' && Capacitor.Plugins) ? Object.keys(Capacitor.Plugins) : [];
        console.warn('[Bio] plugin not available, fallback to PIN. plugins=', pluginKeys);
        return { ok: false, cancelled: true };
    }
    function applyDarkModeFromStorage() {
        const saved = window.localStorage ? localStorage.getItem('theme') : null;
        if (saved === 'dark') {
            isDarkMode = true;
            document.body.classList.add('dark-mode');
        } else {
            isDarkMode = false;
            document.body.classList.remove('dark-mode');
        }
        updateDarkModeUI();
    }

    function toggleDarkMode() {
        isDarkMode = !isDarkMode;
        if (isDarkMode) {
            document.body.classList.add('dark-mode');
            if (window.localStorage) localStorage.setItem('theme', 'dark');
        } else {
            document.body.classList.remove('dark-mode');
            if (window.localStorage) localStorage.setItem('theme', 'light');
        }
        updateDarkModeUI();
    }

    function updateDarkModeUI() {
        const track = document.getElementById('dark-mode-track');
        const knob = document.getElementById('dark-mode-knob');
        if (!track || !knob) return;

        if (isDarkMode) {
            track.classList.remove('bg-slate-200');
            track.classList.add('bg-emerald-500');
            knob.style.transform = 'translateX(16px)';
        } else {
            track.classList.add('bg-slate-200');
            track.classList.remove('bg-emerald-500');
            knob.style.transform = 'translateX(0px)';
        }
    }

    // [권한 요청] 안드로이드 런타임 권한 요청 (앱 시작 시 또는 필요 시 호출)
    async function requestPermissions() {
        if (typeof Capacitor === 'undefined' || !Capacitor.Plugins) {
            console.log("[perm] 웹 환경이므로 권한 요청을 건너뜁니다.");
            return;
        }
        const Plugins = Capacitor.Plugins || {};
        const Camera = Plugins.Camera;
        const Permissions = Plugins.Permissions || Capacitor.Permissions || null;
        const Filesystem = Plugins.Filesystem || null;

        const tryReq = async (label, fn) => {
            if (!fn) {
                console.log(`[perm] ${label} 플러그인 없음`);
                return;
            }
            try {
                await fn();
                console.log(`[perm] ${label} 요청 완료`);
            } catch (e) {
                console.log(`[perm] ${label} 요청 오류:`, e);
            }
        };

        // 카메라
        await tryReq('camera', async () => {
            if (Camera?.requestPermissions) {
                await Camera.requestPermissions({ permissions: ['camera'] });
                return;
            }
            if (Camera?.checkPermissions) {
                const st = await Camera.checkPermissions();
                console.log('[perm] camera check', st);
            }
        });

        // 마이크
        await tryReq('microphone', async () => {
            if (Permissions?.request) {
                await Permissions.request({ name: 'microphone' });
            }
        });

        // 갤러리/미디어 (Android 13+ photos → READ_MEDIA_IMAGES/VIDEO 매핑)
        await tryReq('photos', async () => {
            if (Permissions?.request) {
                await Permissions.request({ name: 'photos' });
            }
        });

        // 파일시스템(선택) : 일부 기기에서 필요
        await tryReq('filesystem', async () => {
            if (Filesystem?.requestPermissions) {
                await Filesystem.requestPermissions();
            }
        });
    }

    document.addEventListener('DOMContentLoaded', () => {
        enforceLoginGuard();
        initAppPin();
        const hash = window.location.hash.replace('#', '').trim();
        const allowedTabs = ['home', 'case', 'expert', 'community', 'menu'];
        const initialTab = allowedTabs.includes(hash) ? hash : 'home';

        setScreen('screen-' + initialTab, { mode: 'clear' });
        bindWebBackGuard();
        bindHistoryGuard();
        updateCommunityAnonUI();
        // 앱 시작 시 MongoDB(백엔드)에서 전문가 목록 가져오기
        fetchExpertsData();
        setupKeyboardInsets();
        // 채팅 키보드 대응 초기화
        setupChatKeyboardHandling();
        // observeBottomNavForKeyboard(); 
        // 다크 모드 초기화
        applyDarkModeFromStorage();
        // 프로필 초기화
        initProfile();
        // 생체 인증 초기화
        initBiometric();
        
        // [추가] 앱 시작 시 권한 요청 시도
        requestPermissions();

         // 안드로이드 하드웨어 뒤로가기 버튼 처리 (Capacitor)
         // Capacitor가 있을 경우 하드웨어 뒤로가기 이벤트도 감지 (네이티브 환경)
        const CapacitorApp = (window.Capacitor && (window.Capacitor.App || (window.Capacitor.Plugins && window.Capacitor.Plugins.App))) || null;
        if (CapacitorApp && typeof CapacitorApp.addListener === 'function') {
            CapacitorApp.addListener('backButton', (event) => {
                event?.preventDefault?.();
                handleBackNavigation();
            });
        }

         // 브라우저 히스토리를 이용한 뒤로가기 처리 (웹뷰/브라우저 공통)
          // popstate 핸들러는 bindHistoryGuard에서 1회만 등록
    });
