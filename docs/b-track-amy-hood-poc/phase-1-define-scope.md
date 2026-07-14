# Phase 1: PoC 범위 확정

## 목표

무엇을 만들고 무엇을 만들지 않을지 먼저 정한다. 이 단계에서는 코드를 작성하지 않는다.

## 왜 먼저 해야 하는가

Amy Hood에 대한 공개자료는 매우 많다. 범위를 정하지 않으면 단순한 인물 소개, Microsoft의 전체 역사, CFO 의사결정 자료가 뒤섞인다. PoC의 목적은 Amy Hood의 모든 모습을 복제하는 것이 아니라 공개적으로 확인 가능한 CFO 판단 방식을 재현하는 것이다.

## To-Do List

- [ ] 제품 안에서 사용할 공식 명칭을 정한다.
  - 권장 명칭: `Amy Hood Public-Evidence CFO Persona`
  - 피해야 할 명칭: `Real Amy Hood`, `Official Amy Hood AI`
- [ ] 사용 목적을 한 문장으로 작성한다.
  - 예: “Amy Hood의 공개 발언에서 관찰되는 재무 판단 원칙을 바탕으로 CFO 의사결정을 검토하는 비공개 PoC 조언자”
- [ ] PoC가 답변할 재무 영역을 정한다.
  - 권장: 자본 배분, 성장과 수익성, 비용 규율, 전략적 투자·인수, 리스크와 불확실성
- [ ] PoC가 답변하지 않을 영역을 정한다.
  - 사생활, 가족, 미공개 회사정보, 정치적 견해, 법적 승인, 실제 Microsoft 내부 결정
- [ ] 1인칭 표현 규칙을 정한다.
  - 1인칭 답변은 허용하되 매 세션에서 공개자료 기반 시뮬레이션임을 고지한다.
- [ ] 페르소나의 권한을 정한다.
  - 조언만 제공하며 실제 결제, 승인, 투자 또는 외부 메시지 발송은 하지 않는다.
- [ ] 조사 기간을 정한다.
  - 권장: CFO 취임 이후 자료 중 최근 5~10년을 우선하고, 중요한 과거 사례를 추가한다.
- [ ] 위 결정을 하나의 범위 정의서로 작성하고 검토한다.

## 만들어야 할 산출물

`data/b-track/amy-hood/poc-scope.md`

권장 내용:

```markdown
# Amy Hood Persona PoC Scope

## Purpose
## Target Users
## Supported Decision Domains
## Excluded Topics
## Persona Disclaimer
## Allowed Actions
## Data Time Range
## PoC Success Criteria
```

## Codex 요청 예시

> `docs/b-track-amy-hood-poc/phase-1-define-scope.md`를 읽고, 권장안을 바탕으로 `data/b-track/amy-hood/poc-scope.md` 초안을 작성해줘. 코드는 수정하지 말고, 결정이 필요한 부분은 TODO로 표시해줘.

## 완료 기준

- 지원 영역과 제외 영역을 다른 사람이 읽어도 구분할 수 있다.
- “실제 Amy Hood가 답변한다”는 오해를 막는 문구가 있다.
- 이 PoC가 조언 도구이며 실제 의사결정권자가 아니라는 점이 명확하다.
- 조사자가 어떤 자료를 찾고 어떤 자료를 제외할지 판단할 수 있다.

