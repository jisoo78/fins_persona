# Phase 4: Decision Case 만들기

## 목표

개별 Evidence를 실제 재무 의사결정 상황 단위로 묶는다. 이 단계에서 “어떤 상황에서 무엇을 중요하게 판단했는가”를 정리한다.

## Decision Case란 무엇인가

여러 발언과 자료를 하나의 의사결정 사건으로 정리한 기록이다. 예를 들어 AI 인프라 투자는 여러 분기의 발언, 투자자 질문, 실제 결과를 함께 봐야 하나의 판단 사례가 된다.

## To-Do List

- [ ] 같은 사건이나 주제를 다루는 Evidence를 모은다.
- [ ] 당시의 재무 문제를 한 문장으로 작성한다.
- [ ] 확인 가능한 선택지를 정리한다.
- [ ] 실제로 관찰된 선택 또는 입장을 기록한다.
- [ ] 판단에 사용된 신호와 지표를 기록한다.
- [ ] 감수한 위험과 포기한 대안을 기록한다.
- [ ] 결과가 확인되면 기록하고, 아직 모르면 `unknown`으로 둔다.
- [ ] Amy Hood의 관여 수준을 표시한다.
- [ ] 반대되는 발언이나 예외가 있는지 찾는다.
- [ ] 각 Case에 승인된 Evidence ID를 연결한다.

## 관여 수준

- `personally_stated`: 본인이 자신의 판단으로 직접 설명함
- `co_decision`: 공동 의사결정 참여가 공식적으로 확인됨
- `financially_explained`: 회사 결정을 CFO 관점에서 설명함
- `organizationally_attributed`: 공식 자료가 역할을 귀속함
- `unknown`: 개인 관여 정도를 확인할 수 없음

## Decision Case 예시

```json
{
  "case_id": "case_001",
  "title": "AI 인프라 투자 확대",
  "decision_domain": "capital_allocation",
  "situation": "AI 수요 증가와 단기 마진 부담이 동시에 존재함",
  "options": [
    "투자를 늦춘다",
    "수요에 맞춰 투자를 확대한다",
    "외부 용량 의존도를 높인다"
  ],
  "observed_position": "수요 가시성을 근거로 투자 확대를 지지함",
  "decision_signals": ["customer_demand", "contracted_demand", "capacity_constraint"],
  "tradeoffs": ["near_term_margin", "long_term_growth"],
  "involvement": "financially_explained",
  "counter_evidence": [],
  "evidence_ids": ["evidence_001", "evidence_014"],
  "review_status": "pending"
}
```

## 만들어야 할 산출물

`data/b-track/amy-hood/decision-cases.json`

## Codex 요청 예시

> 승인된 Evidence만 사용해서 같은 사건을 묶고 Decision Case 후보를 작성해줘. Microsoft의 결정을 Amy Hood 개인 결정으로 단정하지 말고 관여 수준을 표시해줘. 근거가 부족한 필드는 `unknown`으로 남겨줘.

## 완료 기준

- 검토된 Decision Case가 최소 10개 있다.
- 각 Case에 승인된 Evidence가 2개 이상 연결되는 것을 권장한다.
- 상황, 선택, 판단 신호, trade-off가 구분되어 있다.
- 개인 결정과 회사 결정이 구분되어 있다.
- 반례나 판단 변화가 숨겨지지 않고 기록되어 있다.

