-- ── K-Security Supabase 스키마 ───────────────────────────────
-- 실행: Supabase SQL Editor에 붙여넣기

-- 1) 보안 로그 테이블 (각 하위 시스템의 30초 보고)
CREATE TABLE IF NOT EXISTS security_log (
  id           BIGSERIAL PRIMARY KEY,
  svc          TEXT        NOT NULL,          -- 시스템 ID (school, health 등)
  svc_url      TEXT,                          -- 도메인
  status       TEXT        NOT NULL           -- ok | warn | error | critical | offline
                CHECK (status IN ('ok','warn','error','critical','offline')),
  latency_ms   INTEGER,                       -- 응답시간
  auth_ok      BOOLEAN     DEFAULT true,      -- 인증 정상 여부
  pdv_ok       BOOLEAN     DEFAULT true,      -- PDV 흐름 정상 여부
  err_streak   INTEGER     DEFAULT 0,         -- 연속 오류 횟수
  last_error   TEXT,                          -- 마지막 오류 메시지
  uptime_sec   INTEGER,                       -- 에이전트 가동 시간
  raw          JSONB,                         -- 6하원칙 전체 원본
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- 2) 이상 이벤트 테이블 (S1/S2/S3 발생 시 별도 기록)
CREATE TABLE IF NOT EXISTS security_event (
  id           BIGSERIAL PRIMARY KEY,
  svc          TEXT        NOT NULL,
  severity     TEXT        NOT NULL           -- S1 | S2 | S3
                CHECK (severity IN ('S1','S2','S3')),
  title        TEXT        NOT NULL,          -- 이벤트 제목
  detail       TEXT,                          -- 상세 내용
  status       TEXT        DEFAULT 'open'     -- open | investigating | resolved
                CHECK (status IN ('open','investigating','resolved')),
  notified_at  TIMESTAMPTZ,                   -- 이해관계자 알림 발송 시각
  resolved_at  TIMESTAMPTZ,                   -- 해결 시각
  raw          JSONB,                         -- 원본 보고서
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- 3) K-Security 지시 로그 (어떤 지시를 누구에게 보냈는지)
CREATE TABLE IF NOT EXISTS security_command (
  id           BIGSERIAL PRIMARY KEY,
  svc          TEXT        NOT NULL,          -- 대상 시스템
  cmd_type     TEXT        NOT NULL,          -- DIAGNOSE_NOW | SUSPEND | RESUME 등
  cmd_payload  JSONB,                         -- 지시 내용 전체
  event_id     BIGINT      REFERENCES security_event(id),
  issued_at    TIMESTAMPTZ DEFAULT now()
);

-- ── 인덱스 ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_security_log_svc        ON security_log(svc);
CREATE INDEX IF NOT EXISTS idx_security_log_status     ON security_log(status);
CREATE INDEX IF NOT EXISTS idx_security_log_created    ON security_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_event_svc      ON security_event(svc);
CREATE INDEX IF NOT EXISTS idx_security_event_severity ON security_event(severity);
CREATE INDEX IF NOT EXISTS idx_security_event_status   ON security_event(status);

-- ── Row Level Security ───────────────────────────────────────
-- 대시보드는 전체 공개 (읽기), 쓰기는 gopang-proxy 서비스키만
ALTER TABLE security_log     ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_event   ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_command ENABLE ROW LEVEL SECURITY;

-- anon(공개) 읽기 허용
CREATE POLICY "public_read_log"
  ON security_log FOR SELECT TO anon USING (true);

CREATE POLICY "public_read_event"
  ON security_event FOR SELECT TO anon USING (true);

-- security_command는 공개 읽기 불가 (지시 내용은 내부 전용)
CREATE POLICY "no_public_command"
  ON security_command FOR SELECT TO anon USING (false);

-- ── 대시보드용 뷰 ────────────────────────────────────────────
-- 시스템별 최신 상태 1건씩
CREATE OR REPLACE VIEW security_status AS
SELECT DISTINCT ON (svc)
  svc, svc_url, status, latency_ms,
  auth_ok, pdv_ok, err_streak, last_error, created_at
FROM security_log
ORDER BY svc, created_at DESC;

-- 시스템별 1시간 가동률
CREATE OR REPLACE VIEW security_uptime_1h AS
SELECT
  svc,
  COUNT(*)                                          AS total_checks,
  COUNT(*) FILTER (WHERE status = 'ok')             AS ok_count,
  ROUND(
    COUNT(*) FILTER (WHERE status = 'ok') * 100.0
    / NULLIF(COUNT(*), 0), 1
  )                                                 AS uptime_pct,
  AVG(latency_ms)::INTEGER                          AS avg_latency_ms,
  MAX(latency_ms)                                   AS max_latency_ms
FROM security_log
WHERE created_at > now() - INTERVAL '1 hour'
GROUP BY svc;

-- 미해결 이상 이벤트
CREATE OR REPLACE VIEW security_open_events AS
SELECT id, svc, severity, title, detail, status, created_at
FROM security_event
WHERE status != 'resolved'
ORDER BY
  CASE severity WHEN 'S3' THEN 1 WHEN 'S2' THEN 2 ELSE 3 END,
  created_at DESC;

-- ── 자동 정리 (30일 이상 된 로그 삭제) ──────────────────────
-- Supabase pg_cron 사용 시:
-- SELECT cron.schedule('cleanup-security-log', '0 3 * * *',
--   $$DELETE FROM security_log WHERE created_at < now() - INTERVAL '30 days'$$);

