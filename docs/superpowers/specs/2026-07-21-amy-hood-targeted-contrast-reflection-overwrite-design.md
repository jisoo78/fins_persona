# Amy Hood 표적 반대 사건 승인 및 대조형 Reflection 덮어쓰기 설계

## 목표

웹 조사로 확보한 세 반대 사건을 정식 사건 데이터로 추가하고, 현재 `documented_unavailable` 상태인 세 승인 Reflection을 동일 ID로 전면 재작성한다. 결과적으로 Advisor가 지지 조건뿐 아니라 기존 행동을 중단·반전할 조건과 대체 행동을 검색·주입할 수 있어야 한다.

## 확정된 결정

- 대상 영역은 `cost_efficiency`, `ai_cloud_capex`, `shareholder_return_risk` 세 개다.
- 사용자가 세 사건을 모두 반대 사건으로 승인했다.
- 사건은 기존 데이터에 신규 추가한다.
- Reflection은 새 ID를 만들지 않고 다음 기존 ID의 내용을 덮어쓴다.
  - `reflection-bd563b486d9d6f9b`: 비용 효율
  - `reflection-f75c6c30eef7c1e0`: AI·클라우드 CapEx
  - `reflection-7371bfa747efb778`: 주주환원
- 기존 지지 사건과 근거는 보존한다.
- 신규 사건 근거의 품질 한계는 메타데이터에 남기되, 사용자 승인에 따라 대조 사건 게이트는 통과시킨다.

## 데이터 흐름

1. 표적 웹 인벤토리의 세 후보를 정식 `event-candidates.json` 스키마로 변환한다.
2. 출처를 `source-registry.json`에 중복 없이 등록하고, 사건별 근거 span과 승인 event card를 생성한다.
3. 세 기존 Reflection의 `contrastPattern`, `conditionDelta`, `actionDelta`, `contrastingEventIds`를 실제 사건으로 채운다.
4. Reflection review 기록은 동일 ID에 대해 사용자 승인과 근거 한계를 함께 기록한다.
5. 연결된 세 Policy의 반전 조건, 예외, `reversalAction` 또는 동등한 행동 필드, `contrastingEventIds`를 갱신한다.
6. 새 구조화 메모리 릴리스를 생성하고 활성화한 뒤 검색 인덱스를 재생성한다.

## 사건과 판단 축 매핑

### 비용 효율

- 지지 행동: 우선순위가 낮거나 생산성이 낮은 자원을 감축·재배치한다.
- 반대 행동: 검증된 고성장·차별화 기회에는 인력과 운영비를 확대한다.
- 핵심 경계: 비용 총액이 아니라 고객 가치, 성장성, 차별성, 투자 실행 결과다.
- 신규 반대 사건 ID: `event-priority-reinvestment-fy2022`.

### AI·클라우드 CapEx

- 지지 행동: 수요와 용량 부족이 확인되면 인프라를 확대하며 운영비 증가를 통제한다.
- 반대 행동: 지역별 수요·채택·경제성이 약해지면 초기 단계 프로젝트부터 늦추거나 보류한다.
- 핵심 경계: 전체 AI 전략을 철회하지 않고 가역성이 높은 장기 자산의 시점과 위치를 조정한다.
- 신규 반대 사건 ID: `event-ai-datacenter-project-pacing-2025`.

### 주주환원

- 지지 행동: 명시적 한도 안에서 배당과 자사주 매입을 수행한다.
- 반대 행동: 더 높은 장기 성장 투자 또는 자본 유연성 필요가 커지면 자사주 매입 집행을 줄인다.
- 핵심 경계: 배당은 장기 약속으로 취급하되 자사주 매입은 기회적·가변적 수단으로 취급한다.
- 신규 반대 사건 ID: `event-buyback-deployment-slowdown-fy2023`.

## Reflection 덮어쓰기 규칙

세 Reflection은 ID와 domain을 유지하고 나머지 판단 내용을 실제 대조에 맞게 재작성한다.

- `decisionAxis.choiceSet`에는 서로 다른 두 실제 행동을 둔다.
- `supportPattern`은 기존 승인 사건과 근거를 그대로 유지한다.
- `contrastPattern`에는 신규 승인 사건, 조건, 행동, 근거 ID를 둔다.
- `conditionDelta`는 두 조건의 차이를 관측 가능한 변수로 설명한다.
- `actionDelta`는 지원 행동에서 반대 행동으로 어떻게 바뀌는지 명시한다.
- `contrastStatus`는 실제 대조가 존재한다는 상태로 변경하거나 제거한다.
- 출처의 인과 한계는 `unresolvedConflicts`에 기록한다.

## Policy 동기화

연결된 Policy ID는 유지한다.

- 비용 효율: `policy-20d2c645ab6641c9`
- AI·클라우드 CapEx: `policy-e7eafcda9e4dc2e3`
- 주주환원: `policy-a7972af407a0bf69`

각 Policy는 신규 `contrastingEventIds`를 참조하고, 반전 신호가 발생했을 때 취할 대체 행동을 명시한다. 기존 `recommendedAction`은 지지 조건에서의 기본 행동으로 유지한다.

## 오류 및 안전 규칙

- 기존 후보·출처와 canonical URL이 중복되면 새 레코드를 만들지 않는다.
- 신규 근거가 holdout 목록과 충돌하면 릴리스 생성을 중단한다.
- 세 Reflection 중 하나라도 빈 `contrastPattern` 또는 빈 `contrastingEventIds`를 가지면 릴리스를 활성화하지 않는다.
- Policy가 Reflection과 다른 반대 사건을 참조하면 검증 실패로 처리한다.
- 릴리스 또는 인덱스 생성 실패 시 현재 활성 포인터는 변경하지 않는다.

## 테스트 설계

### Happy Path

- 세 신규 사건이 승인되고 기존 세 Reflection ID가 실제 대조 사건을 포함하며, Policy와 릴리스까지 동일 참조로 동기화된다.

### Edge Cases

1. 동일 canonical URL이 이미 출처 레지스트리에 존재하면 중복 등록하지 않는다.
2. 기존 Reflection의 지지 사건과 근거는 덮어쓰기 후에도 보존한다.
3. 직접 Amy 발언이 부족한 승인 사건은 대조 사건으로 사용하되 `unresolvedConflicts`와 출처 품질 메타데이터를 잃지 않는다.

### Failure Paths

- 반대 사건 ID 또는 근거 ID가 존재하지 않으면 검증과 릴리스 생성을 실패시킨다.
- Policy·Reflection의 대조 사건 참조가 불일치하면 활성화를 차단한다.
- holdout 오염이 탐지되면 기존 활성 릴리스와 인덱스를 유지한다.

## 완료 조건

- 세 신규 사건이 정식 승인 데이터에 존재한다.
- 기존 세 Reflection ID가 실제 `contrastPattern`과 `contrastingEventIds`를 갖는다.
- 세 Policy에 조건부 반전 행동과 동일한 대조 사건 참조가 존재한다.
- 관련 자동 테스트, 메모리 무결성 검사, holdout 검사가 통과한다.
- 새 메모리 릴리스와 검색 인덱스가 생성·활성화된다.
