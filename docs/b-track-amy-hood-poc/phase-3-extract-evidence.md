# Phase 3: Evidence 추출

## 목표

선정한 원문에서 Amy Hood가 실제로 말한 내용과 그 발언이 나온 상황을 작은 근거 단위로 저장한다.

## Evidence란 무엇인가

Evidence는 페르소나의 판단 원칙을 뒷받침하는 원문 근거다. 문서 전체 요약이 아니라 하나의 판단이나 이유를 보여주는 짧고 독립적인 기록이다.

## 가장 중요한 규칙

- 원문과 Codex의 해석을 분리한다.
- 발언 전후의 질문과 상황을 함께 기록한다.
- Satya Nadella 등 다른 사람의 말을 Amy Hood의 발언으로 저장하지 않는다.
- 회사가 한 행동을 Amy Hood 개인이 결정했다고 단정하지 않는다.
- 직접 확인할 수 없는 내용은 추측해 채우지 않는다.

## To-Do List

- [ ] Source Inventory에서 `selected` 자료 하나를 선택한다.
- [ ] 전체 원문 또는 transcript를 확보한다.
- [ ] Amy Hood의 발언 부분을 찾는다.
- [ ] 재무 판단, 조건, 위험, 우선순위가 들어 있는 부분만 선택한다.
- [ ] 발언을 바꾸지 않고 원문 그대로 저장한다.
- [ ] 발언이 나온 질문과 상황을 요약한다.
- [ ] Codex가 해석한 판단 신호를 별도 필드에 저장한다.
- [ ] 정확한 문서 위치 또는 section 정보를 저장한다.
- [ ] 한 자료가 끝나면 사람이 원문과 추출 결과를 비교한다.
- [ ] 모든 선택 자료에 대해 반복한다.

## Evidence 예시

```json
{
  "evidence_id": "evidence_001",
  "source_id": "source_001",
  "speaker": "Amy Hood",
  "event_date": "2025-01-01",
  "decision_domain": "capital_allocation",
  "context": "AI 인프라 투자 위험에 대한 질문",
  "original_text": "원문 발언",
  "interpretation": "수요 가시성을 투자 판단 기준으로 사용함",
  "evidence_type": "direct_statement",
  "source_locator": "Q&A section, question 3",
  "review_status": "pending"
}
```

## 만들어야 할 산출물

`data/b-track/amy-hood/evidence.jsonl`

JSONL은 한 줄에 JSON 객체 하나를 저장하는 형식이다. 자료가 하나 잘못되어도 전체 파일을 다루기 쉽고, 근거를 한 줄씩 추가할 수 있다.

## Codex 요청 예시

> `source_001` 원문에서 Amy Hood의 재무 판단 근거만 추출해 `evidence.jsonl`에 추가해줘. 원문과 해석을 분리하고, 다른 화자의 발언은 제외해줘. 새 항목은 모두 `review_status: pending`으로 표시해줘.

## 검토 상태

- `pending`: Codex가 추출했지만 사람이 아직 확인하지 않음
- `approved`: 사람이 원문과 비교해 승인함
- `rejected`: 잘못된 귀속, 문맥 부족, 판단 근거 부족 등으로 제외함

## 완료 기준

- 선택한 모든 자료가 검토되었다.
- 승인된 Evidence가 최소 50개 있다.
- 모든 Evidence에 원문 URL과 위치가 연결된다.
- 원문과 해석이 서로 다른 필드에 있다.
- Amy Hood가 아닌 사람의 발언이 섞이지 않았다.
- 사람이 승인하지 않은 Evidence는 다음 Phase의 핵심 근거로 사용하지 않는다.

