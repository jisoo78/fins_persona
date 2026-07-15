# Phase 6: Amy Hood Decision Advisor 평가

## 목표

Evaluation v3는 Amy Hood Decision Advisor의 판단 정책이 일반적인 CFO 상식보다 실제로 더 높은 설명력을 갖는지 확인하는 PoC 벤치마크다. 30개 문항을 모두 4지선다형으로 고정하고, 같은 Gemma 4 모델에 Prompt와 RAG 조건만 바꾼 네 실험군을 비교한다.

기존 15문항 Evaluation v2는 삭제하거나 변환하지 않는다. Web UI의 `Evaluation V2` 선택으로 과거 실행과 주관식 채점 기록을 계속 확인할 수 있다. 새 화면의 기본값은 `Evaluation V3`다.

## Evaluation v3 구성

| 범주 | ID | 문항 수 | 측정 대상 |
| --- | --- | ---: | --- |
| Amy 판단 판별 | D01-D10 | 10 | 일반 CFO 답과 Amy Hood식 판단 순서의 미세한 차이 |
| 역사적 홀드아웃 | H01-H10 | 10 | 사후 결과를 보지 않고 당시 조건에서 내릴 판단 |
| 반사실 쌍 | C01A-C03B | 6 | 핵심 조건이 바뀌면 결론을 뒤집거나 유지하는 능력 |
| 신규 조언 전이 | T01-T04 | 4 | 보지 못한 경영 상황에 조건부 정책을 적용하는 능력 |

각 문항은 그럴듯한 선택지 네 개를 제공한다. 함정은 명백한 오답이 아니라 우선순위, 적용 시점, 경계 조건, 실행 순서 또는 반전 신호가 Amy Hood의 판단 정책과 미묘하게 다른 답으로 구성한다. 정답 선택은 문항당 1점이며 총점은 30점이다. 선택 이유는 점수를 바꾸지 않고 선택-이유 불일치 진단과 사람의 감사(audit)를 위해 보존한다.

## 네 실험군

| 실험군 | System Prompt | 구조화 메모리 |
| --- | --- | --- |
| `generic_cfo` | 일반 CFO Prompt | 없음 |
| `amy_prompt` | Amy Main Prompt | 없음 |
| `amy_policy_rag` | Amy Main Prompt | 정책만 |
| `amy_full_rag` | Amy Main Prompt | 정책 + 성찰 + 사건 + 검토된 반례 |

`1회 빠른 실험`은 4개 실행과 120번의 모델 호출을 만든다. `5회 정식 실험`은 20개 실행과 600번의 모델 호출을 만들며, 반복별 리프트와 선택 일치도 및 표준편차를 계산한다. 모든 실행은 `local` Gemma 4만 허용한다.

## 실행 전 필수 게이트

다음 두 조건을 모두 만족하기 전에는 Web UI와 API가 실험 생성을 차단한다.

1. Evaluation v3 30문항이 모두 사람에 의해 `approved` 상태여야 한다.
2. 하나의 활성 구조화 메모리 릴리스에 정책, 성찰, 사건 계층이 있어야 한다. 반례가 비어 있으면 릴리스에 `no_reviewed_counterexample` 표식이 명시되어야 한다.

따라서 `amy_policy_rag`와 `amy_full_rag`는 구조화 메모리 릴리스 없이 빈 컨텍스트로 실행되지 않는다. 두 실험군을 동일한 조건으로 잘못 비교하는 것보다 정직하게 중단하는 것이 정상 동작이다.

## 홀드아웃 안전 규칙

역사적 홀드아웃은 다음 네 사건으로 봉인한다.

- GitHub 인수 2018
- AI 데이터센터 투자 2025
- Microsoft 365 가격 인상 2021
- 자사주 매입 승인 2021

GitHub 사건은 이전 저장소 작업에서 노출된 적이 있으므로 깨끗한 미노출 표본으로 주장하지 않고 `known_prior_exposure`로 표시한다. 봉인된 후보·사건·자료·증거 ID와 별칭은 평가 문항 작성 및 채점에서만 사용할 수 있다. Main Prompt, 정책 추출, 메모리 릴리스, 런타임 RAG 인덱스에 들어가면 산출물을 쓰기 전에 실패한다.

생성 모델에는 공개 질문의 시나리오와 네 선택지만 전달한다. 정답, 정답 의도, 함정 의도, 함정 메커니즘, 홀드아웃 채점 메타데이터는 전달하지 않는다.

## Web UI 사용법

1. API 서버와 Web UI를 실행한다.

   ```bash
   npm run api
   npm run dev
   ```

2. B Track의 `평가 문항 검토`를 열고 기본 `Evaluation V3`에서 30문항을 검토한다.
3. 각 카드에서 네 선택지, 정답 의도, 오답별 함정 의도와 메커니즘을 확인한 뒤 `승인` 또는 `수정 필요`를 저장한다.
4. 30문항 승인과 구조화 메모리 준비가 끝나면 `평가 실행`에서 1회 또는 5회 실험을 시작한다.
5. 중단된 실행은 `재개`로 이어서 처리한다. 이미 완료된 답변은 다시 호출하지 않는다.
6. `평가 리포트`에서 네 실험군 점수, D/H/C/T 점수, 리프트, 선택 일치도, 불일치, 토큰, 지연, 실패 문항을 확인한다.
7. 일반 CFO의 첫 완료 실행이 80%를 초과하면 `benchmarkRejected`로 표시되므로 실제 모델 성능 주장 전에 문항 판별력을 다시 높인다.
8. 과거 15문항 실행이나 주관식 채점이 필요하면 각 화면 상단에서 `Evaluation V2`로 전환한다.

## API와 저장 위치

Evaluation v3 API는 기존 `/api/evaluation/*`와 분리된 `/api/evaluation/v3/*`를 사용한다.

- `evaluation/v3/public/questions.json`: 모델에 전달 가능한 30문항
- `evaluation/v3/public/reviews.json`: 사람의 검토 상태
- `evaluation/v3/sealed/answer-key.json`: 정답·함정 메타데이터
- `evaluation/v3/sealed/holdout-manifest.json`: 네 봉인 사건과 차단 ID
- `evaluation/v3/runs/<run-id>.json`: 원자적으로 저장되는 실행 기록

## 검증 명령

```bash
npm run evaluation:v3:test
npm run evaluation:test
npm run persona:test
npm run lint
npm run build
```

API smoke test에서는 모델 호출을 시작하지 않는다. `GET /api/evaluation/v3/questions`로 30문항과 30개 검토 기록을 확인하고, `repetitions: 2` 요청이 HTTP 400과 `evaluation v3 repetitions must be 1 or 5`를 반환하는지만 확인한다.

## 완료 기준

- 30개 4지선다형 문항과 D10/H10/C6/T4 분포가 고정되어 있다.
- 정답 위치 분포와 선택지 길이, 함정 메커니즘 품질 게이트를 통과한다.
- 네 홀드아웃 사건이 Main Prompt·정책·메모리·RAG 빌드 경로에서 fail-closed로 차단된다.
- 1회/5회 실험이 반복-실험군 순서로 4개/20개 실행을 만들고 재개할 수 있다.
- v3 리포트가 네 리프트, 반복 통계, 선택 일치도와 80% 변별력 거부 기준을 계산한다.
- 기존 Evaluation v2 실행·API·UI가 그대로 유지된다.
- 실제 Gemma 실험은 30문항 승인과 활성 구조화 메모리 릴리스 이후에만 시작한다.
