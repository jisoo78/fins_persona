# 사전 인터뷰 5단계 구조 개편 기획서

## 1. 목적

이 프로젝트의 목표는 단순한 인터뷰 엔진이 아니라, 사용자와의 인터뷰를 통해 사용자의 의사결정 기준을 도출하고 이를 복제 가능한 도플갱어 페르소나로 구조화하는 것이다.

최종 산출물은 구조화 JSON만이 아니라 Decision.md와 유사한 Markdown 페르소나 프롬프트여야 한다. 사전 질문 출력, `communication_style`, 심층 인터뷰 출력을 합쳐 에이전트에 그대로 주입 가능한 프롬프트 문서로 완성해야 “도플갱어 페르소나”라고 부를 수 있다.

이 문서를 최상위 기획서로 사용한다. 세부 계약과 구현 명세는 다음 문서에서 관리한다.

| 문서 | 역할 |
| --- | --- |
| [`preinterview-io-schema.md`](./preinterview-io-schema.md) | 사전 질문, 응답, 브릿지 질문, `PreInterviewContext` v2, 심층 인터뷰 입출력 스키마 관리 |
| [`greenfield-decision-persona-functional-spec.md`](./greenfield-decision-persona-functional-spec.md) | 완전히 새롭게 구현할 코드베이스의 기능 명세, 화면 흐름, 모듈 경계, 수용 기준 관리 |

따라서 사전 질문은 단순 선호 수집이 아니라 다음 정보를 안정적으로 추출해야 한다.

- 사용자가 어느 조건에서 결정을 실행하는지
- 상황이 바뀌어도 같은 결정을 유지하는지
- 선택 뒤에 있는 신념과 정체성이 무엇인지
- 빠르게 고른 답과 오래 고민한 답이 무엇인지
- 서로 다른 의사결정 기준이 충돌할 때 어떤 기준을 우선하는지

이를 위해 사전 질문과 `PreInterviewContext`를 5단계 질문 구조와 응답 시간 기반 신호를 포함하도록 개편한다.

## 2. 핵심 구조

사전 질문은 각 의사결정 카테고리 안에서 다음 5단계를 반드시 포함한다. 기존 40개 사전 질문은 카테고리마다 5문항을 갖고 있었고, 각 문항은 암묵적으로 역할, 가치, 금지선, 우선순위, 답변형식의 의미를 갖고 있었다. 새 구조는 이 장점을 유지하면서 의사결정 기준 도출에 더 직접적으로 연결되도록 stage 이름과 목적을 정리한다.

| stage | 목적 | 확인하는 신호 |
| --- | --- | --- |
| `preference` | 기본 선호 확인 | 사용자가 기본적으로 어떤 선택 방향을 선호하는지 |
| `context_shift` | 상황 변화 시 선호 유지 여부 확인 | 특정 조건에서 기준이 바뀌는지 |
| `core_value` | 절대 양보하지 않는 가치 확인 | 선택의 근거가 되는 가치 기준 |
| `red_line` | 절대 넘지 않는 금지선 확인 | 중단, 거절, 보류가 필요한 조건 |
| `priority_order` | 의사결정 우선순위 확인 | 여러 기준이 충돌할 때 먼저 보는 것 |

이 구조를 사용하면 단순히 “A를 선호한다”가 아니라 “A를 선호하지만 B 조건에서는 C로 전환한다”는 식의 실행 가능한 의사결정 규칙을 만들 수 있다.

보고·소통에서 선호하는 형식과 톤은 사전 질문 40항의 stage로 넣지 않는다. 대신 40개 사전 질문을 마친 뒤 `communication_style` 브릿지 질문 1개로 별도 수집한다.

심층 인터뷰의 주된 축은 `identity`와 `cross_dimension`이다. 사전 질문 40항이 사용자의 선호, 조건 변화, 가치, 금지선, 우선순위를 넓게 수집한다면, 심층 인터뷰는 그 응답들을 바탕으로 “나는 어떤 의사결정자인가”와 “서로 다른 기준이 충돌할 때 무엇을 선택하는가”를 깊게 파고든다.

## 3. `PreInterviewContext` v2 출력 구조

심층 인터뷰 프롬프트의 입력 값은 `PreInterviewContext`로 유지한다. 다만 각 질문 응답에 `stage`와 `response_time_ms`를 추가한다.

```json
{
  "투자 의사결정 기준": {
    "question_1": {
      "stage": "preference",
      "question": "질문 내용",
      "answer": "사용자 응답",
      "response_time_ms": 2400,
      "rationale": "사용자 직접 입력"
    },
    "question_2": {
      "stage": "context_shift",
      "question": "질문 내용",
      "answer": "사용자 응답",
      "response_time_ms": 11800,
      "rationale": "사용자 직접 입력"
    },
    "question_3": {
      "stage": "core_value",
      "question": "질문 내용",
      "answer": "사용자 응답",
      "response_time_ms": 5200,
      "rationale": "사용자 직접 입력"
    },
    "question_4": {
      "stage": "red_line",
      "question": "질문 내용",
      "answer": "사용자 응답",
      "response_time_ms": 7600,
      "rationale": "사용자 직접 입력"
    },
    "question_5": {
      "stage": "priority_order",
      "question": "질문 내용",
      "answer": "사용자 응답",
      "response_time_ms": 4100,
      "rationale": "사용자 직접 입력"
    }
  }
}
```

권장 확장 필드는 다음과 같다.

```json
{
  "stage": "preference",
  "source_question_id": 16,
  "question": "질문 내용",
  "selected_option_id": 5,
  "answer": "사용자 응답",
  "rationale": "직접 입력한 판단 근거",
  "response_time_ms": 2400,
  "response_signal": "strong_preference"
}
```

`source_question_id`와 `selected_option_id`는 추적성과 검증을 위해 저장하는 것이 좋다. `answer`만 저장하면 나중에 어떤 원본 질문과 선택지에서 나온 응답인지 역추적하기 어렵다.

`rationale`은 항상 포함한다. 사용자가 A-D 선택지를 고른 경우에는 선택 근거를 짧게 입력받고, `option_5`를 고른 경우에는 사용자가 직접 작성한 답변 자체를 `answer`와 `rationale`에 함께 반영한다.

## 4. 응답 시간 해석 규칙

응답 시간은 사용자의 진짜 의사결정 기준을 추론하는 보조 신호로 사용한다. 단독 결론으로 사용하지 않는다.

| 응답 시간 | signal | 해석 |
| --- | --- | --- |
| `< 3000ms` | `strong_preference` | 즉각적인 선호 또는 익숙한 기준일 가능성이 높음 |
| `3000ms ~ 10000ms` | `considered_preference` | 고민은 있었지만 비교적 안정적인 선호 |
| `> 10000ms` | `slow_response` | 오래 고민한 응답으로만 기록함 |

예를 들어 `preference` 질문은 빠르게 답했지만 `context_shift` 질문에서 10초 이상 걸렸다면, 기본 선호와 조건 변화 응답을 함께 검토한다. 다만 이 값을 근거로 별도의 우회 질문을 만들지는 않는다. 심층 인터뷰는 항상 `identity`와 `cross_dimension` 중심으로 진행한다.

## 5. 사전 질문 40항 개편 방향

현재 `pre_question.json`은 8개 카테고리 × 5문항 = 40문항 구조다. 이 구조는 유지하되, 각 문항에 명시적인 `stage`를 추가한다.

기본 배치는 다음과 같이 제안한다.

| 카테고리 내 문항 | stage | 역할 |
| --- | --- | --- |
| question_1 | `preference` | 기본 선호 확인 |
| question_2 | `context_shift` | 상황 변화 시 기준 전환 여부 확인 |
| question_3 | `core_value` | 절대 양보하지 않는 가치 기준 확인 |
| question_4 | `red_line` | 절대 넘지 않는 금지선 확인 |
| question_5 | `priority_order` | 의사결정 시 무엇을 먼저 보는지 확인 |

이 5단계가 카테고리별 기본 세트다. 기존 문항의 암묵적 역할 중 “답변형식”은 카테고리마다 별도 문항으로 유지하지 않고, 선택지 톤과 `rationale` 입력, 심층 인터뷰의 후속 질문에서 확인한다.

`identity`와 `cross_dimension`은 사전 질문 40항에 넣지 않는다. 이 둘은 심층 인터뷰의 주된 질문 축으로 다룬다.

대신 40개 사전 질문을 마친 뒤 심층 인터뷰 진입 전에 `communication_style` 브릿지 질문을 1개 받는다. 즉, 흐름은 `40 + 1` 구조가 된다. 여기서 `+1`은 보고 형식, 소통 방식, 답변 톤을 확인하는 질문이다.

예시:

```text
심층 인터뷰 결과를 정리할 때 어떤 형식을 가장 선호합니까? 예: 핵심 결론 먼저, 수치 기준 중심, 시나리오 비교, 리스크와 예외 조건 우선, 자유 형식.
```

`communication_style` 브릿지 질문의 선택지는 고정형으로 운영한다.

| option_id | option_text |
| --- | --- |
| 1 | 핵심 결론을 먼저 요약하고 세부 근거를 뒤에 제시한다. |
| 2 | 수치 기준, 임계값, 조건문 중심으로 정리한다. |
| 3 | 기준·낙관·비관 시나리오를 비교해 제시한다. |
| 4 | 리스크, 예외 조건, 중단 기준을 먼저 제시한다. |
| 5 | 실행 체크리스트와 다음 액션 중심으로 정리한다. |

이 방식은 사전 질문을 너무 무겁게 만들지 않으면서도, 심층 인터뷰가 `identity`와 `cross_dimension`을 더 깊게 다룰 수 있게 한다. 동시에 최종 결과물은 사용자가 선호하는 보고 방식에 맞춰 출력할 수 있다.

## 6. `pre_question.json` 권장 스키마

현재 구조:

```json
{
  "pre_question_id": 16,
  "pre_question": "[투자 의사결정 기준] 질문 내용",
  "pre_options": []
}
```

개편 후 권장 구조:

```json
{
  "pre_question_id": 16,
  "category": "투자 의사결정 기준",
  "decision_dimension": "investment_decision",
  "stage": "preference",
  "pre_question": "질문 내용",
  "pre_options": [
    {
      "option_id": 1,
      "option_text": "선택지 내용"
    },
    {
      "option_id": 5,
      "option_text": "E. 기타 (직접입력)"
    }
  ]
}
```

`category`를 질문 텍스트에서 파싱하지 않고 명시 필드로 분리해야 한다. 그래야 심층 인터뷰 프롬프트와 Skill이 안정적으로 같은 데이터 계약을 사용할 수 있다.

모든 문항은 `option_id: 5`를 항상 포함한다. 사용자에게 표시되는 문구는 `E. 기타 (직접입력)`으로 고정한다.

```json
{
  "option_id": 5,
  "option_text": "E. 기타 (직접입력)"
}
```

`option_5`를 선택하면 직접 입력 필드를 열고, 입력값을 `answer`와 `rationale`에 반영한다.

## 7. 질문 작성 원칙

각 stage는 질문의 문법이 달라야 한다.

좋은 질문은 사용자의 답을 실행 가능한 의사결정 기준으로 바꿀 수 있어야 한다. 나쁜 질문은 사용자가 좋은 말로 답할 수는 있지만, 이후 페르소나가 실제 상황에서 어떤 선택을 해야 할지 예측하기 어렵다.

| stage | 좋은 질문 형식 | 나쁜 질문 형식 | 차이 |
| --- | --- | --- | --- |
| `preference` | 신규 투자안의 예상 회수 기간이 12개월을 넘고 성공 확률이 40% 이하일 때도 실행을 검토한다면, 어떤 조건이 반드시 충족되어야 합니까? | 공격적인 투자를 선호합니까? | 좋은 질문은 기간, 확률, 실행 조건을 묻고, 나쁜 질문은 성향 형용사만 확인한다. |
| `context_shift` | 평소에는 성장 투자를 선호하더라도 현금 runway가 6개월 미만으로 줄어드는 상황이라면, 투자 판단을 어떻게 바꾸겠습니까? | 상황이 바뀌면 유연하게 판단합니까? | 좋은 질문은 기준이 흔들리는 조건을 제시하고, 나쁜 질문은 누구나 동의할 수 있는 일반론을 묻는다. |
| `core_value` | 매출 성장률 30%를 기대할 수 있지만 재무 투명성이나 내부 통제가 약해지는 선택이라면, 어느 지점에서 거절하겠습니까? | 재무적으로 올바른 결정을 중요하게 생각합니까? | 좋은 질문은 가치 충돌을 만들고, 나쁜 질문은 바람직한 자기평가만 유도한다. |
| `red_line` | 단일 투자 실패 시 월 매출의 몇 퍼센트 이상 손실이 예상되면, 전략적으로 매력적이어도 중단해야 합니까? | 너무 위험한 투자는 피해야 한다고 생각합니까? | 좋은 질문은 금지선을 수치화하고, 나쁜 질문은 위험 회피라는 추상어에 머문다. |
| `priority_order` | 수익률은 높지만 현금흐름이 악화되고, 리스크는 낮지만 성장성이 제한된 두 선택지가 있다면 무엇을 먼저 비교하겠습니까? | 의사결정할 때 여러 요소를 종합적으로 고려합니까? | 좋은 질문은 실제 trade-off의 비교 순서를 묻고, 나쁜 질문은 판단 순서를 드러내지 못한다. |

질문 작성자는 다음 원칙을 따른다.

- 수치, 기간, 비율, 손실 한도, 회수 조건을 가능한 한 질문 안에 포함한다.
- “좋다, 중요하다, 유연하다, 합리적이다” 같은 형용사만 묻지 않는다.
- 사용자의 anti-pattern을 발견할 수 있도록 실수, 과신, 지연, 과도한 수락 같은 상황을 포함한다.
- 응답 시간이 오래 걸린 문항은 `slow_response`로 기록하되, 별도의 회피성 선택지나 추가 분기로 만들지 않는다.
- CFO, CEO, CMO, CTO 등 역할별 Skill은 같은 stage를 사용하되, 수치 기준과 도메인 조건만 다르게 적용한다.

## 8. 의사결정 기준 도출 방식

사전 질문 응답은 다음 규칙으로 심층 인터뷰에 전달한다.

| 관찰 | 해석 | 후속 질문 방향 |
| --- | --- | --- |
| `preference` 응답이 빠름 | 강한 기본 선호 | 수치 기준으로 고정 |
| `preference`와 `context_shift`가 일치 | 안정적인 원칙 | 예외 조건 확인 |
| `context_shift`에서 답이 바뀜 | 조건부 의사결정 기준 | 전환 조건을 수치화 |
| `core_value`와 실제 선택이 충돌 | 말과 선택의 불일치 | 가치와 실행 기준의 경계 확인 |
| `red_line`이 모호함 | 금지선 미정의 | 손실 한도, 기간, 조건을 수치화 |
| `priority_order`가 느림 | 우선순위 갈등 | `cross_dimension` 심층 질문 생성 |
| 응답 시간이 10초 초과 | 오래 고민한 응답 | 질문 생성의 보조 맥락으로만 사용 |

최종적으로 도출해야 하는 기준은 다음 형태가 좋다.

```text
시장 선점 효과가 명확하고 최대 손실이 월 매출의 15% 이내라면 파일럿 없이도 선제 투자한다.
단, 현금 runway가 6개월 미만으로 줄어드는 경우에는 단계적 투자로 전환한다.
```

이런 문장은 사용자의 도플갱어 페르소나가 실제 의사결정 상황에서 사용할 수 있다.


## 9. 구현 단계

1. `PreInterviewContext` v2 데이터 계약 확정
2. `pre_question.json` 40문항을 5단계 stage 기반으로 재작성
3. 사전 질문 UI에서 응답 시간 측정 추가. 측정 방식은 구현자가 클라이언트 기준 또는 서버 저장 시각 기준 중 자유롭게 선택한다.
4. 모든 문항에 `E. 기타 (직접입력)` 선택지와 `rationale` 입력 흐름 추가
5. 응답 결과 생성 시 `stage`, `response_time_ms`, `response_signal`, `rationale` 포함
6. 40개 사전 질문 이후 보고 형식을 확인하는 고정 선택지 기반 `communication_style` 브릿지 질문 추가
7. `deep-interview-prompt.md`가 stage와 응답 시간 신호를 사용하도록 개편
8. CFO Decision Skill이 5단계 사전 응답을 근거로 `identity`, `cross_dimension` 심층 질문을 생성하도록 수정
9. Persona Prompt Renderer Skill이 `PreInterviewContext v2`와 `DeepInterviewResult`를 받아 Markdown 페르소나 프롬프트를 생성하도록 추가
10. JSON 검증 스크립트 또는 타입 검증 추가

## 10. 수용 기준

- 모든 사전 질문에 `category`, `decision_dimension`, `stage`가 존재한다.
- 각 카테고리는 `preference`, `context_shift`, `core_value`, `red_line`, `priority_order` 질문을 각각 1개씩 가진다.
- 모든 사전 질문은 `option_id: 5`, `option_text: "E. 기타 (직접입력)"`을 가진다.
- 모든 응답은 `rationale` 필드를 가진다.
- 사용자가 답변한 모든 문항에 `response_time_ms`가 기록된다.
- `response_time_ms > 10000`인 응답은 `slow_response`로 표시한다.
- `PreInterviewContext`는 카테고리별 `question_1`부터 `question_5`까지의 구조를 유지한다.
- `PreInterviewContext` v2는 CFO, CEO, CMO, CTO가 모두 재사용하는 범용 계약이다.
- 40개 사전 질문 이후 심층 인터뷰 진입 전 고정 선택지 기반 `communication_style` 브릿지 질문을 1개 제공한다.
- 심층 인터뷰는 `identity`와 `cross_dimension` 질문만 진행한다.
- 심층 인터뷰 프롬프트는 질문 생성 시 `stage`, `answer`, `rationale`, `response_time_ms`를 모두 근거로 사용한다.
- 최종 페르소나 생성 결과에는 구체적인 수치 기준, 예외 조건, 정체성 기준, 교차 차원 우선순위가 포함된다.
- 최종 산출물은 Decision.md와 유사한 Markdown 페르소나 프롬프트로 렌더링된다.

## 11. 확정 결정 사항

다음 항목은 확정한다.

- `response_time_ms` 측정 방식은 개발자가 구현상 적합한 방식을 자유롭게 선택한다.
- `communication_style` 브릿지 질문은 고정형 선택지로 운영한다.
- 심층 인터뷰는 `identity`와 `cross_dimension` 질문만 진행한다.
- “둘 다 고민됨” 옵션은 제공하지 않는다. 이 옵션은 의사결정 기준을 도출하는 데 도움이 되지 않는다.

## 12. 권장 결론

1차 개편은 40문항을 유지하면서 카테고리별 5단계 stage, `rationale`, 응답 시간을 추가하는 방식이 가장 현실적이다.

이 방식은 기존 데이터 흐름을 크게 깨지 않으면서도, 질문의 목적을 명확히 만들고 심층 인터뷰가 사용자의 의사결정 기준을 더 정밀하게 도출할 수 있게 한다.

이후 역할별 Skill이 늘어나더라도 `PreInterviewContext` v2는 공통 계약으로 유지하고, CFO, CEO, CMO, CTO별 심층 질문 지식만 Skill로 분리하는 구조가 적합하다.
