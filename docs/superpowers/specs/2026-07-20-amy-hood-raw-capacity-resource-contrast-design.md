# Amy Hood Raw Capacity-Resource Contrast Design

## 1. 목적

웹 자료를 추가 수집하지 않고 현재 저장소의 raw·normalized 어닝콜만으로 Amy Hood의 조건부 자원배분 정책을 한 개 도출한다. PoC의 성공 기준은 자료량 확대가 아니라 동일한 판단 질문 아래에서 조건 변화와 실제 행동 변화를 원문까지 추적할 수 있게 만드는 것이다.

이 작업은 기존의 엄격한 성찰 게이트를 완화하지 않는다. 새 사건이 근거 검증을 통과하지 못하면 정책과 메모리 릴리스를 만들지 않는다.

## 2. 범위와 원천 자료

다음 세 개의 이미 수집된 Microsoft 어닝콜을 사용한다.

| 신규 사건 | 날짜 | source ID | 핵심 관찰 |
|---|---:|---|---|
| Cloud capacity and broad resource scaling | 2022-04-26 | `source-6b843b4b8385078d` | 클라우드 수요에 대응해 CapEx를 늘리고 인력도 전년 대비 20% 확대 |
| AI infrastructure scale with operating-expense discipline | 2023-04-25 | `source-fbb900eb7e249591` | AI 인프라 CapEx를 크게 늘리면서 운영비 증가율은 낮게 유지 |
| Demand-led AI capacity with owned and external supply | 2024-01-30 | `source-4f4085f8344669c4` | 수요 파이프라인에 따라 CapEx를 가속하고 자체·제3자 용량을 함께 사용하며 인력·운영비는 절제 |

새 URL 수집, 네트워크 크롤링, LinkedIn 수집은 하지 않는다. GitHub 인수, FY25 AI 데이터센터 계획, 2021 Microsoft 365 가격, 2021 자사주 매입 홀드아웃은 입력으로 사용하지 않는다.

## 3. 판단 축

판단 축은 XY 좌표가 아니라 범주형 선택과 관찰 가능한 전환 조건의 조합이다.

```json
{
  "decisionObject": "capacity_resource_mix",
  "decisionQuestion": "How should Microsoft scale infrastructure and operating resources as demand and profitability constraints change?",
  "choiceSet": [
    "scale_infrastructure_and_people",
    "scale_infrastructure_constrain_opex"
  ],
  "gatingVariables": [
    "customer_demand_strength",
    "demand_breadth",
    "ai_capacity_urgency",
    "profitability_pressure",
    "headcount_productivity",
    "internal_capacity_lead_time"
  ]
}
```

`owned_and_external_capacity`는 최상위 선택이 아니라 두 번째 선택을 실행하는 전술로 기록한다. 이를 별도 최상위 행동으로 두면 FY23과 FY24가 서로 다른 행동이 되어 두 사건이 하나의 지원 패턴을 구성하지 못한다.

## 4. 사건 구성

세 사건은 모두 `ai_cloud_capex` 도메인에 속한다.

### 4.1 FY22 Q3: 지원이 아닌 대조 사건

- 조건: 광범위한 클라우드 수요, 성장 투자 지속, Nuance 편입
- 선택 행동: `scale_infrastructure_and_people`
- 필요한 직접 근거: Amy의 CapEx 순차 증가 전망과 인력 20% 증가 발언
- 대조 의미: 성장과 수요가 광범위할 때 인프라와 인력을 함께 확장

### 4.2 FY23 Q3: 지원 사건 1

- 조건: 생성형 AI 수요 증가, Azure AI 인프라 확장 필요, 수익성 방어
- 선택 행동: `scale_infrastructure_constrain_opex`
- 필요한 직접 근거: AI 인프라로 인한 CapEx의 큰 순차 증가와 낮은 OpEx 증가 유지 발언
- 지원 의미: 인프라 투자는 보호하면서 운영비를 제한

### 4.3 FY24 Q2: 지원 사건 2

- 조건: 고객 수요 파이프라인 증가, 자체 용량의 구축 시차, AI 인프라 확장
- 선택 행동: `scale_infrastructure_constrain_opex`
- 필요한 직접 근거: 수요에 따른 CapEx 가속, 자체·제3자 용량 병행, 전년 대비 낮은 인력 또는 운영비 발언
- 지원 의미: 인프라 용량은 늘리되 조직 비용을 함께 확대하지 않고 공급 수단을 혼합

## 5. 데이터 통합 방식

### 5.1 후보 목록

`event-candidates.json`에 신규 후보 세 개를 추가한다. 기존 30개를 삭제하지 않고 33개로 확장한다. 후보 검증은 기존의 정확히 30개 조건을 `30~50개` 범위로 바꾼다. 홀드아웃 후보와 기존 URL은 그대로 보존한다.

### 5.2 소스 연계

기존 source registry의 각 어닝콜 source에 신규 후보 association을 추가한다. 같은 문서를 다른 사건에 사용할 때는 사건별 exact quote, offset, 역할을 분리한다. 기존 후보와 기존 evidence ID는 변경하지 않는다.

### 5.3 파일럿 선택

파일럿 manifest는 10개 구조를 유지한다. 현재 incomplete인 다음 세 target을 신규 후보로 대체한다.

- GitHub acquisition 2018
- Nuance acquisition 2021
- FY25 AI datacenter plan

각 replacement에는 20자 이상의 명시적 이유를 남긴다. GitHub와 FY25 데이터센터 홀드아웃은 후보 목록과 sealed evaluation에는 계속 존재하지만 정책 입력 manifest에서는 제거된다.

### 5.4 사건 카드

기존 `PilotDecisionEvent` 형식을 그대로 사용한다. 각 카드에는 다음을 포함한다.

- 최소 2개 선택지와 정확히 1개 선택 행동
- 조건, 제약, 거절한 이점
- 관찰과 추론의 분리
- Amy 직접 발언 또는 Amy 정책 발언
- contemporaneous decision context
- source ID, exact quote, start/end offset
- post-outcome evidence 0개

Gemma는 카드 문장 초안을 만들 수 있지만 evidence ID, offset, speaker, 날짜, 선택 행동은 코드와 Codex가 검증한 값만 저장한다.

## 6. 검증 흐름

1. registry의 normalized path와 SHA-256 소유권을 확인한다.
2. 선언한 `startChar:endChar`가 normalized 원문의 exact quote와 정확히 일치하는지 확인한다.
3. 인용 구간이 Amy 발화 구간 안에 있는지 확인한다.
4. published date가 사건 날짜 이후가 아닌지 확인한다.
5. 신규 source·candidate·evidence ID가 Evaluation v3 홀드아웃과 겹치지 않는지 검사한다.
6. 세 사건 카드에 `validatePilotEventCard`를 실행한다.
7. Codex가 원문을 확인하고 세 카드를 개별 승인한다.
8. policy-memory input graph가 기존 승인 사건과 신규 승인 사건을 함께 로드하는지 확인한다.
9. Gemma가 구조화 성찰을 최대 2회 생성한다.
10. Codex가 동일 판단 축, 조건 차이, 행동 차이, 원문 양측을 확인해 승인 또는 반려한다.

## 7. 목표 성찰과 정책

목표 성찰의 지원 패턴은 FY23 Q3과 FY24 Q2이며, 대조 패턴은 FY22 Q3이다.

예상 정책은 다음처럼 제한적으로 표현한다.

> 수요가 광범위하고 인력 생산성 제약이 낮을 때는 인프라와 인력을 함께 확장할 수 있다. AI 용량 수요가 급증하지만 수익성과 조직 생산성 제약이 커질 때는 인프라 CapEx를 보호하면서 OpEx와 인력 증가를 제한하고 자체·외부 공급을 병행한다.

이는 Amy Hood의 보편적 성격이나 내부 동기를 주장하지 않는다. 세 공개 사건에서 관찰된 조건부 자원배분 규칙만 나타낸다.

## 8. 오류 처리와 안전 정지

- exact quote와 offset 불일치: 해당 evidence와 사건 카드를 승인하지 않는다.
- Amy 발화 소유권 불명확: context evidence로만 사용하고 direct Amy로 승격하지 않는다.
- 한 사건에서 행동 근거가 부족함: 사건을 incomplete로 유지한다.
- FY23·FY24가 같은 지원 행동으로 의미상 묶이지 않음: 성찰을 승인하지 않는다.
- FY22와 FY23·FY24의 차이가 표현 차이에 불과함: 대조 실패로 기록한다.
- 홀드아웃 ID·alias·source·evidence 누출: 정책 빌드 전에 중단한다.
- 승인 성찰 또는 medium/high deployable policy가 0개: 메모리 릴리스와 Evaluation v3를 실행하지 않는다.
- 기존 활성 릴리스가 있다면 실패 과정에서 변경하지 않는다.

## 9. 테스트 설계

AGENTS.md 기본 규칙에 따라 새 테스트 파일 또는 기존 테스트 계획에 다음을 포함한다.

### Happy Path

- 세 raw 어닝콜에서 검증된 span으로 사건 카드 3개를 만들고, FY23·FY24 지원 대 FY22 대조 성찰이 medium confidence로 통과한다.

### Edge Cases

1. 하나의 source가 기존 후보와 신규 후보 양쪽에 연결되어도 evidence ID와 candidate owner가 분리된다.
2. 자체·외부 용량 병행 표현은 최상위 행동이 아니라 FY24 실행 조건·전술로 유지된다.
3. 공백·문장부호가 포함된 정확한 Amy 인용문도 선언 offset과 일치하면 통과한다.

### Failure Paths

- offset 또는 exact quote 불일치
- Amy가 아닌 발언을 direct Amy로 지정
- 사건 날짜보다 늦은 근거 사용
- FY25 데이터센터 또는 다른 홀드아웃 source 사용
- 두 지원 사건의 실제 선택 행동 불일치
- 신규 후보 추가 도중 기존 30개 후보 또는 sealed holdout 변경
- 저장 실패 시 후보·registry·manifest·카드 중 일부만 기록되는 부분 반영

## 10. 완료 기준

- 후보 데이터셋은 기존 30개를 보존한 33개가 된다.
- 신규 사건 3개의 exact quote, offset, speaker, 날짜가 raw/normalized 원문과 일치한다.
- 파일럿 manifest는 계속 정확히 10개이며 다섯 도메인을 포함한다.
- 신규 카드 3개가 승인되고 policy-memory input에서 홀드아웃 없이 로드된다.
- 지원 사건 2개와 대조 사건 1개로 구조화 성찰이 최소 1개 승인된다.
- medium/high deployable policy가 최소 1개 승인된다.
- 성공한 경우에만 새 불변 메모리 릴리스를 활성화한다.
- 기존 테스트, Evaluation v3 테스트, 타입 검사, 프로덕션 빌드가 통과한다.

## 11. 비범위

- 추가 웹 검색 또는 URL 수집
- LinkedIn 데이터 수집
- Main Prompt 수정
- Evaluation v3 질문 또는 정답 변경
- 홀드아웃 해제
- RAG 검색 알고리즘 변경
- XY 수치 점수 또는 통계 모델 도입
- 세 사건만으로 Amy Hood의 전체 의사결정 체계를 복제했다는 주장
