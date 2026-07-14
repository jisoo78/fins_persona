# Pre-merge RAG Baseline - 2026-07-14

## 목적

Main 병합 전 현재 RAG 평가 파이프라인의 기준 결과를 고정한다.
병합 이후 새 시스템 프롬프트와 새 평가 질문지가 들어오면 같은 방식으로 다시 평가해 차이를 비교한다.

## 현재 구성

- 대상: Amy Hood CFO persona
- 방식: 일반 RAG
- 검색: bge-m3 vector retrieval
- 재정렬: Cohere reranker
- 생성/평가 기준: Amy Hood decision similarity 평가셋 15문항
- 로컬 LLM 설정: llama.cpp OpenAI-compatible server

## 생성한 기준 파일

- `evaluation/amy_hood_decision_similarity_general_rag_answers.lock.json`
  - 기존 15문항 기준 RAG 응답 결과
- `evaluation/amy_hood_decision_similarity_scored.json`
  - 정답지 기준 채점 결과
- `evaluation/amy_hood_decision_similarity_scorecard.csv`
  - 공유/노션 정리용 점수표
- `evaluation/amy_hood_hard_eval_full_vs_holdout_summary.json`
  - 2017-2019 포함/미포함 근거 비교 요약

## 현재 점수

- 총 15문항
- 객관식 9문항
- 주관식 6문항
- 총점: 39 / 39
- 점수율: 100%

KPI별 결과:

- 과거 기억 복원: 8 / 8
- 미래 예측: 8 / 8
- 의사결정 유사도: 23 / 23

## 2017-2019 포함/미포함 비교

GitHub 인수 판단 중심 어려운 평가셋 15문항 기준으로 비교했다.

- 2017-2019 포함 데이터: 문서 1843개, 청크 3009개
- 2017-2019 제외 데이터: 문서 1448개, 청크 2377개
- 차이: 문서 395개, 청크 632개
- 상위 근거가 바뀐 문항: 15문항 중 6문항

상위 근거가 바뀐 대표 문항:

- 사업부 가이던스 판단
  - 포함: `fy2017_q3.json`
  - 미포함: `fy2024_q3.json`
- 인수 통합 리스크 판단
  - 포함: `fy2018_q4.json`
  - 미포함: `fy2024_q4.json`
- GitHub 인수 승인 여부
  - 포함: `fy2019_q1.json`
  - 미포함: `fy2020_q3.json`
- GitHub 독립성/커뮤니티 신뢰 리스크
  - 포함: `fy2019_q1.json`
  - 미포함: `fy2020_q3.json`
- GitHub 인수 가격과 회수 논리
  - 포함: `fy2019_q1.json`
  - 미포함: `fy2013_q4.json`
- GitHub 최종 승인/보류/거절 판단
  - 포함: `fy2018_q4.json`
  - 미포함: `fy2023_q2.json`

해석:

2017-2019 데이터가 있으면 GitHub/LinkedIn 인수 시기의 직접 근거를 사용한다.
해당 기간을 제외하면 이후 연도나 과거 유사 사례를 대체 근거로 사용한다.
따라서 답변 방향은 비슷해도 근거의 직접성은 달라진다.

## 확인한 한계

현재 39/39 결과는 정답지가 있는 폐쇄형 평가셋 기준이다.
외부 질문이나 새 프롬프트가 들어왔을 때의 일반화 성능은 병합 후 다시 확인해야 한다.

LLM-as-Judge도 실행을 시도했지만 로컬 12B 모델 채점이 장시간 지연되어 이번 기준선에서는 fallback 채점 결과를 사용했다.
LLM Judge는 별도 최적화 후 다시 실행하는 것이 좋다.

## 병합 후 할 일

1. Main에서 새 시스템 프롬프트와 평가 질문지를 pull 받는다.
2. 같은 RAG 파이프라인으로 응답을 다시 생성한다.
3. 같은 채점 기준으로 JSON/CSV 결과를 다시 만든다.
4. 병합 전 baseline과 병합 후 결과를 비교한다.
5. 점수 변화와 실패 문항을 정리한다.
