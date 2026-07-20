# Amy Hood 최초 정책 메모리 릴리스 설계

## 1. 목적

승인된 `ai_cloud_capex` 성찰 한 개에서 근거 범위를 넘지 않는 조건부 CFO 정책을 Gemma 4로 다시 생성하고, Codex가 원문과 구조 검증 결과를 직접 대조해 정책 한 개를 승인한다. 승인된 정책·성찰·사건을 묶은 불변 구조화 메모리 릴리스를 생성하고 검증한다.

이번 작업의 목표는 Amy Hood의 전체 판단 체계를 일반화하는 것이 아니다. 공개자료에서 검증된 AI·클라우드 인프라 자원배분 정책 한 개를 Evaluation v3가 사용할 수 있는 형태로 만드는 PoC 체크포인트다.

## 2. 현재 상태

- 승인 성찰: `reflection-4b5f7915d30581a4` 한 개
- 도메인: `ai_cloud_capex`
- 지원 사건: FY23 AI capacity/OpEx pivot, FY24 demand-led capacity sourcing
- 대조 사건: FY22 broad cloud capacity/resource scaling
- 검증된 근거 span: 여섯 개
- 승인 정책: 0개
- 기존 정책 세 개: 모두 거절
- 활성 구조화 메모리 릴리스: 없음
- Evaluation v3: 정책 0개로 안전 정지

기존 정책은 validator의 구조 요건은 통과했지만 `recommendedAction`에 근거 span이 직접 뒷받침하지 않는 인재 재배치를 포함했다. 따라서 스키마 통과와 사람의 의미 검토를 별도 게이트로 유지해야 한다.

## 3. 정책 범위와 목표 표현

정책은 `ai_cloud_capex`에만 적용한다. 모든 플랫폼 전환이나 모든 Microsoft 투자에 대한 보편 규칙으로 확장하지 않는다.

목표 정책은 다음 의미를 넘지 않는다.

> AI 플랫폼 전환에서 고객 수요가 확인되고 인프라 병목이 존재하면 인프라 투자는 확대하되 운영비 성장은 제한한다. 외부 공급은 자체 용량의 구축 리드타임을 보완하는 수단으로만 사용한다.

허용되는 핵심 행동은 `scale_infrastructure_constrain_opex`다. 다음 표현은 직접 근거가 추가되지 않는 한 금지한다.

- 인재 또는 인력의 전략적 재배치
- 특정 마진 수준의 보장
- 구조조정, 감원 또는 조직 재설계
- AI 이외 영역에서의 투자 축소
- 공개 근거에 없는 ROI, 회수기간 또는 수치 임계값

## 4. Master Prompt 검수와 버전 정책

### 4.1 현재 생성 과정

Master Prompt는 처음 만들 때만 동적으로 생성된다.

1. 선택된 공개자료 18개를 청크로 나눈다.
2. Gemma 4가 자료별 판단 기준, 우선순위, 트레이드오프, 위험 신호를 분석한다.
3. 자료별 핵심 신호를 최대 두 개로 압축한다.
4. 압축 분석과 `amy-hood-master-prompt.md` 생성 템플릿을 Gemma 4에 전달한다.
5. 필수 Markdown 섹션과 금지 조건을 검증한다.
6. 생성 결과를 불변 prompt version으로 저장하고 한 버전을 활성화한다.

런타임과 Evaluation v3에서는 Master Prompt를 다시 생성하지 않는다. `prompt-versions.json`의 활성 version ID와 SHA-256을 읽고, 평가 실행 생성 시 해당 버전을 고정한다. 반복 실행마다 원문 청크를 다시 주입하지 않는다.

### 4.2 이번 검수 범위

현재 작업공간의 활성 v2는 `0503f475-50a3-45ad-a5e8-f5a2d5575861`이며 SHA-256은 `c3cf7538494879188a69dbc2eb5a7579deda19e3a65fb4deea4407029bb56e30`이다. 이 내용은 아직 로컬 사용자 변경 상태이므로 구현 시 다른 변경과 섞지 않고 정확한 바이트와 해시를 확인해 별도 버전으로 보존한다.

v2를 기반으로 다음 두 문장만 의미상 보정한 새 버전을 만든다.

1. 근거의 범위를 `retrieved text`에서 `retrieved evidence or approved structured memory`로 확장한다.
2. Evaluation v3처럼 호출자가 명시적인 JSON 출력 스키마를 제공하면 그 스키마가 일반 응답 형식보다 우선한다고 명시한다.

구체적인 AI 투자 정책은 Master Prompt에 넣지 않는다. Master Prompt는 증거 사용, 조건부 전이, 반대 근거, 불확실성 처리와 출력 규율만 제어한다. 조건·우선순위·예외·반전 신호는 구조화 정책 메모리가 담당한다.

새 Master Prompt는 기존 버전을 덮어쓰지 않고 새 version ID와 SHA-256으로 저장한 뒤 활성화한다. Evaluation v3 실행은 활성화된 정확한 버전을 다시 pin한다.

## 5. 정책 유도 프롬프트 보강

정책 유도 프롬프트는 Master Prompt와 독립된 시스템 프롬프트다. 입력은 승인 성찰, 승인 사건, exact evidence span과 직접 정책 근거이며, 출력은 구조화 JSON 정책이다.

현재 프롬프트는 support action 제한, 대조 조건 보존, 기준 중심 priority order, 관찰 가능한 reversal signal을 이미 요구한다. 여기에 다음 금지 규칙을 최소 추가한다.

> `recommendedAction`의 모든 행동은 승인 성찰의 `supportPattern.action` 또는 인용된 support evidence가 명시한 실행 전술에 대응해야 한다. 관찰·invariant에만 등장하는 인재 재배치, 조직 재설계 또는 기타 실행 행동은 exact support span이 직접 뒷받침하지 않으면 포함하지 않는다.

이 보강은 특정 정답 문장을 프롬프트에 주입하지 않는다. 모델이 성찰의 행동 경계 밖으로 나가지 못하게 하는 grounding constraint다.

## 6. 생성·검증·승인 흐름

1. Gemma 4 서버가 설정된 모델명과 16,384 context 조건으로 응답하는지 사전 확인한다.
2. 승인 성찰과 현재 policy-memory input graph의 해시를 기록한다.
3. 보강된 정책 유도 프롬프트로 Gemma 4를 호출한다.
4. JSON 파싱 실패 시 기존 규칙대로 오류를 포함해 한 번만 재시도한다.
5. 생성 결과에 기존 `validatePolicyMemory`를 적용한다.
6. 통과 후보가 여러 개면 가장 좁고 근거가 적게 확장된 후보 한 개만 검토한다.
7. Codex가 아래 의미 검토표를 직접 확인한다.
8. 모든 항목이 통과한 정책 한 개만 개별 승인한다. `--all-passing`으로 일괄 승인하지 않는다.
9. 승인 rationale에 지원 사건, 대조 사건, 허용 행동, 제외한 과잉 추론을 기록한다.
10. gate report를 다시 생성해 승인 정책이 정확히 한 개 이상인지 확인한다.

### Codex 의미 검토표

- 정책 도메인이 승인 성찰과 같은가
- 적용 조건이 두 지원 사건의 실제 조건 안에 있는가
- 권고 행동이 `scale_infrastructure_constrain_opex`를 넘지 않는가
- 외부 공급이 리드타임 보완 전술로만 표현됐는가
- FY22 대조 조건이 부정·반전되지 않고 비적용 조건으로 보존됐는가
- priority order가 행동명이 아닌 판단 기준 순서인가
- reversal signal이 관찰 가능하고 적용 조건의 약화를 나타내는가
- 여섯 evidence ID가 인용된 사건에 속하고 holdout이 아닌가
- 인재 재배치, 마진 보장 또는 사후 성공 결과가 들어가지 않았는가

## 7. 구조화 메모리 릴리스

승인 정책이 생긴 후 기존 `buildMemoryRelease` 경로를 사용한다. 릴리스에는 다음이 포함된다.

- 승인 정책
- 승인 성찰
- 지원·대조 사건
- 검토된 반례
- review ledger
- Evaluation v3용 구조화 context
- 입력·산출물 SHA-256과 manifest

릴리스는 임시 staging 디렉터리에서 완성한 뒤 모든 해시, review ledger, context 구조, 홀드아웃 차단을 검증하고 최종 불변 디렉터리로 승격한다. 같은 입력이면 기존 릴리스를 재사용한다.

이번 범위에서는 검증된 릴리스를 생성하지만 `active.json`은 변경하지 않는다. 활성화는 실제 4개 실험군 평가 직전에 별도 체크포인트로 수행한다. 생성 실패가 기존 활성 포인터에 영향을 주어서는 안 된다.

## 8. 오류 처리와 안전 정지

- Gemma 4 서버 연결 실패: 정책 파일을 쓰지 않고 중단
- 두 번 모두 JSON 파싱 실패: model run 실패 기록만 남기고 중단
- validator 실패: proposal을 review-required로 유지하고 승인하지 않음
- 의미 검토 실패: 명시적 이유와 함께 거절하고 릴리스 생성 금지
- Master Prompt v2 해시 불일치: 새 버전을 만들지 않고 사용자 변경 확인
- Master Prompt 새 버전 검증 실패: 기존 활성 버전 유지
- holdout ID, alias, source 또는 text 누출: 정책 또는 릴리스 단계에서 즉시 중단
- 릴리스 staging 쓰기·검증 실패: staging을 제거하고 부분 릴리스 금지
- 승인 정책 0개: Evaluation v3 차단 상태 유지

PoC 마감이 가까워도 실패한 정책을 수동으로 통과시키거나 validator를 완화하지 않는다.

## 9. 테스트 계획

### Happy Path

- 보강된 프롬프트로 생성한 근거 제한 정책이 medium confidence의 deployable policy로 검증되고, Codex 승인 후 정책·성찰·사건을 포함한 불변 릴리스가 생성된다.

### Edge Cases

1. Gemma 4가 여러 통과 정책을 반환해도 가장 좁은 정책 한 개만 개별 승인한다.
2. 외부 공급 표현이 별도 원칙이 아니라 용량 구축 리드타임을 보완하는 실행 전술이면 통과한다.
3. 동일한 승인 입력으로 릴리스를 다시 생성하면 새 버전을 만들지 않고 기존 검증 릴리스를 반환한다.

### Failure Paths

- 인재 재배치나 마진 보장을 권고 행동에 추가한 정책은 구조 통과 여부와 무관하게 거절한다.
- FY22 대조 조건을 부정하거나 뒤집은 비적용 조건은 거절한다.
- 지원 사건 또는 evidence ID가 성찰 범위를 넘으면 validator가 승인 전에 차단한다.
- Master Prompt active version과 실제 파일의 해시가 다르면 자동으로 덮어쓰지 않는다.
- holdout 참조나 text leakage가 있으면 릴리스 승격 전에 실패한다.
- 저장 실패 시 승인 원장, 정책 디렉터리 또는 릴리스 중 일부만 변경되지 않는다.

## 10. 완료 기준

- 현재 활성 Master Prompt v2의 바이트와 SHA-256을 보존한다.
- 두 가지 검수 보정만 포함한 새 Master Prompt 버전이 생성·검증·활성화된다.
- 정책 유도 프롬프트에 행동 grounding constraint가 추가된다.
- Gemma 4가 새 정책 후보를 생성하고 model run 이력이 남는다.
- 정책 한 개 이상이 validator와 Codex 의미 검토를 모두 통과한다.
- 정책은 `ai_cloud_capex`, medium 이상, `deployable_policy`, approved 상태다.
- gate report의 `safeStop`에서 memory release 차단이 해제된다.
- 불변 구조화 메모리 릴리스가 생성되고 재검증된다.
- 활성 메모리 릴리스 포인터는 이번 범위에서 변경하지 않는다.
- 정책 메모리·Evaluation v3 회귀 테스트, 타입 검사와 프로덕션 빌드가 통과한다.

## 11. 비범위

- 추가 웹 검색 또는 원천자료 수집
- 다른 도메인의 정책 생성
- 기존 거절 정책의 승인 상태 변경
- validator 또는 홀드아웃 게이트 완화
- Evaluation v3 문항·정답 변경
- 4개 실험군 실제 실행
- 구조화 메모리 릴리스 활성화
- Amy Hood의 전체 의사결정 복제를 완료했다는 주장

