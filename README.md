# FINS Persona — Amy Hood Decision Advisor

공개 근거에서 추출한 Amy Hood의 판단 정책과 구조화 메모리를 사용해 CFO 조언자를 구성하고, Prompt/RAG 조건별 행동 정합성을 평가하는 PoC입니다.

## 기본 실행

요구 사항:

- Node.js
- `npm install`로 설치된 의존성

Web UI와 API를 각각 실행합니다.

```bash
npm run dev
npm run api
```

## Evaluation v6 로컬 서비스

정식 평가는 다음 OpenAI 호환 로컬 서비스를 사용합니다.

| 역할 | 주소 | 현재 모델 |
|---|---|---|
| 응답 생성 Gemma 4 | `http://127.0.0.1:8080/v1` | `Gemma-4-E4B-Uncensored-HauhauCS-Aggressive-Q4_K_M.gguf` |
| 임베딩 BGE-M3 | `http://127.0.0.1:8081/v1` | `bge-m3-Q8_0.gguf` |
| 채점 Gemma 4 | `http://127.0.0.1:8082/v1` | `gemma4-v2-Q8_0.gguf` |

서비스 모델을 확인합니다.

```bash
for port in 8080 8081 8082; do
  curl --silent --show-error "http://127.0.0.1:${port}/v1/models" \
    | jq -c --arg port "$port" '{port:$port,models:[.data[].id]}'
done
```

## Evaluation v6 정식 실행

30개 시나리오 × 3개 실험군 × 5회 반복으로 450개 응답을 생성합니다. 이후 450개 개별 정체성 채점, 225개 행동 전환 채점, HTML 보고서 생성을 순서대로 수행합니다.

```bash
npm run evaluation:v6:formal -- \
  --candidate-base-url http://127.0.0.1:8080/v1 \
  --embedding-base-url http://127.0.0.1:8081/v1 \
  --judge-base-url http://127.0.0.1:8082/v1 \
  --html docs/reports/2026-07-22-amy-hood-evaluation-v6-formal.html
```

### 진행률 확인

활성 실험 그룹의 완료 응답 수, 실패 수, 완료 run 수를 확인합니다.

```bash
GROUP_ID=$(jq -r '.experimentGroupId' evaluation/v6/formal-run/active.json)

jq -s --arg g "$GROUP_ID" '
  {
    experimentGroupId: $g,
    completeAnswers: ([.[]
      | select(.experimentGroupId == $g)
      | .answers[]
      | select(.status == "complete")] | length),
    totalAnswers: 450,
    failedAnswers: ([.[]
      | select(.experimentGroupId == $g)
      | .answers[]
      | select(.status == "failed")] | length),
    completeRuns: ([.[]
      | select(.experimentGroupId == $g and .status == "complete")] | length),
    totalRuns: 15
  }
' evaluation/v6/runs/*.json
```

현재 파이프라인 단계와 완료된 채점 반복도 확인할 수 있습니다.

```bash
jq '{experimentGroupId, stage, completedRepetitions, identities}' \
  evaluation/v6/formal-run/active.json
```

단계는 다음 순서로 진행됩니다.

1. `created` — 15개 run 생성 및 450개 응답 생성 중
2. `answers_complete` — 450개 응답 완료
3. `individual_judging` — 반복별 90개 정체성 채점 진행 중
4. `individual_complete` — 450개 정체성 점수 활성화 완료
5. `pairs_complete` — 225개 행동 전환 채점 완료
6. `complete` — HTML 보고서 생성 완료

### 중단 후 재개

실행이 중단되면 위의 `evaluation:v6:formal` 명령을 그대로 다시 실행합니다. 별도 그룹 ID를 지정하지 않아도 `evaluation/v6/formal-run/active.json`의 활성 그룹을 불러옵니다.

특정 실험 그룹을 명시적으로 재개하려면 다음 옵션을 추가합니다.

```bash
--group 37b55f38-82e1-4bfd-a061-24369d0463b1
```

재개 시 다음 결과를 다시 생성하지 않습니다.

- 상태가 `complete`인 응답
- 반복별 로컬 Judge 초안에 저장된 채점 패킷
- pair Judge 초안에 저장된 행동 전환 채점 패킷

모델 ID, Prompt hash, 평가 bundle hash, 메모리 index hash 또는 패킷 hash가 변경되면 서로 다른 결과를 섞지 않고 stale 오류로 중단합니다.

## 주요 산출물

| 산출물 | 위치 |
|---|---|
| 활성 정식 실행 체크포인트 | `evaluation/v6/formal-run/active.json` |
| 응답 run | `evaluation/v6/runs/` |
| RAG 검색 캐시 | `evaluation/v6/retrieval-cache/` |
| 반복별 개별 채점 초안 | `evaluation/v6/judge/local-drafts/<group-id>/individual-repetition-<n>.json` |
| 행동 전환 채점 초안 | `evaluation/v6/judge/local-drafts/<group-id>/pair.json` |
| 활성 450개 점수 | `evaluation/v6/judge/grades/<group-id>/` |
| 활성 225개 전환 점수 | `evaluation/v6/judge/pair-grades/<group-id>/` |
| 최종 HTML 보고서 | `docs/reports/2026-07-22-amy-hood-evaluation-v6-formal.html` |

## 검증 명령

```bash
npm run lint
npm run evaluation:v6:test
npm run advisor:policy-memory:test
npm run build
```

Evaluation v6의 개별 진단 명령은 다음 진입점을 사용합니다.

```bash
npm run evaluation:v6:run -- check
npm run evaluation:v6:run -- judge-local --group <group-id> --repetition 1 --base-url http://127.0.0.1:8082/v1
npm run evaluation:v6:run -- judge-pairs-local --group <group-id> --base-url http://127.0.0.1:8082/v1
npm run evaluation:v6:run -- report --group <group-id> --html <output.html>
```
