# Amy Hood 페르소나 Phase 2 Source Inventory 설계

## 목적

Phase 2는 Amy Hood 페르소나의 Main Master Prompt와 RAG 장기 기억에 사용할 공개자료 후보를 하나의 인벤토리로 정리하고, Phase 3의 1차 Evidence 추출 대상을 선별한다.

이 단계에서는 공개자료를 수집·등록·분류하지만 판단 원칙, Evidence, Decision Case 또는 Main Master Prompt를 만들지 않는다. RAG 코드와 앱도 수정하지 않는다.

## 입력 자료

### 분기별 어닝콜

`archive/`의 FY2013 Q4부터 FY2025 Q3까지 분기별 JSON 48개를 모두 등록한다.

- FY2017 Q1부터 FY2019 Q4까지 12개: 판단 스타일 재현 평가용 `holdout`
- 나머지 36개: 내용에 따라 `selected` 또는 `available`

### 인수받은 인터뷰 데이터

다음 두 파일은 프로젝트 인수 과정에서 Amy Hood 인터뷰 자료라고 확인된 정식 데이터다.

- `archive/microsoft_amy_hood.json`
- `archive/microsoft_amy_hood.csv`

두 파일은 `source_type: interview`, `source_grade: primary`로 등록하고 Main Master Prompt와 RAG 장기 기억의 정식 입력 후보로 사용할 수 있다. URL이나 날짜가 없는 경우 값을 만들지 않고 `null`과 `metadata_status: needs_enrichment`로 기록한다.

JSON과 CSV 사이의 중복 문장을 검사하되 원본 파일은 수정하거나 삭제하지 않는다.

### 신규 웹 자료

기존 자료의 5개 재무 영역 분포를 확인한 후 부족한 영역만 추가 조사한다. 우선순위는 다음과 같다.

1. Microsoft 공식 행사, 영상과 transcript
2. Amy Hood의 직접 인터뷰와 대담
3. CFO 콘퍼런스 발표와 Q&A
4. 신뢰할 수 있는 매체의 직접 인용 자료

단순 약력, 실적 요약, Amy Hood의 직접 발언이나 판단 이유가 없는 자료는 1차 분석에서 제외한다.

## 산출물

Phase 2의 주 산출물은 다음 파일이다.

`data/b-track/amy-hood/source-inventory.json`

한 항목은 하나의 원문 자료 또는 하나의 인수 데이터셋을 나타낸다. 인수 인터뷰 집계 파일은 각각 하나의 데이터셋으로 등록하고, 이후 개별 원문의 출처가 복원되면 별도 항목으로 분리할 수 있다.

## 데이터 계약

각 항목은 최소한 다음 필드를 가진다.

```json
{
  "source_id": "source_001",
  "title": "자료 제목",
  "source_type": "interview",
  "source_grade": "primary",
  "url": null,
  "local_path": "archive/microsoft_amy_hood.json",
  "published_at": null,
  "speaker": "Amy Hood",
  "decision_domains": ["capital_allocation"],
  "has_full_text": true,
  "metadata_status": "needs_enrichment",
  "selection_reason": "Amy Hood의 직접 인터뷰 발언 데이터셋",
  "status": "available"
}
```

필드 의미는 다음과 같다.

- `source_id`: 인벤토리 내부의 안정적인 고유 식별자
- `title`: 자료 또는 인수 데이터셋의 사람이 읽을 수 있는 이름
- `source_type`: `interview`, `presentation`, `conversation`, `earnings_call`, `official_document`, `quoted_media` 중 하나
- `source_grade`: `primary`, `secondary`, `discovery_only` 중 하나
- `url`: 확인된 원문 URL. 없으면 `null`
- `local_path`: 로컬 원문 경로. 없으면 `null`
- `published_at`: 확인된 공개일. 없으면 `null`
- `speaker`: 직접 발언자
- `decision_domains`: Phase 1에서 정한 재무 영역 식별자 배열
- `has_full_text`: 분석 가능한 전체 텍스트 보유 여부
- `metadata_status`: `complete`, `needs_enrichment`, `review_required` 중 하나
- `selection_reason`: 선택, 보관 또는 제외 이유
- `status`: 분석과 평가에서의 사용 상태

중복 자료에는 `duplicate_of`를 추가하고, 접근할 수 없는 URL에는 `url_status: unavailable`을 추가한다. 자동 또는 사람 검토 중 발생한 오류는 `review_notes`에 기록할 수 있다.

## 상태 계약

- `selected`: Phase 3의 1차 Evidence 추출 대상
- `available`: 정식 데이터지만 1차 분석 우선순위가 낮은 자료
- `holdout`: FY2017-FY2019 판단 스타일 평가 전용 자료
- `rejected`: 중복, 다른 화자, 판단 근거 부족 등의 이유로 제외한 자료
- `review_required`: 파일, 원문 또는 직접 발언 여부를 사람이 확인해야 하는 자료

`holdout` 자료는 어떤 경우에도 `selected`나 학습용 RAG 입력으로 승격하지 않는다.

## 재무 영역

자료는 다음 5개 영역 중 하나 이상으로 태그한다.

- `capital_allocation`: 자본 배분
- `growth_profitability_balance`: 성장과 수익성의 균형
- `cost_discipline_operating_efficiency`: 비용 규율과 운영 효율
- `strategic_investment_acquisition`: 전략적 투자와 인수
- `risk_uncertainty`: 리스크와 불확실성 대응

하나의 자료가 여러 영역에 해당할 수 있다.

## 조사 및 선별 흐름

1. 분기별 어닝콜 JSON 48개의 메타데이터를 읽어 모두 등록한다.
2. FY2017-FY2019 어닝콜 12개를 `holdout`으로 격리한다.
3. 인수 인터뷰 JSON과 CSV를 정식 `primary interview` 데이터셋으로 등록한다.
4. 두 인터뷰 파일의 레코드 수와 정규화한 문장 중복을 검사한다.
5. 기존 자료를 5개 재무 영역으로 태그하고 영역별 분포를 계산한다.
6. 부족한 영역을 인터뷰, 발표와 대담 중심으로 웹에서 보충한다.
7. 중복, 직접 발언 여부, 원문 접근성, 판단 이유 포함 여부를 확인한다.
8. Phase 3의 1차 분석에 사용할 15~25개를 `selected`로 정한다.
9. 사람이 링크, 화자, 자료 유형, 선택 이유와 홀드아웃 분리를 검토한다.

## 선별 목표

`selected` 자료는 총 15~25개로 제한한다.

- 인터뷰, 발표와 대담: 10~15개
- 어닝콜: 5~10개
- 재무 영역: 5개 중 최소 4개 포함

인수 인터뷰 집계 파일 2개는 각각 하나의 데이터셋으로 계산한다. 원문 출처를 복원해 개별 항목으로 분리한 경우 집계 항목과 개별 항목을 중복 계산하지 않는다.

자료가 많다는 이유만으로 선택하지 않는다. Amy Hood가 직접 말하고, 실제 재무 문제나 선택 상황과 판단 이유 또는 고려한 위험이 드러나는 자료를 우선한다.

## 중복 처리

- 같은 URL은 같은 자료 후보로 본다.
- URL이 달라도 같은 원문을 복제한 경우 하나만 `selected`로 둔다.
- JSON과 CSV의 텍스트는 공백과 인용부호를 정규화한 후 동일 문장을 비교한다.
- 중복 자료는 삭제하지 않고 `status: rejected`, `duplicate_of`와 제외 이유를 기록한다.
- 원본 로컬 파일은 변경하거나 삭제하지 않는다.

## 오류와 안전한 실패

- URL이나 날짜가 없는 인수 인터뷰 데이터는 정식 자료로 유지하고 `needs_enrichment`를 표시한다.
- 웹 링크가 사라졌지만 로컬 원문이 있으면 `has_full_text: true`, `url_status: unavailable`로 기록한다.
- Amy Hood의 직접 발언인지 불확실한 자료는 `review_required`로 보낸다.
- 자료를 찾지 못한 재무 영역은 관련 없는 자료로 채우지 않고 `coverage_gap`으로 보고한다.
- 파일 또는 일부 레코드 파싱 실패는 전체 인벤토리 생성을 중단시키지 않고 해당 항목을 `review_required`로 남긴다.
- 확인되지 않은 URL, 날짜, 화자 또는 자료 유형을 추정해 채우지 않는다.
- Phase 2에서 자료 내용을 Main Master Prompt의 원칙이나 Evidence로 해석하지 않는다.

## 기존 RAG 페르소나 경로와의 관계

현재 프로젝트의 `RAG 검색 → 정적 페르소나 생성 → 이후 정적 decisionPrompt로 대화`하는 사용자 실행 경로는 신규 구조에서 폐기한다.

이후 구현에서 제거할 대상은 다음과 같다.

- `Amy Hood RAG로 생성` UI
- `/api/reference-personas/amy-hood-rag` 엔드포인트
- `generateReferencePersonaFromRagEvidence`
- 생성된 정적 Amy Hood 페르소나를 브라우저 `localStorage`에 저장하는 흐름

다음 자산은 신규 `Main Master Prompt + 질문별 RAG 장기 기억` 구조의 재사용 후보로 보존한다.

- `archive/` 원문 데이터
- 키워드와 Vector 검색 코드
- bge-m3 인덱스 생성 코드
- 홀드아웃 분리 및 평가 자료
- 재사용 가능한 청킹과 검색 로직

Phase 2에서는 기존 코드를 제거하거나 신규 RAG 구조를 구현하지 않는다. 이 절은 이후 Phase가 기존 사용자 흐름을 신규 구조와 혼합하지 않게 하는 계약이다.

## 검증 계획

새 코드나 크게 수정한 테스트 파일이 필요한 경우 프로젝트의 TDD 지침을 적용한다. Phase 2 결과 자체는 다음 최소 사례로 검증한다.

### Happy Path

출처와 메타데이터가 완전한 Microsoft 공식 자료가 올바른 유형, 재무 영역과 상태로 인벤토리에 등록된다.

### Edge Cases

1. URL과 날짜가 없지만 정식으로 인수받은 인터뷰 데이터셋
2. JSON과 CSV 또는 웹 자료 사이에 동일 발언이 중복된 경우
3. 하나의 자료가 여러 재무 영역에 동시에 해당하는 경우

### Failure Paths

- 손상된 JSON이나 읽을 수 없는 파일은 전체 작업을 중단시키지 않고 `review_required`로 기록한다.
- Amy Hood 직접 발언 여부가 불명확한 자료는 `selected`로 자동 승격하지 않는다.
- 사라진 링크에는 허위 대체 URL을 만들지 않고 접근 실패 상태를 기록한다.
- 홀드아웃 12개 중 하나라도 `selected`에 포함되면 검증 실패로 처리한다.

## 완료 기준

- 어닝콜 48개가 모두 인벤토리에 등록되어 있다.
- FY2017-FY2019 어닝콜 12개가 `holdout`으로 격리되어 있다.
- 인수 인터뷰 JSON과 CSV가 정식 자료로 등록되어 있다.
- `selected` 자료가 총 15~25개다.
- `selected` 중 인터뷰, 발표와 대담이 10~15개이고 어닝콜이 5~10개다.
- 5개 재무 영역 중 최소 4개가 `selected` 자료에 포함된다.
- 모든 항목에 선택, 보관, 검토 또는 제외 이유가 있다.
- 중복 관계와 메타데이터 보강 필요 여부가 표시되어 있다.
- Main Master Prompt 원칙, Evidence 또는 Decision Case를 생성하지 않았다.
- 기존 정적 RAG 페르소나 사용자 경로를 수정하지 않았다.
