// ── security-agent.js ────────────────────────────────────────
// 고팡 생태계 하위 시스템 공통 보안 에이전트 v1.1
//
// 사용법: 각 하위 시스템의 </body> 직전에 추가
//   <script
//     src="https://security.gopang.net/security-agent.js"
//     data-svc="school"
//     data-url="school.gopang.net"
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
  // Supabase 직접 저장 (gopang-proxy /security/report 배포 전까지)
  const SUPA_URL   = 'https://ebbecjfrwaswbdybbgiu.supabase.co';
  const SUPA_ANON  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImViYmVjamZyd2Fzd2JkeWJiZ2l1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1NjE5ODQsImV4cCI6MjA5NTEzNzk4NH0.H2ahQKtWdSke04Pdi3hDY86pdTx7UUKPUpQMlS_zciA';
  const REPORT_URL  = SUPA_URL + '/rest/v1/security_log';
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
        headers: {
          'Content-Type': 'application/json',
          'apikey':        SUPA_ANON,
          'Authorization': 'Bearer ' + SUPA_ANON,
          'Prefer':        'return=minimal',
        },
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

  // ── K-Security 지시 수신 및 이행 ─────────────────────────────
  async function executeCommand(cmd) {
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
      <span style="font-size:10px;opacity:.6">security.gopang.net</span>
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
        headers: { 'Content-Type': 'application/json',
                   'apikey': SUPA_ANON, 'Authorization': 'Bearer ' + SUPA_ANON,
                   'Prefer': 'return=minimal' },
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

  // 외부 접근용 (다른 스크립트에서 수동 보고 트리거 가능)
  window.KSecAgent = { report, executeCommand, diagnose };

})();
