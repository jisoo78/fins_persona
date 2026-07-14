# A/B Track 워크스페이스, Main Prompt 버전 관리 및 평가 리포트 설계

## 목적

현재 한 사이드바에 섞여 있는 A Track과 B Track 기능을 별도 작업 공간으로 분리한다. B Track에는 공개자료 기반 Amy Hood 페르소나의 Main Prompt 편집, 평가 문항 검토, 평가 실행과 결과 분석을 한 흐름으로 배치한다.

이번 설계는 다음 네 가지 개선을 하나의 운영 흐름으로 묶는다.

1. A Track과 B Track을 별도 진입 페이지로 분리한다.
2. Main Prompt를 조회·편집하고 버전별로 보관한다.
3. 단일 실행 및 두 실행 비교 평가 리포트를 제공한다.
4. 현재 실행과 비교 대상 실행의 전체 ID를 복사한다.

## 현재 문제

- 사전 질문, 심층 인터뷰, 페르소나, 문항 검토와 평가 비교가 같은 사이드바 목록에 있어 제품의 두 Track이 구분되지 않는다.
- `AMY_HOOD_PERSONA.gemma4.md`를 Web UI에서 확인하거나 수정할 수 없다.
- 프롬프트를 수정하면 이전 본문이 보존되지 않아 평가 결과와 당시 프롬프트를 정확히 연결할 수 없다.
- 평가 실행·비교 화면은 있으나 한 실행의 실패 원인과 개선 지점을 모아 보는 리포트 페이지가 없다.
- 화면의 축약 실행 ID만으로 Codex 채점이나 API 조회를 요청하면 전체 UUID를 다시 찾아야 한다.

## 범위와 비범위

### 포함

- 공통 사이드바와 A/B Track 진입 페이지
- 각 Track 페이지의 내부 메뉴
- Amy Hood Gemma 4 Main Prompt 버전 생성·조회·활성화
- 평가 실행에 프롬프트 버전 고정
- 단일 실행 상세 리포트와 두 실행 비교 리포트
- 실행 ID 전체 복사와 성공·실패 피드백
- API 비정상 응답에 대한 읽을 수 있는 오류 메시지

### 제외

- 자동 외부 Judge API 호출
- PDF, CSV 또는 문서 파일 내보내기
- B Track에서 Amy Hood 이외 인물을 관리하는 범용 CMS
- A Track의 `PreInterviewContext` 또는 심층 인터뷰 계약 변경
- 기존 평가 실행 JSON을 DB로 이전하는 작업

## 정보 구조

### 공통 사이드바

사이드바에는 다음 네 개의 최상위 진입점만 둔다.

- `대시보드`
- `A Track`
- `B Track`
- `설정`

사이드바에서 기존 세부 기능 버튼을 제거하고 Track 페이지 내부 메뉴로 이동한다. 현재 선택된 Track은 페이지 제목과 내부 내비게이션에서 명확히 표시한다.

### A Track 페이지

A Track은 사용자의 판단 데이터를 인터뷰로 수집해 개인 페르소나를 만드는 기존 흐름을 유지한다.

- `사전 질문`
- `심층 인터뷰`
- `개인 페르소나`

기존 `InterviewView`, `DeepInterviewView`, `PersonasView`를 재사용한다. 화면 재배치는 A Track의 데이터 계약이나 저장 책임을 바꾸지 않는다.

### B Track 페이지

B Track은 공개자료에서 만든 인물 페르소나를 운영하고 평가한다.

- `Main Prompt`
- `평가 문항 검토`
- `평가 실행`
- `평가 리포트`

기존 `EvaluationQuestionReviewView`와 `EvaluationView`는 B Track 내부 화면으로 이동한다. 평가 리포트는 별도 내부 메뉴로 추가한다.

## Main Prompt 버전 관리

### 사용자 흐름

Main Prompt 화면은 다음 작업을 제공한다.

1. 현재 활성 버전의 전체 Markdown을 조회한다.
2. 본문을 편집해 새 불변 버전으로 저장한다.
3. 버전 목록에서 생성 시각, 해시와 활성 상태를 확인한다.
4. 두 버전의 본문을 나란히 비교한다.
5. 저장된 과거 버전을 다시 활성화한다.

새 버전 저장과 활성화는 분리한다. 저장은 이력을 추가할 뿐 현재 평가 프롬프트를 바꾸지 않는다. 사용자가 명시적으로 `활성화`해야 이후 평가가 해당 버전을 사용한다.

### 저장 구조

```text
data/b-track/amy-hood/
├── AMY_HOOD_PERSONA.gemma4.md
├── prompt-versions.json
└── prompts/
    └── <version-id>.md
```

- `prompts/<version-id>.md`: 저장 후 수정하지 않는 프롬프트 본문
- `prompt-versions.json`: 버전 ID, 생성 시각, SHA-256, 바탕 버전 ID와 `activeVersionId`
- `AMY_HOOD_PERSONA.gemma4.md`: 기존 파이프라인 호환을 위해 활성 버전 본문을 반영하는 파일

처음 기능을 사용할 때 기존 `AMY_HOOD_PERSONA.gemma4.md`를 초기 버전으로 등록한다. 같은 내용도 사용자가 새 버전 저장을 명시하면 별도 버전으로 남길 수 있다.

### 검증과 원자성

- 빈 본문은 저장할 수 없다.
- 활성화할 프롬프트에는 기존 파이프라인이 요구하는 필수 Markdown 섹션이 있어야 한다.
- 버전 파일과 manifest는 임시 파일을 거쳐 원자적으로 기록한다.
- `prompt-versions.json`을 활성 버전의 기준 데이터로 사용한다.
- 호환 파일 갱신 중 실패하면 manifest의 `activeVersionId`를 바꾸지 않는다.
- 시작 시 호환 파일이 manifest의 활성 버전과 다르면 활성 버전 본문으로 복구한다.

### API

- `GET /api/b-track/amy-hood/prompt-versions`: 버전 목록과 활성 버전 조회
- `GET /api/b-track/amy-hood/prompt-versions/:id`: 특정 버전 본문 조회
- `POST /api/b-track/amy-hood/prompt-versions`: 편집 본문을 새 버전으로 저장
- `POST /api/b-track/amy-hood/prompt-versions/:id/activate`: 검증 후 활성 버전 변경

버전 ID가 없으면 404, 본문 또는 필수 섹션 검증에 실패하면 400 JSON 응답을 반환한다.

## 평가 실행과 프롬프트 고정

새 평가 실행은 생성 시점의 다음 값을 저장한다.

- `promptVersionId`
- `promptHash`
- `questionSetVersion`
- `provider`
- `model`

실행 엔진은 활성 호환 파일을 다시 읽지 않고 `promptVersionId`가 가리키는 불변 파일을 사용한다. 실행 도중 다른 프롬프트를 활성화해도 진행 중인 실행은 영향을 받지 않는다.

기존 실행처럼 `promptVersionId`가 없는 기록은 삭제하지 않는다. 리포트에서 `레거시 프롬프트 · <promptHash>`로 표시한다.

## 평가 리포트

리포트는 `evaluation/runs/<run-id>.json`을 원본 데이터로 사용하며 별도의 중복 결과 파일을 만들지 않는다.

### 단일 실행 리포트

완료 여부와 관계없이 존재하는 실행을 조회할 수 있다.

- 전체 실행 ID와 복사 버튼
- provider, model, 프롬프트 버전, 질문 세트 버전, 실행 시각
- 과거 복원 `0-7`, GitHub 홀드아웃 `0-5`, 주관식 `0-24`
- 객관식 문항별 선택, 정답 여부와 생성 이유
- 주관식 문항별 원문 답변, 네 차원 점수와 채점 요약
- 실패 문항과 오류 메시지
- 미완료 실행의 재개 진입점
- 주관식 미채점 실행의 `채점 대기` 표시

### 두 실행 비교 리포트

같은 `questionSetVersion`을 사용하는 두 실행만 비교한다.

- 좌·우 실행의 전체 ID 복사
- 모델과 프롬프트 버전 표시
- KPI별 점수와 증감
- 문항별 답변 나란히 비교
- 객관식 정답 변화
- 주관식 차원별 점수와 채점 요약 변화
- 미채점 점수는 `채점 대기`로 표시하고 임의로 0점 처리하지 않음

같은 실행을 양쪽에 선택하거나 질문 세트 버전이 다르면 비교를 실행하지 않고 이유를 안내한다.

### 외부/Codex 채점 경계

현재 PoC에서는 사용자가 실행 ID를 Codex에 전달하면 Codex가 S1-S3 질문·루브릭·답변만 읽어 블라인드 채점하고 기존 주관식 채점 API로 저장한다. 생성 provider와 model은 채점 입력에서 제외한다. 자동 Judge API 호출은 이번 범위에 포함하지 않는다.

## 실행 ID 복사

### 배치

- 현재 평가 실행 요약의 전체 실행 ID 옆
- 단일 실행 리포트 상단
- 평가 실행 비교 선택 영역의 좌·우 실행
- 두 실행 비교 리포트 상단의 좌·우 실행

### 동작

- 항상 축약값이 아닌 전체 `runId`를 복사한다.
- 기본 라벨은 `ID 복사`다.
- 성공하면 해당 버튼만 2초 동안 `복사됨`으로 표시한다.
- 실패하면 해당 버튼만 2초 동안 `복사 실패`로 표시한다.
- 빠르게 다시 클릭하면 마지막 클릭을 기준으로 복귀 시간을 갱신한다.
- 선택된 실행이 없으면 버튼을 비활성화한다.

공용 `copyTextToClipboard`는 `navigator.clipboard.writeText`를 먼저 사용한다. Clipboard API가 없으면 임시 텍스트 요소와 `document.execCommand('copy')`를 사용한다. 두 경로가 모두 실패해도 평가 화면 상태에는 영향을 주지 않는다.

## 컴포넌트 경계

- `TrackWorkspaceView`: Track 제목과 내부 메뉴 레이아웃
- `ATrackView`: 기존 A Track 화면 연결
- `BTrackView`: B Track 내부 화면 연결
- `MainPromptView`: 버전 목록, 편집기, 비교와 활성화 동작
- `EvaluationReportView`: 단일/비교 리포트 진입
- `SingleRunReport`: 한 실행의 상세 결과
- `ComparisonRunReport`: 두 실행의 차이
- `CopyRunIdButton`: 복사와 독립적인 피드백 상태
- `promptVersionStore`: 버전 저장, 활성화와 복구
- `evaluationReportViewModel`: 실행 데이터를 표시용 리포트로 변환

각 컴포넌트는 화면 표시와 사용자 입력만 담당한다. 파일 접근, 해시 계산, 활성화 검증은 서버에 둔다.

## 오류 처리

- API가 빈 본문이나 비 JSON 응답을 반환하면 `response.json()` 오류 대신 HTTP 상태와 연결 오류를 사용자에게 표시한다.
- 프롬프트 저장·활성화 실패 시 기존 활성 버전을 유지한다.
- 존재하지 않는 프롬프트 버전과 실행 ID는 명확한 404 JSON 응답을 반환한다.
- 평가 실행이 없으면 리포트의 빈 상태와 다음 행동을 안내한다.
- 레거시 실행과 주관식 미채점 실행은 리포트에서 안전하게 축소 표시한다.
- A/B Track 내부 선택 상태는 분리해 한 Track의 이동이 다른 Track의 작업 상태를 초기화하지 않는다.

## 테스트 계획

새 테스트 파일에는 프로젝트 지침에 따라 Test Plan 주석을 먼저 작성한다.

### Track 내비게이션

#### Happy Path

- 공통 사이드바에서 A Track과 B Track에 진입하고 각 내부 메뉴를 전환한다.

#### Edge Cases

1. 새로고침 후 마지막 Track과 내부 메뉴를 복원한다.
2. 저장된 알 수 없는 메뉴 값은 각 Track의 기본 화면으로 복구한다.
3. A Track과 B Track의 마지막 내부 메뉴를 서로 독립적으로 기억한다.

#### Failure Path

- 제거된 기존 탭 값이 localStorage에 있어도 빈 화면을 만들지 않는다.

### Main Prompt 버전

#### Happy Path

- 편집 본문을 새 버전으로 저장하고 명시적으로 활성화한 뒤 평가가 그 버전을 고정한다.

#### Edge Cases

1. 기존 단일 프롬프트 파일을 최초 버전으로 이관한다.
2. 동일 본문을 다시 저장해도 별도 버전 ID와 올바른 해시를 만든다.
3. 과거 버전을 재활성화하면 호환 파일과 manifest가 해당 버전을 가리킨다.

#### Failure Path

- 빈 본문, 필수 섹션 누락, 알 수 없는 버전과 원자적 쓰기 실패는 기존 활성 버전을 변경하지 않는다.

### 평가 리포트

#### Happy Path

- 채점 완료 실행의 단일 리포트와 같은 질문 세트 두 실행의 비교 리포트를 만든다.

#### Edge Cases

1. `promptVersionId` 없는 레거시 실행을 해시 기반으로 표시한다.
2. 주관식 미채점 실행을 0점이 아닌 `채점 대기`로 표시한다.
3. 미완료 실행의 완료 답변과 실패 문항을 함께 표시한다.

#### Failure Path

- 없는 실행, 같은 실행끼리 비교, 질문 세트 불일치는 명확한 안내와 함께 비교를 차단한다.

### 실행 ID 복사

#### Happy Path

- 전체 UUID를 Clipboard API로 복사하고 성공 상태를 표시한다.

#### Edge Cases

1. Clipboard API가 없으면 폴백으로 복사한다.
2. 여러 복사 버튼의 피드백 상태는 서로 독립적이다.
3. 빠른 재클릭은 마지막 클릭을 기준으로 피드백 시간을 갱신한다.

#### Failure Path

- 기본 경로와 폴백이 모두 실패하면 예외를 전파하지 않고 실패 상태를 표시한다.

## 완료 기준

- 공통 사이드바에서 A/B Track의 세부 기능이 분리된다.
- Main Prompt의 모든 저장본이 불변 버전으로 보존되고 하나의 활성 버전을 명시적으로 선택할 수 있다.
- 평가 실행이 사용한 프롬프트 버전과 해시를 재현할 수 있다.
- 단일 실행과 두 실행 비교 리포트가 B Track에서 조회된다.
- 현재 실행과 리포트의 전체 실행 ID를 한 번에 복사할 수 있다.
- 기존 A Track 계약과 B Track 홀드아웃 안전 규칙이 유지된다.
- 관련 테스트, TypeScript 검사와 프로덕션 빌드가 통과한다.
