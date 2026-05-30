// ── security/js/auth.js ──────────────────────────────────
// 백서 §12 준수: 독자 인증 없음, gopang-sso.js 전용
//
// 이 파일이 하는 일:
//   1. gopang-sso.js import
//   2. K-Security 최소 레벨 L1 선언
//   3. 인증 배지·패널 UI (읽기 전용 표시)
//   4. 특정 탭(재무제표 L2, 고위험 L3) 레벨 게이트
//
// 독자 구현 금지 목록 (백서 §12.9):
//   ✗ 자체 로그인 폼
//   ✗ gopang_user_v3 직접 쓰기
//   ✗ 지문·얼굴·시드 직접 등록
//   ✗ 평문 IPv6 URL 파라미터

// ── gopang SSO 라이브러리 (비동기 import) ─────────────────
let gopangAuth = null;

async function _loadSSO() {
  if (gopangAuth) return;
  try {
    const mod = await import('https://gopang.net/auth/gopang-sso.js');
    gopangAuth = mod.gopangAuth;
  } catch(e) {
    // gopang-sso.js 미배포 환경(개발) — 로컬 폴백
    console.warn('[Auth] gopang-sso.js 로드 실패, 로컬 폴백 사용:', e.message);
    gopangAuth = _localFallback();
  }
}

// ── 전역 인증 상태 (읽기 전용) ────────────────────────────
let _user = null;  // { ipv6, level, exp, via }

// ── K-Security 진입점 (백서 §12.10 패턴) ─────────────────
async function initAuth() {
  await _loadSSO();

  // K-Security 기본 최소 레벨: L1 (백서 §12.11 기준표)
  _user = await gopangAuth.require('L1');

  if (!_user) {
    // null = 리다이렉트 중 — 이하 실행 안 됨
    return null;
  }

  renderAuthBadge();
  console.info('[K-Security] 인증 완료:', _user.ipv6, _user.level);
  return _user;
}

// ── 탭별 인증 게이트 (백서 §12.5 패턴) ───────────────────
// 재무제표 탭: L2 필요
// 기타(개요·AI·규제): 진입 시 이미 L1 충족
async function requireLevel(level) {
  await _loadSSO();
  const result = await gopangAuth.require(level);  // verify → require (4경로 전체 재시도)
  if (result) {
    _user = result;
    renderAuthBadge();
  }
  return result;
}

// ── 인증 배지 (표시 전용) ────────────────────────────────
function renderAuthBadge() {
  const el = document.getElementById('auth-badge');
  if (!el) return;

  if (!_user) {
    el.style.cssText = 'background:var(--obg);color:var(--org);border-radius:10px;padding:2px 10px;font-size:11px;font-weight:700;cursor:pointer';
    el.textContent   = '인증 중…';
    el.title         = '';
    el.onclick       = null;
    return;
  }

  const cfg = {
    L0:{ bg:'var(--bg)',    color:'var(--hint)', label:'L0 기기' },
    L1:{ bg:'var(--tbg)',   color:'var(--teal)', label:'L1 얼굴' },
    L2:{ bg:'var(--pri-bg)',color:'var(--pri)',  label:'L2 지문' },
    L3:{ bg:'var(--gbg)',   color:'var(--grn)',  label:'L3 시드' },
  };
  const c = cfg[_user.level] || cfg.L0;
  const via = { gwp:'GWP', session:'세션', local:'로컬', silent:'사일런트', popup:'팝업' };

  el.style.cssText = `background:${c.bg};color:${c.color};border-radius:10px;padding:2px 10px;font-size:11px;font-weight:700;cursor:pointer`;
  el.textContent   = c.label;
  el.title         = `${_user.ipv6} · 경로: ${via[_user.via] || _user.via}`;
  el.onclick       = showAuthPanel;
}

// ── 인증 관리 패널 (읽기 전용, 고팡 앱으로 안내) ──────────
function showAuthPanel() {
  const modal   = document.getElementById('auth-modal');
  const content = document.getElementById('auth-modal-content');
  if (!modal || !content) return;

  const lvl  = _user?.level || '—';
  const ipv6 = _user?.ipv6  || '—';
  const exp  = _user?.exp
    ? new Date(_user.exp * 1000).toLocaleTimeString('ko-KR')
    : '—';

  const labels  = { L0:'기기', L1:'얼굴', L2:'지문', L3:'시드' };
  const LEVEL_ORDER = { L0:0, L1:1, L2:2, L3:3 };

  content.innerHTML = `
    <div style="font-size:16px;font-weight:800;color:var(--txt);margin-bottom:4px">고팡 인증 정보</div>
    <div style="font-size:10px;font-family:monospace;color:var(--hint);word-break:break-all;margin-bottom:16px">${ipv6}</div>

    <div style="background:var(--bg);border-radius:var(--r);padding:12px 14px;margin-bottom:14px;font-size:12px;line-height:1.9;color:var(--sub)">
      <div style="display:flex;justify-content:space-between"><span>인증 레벨</span><strong style="color:var(--txt)">${lvl} (${labels[lvl]||'—'})</strong></div>
      <div style="display:flex;justify-content:space-between"><span>세션 만료</span><strong style="color:var(--txt)">${exp}</strong></div>
      <div style="display:flex;justify-content:space-between"><span>서비스</span><strong style="color:var(--txt)">K-Security</strong></div>
    </div>

    <div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap">
      ${['L0','L1','L2','L3'].map(l => `
        <div class="auth-level-badge ${l.toLowerCase()}"
             style="opacity:${(LEVEL_ORDER[lvl]||0) >= LEVEL_ORDER[l] ? 1 : .3}">
          ${l} ${labels[l]}
        </div>`).join('')}
    </div>

    <div style="font-size:11px;color:var(--hint);padding:8px 12px;background:var(--pri-bg);border-radius:var(--r);margin-bottom:14px;line-height:1.7">
      인증 레벨 변경·생체 등록은 <strong>고팡 앱</strong>에서 진행합니다.<br>
      K-Security는 독자 인증 시스템을 운영하지 않습니다.
    </div>

    <div style="display:flex;gap:8px">
      <a href="https://gopang.net" target="_blank"
         style="flex:1;padding:10px;background:var(--pri);color:#fff;border:none;border-radius:var(--r);font-family:var(--font);font-size:13px;font-weight:700;cursor:pointer;text-align:center;text-decoration:none">
        고팡 앱 열기
      </a>
      <button onclick="closeAuthModal()"
              style="flex:1;padding:10px;border:1.5px solid var(--bdr);border-radius:var(--r);font-family:var(--font);font-size:13px;font-weight:600;color:var(--hint);background:none;cursor:pointer">
        닫기
      </button>
    </div>
  `;
  modal.classList.add('open');
}

function closeAuthModal() {
  const modal = document.getElementById('auth-modal');
  if (modal) modal.classList.remove('open');
}

// ── 개발환경 폴백 (gopang-sso.js 미배포 시) ──────────────
// gopang_user_v3를 읽기 전용으로 참조 (경로 2-B Local 방식만 사용)
// 백서 §12.1 허용: "gopang_user_v3 읽기 전용 참조 (L0 기기 일치 확인만)"
function _localFallback() {
  const STORE    = 'gopang_user_v3';
  const SESSION  = 'gopang_sso_token';
  const LVL_ORD  = { L0:0, L1:1, L2:2, L3:3 };

  async function _fp() {
    const raw = [
      navigator.userAgent, navigator.language,
      screen.width + 'x' + screen.height, screen.colorDepth,
      Intl.DateTimeFormat().resolvedOptions().timeZone,
      navigator.hardwareConcurrency || '', navigator.deviceMemory || '', screen.pixelDepth || '',
    ].join('|');
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
    return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
  }

  return {
    async require(level) {
      // 세션 캐시 확인
      try {
        const s = JSON.parse(sessionStorage.getItem(SESSION) || 'null');
        if (s?.exp && Date.now()/1000 < s.exp && LVL_ORD[s.level] >= LVL_ORD[level])
          return { ...s, via:'session' };
      } catch {}

      // 로컬스토어 대조
      const stored = JSON.parse(localStorage.getItem(STORE) || 'null');
      if (!stored?.ipv6) {
        // 미등록 → gopang.net 안내 (리다이렉트 대신 모달 표시)
        _showFallbackPrompt();
        return null;
      }

      const fp = await _fp();
      if (stored.fpHex !== fp) { _showFallbackPrompt(); return null; }

      if (LVL_ORD[stored.authLevel||'L0'] < LVL_ORD[level]) {
        _showFallbackPrompt(level);
        return null;
      }

      const exp = Math.floor(Date.now()/1000) + 3600;
      const token = { ipv6: stored.ipv6, level: stored.authLevel||'L0', exp };
      sessionStorage.setItem(SESSION, JSON.stringify(token));
      return { ...token, via:'local' };
    },

    async verify(level) { return this.require(level); },
    session() {
      try {
        const s = JSON.parse(sessionStorage.getItem(SESSION)||'null');
        return s?.exp && Date.now()/1000 < s.exp ? s : null;
      } catch { return null; }
    },
    logout() { sessionStorage.removeItem(SESSION); },
  };
}

function _showFallbackPrompt(level) {
  const modal   = document.getElementById('auth-modal');
  const content = document.getElementById('auth-modal-content');
  if (!modal || !content) return;

  content.innerHTML = `
    <div class="auth-modal-hd">
      <div class="auth-level-badge" style="background:var(--obg);color:var(--org);border-color:var(--obd);font-size:20px;width:36px;height:36px">G</div>
      <div>
        <div class="auth-modal-title">고팡 인증 필요</div>
        <div class="auth-modal-sub">gopang.net에서 ${level||'L1'} 인증 후 돌아오세요</div>
      </div>
    </div>
    <div style="margin:16px 0;padding:14px;background:var(--bg);border-radius:var(--r);font-size:13px;line-height:1.8;color:var(--sub)">
      K-Security는 <strong>고팡(gopang.net)</strong> 인증을 사용합니다.<br><br>
      1. <a href="https://gopang.net" target="_blank" style="color:var(--pri);font-weight:700">gopang.net</a> 에서 인증 완료<br>
      2. 이 페이지로 돌아와 [재확인] 클릭
    </div>
    <div style="display:flex;gap:8px">
      <button onclick="closeAuthModal()" class="auth-btn-cancel">취소</button>
      <a href="https://gopang.net" target="_blank" class="auth-btn-primary"
         style="flex:2;display:flex;align-items:center;justify-content:center;text-decoration:none">
        gopang.net 열기
      </a>
    </div>
    <button onclick="location.reload()"
            style="width:100%;margin-top:8px;padding:9px;border:1.5px solid var(--pri-bd);border-radius:var(--r);font-family:var(--font);font-size:13px;font-weight:600;color:var(--pri);background:var(--pri-bg);cursor:pointer">
      ✓ 인증 완료 — 재확인 (페이지 새로고침)
    </button>
  `;
  modal.classList.add('open');
}
