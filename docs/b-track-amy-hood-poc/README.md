# B Track: Amy Hood CFO Persona PoC 실행 가이드

## 이 문서의 목적

B Track은 공개된 웹 자료를 이용해 특정 C-level 인물의 의사결정 방식을 재현하는 기능이다. 첫 번째 PoC 대상은 Microsoft CFO Amy Hood다.

이 가이드는 프로그래밍 경험이 많지 않아도 작업 순서와 완료 여부를 확인할 수 있도록 Phase별 To-Do List로 구성한다.

## A Track과 B Track의 차이

| 구분 | A Track | B Track |
| --- | --- | --- |
| 대상 | 서비스에 직접 답변하는 사용자 | 공개 인물 |
| 원재료 | 40문항 사전 질문과 심층 인터뷰 | 공개된 발언과 의사결정 사례 |
| 검증 방법 | 사용자 본인 확인 | 출처, 반복 관찰, 사람 검토 |
| PoC 대상 | 일반 CFO 사용자 | Amy Hood |
| 최종 결과 | 개인 Decision Persona | 공개 근거 기반 CFO Persona |

## 전체 진행 순서

| Phase | 목적 | 핵심 산출물 | 문서 |
| --- | --- | --- | --- |
| 1 | PoC의 범위와 안전한 표현을 확정한다 | PoC 범위 정의서 | [Phase 1](./phase-1-define-scope.md) |
| 2 | 조사할 공개자료의 목록을 만든다 | Source Inventory | [Phase 2](./phase-2-build-source-inventory.md) |
| 3 | 원문에서 판단 근거를 추출한다 | Evidence Dataset | [Phase 3](./phase-3-extract-evidence.md) |
| 4 | 근거를 실제 의사결정 사례로 묶는다 | Decision Case Set | [Phase 4](./phase-4-build-decision-cases.md) |
| 5 | 반복되는 판단 원칙을 도출하고 프롬프트를 만든다 | Amy Hood Persona Prompt | [Phase 5](./phase-5-create-persona-prompt.md) |
| 6 | 페르소나의 정확성과 한계를 평가한다 | Evaluation Report | [Phase 6](./phase-6-evaluate-persona.md) |
| 7 | 검증된 페르소나를 현재 앱에 연결한다 | B Track PoC 화면 | [Phase 7](./phase-7-integrate-prototype.md) |

## 진행 원칙

- 한 Phase를 완료한 뒤 다음 Phase로 넘어간다.
- Amy Hood의 직접 발언과 Codex가 해석한 내용을 구분한다.
- 자료가 많다는 이유만으로 사용하지 않는다. 실제 재무 판단을 보여주는 자료를 우선한다.
- Microsoft의 결정을 모두 Amy Hood 개인의 결정으로 기록하지 않는다.
- 출처가 없는 성격, 가치관, 사적 생각은 생성하지 않는다.
- PoC 화면에는 실제 Amy Hood 또는 Microsoft의 공식 서비스가 아니라는 점을 표시한다.
- 초기 PoC에서는 자동 수집 시스템보다 작고 검증 가능한 데이터셋을 먼저 만든다.

## 추천 작업 방식

각 Phase에서 Codex에게 한 번에 모든 작업을 맡기지 않는다. 다음 순서를 반복한다.

1. 이번 Phase 문서를 Codex에게 읽게 한다.
2. To-Do 중 한 항목만 요청한다.
3. 결과 파일을 사람이 확인한다.
4. 출처와 해석이 맞는지 검토한다.
5. 문제가 없으면 다음 항목을 진행한다.

## PoC 완료의 정의

다음 조건을 모두 만족하면 B Track의 첫 번째 PoC가 완료된 것이다.

- Amy Hood의 CFO 업무와 관련된 공개자료가 정리되어 있다.
- 주요 판단 원칙마다 확인 가능한 근거가 연결되어 있다.
- 근거가 부족한 질문에는 모른다고 답한다.
- 실제 Amy Hood인 것처럼 오인시키지 않는다.
- CFO 의사결정 시나리오에서 일관된 조언을 제공한다.
- 현재 앱에서 A Track과 B Track을 구분해 실행할 수 있다.

