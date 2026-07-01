# 사전 인터뷰 입력/출력/스키마 명세서

## 1. 목적

이 문서는 사전 인터뷰 5단계 구조에서 사용하는 모든 입력, 출력, JSON 계약을 관리한다.

최상위 기획서는 [`preinterview-5stage-plan.md`](./preinterview-5stage-plan.md)이며, 이 문서는 구현자가 실제 타입, 검증 로직, 저장 구조를 만들 때 참조하는 계약 문서다.

## 2. 전체 데이터 흐름

```text
PreQuestionBank
  -> PreInterviewSession
  -> PreInterviewAnswerSet
  -> CommunicationStyleBridge
  -> PreInterviewContext v2
  -> DeepInterviewInput
  -> DeepInterviewResult
  -> PersonaPromptMarkdown
```

## 3. Stage 정의

| stage | 설명 | 사전 질문 내 위치 |
| --- | --- | --- |
| `preference` | 기본 선호 확인 | 카테고리별 question_1 |
| `context_shift` | 상황 변화 시 기준 전환 여부 확인 | 카테고리별 question_2 |
| `core_value` | 절대 양보하지 않는 가치 기준 확인 | 카테고리별 question_3 |
| `red_line` | 절대 넘지 않는 금지선 확인 | 카테고리별 question_4 |
| `priority_order` | 의사결정 시 먼저 보는 기준 확인 | 카테고리별 question_5 |

심층 인터뷰의 질문 축은 `identity`, `cross_dimension`만 사용한다. 이 둘은 사전 질문 stage가 아니다.

## 4. PreQuestionBank 입력 스키마

`pre_question.json`은 8개 카테고리 × 5문항 = 40문항을 가진다.

### 필드 정의

| 필드 | 타입 | 의미 |
| --- | --- | --- |
| `pre_questions` | array | 사전 질문 전체 목록이다. 현재 40개 문항을 가진다. |
| `pre_question_id` | number | 질문의 고유 ID다. 전체 질문에서 중복되면 안 된다. |
| `category` | string | 사용자에게 보여줄 대분류 주제명이다. 예: `투자 의사결정 기준`. |
| `decision_dimension` | string | 코드, 저장소, 분석 로직에서 사용하는 영문 내부 식별자다. 같은 `category`에 속한 5개 질문은 같은 값을 가진다. |
| `stage` | string | 카테고리 안에서 해당 질문이 맡는 역할이다. `preference`, `context_shift`, `core_value`, `red_line`, `priority_order` 중 하나다. |
| `pre_question` | string | 사용자에게 표시할 질문 본문이다. 카테고리명은 별도 필드로 관리하므로 질문 앞에 `[카테고리]`를 붙이지 않는다. |
| `pre_options` | array | 사용자가 선택할 수 있는 보기 목록이다. 모든 질문은 1-5번 보기를 가진다. |
| `option_id` | number | 보기의 고유 번호다. 1-4는 고정 선택지, 5는 직접 입력 선택지다. |
| `option_text` | string | 사용자에게 표시할 보기 문구다. `option_id: 5`는 항상 `E. 기타 (직접입력)`이다. |

### `decision_dimension` 목록

| category | decision_dimension |
| --- | --- |
| `자본 배치 우선순위` | `capital_allocation_priority` |
| `이익 vs 현금흐름` | `profit_vs_cash_flow` |
| `부채와 자본구조` | `debt_and_capital_structure` |
| `투자 의사결정 기준` | `investment_decision_criteria` |
| `유동성과 현금 관리` | `liquidity_and_cash_management` |
| `비용·수익성 관리` | `cost_and_profitability_management` |
| `리스크 관리` | `risk_management` |
| `주주환원·거버넌스·보고` | `shareholder_return_governance_reporting` |

```json
{
  "pre_questions": [
    {
      "pre_question_id": 16,
      "category": "투자 의사결정 기준",
      "decision_dimension": "investment_decision_criteria",
      "stage": "preference",
      "pre_question": "불확실성이 높은 신규 투자안을 검토할 때, 실행 여부를 판단하는 가장 중요한 기준은 무엇입니까?",
      "pre_options": [
        {
          "option_id": 1,
          "option_text": "소규모 파일럿으로 시작하고 핵심 가설이 검증될 때마다 투자를 확대한다."
        },
        {
          "option_id": 2,
          "option_text": "전체 투자 한도와 최대 손실 범위를 먼저 정한 뒤 그 안에서 실행한다."
        },
        {
          "option_id": 3,
          "option_text": "사업 책임자에게 충분한 권한을 부여하되 단계별 성과 목표를 엄격히 관리한다."
        },
        {
          "option_id": 4,
          "option_text": "시장 선점이 중요하다면 초기부터 충분한 규모로 투자하고 빠르게 성과를 판단한다."
        },
        {
          "option_id": 5,
          "option_text": "E. 기타 (직접입력)"
        }
      ]
    }
  ]
}
```

검증 규칙:

- `pre_question_id`는 전체 문항에서 유일해야 한다.
- `category`는 빈 문자열이면 안 된다.
- `decision_dimension`은 영문 snake_case를 사용한다.
- `stage`는 `preference`, `context_shift`, `core_value`, `red_line`, `priority_order` 중 하나여야 한다.
- 각 카테고리는 5개 stage를 각각 1개씩 가져야 한다.
- 모든 문항은 `option_id: 5`, `option_text: "E. 기타 (직접입력)"`을 가져야 한다.

## 5. 사전 인터뷰 응답 스키마

사용자가 각 문항에 답하면 다음 형태로 저장한다.

```json
{
  "source_question_id": 16,
  "category": "투자 의사결정 기준",
  "decision_dimension": "investment_decision_criteria",
  "stage": "preference",
  "question": "질문 내용",
  "selected_option_id": 4,
  "answer": "시장 선점이 중요하다면 초기부터 충분한 규모로 투자하고 빠르게 성과를 판단한다.",
  "response_time_ms": 2400,
  "response_signal": "strong_preference"
}
```

`option_id: 5`를 선택하면 직접 입력값을 `answer`에 저장한다.

## 6. 응답 시간 신호

`response_time_ms` 측정 방식은 개발자가 자유롭게 선택한다. 클라이언트 기준 측정, 서버 저장 시각 기준 측정, 혼합 방식 모두 허용한다.

| 조건 | response_signal |
| --- | --- |
| `< 3000ms` | `strong_preference` |
| `3000ms <= value <= 10000ms` | `considered_preference` |
| `> 10000ms` | `slow_response` |

`slow_response`는 오래 고민한 응답이라는 메타데이터다. 별도 회피 옵션, 기준 충돌 전용 분기, 추가 질문 축을 만들지 않는다.

## 7. CommunicationStyleBridge 스키마

40개 사전 질문 이후 심층 인터뷰 진입 전에 CFO로서 선호하는 답변 형식과 보고·소통 톤을 1개 질문으로 수집한다.

```json
{
  "bridge_question_id": "communication_style",
  "question": "CFO로써 답변형식: 보고·소통에서 선호하는 형식과 톤",
  "options": [
    {
      "option_id": 1,
      "option_text": "핵심 결론을 먼저 요약하고 세부 근거를 뒤에 제시한다."
    },
    {
      "option_id": 2,
      "option_text": "수치 기준, 임계값, 조건문 중심으로 정리한다."
    },
    {
      "option_id": 3,
      "option_text": "기준·낙관·비관 시나리오를 비교해 제시한다."
    },
    {
      "option_id": 4,
      "option_text": "리스크, 예외 조건, 중단 기준을 먼저 제시한다."
    },
    {
      "option_id": 5,
      "option_text": "실행 체크리스트와 다음 액션 중심으로 정리한다."
    }
  ]
}
```

응답 저장 형태:

```json
{
  "bridge_question_id": "communication_style",
  "selected_option_id": 2,
  "answer": "수치 기준, 임계값, 조건문 중심으로 정리한다."
}
```

## 8. PreInterviewContext v2 출력 스키마

`PreInterviewContext`는 CFO, CEO, CMO, CTO가 모두 재사용하는 범용 계약이다.

```json
{
  "meta": {
    "schema_version": "pre_interview_context.v2",
    "target_role": "CFO",
    "completed_at": "2026-06-30T08:00:00.000Z"
  },
  "communication_style": {
    "selected_option_id": 2,
    "answer": "수치 기준, 임계값, 조건문 중심으로 정리한다."
  },
  "categories": {
    "투자 의사결정 기준": {
      "question_1": {
        "stage": "preference",
        "source_question_id": 16,
        "question": "질문 내용",
        "selected_option_id": 4,
        "answer": "사용자 응답",
        "response_time_ms": 2400,
        "response_signal": "strong_preference"
      },
      "question_2": {
        "stage": "context_shift",
        "source_question_id": 17,
        "question": "질문 내용",
        "selected_option_id": 2,
        "answer": "사용자 응답",
        "response_time_ms": 11800,
        "response_signal": "slow_response"
      },
      "question_3": {
        "stage": "core_value",
        "source_question_id": 18,
        "question": "질문 내용",
        "selected_option_id": 1,
        "answer": "사용자 응답",
        "response_time_ms": 5200,
        "response_signal": "considered_preference"
      },
      "question_4": {
        "stage": "red_line",
        "source_question_id": 19,
        "question": "질문 내용",
        "selected_option_id": 3,
        "answer": "사용자 응답",
        "response_time_ms": 7600,
        "response_signal": "considered_preference"
      },
      "question_5": {
        "stage": "priority_order",
        "source_question_id": 20,
        "question": "질문 내용",
        "selected_option_id": 5,
        "answer": "사용자 직접 입력",
        "response_time_ms": 4100,
        "response_signal": "considered_preference"
      }
    }
  }
}
```

## 9. DeepInterviewInput 스키마

심층 인터뷰는 `identity`, `cross_dimension` 질문만 생성한다.

```json
{
  "pre_interview_context": {},
  "target_role": "CFO",
  "skill_id": "cfo-decision",
  "question_axes": ["identity", "cross_dimension"],
  "communication_style": {
    "selected_option_id": 2,
    "answer": "수치 기준, 임계값, 조건문 중심으로 정리한다."
  }
}
```

`question_axes`는 `identity`, `cross_dimension`만 허용한다. 이 외의 질문 축은 생성하지 않는다.

## 10. DeepInterviewResult 스키마

```json
{
  "identity": [
    {
      "question": "당신은 재무 의사결정에서 어떤 CFO로 복제되기를 원합니까?",
      "answer": "성장 기회를 놓치지 않되, 손실 한도를 명확히 정하는 CFO",
      "derived_principle": "성장 지향성과 손실 제한을 동시에 요구한다."
    }
  ],
  "cross_dimension": [
    {
      "question": "성장성, 현금흐름, 리스크가 충돌할 때 무엇을 먼저 보겠습니까?",
      "answer": "현금 runway가 충분하면 성장성을 우선하고, 부족하면 현금흐름을 우선한다.",
      "derived_rule": "runway가 충분한 경우 성장성 우선, 부족한 경우 현금흐름 우선"
    }
  ]
}
```

## 11. PersonaPromptMarkdown 출력 스키마

최종 산출물은 Decision.md와 유사한 Markdown 문서여야 한다. 이 문서는 사람도 읽을 수 있고, 에이전트가 시스템 프롬프트 또는 지식 주입 프롬프트로 사용할 수 있어야 한다.

입력은 다음 두 가지를 병합한다.

- 사전 질문 40+1 출력: `PreInterviewContext v2`
- 심층 인터뷰 출력: `DeepInterviewResult`

출력 객체:

```json
{
  "persona_prompt_id": "persona_prompt_cfo_20260630_001",
  "source": {
    "pre_interview_context_id": "pre_ctx_001",
    "deep_interview_result_id": "deep_result_001"
  },
  "format": "markdown",
  "title": "CFO Decision Persona Prompt",
  "content": "# CFO Decision Persona Prompt\n\n...",
  "created_at": "2026-06-30T08:00:00.000Z"
}
```

Markdown 템플릿:

```markdown
# CFO Decision Persona Prompt

## 1. Role

You are a decision-making persona cloned from the user's CFO decision criteria.

## 2. Identity

- 성장 기회를 놓치지 않되 손실 한도를 명확히 정하는 재무 리더로 판단한다.
- 불확실성을 회피하지 않지만, 손실 한도와 중단 기준이 없는 실행은 거절한다.

## 3. Decision Principles

| Situation | Rule | Exception |
| --- | --- | --- |
| 신규 투자안을 검토할 때 | 시장 선점 효과가 명확하고 최대 손실이 월 매출의 15% 이내라면 선제 투자한다. | 현금 runway가 6개월 미만이면 단계적 투자로 전환한다. |

## 4. Cross-Dimension Rules

- 성장성, 현금흐름, 리스크가 충돌할 때 runway가 충분하면 성장성을 우선한다.
- runway가 부족하면 성장성보다 현금흐름을 우선한다.

## 5. Red Lines

- 손실 한도가 정의되지 않은 투자는 실행하지 않는다.
- 중단 조건이 합의되지 않은 프로젝트는 승인하지 않는다.

## 6. Communication Style

- 수치 기준, 임계값, 조건문 중심으로 답한다.
- 가능하면 `if/then` 규칙으로 판단을 설명한다.

## 7. Evidence

- 투자 의사결정 기준 question_1: preference 응답에서 도출
- 투자 의사결정 기준 question_4: red_line 응답에서 도출
- 심층 인터뷰 identity 응답에서 도출
- 심층 인터뷰 cross_dimension 응답에서 도출
```

렌더링 규칙:

- `Identity`는 `DeepInterviewResult.identity`를 기반으로 작성한다.
- `Decision Principles`는 `PreInterviewContext v2`의 stage별 응답을 분석해 작성한다.
- `Cross-Dimension Rules`는 `DeepInterviewResult.cross_dimension`을 기반으로 작성한다.
- `Communication Style`은 `communication_style` 선택지를 그대로 반영한다.
- `Evidence`는 원본 질문, stage, 심층 인터뷰 응답을 추적할 수 있어야 한다.

금지 사항:

- 단순 성향 요약만 출력하지 않는다.
- “공격적이다”, “보수적이다” 같은 형용사만으로 원칙을 만들지 않는다.
- 근거 응답 없이 의사결정 규칙을 생성하지 않는다.
- 최종 산출물을 JSON으로만 끝내지 않는다. 반드시 Markdown 프롬프트를 생성한다.

## 12. 금지 사항

- “둘 다 고민됨” 선택지는 제공하지 않는다.
- `slow_response`를 별도 질문 축으로 사용하지 않는다.
- 심층 인터뷰에서 `identity`, `cross_dimension` 외의 축을 임의로 추가하지 않는다.
- `PreInterviewResult`라는 계약명을 사용하지 않는다. 입력 계약명은 `PreInterviewContext`다.
