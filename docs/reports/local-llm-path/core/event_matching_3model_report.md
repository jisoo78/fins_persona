# Amy Hood Event Matching 3-Model Evaluation Report

Date: 2026-07-20

## 평가 목적

실제 의사결정 사건을 기준 데이터베이스로 두고, 가상 의사결정 사건을 제시했을 때 페르소나가 가장 유사한 실제 사건을 찾아 의사결정 기준을 전이하는지 평가했다.

기존 객관식 평가는 보기 안에서 정답을 고르는 방식이었다. 이번 평가는 모델이 스스로 과거 사건을 불러오고, 그 사건의 판단 기준을 새로운 상황에 적용하는지 확인하는 주관식 평가다.

## 평가셋

- 평가셋: `amy_hood_event_matching_evaluation`
- 버전: `0.1.0`
- 실제 사건: 6개
- 가상 사건 문항: 8개
- 문항 형식: 주관식 Event Matching

실제 사건:

- Nokia Devices and Services acquisition, 2013
- Mojang and Minecraft acquisition, 2014
- LinkedIn acquisition, 2016
- GitHub acquisition, 2018
- Nuance acquisition, 2021
- Activision Blizzard acquisition, 2022

## 실행 기록

| 모델 | 실행 ID | 상태 | 문항 수 | 리포트 |
|---|---|---|---:|---|
| Gemma 4 12B | 8818c57f-4978-4ae3-b9c4-10828529aee3 | complete | 8/8 | docs/event_matching_report_8818c57f.md |
| Gemma 4 E4B | b5fdd0b8-2226-4617-80e8-1258af674df8 | complete | 8/8 | docs/event_matching_report_b5fdd0b8.md |
| Phi-4-mini | 7e0fd7cf-c785-453c-9838-809f69410cdd | complete | 8/8 | docs/event_matching_report_7e0fd7cf.md |

## 채점 기준

각 문항 10점 만점이다.

- 유사 실제 사건 선택: 0~2점
- 의사결정 기준 유사도: 0~2점
- 근거 사용: 0~2점
- 추측 억제: 0~2점
- 최종 권고 명확성: 0~2점

## 1차 수동 채점

| 문항 | 기대 사건 | Gemma 4 12B | Gemma 4 E4B | Phi-4-mini | 주요 관찰 |
|---|---|---:|---:|---:|---|
| EM1 | GitHub | 10 | 9 | 10 | 세 모델 모두 GitHub를 정확히 선택했다. E4B는 결론이 승인으로 다소 강했다. |
| EM2 | Nuance | 9 | 8 | 9 | 세 모델 모두 Nuance를 골랐다. 일부 모델은 HIPAA, MRR/ARR 등 데이터베이스에 없는 세부 지표를 확인 필요로 추가했다. |
| EM3 | Activision | 10 | 9 | 8 | 모두 Activision을 골랐다. Phi는 일부 표현 오류와 직접 발언 관련 문구가 불안정했다. |
| EM4 | LinkedIn | 10 | 10 | 8 | 12B와 E4B는 member-first, debt financing, EPS 영향을 잘 분리했다. Phi는 12~24개월 등 추가 기간을 만들었다. |
| EM5 | Mojang | 10 | 9 | 10 | 모두 Mojang/Minecraft를 골랐다. 커뮤니티 신뢰와 cross-platform 기준은 잘 복원했다. |
| EM6 | Nokia | 10 | 10 | 9 | 모두 Nokia를 골랐다. Phi는 사후 손상 정보를 활용했다는 점을 명시했지만 판단 근거 분리가 약간 아쉬웠다. |
| EM7 | GitHub + Nuance | 8 | 8 | 8 | 세 모델 모두 GitHub는 골랐지만 Nuance를 보조 사건으로 함께 비교하지 못했다. |
| EM8 | LinkedIn + GitHub | 10 | 10 | 8 | 12B와 E4B는 복수 사건 비교가 좋았다. Phi는 1~3년 등 추가 기간을 만들었다. |

## 총점

| 순위 | 모델 | 점수 | 해석 |
|---:|---|---:|---|
| 1 | Gemma 4 12B | 77/80 | 실제 사건 매칭과 판단 기준 전이가 가장 안정적이었다. |
| 2 | Gemma 4 E4B | 73/80 | 사건 매칭은 좋지만 일부 결론이 빠르게 승인 쪽으로 기울고, 확인 필요 항목에 추가 지표가 많았다. |
| 3 | Phi-4-mini | 70/80 | 사건 매칭은 대체로 맞지만 표현 오류와 근거 밖 기간·조건 생성이 더 자주 보였다. |

## 결론

Event Matching 평가는 의사결정 기준 복제 여부를 보기 위한 방식으로 유효하다.

세 모델 모두 단순 사실 검색은 잘했고, 8개 문항 중 대부분에서 기대 실제 사건을 정확히 불러왔다. 특히 GitHub, Nuance, Activision, LinkedIn, Mojang, Nokia 매칭은 전반적으로 안정적이었다.

다만 복수 사건을 함께 참고해야 하는 EM7에서는 세 모델 모두 약점을 보였다. AI 코딩 도구 사건은 GitHub의 개발자 생태계 기준과 Nuance의 AI/전문 도메인 인수 기준을 함께 봐야 했지만, 세 모델 모두 GitHub 중심으로만 답했다.

## 모델별 요약

Gemma 4 12B:

- 가장 안정적인 결과를 보였다.
- 실제 사건 선택이 정확하고, 재무 조건과 비재무 조건 분리가 좋았다.
- EM7처럼 복수 사건 비교가 필요한 문항에서는 보조 사건을 놓쳤다.

Gemma 4 E4B:

- 사건 매칭 자체는 안정적이었다.
- 다만 일부 문항에서 단계화보다 승인에 가까운 결론을 내거나, 확인 필요 항목에 데이터베이스 밖 지표를 더 많이 붙였다.
- 12B보다 추측 억제와 결론 균형이 약간 약했다.

Phi-4-mini:

- 핵심 사건 매칭은 대체로 성공했다.
- 다만 문장 안정성과 근거 통제에서 약점이 있었다.
- 일부 문항에서 데이터베이스에 없는 기간, 직접 발언 관련 어색한 표현, 추가 조건이 나타났다.

## 다음 작업

- Event Matching 문항 수를 8개에서 15~20개로 늘린다.
- 복수 사건 매칭 문항을 더 추가한다.
- 주관식 채점을 자동화하거나 LLM-as-Judge 채점 JSON을 별도로 만든다.
- Web UI에서 Event Matching 평가를 실행하고 결과를 확인할 수 있게 연결한다.
