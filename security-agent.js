// ── security-agent.js ────────────────────────────────────────
// 고팡 생태계 하위 시스템 공통 보안 에이전트 v1.1
//
// 사용법: 각 하위 시스템의 </body> 직전에 추가
//   <script
//     src="https://security.hondi.net/security-agent.js"
//     data-svc="school"
//     data-url="school.hondi.net"
//   ></script>
//
// 이 파일이 하는 일:
//   1. 자가 진단 (응답시간·인증·PDV 흐름) — 30초 간격
//   2. K-Security에 보고
//   3. K-Security의 지시 수신 및 이행

(function () {
  'use strict';

  // ── 설정 ────────────────────────────────────────────────────
  const SCRIPT_EL    = document.getElementById('ksec-agent') || document.currentScript;
  const SVC_ID       = SCRIPT_EL?.dataset?.svc       || 'unknown';
  const SVC_URL      = SCRIPT_EL?.dataset?.url       || location.hostname;
  const AUTH_LEVEL   = SCRIPT_EL?.dataset?.authLevel || 'L0'; // subsystem-auth.js 전달값
  // L1 PocketBase(hanlim) 직접 저장 — Supabase 전면 중단(2026-07-19)에 따라 이관
  const REPORT_URL  = 'https://l1-hanlim.gopang.net/api/collections/security_log/records';
  const COMMAND_URL = null; // gopang-proxy 배포 후 활성화
  const INTERVAL_SEC = 24 * 60 * 60; // v1.1: 24시간 (기존 30초)
  const STORE_KEY    = `ksec_agent_${SVC_ID}`;

  // ── 상태 ────────────────────────────────────────────────────
  let _startTime  = Date.now();
  let _errStreak  = 0;   // 연속 오류 횟수
  let _lastStatus = 'ok';
  let _timer      = null;

  // ── 자가 진단 ────────────────────────────────────────────────
  async function diagnose() {
    const t0 = performance.now();
    let authOk = false, pdvOk = false, lastError = null;

    // 1) 인증 상태 확인 (gopang_sso_token 세션 존재 여부)
    try {
      const token = JSON.parse(sessionStorage.getItem('gopang_sso_token') || 'null');
      authOk = !!(token?.ipv6 && token?.exp && Date.now() / 1000 < token.exp);
    } catch (e) {
      lastError = 'auth_parse_error';
    }

    // 2) PDV 흐름 확인 (로컬 대기열이 20건 이상이면 PDV 전송 막힘)
    try {
      const pending = JSON.parse(localStorage.getItem(`pdv_pending_${SVC_ID}`) || '[]');
      pdvOk = pending.length < 20;
      if (!pdvOk) lastError = `pdv_queue_overflow:${pending.length}`;
    } catch (e) {
      pdvOk = true; // 키 없으면 정상
    }

    // 3) 페이지 응답성 (자기 자신 fetch — no-cors로 시간만 측정)
    let latencyMs = Math.round(performance.now() - t0);
    try {
      const p0  = performance.now();
      await fetch(location.origin + '/', { method: 'HEAD', cache: 'no-store', mode: 'no-cors' });
      latencyMs = Math.round(performance.now() - p0);
    } catch (e) {
      lastError = lastError || 'fetch_failed';
    }

    // 4) 심각도 판정
    let status = 'ok';
    if (latencyMs > 3000 || !pdvOk)        status = 'warn';   // S1
    if (_errStreak >= 3 || !authOk)        status = 'error';  // S2 (인증 불능)
    if (_errStreak >= 5 || latencyMs > 10000) status = 'critical'; // S3

    return {
      status,
      latency_ms:  latencyMs,
      auth_ok:     authOk,
      pdv_ok:      pdvOk,
      last_error:  lastError,
      uptime_sec:  Math.floor((Date.now() - _startTime) / 1000),
    };
  }

  // ── 보고서 생성 (6하원칙) ────────────────────────────────────
  function buildReport(diag) {
    const now = new Date().toISOString();
    return {
      who:  { svc: SVC_ID, url: SVC_URL, agent: 'security-agent/1.0', auth_level: AUTH_LEVEL },
      when: { ts: now, uptime_sec: diag.uptime_sec },
      where:{ origin: location.origin, page: location.pathname },
      what: {
        status:     diag.status,
        latency_ms: diag.latency_ms,
        auth_ok:    diag.auth_ok,
        pdv_ok:     diag.pdv_ok,
        last_error: diag.last_error,
        err_streak: _errStreak,
      },
      how:  { method: 'self-report', interval_sec: INTERVAL_SEC },
      why:  { triggered: 'interval', prev_status: _lastStatus },
    };
  }

  // ── K-Security에 보고 ────────────────────────────────────────
  async function report() {
    const diag = await diagnose();
    const payload = buildReport(diag);

    // 오류 연속 횟수 관리
    if (diag.status !== 'ok') _errStreak++;
    else                       _errStreak = 0;

    _lastStatus = diag.status;

    // 로컬 캐시 (오프라인 대비)
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        ...payload, cached_at: Date.now()
      }));
    } catch {}

    // Supabase security_log 직접 저장
    try {
      const row = {
        svc:        payload.who.svc,
        svc_url:    payload.who.url,
        status:     payload.what.status,
        latency_ms: payload.what.latency_ms,
        auth_ok:    payload.what.auth_ok,
        pdv_ok:     payload.what.pdv_ok,
        err_streak: payload.what.err_streak,
        last_error: payload.what.last_error,
        uptime_sec: payload.when.uptime_sec,
        raw:        payload,
      };
      const res = await fetch(REPORT_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:      JSON.stringify(row),
        keepalive: true,
      });
      if (!res.ok) {
        const txt = await res.text().catch(()=>'');
        console.warn(`[K-Security Agent:${SVC_ID}] 저장 실패 ${res.status}:`, txt);
      }
    } catch (e) {
      console.warn(`[K-Security Agent:${SVC_ID}] 보고 실패:`, e.message);
    }

    console.debug(
      `[K-Security Agent:${SVC_ID}] ${diag.status.toUpperCase()} ` +
      `| ${diag.latency_ms}ms | auth:${diag.auth_ok} | pdv:${diag.pdv_ok}`
    );
  }

  // ── K-Security 명령 서명 검증 (2026-07-18 재설계) ─────────────
  // COMMAND_URL이 아직 null이라 지금은 어떤 경로로도 실제로 호출되지
  // 않는다(_pollCommands는 스캐폴딩일 뿐 어디서도 부르지 않음). 다만
  // "COMMAND_URL을 켜는 순간 이 검증도 같이 있어야 한다"는 게 지난
  // 세션 결론이라, 활성화 이전인 지금 미리 구현해둔다.
  //
  // 신뢰 모델이 gopang worker.js의 _verifyClaimsRequester와 다르다는
  // 점이 핵심이다 — 그쪽은 "요청자 1명"을 매번 L1에서 조회해 검증하는
  // 모델(사용자마다 공개키가 다름)이고, 여기는 "발신자(K-Security 서버)
  // 단 하나"만 검증하면 되는 모델이다. 이 스크립트는 여러 하위 시스템의
  // 브라우저에 그대로 배포되는 "받는 쪽"이라 대칭키/비밀값을 안전하게
  // 들고 있을 수 없다 — 그래서 K-Security의 공개키 하나만 이 파일에
  // 고정 배포(pin)하고, 서명에 쓰는 개인키는 K-Security 서버에만
  // 존재한다. 소프트웨어 업데이트 서명(TUF 등)과 같은 구조다.
  //
  // ⚠️ 아래 공개키는 플레이스홀더다 — 실제 K-Security 서버가 갖추는
  // 개인키와 짝이 맞는 진짜 키로 반드시 교체해야 한다. 짝이 안 맞으면
  // 모든 서명 검증이 항상 실패한다(안전한 방향의 실패 — 명령이 전혀
  // 실행되지 않을 뿐, 위조된 명령이 통과하지는 않는다).
  const K_SECURITY_PUBLIC_KEY_B64U = 'pQ95N6nW8CoduZk_qakJiRqk-SKIO53PXFKxHDpMSk8';
  const COMMAND_FRESHNESS_SEC = 300; // 5분 — 이보다 오래된 서명은 재생(replay) 공격으로 간주해 거부
  const KNOWN_COMMAND_TYPES = Object.freeze([
    'DIAGNOSE_NOW', 'SET_INTERVAL', 'SHOW_ALERT', 'HIDE_ALERT', 'SUSPEND', 'RESUME',
  ]);

  function _b64uToBytes(b64u) {
    const b64 = b64u.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - b64u.length % 4) % 4);
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  // 서명 대상 메시지는 명령의 모든 필드를 결정적 순서로 직렬화한다.
  // svc_id를 반드시 포함해야 "다른 서비스용으로 서명된 명령을 이 서비스에
  // 재생"하는 공격(cross-service replay)을 막을 수 있다.
  function _commandSigningMessage({ svc_id, type, params, ts }) {
    return `ksec-command:${svc_id}:${type}:${JSON.stringify(params || {})}:${ts}`;
  }

  /**
   * 서명된 명령을 검증 후에만 실행한다. 아래 4가지 중 하나라도 실패하면
   * 명령을 절대 실행하지 않는다:
   *   1. Ed25519 서명이 K_SECURITY_PUBLIC_KEY_B64U로 검증되는가
   *   2. signedCmd.svc_id가 이 스크립트가 실행 중인 서비스(SVC_ID)와 일치하는가
   *   3. ts(발급 시각)가 신선한가(COMMAND_FRESHNESS_SEC 이내)
   *   4. type이 KNOWN_COMMAND_TYPES 화이트리스트 안에 있는가
   */
  async function receiveSignedCommand(signedCmd) {
    const { svc_id, type, params, ts, signature } = signedCmd || {};

    if (!svc_id || !type || !ts || !signature) {
      console.warn(`[K-Security Agent:${SVC_ID}] 명령 거부: 필드 누락`);
      return { accepted: false, reason: 'MISSING_FIELD' };
    }
    if (svc_id !== SVC_ID) {
      console.warn(`[K-Security Agent:${SVC_ID}] 명령 거부: svc_id 불일치(${svc_id})`);
      return { accepted: false, reason: 'SVC_MISMATCH' };
    }
    if (!KNOWN_COMMAND_TYPES.includes(type)) {
      console.warn(`[K-Security Agent:${SVC_ID}] 명령 거부: 알 수 없는 타입(${type})`);
      return { accepted: false, reason: 'UNKNOWN_TYPE' };
    }
    const ageSec = Math.abs(Date.now() / 1000 - Number(ts));
    if (!(ageSec <= COMMAND_FRESHNESS_SEC)) {
      console.warn(`[K-Security Agent:${SVC_ID}] 명령 거부: 오래된 서명(${Math.round(ageSec)}s)`);
      return { accepted: false, reason: 'STALE_SIGNATURE' };
    }

    let sigOk = false;
    try {
      const key = await crypto.subtle.importKey(
        'raw', _b64uToBytes(K_SECURITY_PUBLIC_KEY_B64U), { name: 'Ed25519' }, false, ['verify']
      );
      const msg = _commandSigningMessage({ svc_id, type, params, ts });
      sigOk = await crypto.subtle.verify('Ed25519', key, _b64uToBytes(signature), new TextEncoder().encode(msg));
    } catch (e) {
      console.warn(`[K-Security Agent:${SVC_ID}] 서명 검증 오류:`, e.message);
      sigOk = false;
    }
    if (!sigOk) {
      console.warn(`[K-Security Agent:${SVC_ID}] 명령 거부: 서명 검증 실패`);
      return { accepted: false, reason: 'BAD_SIGNATURE' };
    }

    await _executeCommandUnsafe({ type, ...params });
    return { accepted: true };
  }

  // COMMAND_URL 활성화 시 이 함수가 주기적으로 폴링하도록 연결할 것.
  // 지금은 COMMAND_URL이 null이라 어디서도 호출되지 않는 스캐폴딩이다.
  async function _pollCommands() {
    if (!COMMAND_URL) return;
    try {
      const res = await fetch(`${COMMAND_URL}?svc_id=${encodeURIComponent(SVC_ID)}`);
      const data = await res.json().catch(() => null);
      for (const signedCmd of (data?.commands || [])) {
        await receiveSignedCommand(signedCmd);
      }
    } catch (e) {
      console.warn(`[K-Security Agent:${SVC_ID}] 명령 폴링 실패:`, e.message);
    }
  }

  // ── K-Security 지시 이행 (내부 전용 — 서명 검증을 통과한 뒤에만 호출) ─
  async function _executeCommandUnsafe(cmd) {
    console.info(`[K-Security Agent:${SVC_ID}] 지시 수신:`, cmd.type);

    switch (cmd.type) {

      // 즉시 추가 진단 보고
      case 'DIAGNOSE_NOW':
        await report();
        break;

      // 점검 간격 변경 (심각 상황 시 K-Security가 간격을 줄임)
      case 'SET_INTERVAL':
        if (cmd.interval_sec && cmd.interval_sec >= 5) {
          clearInterval(_timer);
          _timer = setInterval(report, cmd.interval_sec * 1000);
          console.info(`[K-Security Agent:${SVC_ID}] 점검 간격 변경: ${cmd.interval_sec}s`);
        }
        break;

      // 사용자에게 경고 배너 표시
      case 'SHOW_ALERT':
        showAlertBanner(cmd.message || '시스템 점검 중입니다.', cmd.level || 'warn');
        break;

      // 경고 배너 해제
      case 'HIDE_ALERT':
        hideAlertBanner();
        break;

      // 서비스 일시 중단 — 모든 기능 비활성화 후 안내 페이지 표시
      case 'SUSPEND':
        showAlertBanner(
          cmd.message || '보안 점검으로 인해 서비스가 일시 중단되었습니다.',
          'critical'
        );
        // 입력 필드·버튼 전체 비활성화
        document.querySelectorAll('input, button, textarea, select').forEach(el => {
          el.disabled = true;
        });
        console.warn(`[K-Security Agent:${SVC_ID}] 서비스 중단 지시 이행`);
        break;

      // 서비스 재개
      case 'RESUME':
        hideAlertBanner();
        document.querySelectorAll('input, button, textarea, select').forEach(el => {
          el.disabled = false;
        });
        break;

      // 페이지 강제 새로고침 (업데이트 배포 후)
      case 'RELOAD':
        setTimeout(() => location.reload(true), cmd.delay_ms || 2000);
        break;

      default:
        console.warn(`[K-Security Agent:${SVC_ID}] 알 수 없는 지시:`, cmd.type);
    }
  }

  // ── 경고 배너 UI ─────────────────────────────────────────────
  function showAlertBanner(message, level) {
    hideAlertBanner(); // 기존 배너 제거

    const colors = {
      warn:     { bg: '#fef3c7', border: '#fbbf24', text: '#92400e', icon: '⚠️' },
      error:    { bg: '#fee2e2', border: '#f87171', text: '#991b1b', icon: '🚨' },
      critical: { bg: '#1a0000', border: '#dc2626', text: '#fca5a5', icon: '🔴' },
    };
    const c = colors[level] || colors.warn;

    const banner = document.createElement('div');
    banner.id = 'ksec-alert-banner';
    banner.style.cssText = `
      position:fixed; top:0; left:0; right:0; z-index:99999;
      background:${c.bg}; border-bottom:2px solid ${c.border};
      color:${c.text}; font-family:-apple-system,sans-serif;
      font-size:13px; font-weight:600; padding:10px 16px;
      display:flex; align-items:center; gap:8px;
      box-shadow:0 2px 8px rgba(0,0,0,.15);
    `;
    banner.innerHTML = `
      <span>${c.icon}</span>
      <span style="flex:1">[K-Security] ${message}</span>
      <span style="font-size:10px;opacity:.6">security.hondi.net</span>
    `;
    document.body.prepend(banner);
  }

  function hideAlertBanner() {
    document.getElementById('ksec-alert-banner')?.remove();
  }

  // ── 에이전트 시작 ────────────────────────────────────────────
  function start() {
    // 페이지 로드 직후 1회 즉시 보고
    report();
    // 이후 30초 간격
    _timer = setInterval(report, INTERVAL_SEC * 1000);

    // 페이지 언로드 시 마지막 보고 (beacon)
    window.addEventListener('beforeunload', () => {
      const diag = { status: 'offline', latency_ms: 0,
                     auth_ok: false, pdv_ok: true,
                     last_error: 'page_unload',
                     uptime_sec: Math.floor((Date.now() - _startTime) / 1000) };
      const payload = buildReport(diag);
      const row = {
        svc: payload.who.svc, svc_url: payload.who.url,
        status: payload.what.status, latency_ms: payload.what.latency_ms,
        auth_ok: payload.what.auth_ok, pdv_ok: payload.what.pdv_ok,
        err_streak: payload.what.err_streak, last_error: payload.what.last_error,
        uptime_sec: payload.when.uptime_sec, raw: payload,
      };
      // sendBeacon은 커스텀 헤더 불가 → fetch keepalive로 대체
      fetch(REPORT_URL, {
        method: 'POST', keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(row),
      }).catch(()=>{});
    });

    console.info(`[K-Security Agent:${SVC_ID}] 시작 — ${SVC_URL} — 점검 간격 ${INTERVAL_SEC}s`);
  }

  // DOM 준비 후 시작
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  // 외부 접근용 (다른 스크립트에서 수동 보고 트리거 가능) — 2026-07-18:
  // executeCommand(→ _executeCommandUnsafe로 개명, 비공개)는 여기서
  // 뺐다. report/diagnose는 부작용이 읽기·보고뿐이라 외부에서 불러도
  // 안전하다. receiveSignedCommand는 노출해도 안전하다 — 서명 검증을
  // 통과하지 못하면 절대 실행하지 않도록 설계했으므로, 유효한
  // K-Security 서명 없이 아무나 호출해봤자 항상 거부된다.
  window.KSecAgent = { report, diagnose, receiveSignedCommand };

})();
