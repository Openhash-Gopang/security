# K-Security 백서
## 고팡 생태계 보안 인프라 설계 및 운영 원칙

> **버전**: 1.0
> **기준**: 고팡 생태계 v4.2
> **도메인**: security.gopang.net
> **저장소**: github.com/Openhash-Gopang/security
> **발행**: 2026-06-05 · AI City Inc. · 제주특별자치도

---

## 목차

1. [개요 및 설계 철학](#1-개요-및-설계-철학)
2. [감시 대상 — 고팡 생태계 22개 시스템](#2-감시-대상--고팡-생태계-22개-시스템)
3. [보안 에이전트 아키텍처](#3-보안-에이전트-아키텍처)
4. [AI 기반 이상 탐지 엔진](#4-ai-기반-이상-탐지-엔진)
5. [이상 징후 분류 체계](#5-이상-징후-분류-체계)
6. [심각도 판정 및 대응 체계](#6-심각도-판정-및-대응-체계)
7. [데이터 흐름 및 저장 구조](#7-데이터-흐름-및-저장-구조)
8. [공개 대시보드 원칙](#8-공개-대시보드-원칙)
9. [인증 통합 — 한 줄 추가 원칙](#9-인증-통합--한-줄-추가-원칙)
10. [OpenHash 네트워크 특별 감시](#10-openhash-네트워크-특별-감시)
11. [파일 구조 및 배포](#11-파일-구조-및-배포)
12. [보안 모델 계층 구조](#12-보안-모델-계층-구조)

---

## 1. 개요 및 설계 철학

### 1.1 K-Security의 목적

K-Security는 고팡(Gopang) 생태계를 구성하는 **22개 하위 시스템 각각의 해킹 여부, 시스템 오류, 이상 징후를 수시로 또는 백그라운드에서 상시 점검**하는 보안 인프라입니다.

K-Security는 일반 사용자를 위한 보안 서비스가 아닙니다. 고팡 생태계 자체의 무결성과 신뢰성을 유지하는 것이 유일한 목적입니다.

### 1.2 핵심 설계 원칙

**원칙 1 — 투명성이 신뢰의 근거다**
> 숨김으로써 보안을 달성하지 않는다.
> 모든 시스템의 보안 상태는 누구나 실시간으로 확인할 수 있다.

공개하는 것 | 숨기는 것
--- | ---
시스템별 응답 상태 | 취약점 상세 내용
이상 발생 이력 | 공격 벡터 정보
조치 완료 여부 | 미해결 취약점 경로
가동률 통계 | 인증키·토큰

**원칙 2 — 독자 인증 구현 금지**
K-Security는 자체 인증 시스템을 운영하지 않습니다. 모든 인증은 `gopang.net`이 전담합니다. K-Security는 결과만 수신합니다.

**원칙 3 — 한 줄 추가 원칙**
각 하위 시스템은 단 하나의 스크립트 태그만 추가하면 보안 감시에 참여합니다. 복잡한 설정이나 별도 인증 로직은 불필요합니다.

**원칙 4 — 증거 기반 판단**
K-Security AI는 추측하지 않습니다. 보고 데이터에 없는 내용은 판단하지 않으며, 불확실한 경우 명시적으로 표시합니다.

**원칙 5 — 과소 탐지보다 과다 탐지**
오탐(False Positive)이 미탐(False Negative)보다 낫습니다. 의심스러우면 S1 이상으로 올립니다.

---

## 2. 감시 대상 — 고팡 생태계 22개 시스템

### 2.1 서비스 시스템 (17개)

#### 핵심 인프라
| 시스템 | ID | 도메인 | 정상 행동 기준 |
|--------|-----|--------|---------------|
| 고팡 메인 | `gopang` | gopang.net | 응답 <500ms, 인증 성공률 >99%, PDV 기록 연속 |
| K-Security | `security` | security.gopang.net | 30초 보고 주기 유지 |
| gopang-proxy | `gopang-proxy` | tensor-city.workers.dev | `/auth` `/pdv/report` `/deepseek` 응답 <300ms |

#### 안전·사법
| 시스템 | ID | 도메인 | 정상 행동 기준 |
|--------|-----|--------|---------------|
| K-Police | `police` | police.gopang.net | 신고→PDV→출동번호 흐름 정상 |
| K-119 | `911` | 911.gopang.net | 응급 분류 1~4급, K-Police 연동 정상 |
| K-Law | `klaw` | klaw.gopang.net | 30초 쿨다운 모니터, 판결 정확도 9.99/10 |

#### 경제·금융
| 시스템 | ID | 도메인 | 정상 행동 기준 |
|--------|-----|--------|---------------|
| GDC | `gdc` | gdc.gopang.net | BIVM **Σδ=0** 항등식 유지, 이중지불 없음 |
| K-Tax | `tax` | tax.gopang.net | 거래 발생 즉시 세금 분리, 실시간 정산 |
| K-Stock | `stock` | stock.gopang.net | 89개 자산군 갱신, 이상 거래 없음 |
| K-Insurance | `insurance` | insurance.gopang.net | 유효성 점수 >0.9 유지 |
| K-Market | `market` | market.gopang.net | 주문-결제-PDV 흐름 정상 |

#### 교통·물류
| 시스템 | ID | 도메인 | 정상 행동 기준 |
|--------|-----|--------|---------------|
| K-Traffic | `traffic` | traffic.gopang.net | 이동 수단 조합 응답 <1s |
| K-Logistics | `logistics` | logistics.gopang.net | 주문-출고-배송 흐름, K-Traffic 연동 |

#### 의료·교육
| 시스템 | ID | 도메인 | 정상 행동 기준 |
|--------|-----|--------|---------------|
| K-Health | `health` | health.gopang.net | AI 주치의 응답 정상, K-119 연동 |
| K-School | `school` | school.gopang.net | 세션 평균 12분, PDV 학습 기록 |

#### 공공·거버넌스
| 시스템 | ID | 도메인 | 정상 행동 기준 |
|--------|-----|--------|---------------|
| K-Public | `public` | public.gopang.net | 228개 기관 서비스, 증명서 발급 |
| K-Democracy | `democracy` | democracy.gopang.net | DAWN 투표 무결성, 이중 투표 없음 |

### 2.2 OpenHash 네트워크 (5개 노드)

OpenHash는 고팡 생태계의 데이터 무결성 기반입니다. **OpenHash 이상은 전체 생태계 위협으로 간주**하며 최우선 감시 대상입니다.

| 노드 | ID | 계층 | 관할 | 정상 행동 기준 |
|------|-----|------|------|---------------|
| OpenHash L1 | `openhash-L1-ido1` | 읍면동 | 제주시 이도1동 | 블록 주기 ~10초, 해시체인 연속, 4,399TPS |
| OpenHash L2 | `openhash-L2-jeju-city` | 시군구 | 제주시 | L1 앵커링 수신, ILMV 검증 통과 |
| OpenHash L3 | `openhash-L3-jeju` | 광역 | 제주특별자치도 | L2 집계 정상 |
| OpenHash L4 | `openhash-L4-kr` | 국가 | 대한민국 | L3 집계, 국가 단위 무결성 |
| OpenHash L5 | `openhash-L5-global` | 글로벌 | 전 세계 | 전체 앵커링, 19개국 동기화 |

---

## 3. 보안 에이전트 아키텍처

### 3.1 security-agent.js

각 하위 시스템에 **단 하나의 파일**만 추가하면 보안 감시에 참여합니다.

```html
<!-- 각 하위 시스템 </body> 직전 -->
<script
  src="https://security.gopang.net/security-agent.js"
  data-svc="school"
  data-url="school.gopang.net">
</script>
```

`data-svc`와 `data-url`만 변경하면 모든 시스템에 동일하게 적용됩니다.

### 3.2 자가 진단 항목

에이전트는 30초마다 세 가지를 자가 진단하고 K-Security에 보고합니다.

```
1. 인증 상태   — gopang_sso_token 유효성 확인
2. PDV 흐름    — 로컬 대기열 20건 초과 시 이상
3. 응답시간    — 자기 자신 HEAD 요청으로 레이턴시 측정
```

### 3.3 보고서 구조 (6하원칙)

```json
{
  "who":  { "svc": "school", "url": "school.gopang.net",
            "agent": "security-agent/1.0", "auth_level": "L1" },
  "when": { "ts": "2026-06-05T09:00:00Z", "uptime_sec": 43200 },
  "where":{ "origin": "https://school.gopang.net", "page": "/" },
  "what": { "status": "ok", "latency_ms": 142,
            "auth_ok": true, "pdv_ok": true,
            "last_error": null, "err_streak": 0 },
  "how":  { "method": "self-report", "interval_sec": 30 },
  "why":  { "triggered": "interval", "prev_status": "ok" }
}
```

### 3.4 K-Security 지시 이행

K-Security는 보고 응답에 지시를 포함할 수 있으며, 에이전트는 즉시 이행합니다.

| 지시 | 동작 |
|------|------|
| `DIAGNOSE_NOW` | 즉시 추가 진단 보고 |
| `SET_INTERVAL` | 점검 간격 변경 (최소 5초) |
| `SHOW_ALERT` | 사용자에게 경고 배너 표시 |
| `HIDE_ALERT` | 경고 배너 해제 |
| `SUSPEND` | 서비스 일시 중단 (S3에서만) |
| `RESUME` | 서비스 재개 |
| `RELOAD` | 페이지 강제 새로고침 |

### 3.5 인증과의 융합 — 방안 2

기존 `subsystem-auth.js` 한 줄에 보안 에이전트가 자동 통합됩니다.

```
subsystem-auth.js (v1.1)
  → 인증 완료 (_user 확보)
  → window._onGopangAuth(user) 호출
  → _loadSecurityAgent()          ← v1.1 신규
      → security-agent.js 동적 삽입
      → data-svc, data-authLevel 자동 전달
```

비활성화가 필요한 경우:
```html
<script type="module"
  src="https://gopang.net/auth/subsystem-auth.js"
  data-security="false">
</script>
```

---

## 4. AI 기반 이상 탐지 엔진

### 4.1 2단계 LLM 파이프라인

K-Security는 수치 기반 탐지(임계값)와 의미 기반 탐지(LLM)를 결합합니다.

```
security-agent.js 보고 (30초)
        ↓
[1차] DeepSeek V3 — 빠른 스크리닝
  · 이상 징후 점수 산정 (0.0 ~ 1.0)
  · 알려진 패턴 매칭
  · escalate 여부 결정
        ↓ (anomaly_score ≥ 0.6)
[2차] Claude Opus — 심층 판정
  · 공격 유형 분류
  · 맥락 및 패턴 종합 분석
  · S1/S2/S3 최종 심각도 결정
  · 대응 방안 생성
        ↓
Supabase security_event 기록
        ↓
이해관계자 gopang 앱 긴급 메시지
```

### 4.2 역할 분담 근거

| 항목 | DeepSeek V3 | Claude Opus |
|------|-------------|-------------|
| 역할 | 1차 스크리닝 | 2차 심층 판정 |
| 처리량 | 전체 보고 (30초 간격) | 의심 건만 (이상 시) |
| 강점 | 빠른 응답, 저비용 | 높은 정확도, 맥락 이해 |
| 출력 | 점수 + escalate 여부 | 심각도 + 대응 방안 |

### 4.3 시스템 프롬프트

AI 엔진의 핵심은 `prompts/security.md`에 정의된 마스터 시스템 프롬프트입니다. 이 프롬프트는 다음을 포함합니다.

- 고팡 생태계 전체 지도 및 각 시스템의 정상 행동 기준
- 알려진 공격 패턴 22개의 시그니처
- 심각도 판정 수치 기준
- 증거 기반 판단 원칙
- JSON 출력 형식 명세

---

## 5. 이상 징후 분류 체계

### 5.1 인증 공격

| 패턴 | 정의 |
|------|------|
| `CRED_STUFFING` | PDV 기록 없이 인증 요청만 반복 (>10회/분) |
| `SESSION_HIJACK` | 동일 IPv6에서 비정상적 레벨 변동 (L0→L3 순간 상승) |
| `AUTH_BYPASS` | auth_ok=false 상태에서 서비스 접근 시도 |
| `SYBIL_ATTACK` | 신규 IPv6 대량 생성 + 즉시 L1 인증 시도 |

### 5.2 데이터 무결성 공격

| 패턴 | 정의 |
|------|------|
| `HASH_TAMPER` | OpenHash 해시값 불일치 (ILMV 검증 실패) |
| `PDV_INJECT` | PDV 기록에 비정상 필드 삽입 시도 |
| `REPLAY_ATTACK` | 동일 트랜잭션 ID 중복 제출 |
| `DOUBLE_SPEND` | GDC BIVM Σδ≠0 감지 |

### 5.3 서비스 공격

| 패턴 | 정의 |
|------|------|
| `DDOS_PROBE` | 응답시간 급증 후 정상화 반복 (3회 이상/10분) |
| `SLOWLORIS` | 연결 유지 + 응답 없음 패턴 |
| `RESOURCE_EXHAUST` | err_streak 급증 + latency 폭증 동시 발생 |

### 5.4 AI 시스템 공격

| 패턴 | 정의 |
|------|------|
| `PROMPT_INJECTION` | AI 응답에 시스템 프롬프트 유출 징후 |
| `JAILBREAK_ATTEMPT` | 역할 전환 유도, 제약 우회 시도 |
| `ADVERSARIAL_INPUT` | 비정상 유니코드, 이상 길이 입력 반복 |
| `MODEL_INVERSION` | 훈련 데이터 추출 시도 패턴 |

### 5.5 금융 공격

| 패턴 | 정의 |
|------|------|
| `CARD_TESTING` | GDC 소액(< 1 GDC) 반복 거래 (>5회/분) |
| `MICRO_TRANSACTION` | 수수료 우회 목적 분산 거래 |
| `TAX_EVASION_PROBE` | K-Tax 정산 직전 거래 취소 반복 |

### 5.6 정상으로 간주할 것 (무시 기준)

- 정기 배포로 인한 일시 중단 (err_streak < 5, 5분 이내 회복)
- 알려진 모니터링 크롤러 (User-Agent 기반)
- 야간(02:00~06:00 KST) 트래픽 자연 감소
- security-agent.js 최초 로드 시 pending 상태

---

## 6. 심각도 판정 및 대응 체계

### 6.1 S1 — 경고

- **이상 점수**: 0.4 ~ 0.6
- **상황**: 서비스 중단 없음, 데이터 무결성 유지
- **예시**: 응답 지연, PDV 대기열 증가, 단발성 인증 실패
- **액션**: 해당 시스템 운영자에게 gopang 앱 알림

### 6.2 S2 — 오류

- **이상 점수**: 0.6 ~ 0.85
- **상황**: 서비스 일부 영향, 또는 공격 패턴 명확
- **예시**: 연속 인증 실패, PROMPT_INJECTION 시도
- **액션**: 운영자 + 고팡 관리팀 긴급 알림, 점검 간격 5초로 단축

### 6.3 S3 — 위험

- **이상 점수**: 0.85 이상
- **상황**: 서비스 중단, 데이터 무결성 위협, OpenHash 이상
- **예시**: `DOUBLE_SPEND`, 해시체인 단절, `SYBIL_ATTACK` 확인
- **액션**: 전체 이해관계자 즉시 알림 + K-Police 자동 연동 + `SUSPEND` 지시

### 6.4 대응 흐름

```
이상 탐지
    │
    ├─ S1 ──→ gopang 앱 알림 (운영자)
    │
    ├─ S2 ──→ gopang 앱 긴급 알림 (운영자 + 관리팀)
    │         점검 간격 5초 단축 (SET_INTERVAL)
    │         즉시 진단 요청 (DIAGNOSE_NOW)
    │
    └─ S3 ──→ gopang 앱 긴급 알림 (전체 이해관계자)
              K-Police 자동 연동
              해당 시스템 SUSPEND 지시
              security_event 기록 (status: open)
```

---

## 7. 데이터 흐름 및 저장 구조

### 7.1 전체 데이터 흐름

```
[하위 시스템 22개]
  security-agent.js → 30초 보고
          ↓
  gopang-proxy /security/report
          ↓
  Supabase security_log 테이블 (원본 전체)
          ↓
  K-Security AI 분석 (DeepSeek → Claude Opus)
          ↓
  Supabase security_event 테이블 (이상 이벤트)
          ↓
  [이상 감지 시]
  gopang webapp → 이해관계자 긴급 메시지
  K-Police 연동 (S3)
```

### 7.2 Supabase 테이블 구조

**`security_log`** — 30초 보고 원본
```sql
id, svc, svc_url, status, latency_ms,
auth_ok, pdv_ok, err_streak, last_error,
uptime_sec, raw(JSONB), created_at
```

**`security_event`** — 이상 이벤트
```sql
id, svc, severity(S1|S2|S3), title, detail,
status(open|investigating|resolved),
notified_at, resolved_at, raw(JSONB), created_at
```

**`security_command`** — 지시 로그 (내부 전용)
```sql
id, svc, cmd_type, cmd_payload(JSONB),
event_id, issued_at
```

### 7.3 공개 뷰

| 뷰 | 내용 | 공개 여부 |
|----|------|----------|
| `security_status` | 시스템별 최신 상태 | ✅ 공개 |
| `security_uptime_1h` | 1시간 가동률 | ✅ 공개 |
| `security_open_events` | 미해결 이벤트 | ✅ 공개 |
| `security_command` | 지시 로그 | ❌ 내부 전용 |

---

## 8. 공개 대시보드 원칙

K-Security 대시보드(`desktop.html`)는 **인증 없이 누구나** 접근할 수 있습니다.

### 8.1 구성

- **사이드바**: 10개 페이지 아이콘 네비게이션 (hover 시 라벨 표시)
- **개요 페이지**: 22개 시스템 전체 상태 테이블
- **이벤트 페이지**: 미해결 S1~S3 이벤트 목록
- **업타임 페이지**: 1시간 가동률 바 그래프
- **카테고리별 페이지**: 시스템 그룹별 상세 현황
- **OpenHash 페이지**: L1~L5 노드 개별 상태

### 8.2 갱신 주기

Supabase anon 키로 30초마다 자동 조회합니다. 별도 서버 없이 정적 페이지로 운영됩니다.

---

## 9. 인증 통합 — 한 줄 추가 원칙

K-Security는 고팡의 기존 인증 원칙을 그대로 따릅니다.

### 9.1 기본 패턴

```html
<!-- 모든 하위 시스템 공통 -->
<script type="module"
  src="https://gopang.net/auth/subsystem-auth.js">
</script>
```

### 9.2 인증 레벨별 K-Security 권한

| 레벨 | 인증 방법 | K-Security 접근 범위 |
|------|----------|---------------------|
| L0 | 기기 자동 인식 | 공개 대시보드 조회 |
| L1 | 실명 인증 | 보안 상담, 이벤트 신고 |
| L2 | 생체 인증 | 이벤트 처리, 지시 발송 |
| L3 | 시드 복원 | 시스템 SUSPEND, 법적 증거 |

---

## 10. OpenHash 네트워크 특별 감시

OpenHash는 고팡 생태계 데이터 무결성의 최종 근거입니다. 다른 어떤 시스템보다 엄격하게 감시합니다.

### 10.1 감시 항목

```
블록 생성 주기    ~10초 유지 여부
해시체인 연속성   이전 블록 해시 일치 여부 (ILMV 검증)
TPS               4,399 TPS 기준 대비 이탈 여부
노드 간 동기화    L1→L2→L3→L4→L5 앵커링 흐름
```

### 10.2 자동 S3 판정 조건

다음 중 하나라도 감지되면 추가 분석 없이 즉시 S3로 판정합니다.

- ILMV 해시 검증 실패 1건
- 블록 생성 중단 30초 이상
- L1~L5 간 앵커링 불일치
- `hash_mismatch` 오류 보고

---

## 11. 파일 구조 및 배포

```
security/
│   .nojekyll
│   CNAME                     ← security.gopang.net
│   LICENSE
│   index.html                ← 라우터 (모바일→webapp / PC→desktop)
│   desktop.html              ← 공개 보안 대시보드 (인증 불필요)
│   webapp.html               ← 보안 AI 채팅 (gopang 호출 또는 직접 접속)
│   security-agent.js         ← 각 하위 시스템에 부착할 에이전트
│
├───auth/
│       subsystem-auth.js     ← v1.1 (gopang_v2 저장소에서 배포)
│
└───prompts/
        security.md           ← AI 마스터 시스템 프롬프트
        security_schema.sql   ← Supabase 테이블 스키마
        test-security.html    ← 프롬프트 테스트 페이지
```

### 11.1 배포 방법

**security 저장소**
```powershell
cd C:\Users\주피터\Downloads\security
git add .
git commit -m "feat: K-Security v1.0"
git push
```

**subsystem-auth.js (gopang_v2 저장소)**
```powershell
cd C:\Users\주피터\Downloads\gopang_v2
git add auth/subsystem-auth.js
git commit -m "feat: subsystem-auth v1.1 — K-Security 에이전트 자동 로드"
git push
```

**Supabase 스키마**
```
Supabase Dashboard → SQL Editor → security_schema.sql 실행
```

---

## 12. 보안 모델 계층 구조

| 계층 | 위협 | 대응 |
|------|------|------|
| 사용자 기기 | 기기 분실·탈취 | L3 4단어 시드 복원 |
| 통신 구간 | 중간자 공격 | TLS 1.3 + ECDSA 서명 |
| PDV 저장 | 무단 열람 | 사용자 공개키 암호화 |
| OpenHash | 데이터 위변조 | SHA-256 해시체인 + ILMV |
| AI 시스템 | 프롬프트 인젝션 | K-Law 백그라운드 모니터 |
| GDC 결제 | 이중 지불 | BIVM Σδ=0 + OpenHash 앵커링 |
| 신원 시스템 | Sybil 공격 | ECDSA 키 생성 비용 + 스테이킹 |
| 생태계 전체 | 복합 공격 | K-Security 상시 감시 |

---

*본 백서는 고팡 생태계 v4.2 기준입니다.*
*Supabase, OpenHash, gopang-proxy는 공유 인프라이므로 K-Security 단독으로 수정하지 않습니다.*

*© 2026 Gopang Ecosystem — K-Security Team · AI City Inc.*
