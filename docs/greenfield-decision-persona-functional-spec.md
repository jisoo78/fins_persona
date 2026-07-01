# 신규 코드베이스 기능 명세서

## 1. 목적

이 문서는 사전 인터뷰 5단계 구조를 완전히 새 코드베이스로 구현할 때 필요한 기능 명세를 정의한다.

최상위 기획서는 [`preinterview-5stage-plan.md`](./preinterview-5stage-plan.md)이고, 데이터 계약은 [`preinterview-io-schema.md`](./preinterview-io-schema.md)를 따른다.

제품의 목표는 사용자의 답변을 수집하는 것이 아니라, 사용자의 의사결정 기준을 도출하고 이를 복제 가능한 도플갱어 페르소나로 만드는 것이다.

## 2. 핵심 사용자 흐름

```text
역할 선택
  -> 사전 인터뷰 40문항
  -> communication_style 브릿지 질문
  -> PreInterviewContext v2 생성
  -> 역할별 Decision Skill 선택
  -> identity / cross_dimension 심층 인터뷰
  -> PersonaPromptMarkdown 생성
  -> 사용자가 검토하고 수정
  -> 도플갱어 페르소나 저장
```

## 3. 주요 화면

### 3.1 역할 선택 화면

사용자는 CFO, CEO, CMO, CTO 등 대상 역할을 선택한다.

필수 기능:

- 역할 목록 표시
- 선택한 역할에 따라 사용할 Decision Skill 결정
- 모든 역할은 동일한 `PreInterviewContext v2` 계약 사용

수용 기준:

- 역할을 선택하지 않으면 사전 인터뷰를 시작할 수 없다.
- 현재 지원하지 않는 역할은 비활성 상태로 표시한다.

### 3.2 사전 인터뷰 화면

사용자는 8개 카테고리 × 5문항 = 40문항에 답한다.

필수 기능:

- 카테고리별 진행률 표시
- 현재 문항의 stage 표시
- A-D 고정 선택지 표시
- `E. 기타 (직접입력)` 선택지 표시
- 모든 문항에서 `rationale` 입력 받기
- 응답 시간 측정
- 다음 문항 이동
- 이전 문항 수정

수용 기준:

- 모든 문항은 답변과 `rationale`이 있어야 완료 처리된다.
- `E. 기타 (직접입력)`을 선택하면 직접 입력 필드가 열린다.
- 응답 시간 측정 방식은 구현자가 자유롭게 선택하되, 최종 응답에는 `response_time_ms`가 있어야 한다.
- `response_time_ms > 10000`이면 `response_signal`은 `slow_response`가 된다.

### 3.3 Communication Style 브릿지 화면

40개 사전 질문 이후 사용자의 보고 형식을 묻는다.

고정 선택지:

| option_id | option_text |
| --- | --- |
| 1 | 핵심 결론을 먼저 요약하고 세부 근거를 뒤에 제시한다. |
| 2 | 수치 기준, 임계값, 조건문 중심으로 정리한다. |
| 3 | 기준·낙관·비관 시나리오를 비교해 제시한다. |
| 4 | 리스크, 예외 조건, 중단 기준을 먼저 제시한다. |
| 5 | 실행 체크리스트와 다음 액션 중심으로 정리한다. |

수용 기준:

- 사용자는 반드시 1개 선택지를 선택해야 한다.
- 자유 입력 선택지는 제공하지 않는다.
- 이 값은 최종 페르소나 출력 형식에 반영된다.

### 3.4 사전 인터뷰 요약 화면

심층 인터뷰 시작 전 `PreInterviewContext v2` 요약을 보여준다.

필수 기능:

- 카테고리별 응답 요약
- stage별 응답 요약
- 느린 응답 표시
- `rationale` 표시
- communication style 표시
- 수정하기 버튼
- 심층 인터뷰 시작 버튼

수용 기준:

- 이 화면에서 수정한 답변은 `PreInterviewContext v2`에 반영된다.
- 느린 응답은 참고 정보로만 표시한다.

### 3.5 심층 인터뷰 화면

심층 인터뷰는 `identity`, `cross_dimension` 질문만 진행한다.

필수 기능:

- 역할별 Decision Skill 로드
- `PreInterviewContext v2`를 입력으로 사용
- 질문 축은 `identity`, `cross_dimension`만 허용
- 사용자의 답변 저장
- 질문마다 도출 의도 표시

수용 기준:

- 기준 충돌 전용 질문 축은 생성하지 않는다.
- “둘 다 고민됨” 옵션은 제공하지 않는다.
- 질문은 사용자의 사전 답변, `rationale`, 응답 시간, 역할 Skill을 근거로 생성된다.
- 심층 인터뷰 결과는 `DeepInterviewResult`로 저장된다.

### 3.6 페르소나 프롬프트 생성 화면

`PreInterviewContext v2`와 `DeepInterviewResult`를 합쳐 Decision.md와 유사한 Markdown 프롬프트를 생성한다.

필수 기능:

- 최종 Markdown 프롬프트 미리보기
- Role, Identity, Decision Principles, Cross-Dimension Rules, Red Lines, Communication Style, Evidence 섹션 표시
- 사용자가 섹션별로 수정할 수 있음
- 수정된 Markdown을 저장할 수 있음
- 원본 `PreInterviewContext v2`, `DeepInterviewResult`, Markdown 프롬프트를 함께 보존

수용 기준:

- 최종 산출물은 JSON만으로 끝나면 안 된다.
- Markdown 프롬프트는 에이전트에 그대로 주입 가능한 형태여야 한다.
- 각 의사결정 원칙은 원본 응답 또는 심층 인터뷰 응답 근거를 가져야 한다.
- `communication_style` 선택 결과가 Markdown의 표현 방식에 반영되어야 한다.

### 3.7 페르소나 저장 및 관리 화면

생성된 도플갱어 페르소나를 저장하고 다시 열람한다.

필수 기능:

- 페르소나 목록
- 역할별 필터
- 생성일 표시
- 최근 수정일 표시
- 페르소나 상세 보기
- 페르소나 수정
- 페르소나 복제
- Markdown 프롬프트 복사 또는 내보내기

수용 기준:

- 저장된 페르소나는 원본 `PreInterviewContext v2`와 연결된다.
- 사용자가 페르소나를 수정해도 원본 인터뷰 기록은 보존된다.
- 저장된 페르소나는 구조화 데이터와 최종 Markdown 프롬프트를 모두 가진다.

## 4. 핵심 모듈

### 4.1 Question Bank

역할과 무관한 사전 질문 40문항을 관리한다.

책임:

- `pre_question.json` 로드
- 카테고리와 stage 검증
- option 5 존재 여부 검증

### 4.2 Interview Runtime

사전 인터뷰 진행 상태를 관리한다.

책임:

- 현재 문항 인덱스
- 응답 저장
- 응답 시간 측정
- rationale 필수 입력 검증
- 완료 여부 계산

### 4.3 Context Builder

사전 인터뷰 응답을 `PreInterviewContext v2`로 변환한다.

책임:

- 카테고리별 `question_1`부터 `question_5` 구성
- `response_signal` 계산
- communication style 병합
- schema version 부여

### 4.4 Decision Skill Runtime

역할별 심층 인터뷰 지식을 로드한다.

책임:

- CFO, CEO, CMO, CTO Skill 선택
- `identity`, `cross_dimension` 질문 생성
- 역할별 도메인 수치 기준 적용
- 금지된 질문 축 차단

### 4.5 Persona Prompt Renderer

`PreInterviewContext v2`와 `DeepInterviewResult`를 Decision.md와 유사한 Markdown 프롬프트로 렌더링한다.

책임:

- Role 섹션 생성
- Identity 섹션 생성
- Decision Principles 섹션 생성
- Cross-Dimension Rules 섹션 생성
- Red Lines 섹션 생성
- Communication Style 섹션 생성
- Evidence 섹션 생성
- communication style에 맞는 문체와 구조 적용
- 파일 저장 또는 DB 저장을 위한 Markdown 출력 wrapper 생성

### 4.6 Persistence

인터뷰 세션과 페르소나를 저장한다.

책임:

- 질문 은행 버전 저장
- 세션 저장
- 응답 저장
- 생성된 페르소나 저장
- 생성된 Markdown 프롬프트 저장
- 수정 이력 저장

## 5. 상태 모델

```text
idle
  -> role_selected
  -> pre_interview_in_progress
  -> pre_interview_completed
  -> communication_style_completed
  -> context_ready
  -> deep_interview_in_progress
  -> deep_interview_completed
  -> persona_prompt_generated
  -> persona_saved
```

실패 상태:

| 상태 | 발생 조건 | 처리 |
| --- | --- | --- |
| `invalid_question_bank` | 질문 스키마가 깨짐 | 인터뷰 시작 차단 |
| `incomplete_answer` | 답변 또는 rationale 누락 | 다음 단계 이동 차단 |
| `context_build_failed` | `PreInterviewContext v2` 생성 실패 | 오류 메시지와 재시도 제공 |
| `skill_load_failed` | 역할 Skill 로드 실패 | 심층 인터뷰 시작 차단 |
| `persona_prompt_render_failed` | Markdown 프롬프트 생성 실패 | 구조화 데이터 보존 후 재시도 |

## 6. 검증 규칙

사전 질문 검증:

- 전체 문항 수는 40개다.
- 카테고리는 8개다.
- 각 카테고리는 5개 문항을 가진다.
- 각 카테고리는 5개 stage를 각각 1개씩 가진다.
- 모든 문항은 option 1-5를 가진다.
- option 5의 텍스트는 `E. 기타 (직접입력)`이다.

응답 검증:

- `selected_option_id`는 1-5 사이 값이다.
- `answer`는 비어 있으면 안 된다.
- `rationale`은 비어 있으면 안 된다.
- `response_time_ms`는 0 이상의 숫자다.
- `response_signal`은 `strong_preference`, `considered_preference`, `slow_response` 중 하나다.

심층 인터뷰 검증:

- 질문 축은 `identity`, `cross_dimension`만 허용한다.
- “둘 다 고민됨” 선택지는 없어야 한다.
- 생성된 질문은 최소 1개 이상의 사전 응답 근거를 참조해야 한다.

페르소나 프롬프트 검증:

- 최종 산출물은 Markdown 문자열이어야 한다.
- Role, Identity, Decision Principles, Cross-Dimension Rules, Red Lines, Communication Style, Evidence 섹션을 가져야 한다.
- 각 Decision Principle은 근거 응답을 1개 이상 참조해야 한다.
- `communication_style` 선택 결과가 프롬프트 표현 방식에 반영되어야 한다.
