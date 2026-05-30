// ── 설정 상수 ────────────────────────────────────────
const SUPA_URL  = 'https://ebbecjfrwaswbdybbgiu.supabase.co';
const SUPA_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImViYmVjamZyd2Fzd2JkeWJiZ2l1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1NjE5ODQsImV4cCI6MjA5NTEzNzk4NH0.H2ahQKtWdSke04Pdi3hDY86pdTx7UUKPUpQMlS_zciA';
const HDR = { 'apikey': SUPA_ANON, 'Authorization': 'Bearer ' + SUPA_ANON };

// SEOM 보안 시스템 상수 (특허 기반)
const FPGA_TARGET_MS   = 0.032;   // 영지식증명 목표: 0.032ms
const AI_THRESHOLD     = 0.60;    // 의심도 임계값: 0.6 이상 거부
const GDC_FEE_RATE     = 0.0020;  // 0.20%
const REFRESH_INTERVAL = 15000;   // 15초마다 자동 갱신

// 글로벌 규제 준수 국가 목록 (특허 도면 8 기반)
const REGULATED_COUNTRIES = [
  { code:'US', name:'미국',     flag:'🇺🇸', law:'SEC Howey Test',     threshold:75 },
  { code:'EU', name:'유럽연합', flag:'🇪🇺', law:'EU MiCA',            threshold:80 },
  { code:'JP', name:'일본',     flag:'🇯🇵', law:'JP FSA',             threshold:80 },
  { code:'SG', name:'싱가포르', flag:'🇸🇬', law:'MAS Guidelines',     threshold:75 },
  { code:'KR', name:'한국',     flag:'🇰🇷', law:'금융위원회 규정',     threshold:85 },
  { code:'GB', name:'영국',     flag:'🇬🇧', law:'FCA Rules',          threshold:78 },
  { code:'AU', name:'호주',     flag:'🇦🇺', law:'ASIC Guidelines',    threshold:75 },
  { code:'CA', name:'캐나다',   flag:'🇨🇦', law:'CSA Framework',      threshold:72 },
  { code:'DE', name:'독일',     flag:'🇩🇪', law:'BaFin Rules',        threshold:80 },
  { code:'FR', name:'프랑스',   flag:'🇫🇷', law:'AMF Doctrine',       threshold:80 },
  { code:'CH', name:'스위스',   flag:'🇨🇭', law:'FINMA Guidance',     threshold:70 },
  { code:'HK', name:'홍콩',     flag:'🇭🇰', law:'SFC Framework',      threshold:75 },
  { code:'AE', name:'UAE',      flag:'🇦🇪', law:'VARA Rulebook',      threshold:70 },
  { code:'BR', name:'브라질',   flag:'🇧🇷', law:'CVM Resolution',     threshold:68 },
  { code:'IN', name:'인도',     flag:'🇮🇳', law:'RBI Circular',       threshold:65 },
];
