// ── AI 앙상블 검증 (특허 §3.5.2) ────────────────────
// BERT 768차원 · CNN · LSTM · 적대적 훈련 포함

const ENSEMBLE_MODELS = [
  { id:'bert', name:'BERT',       desc:'768차원 임베딩 · 3층 FC',   acc:99.1, cls:'bert' },
  { id:'cnn',  name:'CNN',        desc:'패턴 추출 · 합성곱 신경망', acc:97.8, cls:'cnn'  },
  { id:'lstm', name:'LSTM',       desc:'시계열 분석 · 거래 패턴',   acc:98.5, cls:'lstm' },
];

const DEFENSE_METHODS = [
  { name:'FGSM 적대적 훈련',  desc:'훈련 데이터의 15%를 적대적 예제로 교체', status:'ok'  },
  { name:'PGD 방어',         desc:'투영 경사하강법 기반 견고성 강화',         status:'ok'  },
  { name:'입력 검증 필터',   desc:'통계적 이상치 탐지 · 유니코드 차단',       status:'ok'  },
  { name:'앙상블 다수결',    desc:'3개 모델 독립 판단 → 최종 결정',           status:'ok'  },
  { name:'HSM 무결성 검증',  desc:'SHA-256 기반 입력 변조 탐지',              status:'ok'  },
];

const SERVICE_BRANCHES = [
  { name:'신용평가 분기',   desc:'768→256→64→1 신경망 · 상환확률 예측', threshold:'LSTM ≥ 0.85 & 신용 ≥ 0.70', status:'active' },
  { name:'보험 사기 탐지', desc:'의료비·사고·이력 종합 분석',           threshold:'사기확률 < 0.10 & 유효성 ≥ 0.90', status:'active' },
  { name:'투자 위험 분석', desc:'위험성향 0–1 스케일 산정',             threshold:'편차 ≥ 5% 시 리밸런싱',  status:'active' },
  { name:'부정거래 탐지',  desc:'의심도 점수 < 0.6 승인',               threshold:'0.6 이상 → 거부',           status:'active' },
];

function loadAI() {
  const el = document.getElementById('tab-ai');
  if (!el) return;

  // 정확도 지표 (1,000건 실증 기준)
  const metrics = [
    { label:'정확도',           val:'99.4%', sub:'994/1,000건' },
    { label:'정밀도',           val:'98.0%', sub:'오탐율 2%'   },
    { label:'재현율',           val:'99.0%', sub:'누락율 1%'   },
    { label:'F1-Score',         val:'98.5%', sub:'조화평균'     },
    { label:'정상거래 통과율',  val:'99.5%', sub:'795/799건'   },
    { label:'의심거래 차단율',  val:'99.0%', sub:'199/201건'   },
  ];

  el.innerHTML = `
    <!-- 앙상블 정확도 -->
    <div class="panel" style="margin-bottom:14px">
      <div class="panel-hd">
        <div class="panel-hd-icon blue">🤖</div>
        <div><div class="panel-title">앙상블 AI 검증 모델</div><div class="panel-sub">BERT · CNN · LSTM 독립 판단 후 다수결 최종 결정</div></div>
      </div>
      <div class="panel-body">
        <div style="margin-bottom:16px">
          ${ENSEMBLE_MODELS.map(m => `
          <div class="ensemble-row">
            <span class="ensemble-model">${m.name}</span>
            <div class="ensemble-acc">
              <div class="ensemble-acc-bar">
                <div class="ensemble-acc-fill ${m.cls}" style="width:${m.acc}%"></div>
              </div>
              <div style="font-size:10px;color:var(--hint)">${m.desc}</div>
            </div>
            <span class="ensemble-score">${m.acc}%</span>
          </div>`).join('')}
        </div>
        <!-- 성능 지표 그리드 -->
        <div class="section-hd">1,000건 실증 테스트 결과</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px">
          ${metrics.map(m => `
          <div style="background:var(--bg);border-radius:var(--r);padding:12px 14px">
            <div style="font-size:10px;font-weight:700;color:var(--hint);margin-bottom:4px">${m.label}</div>
            <div style="font-size:20px;font-weight:900;color:var(--txt)">${m.val}</div>
            <div style="font-size:10px;color:var(--hint)">${m.sub}</div>
          </div>`).join('')}
        </div>
      </div>
    </div>

    <div class="card-grid col2">
      <!-- 적대적 공격 방어 -->
      <div class="panel">
        <div class="panel-hd">
          <div class="panel-hd-icon org">🛡️</div>
          <div><div class="panel-title">적대적 공격 방어</div><div class="panel-sub">FGSM · PGD · 앙상블 투표</div></div>
        </div>
        <div class="panel-body">
          ${DEFENSE_METHODS.map(d => `
          <div style="display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px solid var(--bdr)">
            <span class="badge badge-ok" style="flex-shrink:0">✓ 활성</span>
            <div>
              <div style="font-size:13px;font-weight:700;color:var(--txt)">${d.name}</div>
              <div style="font-size:11px;color:var(--hint)">${d.desc}</div>
            </div>
          </div>`).join('')}
        </div>
      </div>

      <!-- 서비스별 AI 분기 -->
      <div class="panel">
        <div class="panel-hd">
          <div class="panel-hd-icon pur">🔀</div>
          <div><div class="panel-title">서비스별 AI 분기</div><div class="panel-sub">공통 BERT 임베딩 → 전용 신경망</div></div>
        </div>
        <div class="panel-body">
          ${SERVICE_BRANCHES.map(b => `
          <div style="padding:10px 0;border-bottom:1px solid var(--bdr)">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
              <span class="badge badge-ok">활성</span>
              <span style="font-size:13px;font-weight:700;color:var(--txt)">${b.name}</span>
            </div>
            <div style="font-size:11px;color:var(--hint);margin-bottom:2px">${b.desc}</div>
            <div style="font-size:10px;font-family:monospace;background:var(--bg);padding:3px 8px;border-radius:3px;color:var(--sub)">${b.threshold}</div>
          </div>`).join('')}
        </div>
      </div>
    </div>
  `;
}
