# Amy Hood Main Prompt RAG Evaluation Result

## 목적

상대방이 작성한 Amy Hood Main System Prompt를 RAG 답변 생성에 주입하고, 기존 15문항 평가셋으로 동일 평가를 수행했다.

기존 baseline은 짧은 RAG 검증용 프롬프트와 deterministic fallback 생성에 가까웠다.
이번 실험은 긴 Main Prompt를 주입하고 로컬 LLM(Gemma4 12B GGUF, llama.cpp)을 통해 직접 답변을 생성했다.

## 사용한 프롬프트

- 당시 실험 파일: `agent_prompts/prompts/amy-hood-main-system-prompt.md`
- 현재 런타임 원본: `data/b-track/amy-hood/prompt-versions.json`이 가리키는 활성 불변 버전
- 현재 평가기는 정적 경로 대신 활성 `prompt_version_id`와 `prompt_hash`를 결과에 기록함
- 핵심 변화:
  - Amy Hood 1인칭 페르소나
  - 장기 관점, 플랫폼 리더십, 고객 가치 강조
  - 성장 vs 마진, 단기 vs 장기 판단 규칙 포함
  - 모르는 정보는 추측하지 않는 Unknown Policy 포함
  - RAG 근거 충실도는 명시적으로 강하게 요구하지 않음

이 문서와 당시 실험 파일은 기준선 재현 자료로 보존한다. 새 실행에서 별도 정적 Prompt 파일을 런타임 원본으로 사용하지 않는다.

## 생성/채점 파일

- 응답 결과: `evaluation/amy_hood_decision_similarity_main_prompt_answers.lock.json`
- 채점 결과: `evaluation/amy_hood_decision_similarity_main_prompt_scored.json`
- 점수표: `evaluation/amy_hood_decision_similarity_main_prompt_scorecard.csv`

비교 기준 baseline:

- 응답 결과: `evaluation/amy_hood_decision_similarity_general_rag_answers.lock.json`
- 채점 결과: `evaluation/amy_hood_decision_similarity_scored.json`
- 점수표: `evaluation/amy_hood_decision_similarity_scorecard.csv`

## 점수 비교

| 구분 | 점수 | 비율 |
|---|---:|---:|
| 기존 RAG baseline | 39 / 39 | 100% |
| Main Prompt 주입 | 12.3 / 39 | 31.5% |

KPI별 Main Prompt 주입 결과:

| KPI | 점수 | 비율 |
|---|---:|---:|
| 과거 기억 복원 | 4.4 / 8 | 55% |
| 미래 예측 | 3 / 8 | 37.5% |
| 의사결정 유사도 | 4.9 / 23 | 21.3% |

## 문항별 결과

객관식 9문항은 모두 정답과 일치했다.

- `mc_01_cloud_capex_margin`: B 정답
- `mc_02_free_cash_flow`: C 정답
- `mc_03_guidance_variables`: A 정답
- `mc_04_github_go_no_go`: B 정답
- `mc_05_github_independence`: B 정답
- `mc_06_monetization_path`: B 정답
- `mc_07_expense_discipline`: C 정답
- `mc_08_investor_tone`: B 정답
- `mc_09_unknown_threshold`: C 정답

주관식 6문항은 fallback 키워드 채점 기준에서 낮게 나왔다.

- `subj_01_cloud_margin_bridge`: 1.4 / 5
- `subj_02_github_recommendation`: 0 / 5
- `subj_03_acquisition_redline`: 0 / 5
- `subj_04_guidance_tone`: 0.6 / 5
- `subj_05_persona_rules`: 1.3 / 5
- `subj_06_missing_data_behavior`: 0 / 5

## 답변 변화

기존 baseline은 정답지와 평가 기준에 맞춘 짧고 구조적인 답변을 생성했다.
Main Prompt 주입 버전은 Amy Hood처럼 1인칭으로 말하고, 장기 플랫폼/고객 가치/운영 효율 관점의 조언형 답변을 생성했다.

예시 1. GitHub 인수 결론

질문:

`Amy Hood 페르소나라면 GitHub 인수에 대해 어떤 결론과 조건을 제시할지 작성하라.`

Main Prompt 주입 답변 요지:

`GitHub은 개발자 SaaS 영역에서 성장 기회로 보고 계속 투자할 영역이다. 다만 인프라 활용도와 운영 비용 배치, GitHub Copilot의 수익화 가능성, 플랫폼 리더십과 운영 효율성을 함께 확인해야 한다.`

해석:

프롬프트의 장기 플랫폼/고객 가치 관점은 잘 반영됐다.
다만 평가 정답에서 요구한 GitHub 인수 조건, 커뮤니티 신뢰, 독립성, 가격 부담, 통합 리스크 같은 키워드가 충분히 직접적으로 들어가지 않아 fallback 채점 점수는 낮게 나왔다.

예시 2. 커뮤니티 기반 회사 인수 레드라인

질문:

`커뮤니티 기반 회사를 인수할 때 Amy Hood식 레드라인을 작성하라.`

Main Prompt 주입 답변 요지:

`커뮤니티 가치와 미션이 맞지 않으면 인수하지 않는다. IP와 데이터 권리, 커뮤니티 거버넌스와 문화 존중, 장기 플랫폼 가치와 고객 영향이 중요하다.`

해석:

답변 자체는 커뮤니티 기반 인수에 대한 판단 기준을 제시했다.
하지만 Microsoft/Amy Hood 공개 근거와 직접 연결된 표현보다 일반적인 M&A 원칙에 가까워졌다.

예시 3. 2017-2019 GitHub 데이터 누락 시 답변

질문:

`2017~2019년 GitHub 인수 관련 데이터가 누락된 상태에서 Amy Hood 페르소나는 어떻게 답해야 하는가?`

Main Prompt 주입 답변 요지:

`2017-2019 GitHub 인수 데이터는 가지고 있지 않다. 대신 장기 인프라와 플랫폼 리더십, 단기 마진보다 장기 가치 창출을 우선하는 투자 철학을 설명할 수 있다.`

해석:

Unknown Policy는 잘 지켰다.
다만 기존 정답 기준이 요구한 "누락된 데이터는 확인 필요로 표시하고, 직접 근거와 추정 원칙을 분리한다"는 표현이 충분히 매칭되지 않아 점수는 낮게 나왔다.

## 결론

Main Prompt를 주입하자 답변 스타일은 확실히 달라졌다.

- 기존 baseline: 평가 정답에 맞춘 구조적/근거 중심 답변
- Main Prompt 주입: 1인칭 Amy Hood 페르소나, 장기 전략, 플랫폼 리더십 중심 답변

객관식은 9문항 모두 정답을 맞췄기 때문에 큰 판단 방향은 유지됐다.
하지만 주관식에서는 RAG 근거 충실도와 평가용 must_include 키워드가 약해져 점수가 크게 하락했다.

따라서 이 프롬프트를 실제 RAG 평가에 쓰려면 다음 보강이 필요하다.

1. Main Prompt에 RAG 근거 우선 규칙을 명시한다.
2. 답변 시 검색 근거에서 확인된 내용과 추론을 구분하게 한다.
3. 평가 질문의 주관식 정답 기준과 프롬프트의 표현 방식을 맞춘다.
4. fallback 키워드 채점 대신 LLM-as-Judge를 안정적으로 돌려 의미 유사도 기준으로 평가한다.

## 보고용 요약

상대방이 준 Main Prompt를 주입해서 동일 15문항 평가를 다시 돌렸다.
객관식은 9문항 모두 정답으로 유지됐지만, 주관식은 fallback 키워드 채점 기준에서 낮게 나와 총점이 39/39에서 12.3/39로 떨어졌다.
답변은 더 Amy Hood다운 1인칭 조언형으로 바뀌었지만, RAG 근거 충실도와 평가 정답 키워드 매칭은 약해졌다.
따라서 Main Prompt에 RAG 근거 우선 규칙을 추가하고, 주관식 평가는 LLM-as-Judge로 보는 방향이 필요하다.
