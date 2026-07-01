# 사전 질문 독립 섹션 설계

## 목적

사이드바의 `인터뷰` 섹션 위에 `사전 질문` 섹션을 추가한다. 사용자는 이 화면에서 `src/data/pre_question.json`의 사전 질문 40개와 `communication_style` 브릿지 질문 1개에 답한다. 완료 결과는 `docs/preinterview-io-schema.md`의 `PreInterviewContext v2` 계약에 맞춰 저장되고, 이후 심층 인터뷰 입력으로 사용된다.

## 검토한 접근

### A. 독립 사전 질문 화면

사이드바에 `사전 질문` 탭을 새로 만들고, 질문 진행과 `PreInterviewContext` 생성을 이 화면이 책임진다. 기존 `인터뷰` 화면은 심층 인터뷰와 페르소나 생성 흐름에 집중한다.

장점은 책임 경계가 명확하고, 사용자가 사전 질문을 별도 단계로 인식할 수 있다는 점이다. `question_mode: attribute_tradeoff` 같은 특수 렌더링도 독립 화면에서 다루기 쉽다. 단점은 기존 `InterviewView`에 들어 있는 사전 질문 로직을 분리해야 한다는 점이다.

### B. 기존 인터뷰 화면 확장

현재 `InterviewView` 안의 프로필 수집, 사전 질문, 커뮤니케이션 스타일, 심층 인터뷰 흐름을 유지하고 화면 안에 단계 표시만 강화한다.

장점은 구현량이 가장 작다는 점이다. 단점은 사전 질문과 심층 인터뷰의 책임이 계속 한 컴포넌트에 섞이고, 사용자가 요청한 사이드바 구조와 맞지 않는다.

### C. 사전 질문 요약 중심 화면

사전 질문 화면을 완료 결과 검토와 수정 중심으로 만들고, 실제 질문 진행은 기존 인터뷰 화면에서 처리한다.

장점은 `PreInterviewContext` 검토 경험이 좋다는 점이다. 단점은 사용자가 사전 질문을 수행하는 독립 UI라는 요구와 거리가 있고, 첫 구현 범위로는 무겁다.

## 결정

A안으로 진행한다. `사전 질문` 화면은 독립 탭이며, 질문 진행 상태와 응답 저장을 책임진다. 완료 후 생성된 `PreInterviewContext`는 앱 상태에 보관하고 심층 인터뷰 진입 시 전달한다.

## 화면 구조

사이드바 메뉴 순서는 다음과 같다.

1. 대시보드
2. 사전 질문
3. 인터뷰
4. 페르소나
5. 히스토리
6. 설정

`사전 질문` 화면은 다음 영역을 가진다.

- 상단 진행 정보: 현재 문항 번호, 총 문항 수, 카테고리, stage, 진행률
- 질문 본문: `pre_question`
- 선택 UI: 일반 객관식 또는 attribute tradeoff 테이블
- 이동 버튼: 이전, 다음, 완료
- 완료 요약: 카테고리별 `question_1`부터 `question_5`까지의 저장 결과와 `communication_style`

## 질문 렌더링

일반 문항은 `pre_options`를 라디오 또는 선택 카드 형태로 렌더링한다.

`question_mode: "attribute_tradeoff"` 문항은 테이블로 렌더링한다.

- 행: 각 `pre_options` 선택지
- 첫 번째 열: 선택지 문구
- 추가 열: `attributes[].label`
- 셀 값: 선택지의 `attribute_values[attribute_id]`
- `option_id: 5`는 직접 입력 행으로 표시하고 attribute 값은 비워 둔다.

사용자는 테이블 행 하나를 선택한다. 선택지가 1-4번이면 `answer`에는 선택지 문구를 저장한다. 선택지가 5번이면 직접 입력값을 `answer`에 저장한다.

## 데이터 흐름

1. `src/data/pre_question.json`을 로드한다.
2. 문항을 순서대로 렌더링한다.
3. 사용자가 선택지를 고른다. `option_id: 5`는 직접 입력값을 받는다.
4. 응답 시간을 측정해 `response_time_ms`와 `response_signal`을 계산한다.
5. 40문항 완료 후 `communication_style` 브릿지 질문을 렌더링한다.
6. 전체 응답을 `PreInterviewContext v2`로 변환한다.
7. 생성된 context를 앱 상태에 저장하고 `인터뷰` 화면의 심층 인터뷰 시작 입력으로 전달한다.

## PreInterviewContext 저장

기본 저장 구조는 `docs/preinterview-io-schema.md`를 따른다.

```ts
categories[category][question_n] = {
  stage,
  source_question_id,
  question,
  selected_option_id,
  answer,
  response_time_ms,
  response_signal,
}
```

`question_mode: "attribute_tradeoff"` 문항은 선택지 의미를 잃지 않도록 다음 필드를 추가한다.

```ts
categories[category][question_n] = {
  ...baseFields,
  question_mode: "attribute_tradeoff",
  revealed_preference,
  attribute_values,
}
```

`attribute_values`는 선택된 보기의 `attribute_values` 객체를 그대로 보존한다. `option_id: 5` 직접 입력은 선택지에 `attribute_values`가 없으므로 이 필드를 생략하거나 빈 객체로 저장한다. 구현은 빈 객체보다 생략을 기본으로 한다.

## 상태와 연결

`TabType`에 `pre-question`을 추가한다. `App`은 `PreInterviewContext` 상태를 보유한다.

- `PreQuestionView`는 완료 시 `onComplete(context)`를 호출한다.
- `App`은 context를 저장하고 필요하면 `interview` 탭으로 이동시킨다.
- `InterviewView`는 저장된 context가 있으면 심층 인터뷰 시작 입력으로 사용한다.

기존 `InterviewView`에 들어 있는 사전 질문 생성과 사전 질문 응답 처리 로직은 새 화면으로 이동한다. 심층 인터뷰 질문 생성, 최종 산출물 생성, 페르소나 생성 흐름은 기존 화면에 남긴다.

## 오류 처리

질문 데이터가 깨진 경우 사전 질문 시작을 막고 명확한 오류를 보여준다.

검증 규칙은 다음과 같다.

- `pre_question_id` 중복 없음
- 각 문항에 `category`, `decision_dimension`, `stage`, `pre_question`, `pre_options` 존재
- 각 카테고리에 5개 stage가 하나씩 존재
- 모든 문항에 `option_id: 5`, `option_text: "E. 기타 (직접입력)"` 존재
- `attribute_tradeoff` 문항은 `attributes`와 1-4번 선택지의 `attribute_values` 존재

사용자가 선택지 없이 다음으로 이동하면 저장하지 않고 안내 메시지를 보여준다. 직접 입력 선택지를 고른 경우 직접 입력값이 비어 있으면 다음으로 이동할 수 없다.

## 테스트 계획

새 테스트 파일 또는 크게 수정되는 테스트 파일 상단에는 다음 형식의 Test Plan 주석을 둔다.

```text
Test Plan:
1. Happy Path:
   - 40개 사전 질문과 communication_style을 완료하면 PreInterviewContext v2가 생성된다.

2. Edge Cases:
   - attribute_tradeoff 문항 선택 시 attribute_values와 revealed_preference가 context에 보존된다.
   - option_id 5 직접 입력 선택 시 직접 입력값이 answer에 반영된다.
   - 이전 문항으로 돌아가 답변을 수정하면 기존 응답이 중복되지 않고 교체된다.

3. Failure Path:
   - 필수 선택지와 직접 입력값이 비어 있으면 다음 단계로 진행하지 않고 context를 변경하지 않는다.
```

테스트는 최소한 context builder와 question bank validation을 분리해 검증한다. UI 테스트가 없는 현재 프로젝트 구조에서는 순수 함수 테스트를 우선하고, 빌드는 `npm run build`로 검증한다.

## 구현 범위

이번 구현 범위에 포함한다.

- 사이드바 `사전 질문` 탭 추가
- `PreQuestionView` 추가
- 질문 데이터 타입과 validator 추가
- 일반 객관식 렌더링
- `attribute_tradeoff` 테이블 렌더링
- 응답 시간 측정과 `response_signal` 계산
- `PreInterviewContext v2` 생성
- 완료 context를 `InterviewView`로 전달
- 관련 순수 함수 테스트
- 빌드 검증

이번 구현 범위에서 제외한다.

- 서버 저장 스키마 변경
- DB migration 추가
- 심층 인터뷰 프롬프트 자체 수정
- 완료 요약 화면의 세밀한 편집 기능
- 역할별 CFO 외 question bank 분기
