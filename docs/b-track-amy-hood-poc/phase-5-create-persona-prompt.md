# Phase 5: Decision Principles와 Persona Prompt 생성

## 목표

여러 Decision Case에서 반복되는 판단 패턴을 원칙으로 만들고, Amy Hood CFO Persona의 최종 Markdown 프롬프트를 생성한다.

## 원칙을 만드는 기준

한 번 등장한 발언을 곧바로 가치관으로 만들지 않는다. 다음 중 하나를 만족해야 한다.

- 서로 다른 상황에서 같은 기준이 반복된다.
- 본인이 명확하게 원칙 또는 우선순위로 표현했다.
- 공식 자료와 실제 사례가 서로 뒷받침한다.

## To-Do List

- [ ] Decision Case를 재무 영역별로 분류한다.
- [ ] 반복되는 판단 신호를 찾는다.
- [ ] “상황 → 조건 → 판단 → 예외” 형태로 원칙 후보를 작성한다.
- [ ] 각 원칙에 Evidence와 Case ID를 연결한다.
- [ ] 확신 수준을 지정한다.
- [ ] 반대 사례가 있으면 예외 조건으로 기록한다.
- [ ] 직접 확인된 원칙과 Codex가 추론한 원칙을 구분한다.
- [ ] 사람이 원칙의 표현이 과장되지 않았는지 검토한다.
- [ ] 승인된 원칙만 Persona Prompt에 반영한다.
- [ ] 현재 프로젝트의 Markdown Persona 구조로 렌더링한다.

## 확신 수준

- `high`: 직접 발언과 여러 사례가 함께 존재함
- `medium`: 여러 사례에서 반복되지만 직접 원칙으로 말하지 않음
- `low`: 단일 사례 또는 간접적인 추론임
- `unknown`: 공개 근거로 판단할 수 없음

`low` 원칙은 최종 프롬프트의 강한 지시로 사용하지 않는 것을 권장한다.

## 원칙 예시

```json
{
  "principle_id": "principle_001",
  "rule": "수요가 계약과 사용량으로 확인되고 용량 부족이 성장을 제한하면 단기 비용 부담을 감수하고 투자를 확대한다.",
  "conditions": ["observable_demand", "capacity_constraint"],
  "exceptions": ["demand_is_speculative"],
  "case_ids": ["case_001", "case_004"],
  "evidence_ids": ["evidence_001", "evidence_014", "evidence_031"],
  "confidence": "high",
  "derivation": "cross_case_inference",
  "review_status": "approved"
}
```

## Persona Prompt 권장 구조

```markdown
# Amy Hood Public-Evidence CFO Persona

## 1. Persona Status and Disclaimer
## 2. Role
## 3. Scope of Representation
## 4. Identity
## 5. Decision Principles
## 6. Cross-Dimension Rules
## 7. Red Lines
## 8. Communication Style
## 9. Evidence and Confidence Policy
## 10. Unknown and Abstention Policy
## 11. Response Format
## 12. Evidence Index
```

## 만들어야 할 산출물

- `data/b-track/amy-hood/decision-principles.json`
- `data/b-track/amy-hood/AMY_HOOD_PERSONA.md`

## Codex 요청 예시

> 승인된 Decision Case만 사용해서 반복되는 판단 원칙을 도출해줘. 각 원칙을 상황, 조건, 판단, 예외 구조로 작성하고 근거 ID와 확신 수준을 포함해줘. 승인되지 않은 추론은 최종 Persona Prompt에 넣지 마.

## 완료 기준

- 핵심 Decision Principle이 8~12개 있다.
- 모든 핵심 원칙에 Case와 Evidence가 연결되어 있다.
- 확신 수준과 추론 방식이 표시되어 있다.
- 근거 없는 성격이나 사적 가치관이 없다.
- 자료가 없는 경우 추정하지 않는 규칙이 포함되어 있다.
- 최종 결과가 현재 프로젝트에서 사용할 수 있는 Markdown 문서다.

