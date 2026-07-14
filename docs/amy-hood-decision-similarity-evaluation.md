# Amy Hood Decision Similarity Evaluation

## 목적

기존 평가는 2017~2019년 데이터 포함/제외에 따라 RAG가 어떤 근거문서를 먼저 찾는지 확인하는 검색 평가에 가까웠다.

이번 평가는 Amy Hood 페르소나가 실제 Amy Hood의 재무 의사결정 기준과 얼마나 유사하게 답하는지 확인하기 위한 정답 기반 평가다.

## 평가 구성

- 총 15문항
- 객관식 9문항
- 주관식 6문항
- KPI 3개
  - 과거 기억 복원
  - 미래 예측
  - 의사결정 유사도

## 채점 방식

객관식은 정답 option을 고정한다.

- 정답 일치: 1점
- 오답: 0점

주관식은 LLM-as-Judge 방식으로 채점한다.

- 기준 답변(reference_answer)
- 반드시 포함해야 할 요소(must_include)
- 0~5점 rubric

로컬 LLM이 없거나 judge 호출을 끈 상태에서는 must_include 포함 여부를 기준으로 보수적인 자동 점수를 계산한다.

LLM-as-Judge를 사용하려면 아래 값을 설정한다.

```env
AMY_HOOD_JUDGE_USE_LLM="true"
AMY_HOOD_JUDGE_TEMPERATURE="0"
```

이 설정은 기존 `LLM_PROVIDER`, `LOCAL_LLM_BASE_URL`, `LOCAL_LLM_MODEL` 또는 Gemini 설정을 사용한다.

## 응답 생성 방식

`npm run rag:evaluate:decision-similarity`는 기본적으로 빠른 deterministic RAG 답변 생성을 사용한다.

필요하면 `RAG_EVAL_USE_LLM=true npm run rag:evaluate:decision-similarity`로 LLM 직접 답변 생성을 켤 수 있다.

실행기는 `server/evaluation/decisionSimilarityBaseline.ts`로 격리되어 있으며, B Track Prompt 버전 저장소의 현재 활성 버전을 읽는다. 별도 정적 Prompt 경로 fallback은 사용하지 않는다.

기본 경로에서는 bge-m3와 Cohere reranker가 고른 근거를 바탕으로 Amy Hood식 판단 신호에 가까운 선택지를 고르고 답변을 생성한다.

- 객관식 답변은 `선택: B. ...` 형식으로 시작한다.
- 객관식 답변은 `selected_option_id`를 별도 필드로 저장하고 채점 시 이 값을 우선 사용한다.
- 주관식 답변은 질문에 바로 답하는 한 문단으로 작성한다.
- `RAG 검색 기준으로 보면` 같은 메타 설명은 쓰지 않는다.

## 산출 파일

- `evaluation/amy_hood_decision_similarity_answer_key_15.json`
  - 정답 포함 평가 질문지
- `evaluation/amy_hood_llm_judge_contract.json`
  - LLM-as-Judge 채점 계약
- `evaluation/amy_hood_decision_similarity_scored.json`
  - 일반 RAG 답변 채점 결과. `judge.mode`가 `llm_as_judge`이면 LLM Judge 결과다.
- `evaluation/amy_hood_decision_similarity_scorecard.csv`
  - 노션/스프레드시트 공유용 점수표

## 해석 기준

이 평가는 일반 RAG 기반 페르소나가 같은 질문, 같은 정답지, 같은 judge 기준에서 얼마나 Amy Hood의 판단 기준과 유사한지 확인하기 위한 기준선이다.

따라서 top evidence가 바뀌었는지보다, 최종 답변이 Amy Hood의 판단 기준과 얼마나 유사한지를 점수로 비교하는 데 초점을 둔다.
