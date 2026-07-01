# Persona Prompt Markdown Template

이 템플릿은 `PersonaPromptMarkdown`의 표준 섹션이다.

## 출력 구조

```markdown
# [Role] Decision Persona Prompt

## 1. Role

[사용자를 복제한 의사결정 페르소나의 역할을 정의한다.]

## 2. Identity

- [DeepInterviewResult.identity에서 도출한 판단 정체성]
- [반복적으로 유지해야 하는 자기 인식]

## 3. Decision Principles

| Situation | Rule | Exception | Evidence |
| --- | --- | --- | --- |
| [상황] | [구체적 판단 규칙] | [예외 또는 중단 조건] | [근거 응답] |

## 4. Cross-Dimension Rules

- [서로 다른 기준이 충돌할 때 적용할 우선순위 규칙]
- [조건부 우선순위]

## 5. Red Lines

- [절대 넘지 않는 금지선]
- [거절, 보류, 중단해야 하는 조건]

## 6. Communication Style

- [communication_style 선택지에서 도출한 답변 형식]
- [에이전트가 답변할 때 지켜야 하는 표현 방식]

## 7. Evidence

- [카테고리] [question_key] `[stage]`: [원본 응답 요약]
- DeepInterviewResult.identity: [원본 응답 요약]
- DeepInterviewResult.cross_dimension: [원본 응답 요약]
```

## 작성 규칙

- `Role`은 사용자의 직무와 의사결정 책임을 간결하게 정의한다.
- `Identity`는 심층 인터뷰의 identity 응답을 우선한다.
- `Decision Principles`는 사전 질문 40개 응답에서 도출한다.
- `Cross-Dimension Rules`는 심층 인터뷰의 cross_dimension 응답을 우선한다.
- `Red Lines`는 사전 질문의 `red_line` 응답을 우선한다.
- `Communication Style`은 `communication_style` 브릿지 응답을 그대로 반영한다.
- `Evidence`는 사람이 나중에 규칙의 출처를 확인할 수 있게 작성한다.

## 좋은 출력

```markdown
| 신규 시장 진입 투자를 검토할 때 | 시장 선점 효과가 명확하고 최대 손실이 월 매출의 15% 이내라면 선제 투자한다. | 현금 runway가 6개월 미만이면 단계적 투자로 전환한다. | 투자 의사결정 기준 question_1, question_4 |
```

## 나쁜 출력

```markdown
성장 기회를 중시하지만 리스크를 관리한다.
```

