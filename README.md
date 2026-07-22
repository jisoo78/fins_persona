# Local LLM Evaluation Archive

이 브랜치는 Amy Hood CFO Persona PoC에서 수행한 로컬 LLM 비교 평가와 프롬프트 튜닝 실험을 보존하는 **역사적 실험 브랜치**입니다.

현재 제품 코드와 정식 Evaluation v6 파이프라인의 기준은 `main`입니다. 이 브랜치를 `main`에 통째로 병합하지 말고, 과거 결과를 재현하거나 특정 평가 자산을 검토할 때만 사용하세요.

## 브랜치의 역할

- Gemma 4 12B, Gemma 4 E4B, Phi-4-mini, Llama 3.1 8B의 로컬 실행 가능성을 비교합니다.
- 객관식 난이도 강화, Event Matching, Action Alignment의 초기 실험을 보존합니다.
- 프롬프트 변경이 경량 모델의 판단 행동에 미친 영향을 확인하는 하위호환·반증 자료를 제공합니다.

## 핵심 실험

### 1. Evaluation 1.5.0 — 60문항

60문항은 과거 복원 20개, GitHub/M&A 판단 20개, 가상 시나리오 20개로 구성되며 모두 4지선다형입니다. 1.4.0에서 세 모델이 모두 만점을 기록한 뒤, 1.5.0에서 그럴듯한 함정 선택지를 강화했습니다.

| 모델 | 점수 |
| --- | ---: |
| Gemma 4 12B | 48/60 |
| Phi-4-mini | 47/60 |
| Gemma 4 E4B | 45/60 |

이 결과는 평가 난이도를 높이면 모델 간 차이가 드러난다는 보조 증거입니다. 다만 현재 v6의 정식 정체성 평가를 대체하지 않습니다.

관련 파일:

- `evaluation/amy_hood_eval_questions.json`
- `evaluation/amy_hood_eval_answer_key.json`
- `evaluation/amy_hood_eval_question_reviews.json`
- `docs/test60_1.5_report.md`

### 2. Event Matching

가상 사건을 제시하고 Nokia, Mojang, LinkedIn, GitHub, Nuance, Activision Blizzard 중 유사한 실제 사건과 판단 기준을 고르게 하는 8문항 실험입니다.

- 평가 데이터: `evaluation/amy_hood_event_matching_eval.json`
- 실행기: `server/evaluation/eventMatchingRunner.ts`
- 종합 결과: `docs/event_matching_3model_report.md`

### 3. Action Alignment

10개 가상 시나리오에 대한 답변을 실제 사건에서 정의한 행동 패턴과 비교해 1~10점으로 채점합니다. 기본 설정은 시나리오별 5회 반복입니다.

- 평가 데이터: `evaluation/amy_hood_action_alignment_eval.json`
- 실행기: `server/evaluation/actionAlignmentRunner.ts`
- 결과: `docs/action_alignment_report_*.md`

### 4. Prompt Tuning과 A Track Copy

Llama 3.1 8B 중심의 프롬프트 변형과 B Track Persona를 A Track 인터뷰 흐름에 다시 투입하는 실험입니다. A Track Copy는 PoC 종료 시 폐기된 방향이므로 제품 기능으로 간주하지 않습니다.

- 프롬프트: `data/b-track/amy-hood/prompts/llama31-8b-*.md`
- 튜닝 요약: `docs/amy-hood-prompt-tuning-before-after-report.md`
- A Track 실행기: `server/evaluation/aTrackCopyExperimentRunner.ts`

## 실행 방법

### 기본 검증

```bash
npm ci
npm run evaluation:test
```

### 로컬 모델 설정

사용 가능한 모델 ID와 실제 모델명은 `config/evaluation-model-options.json`에서 확인합니다. OpenAI 호환 로컬 서버 주소와 키는 `.env.example`을 참고해 환경 변수로 설정합니다.

### 실험 실행

```bash
# Event Matching
npm run event-matching:evaluate -- --model=gemma4-e4b-local

# Action Alignment — 응답 모델과 Judge 모델을 분리하는 것을 권장
npm run action-alignment:evaluate -- \
  --model=gemma4-e4b-local \
  --judge-model=gemma4-12b-local \
  --repetitions=5

# 폐기된 A Track Copy 실험 재현
npm run a-track-copy:evaluate -- \
  --model=llama-3.1-8b-local \
  --repetitions=5
```

실행 결과는 `evaluation/*_runs/`와 `docs/*_report_*.md`에 생성됩니다. 새 실행 결과를 무분별하게 커밋하지 마세요.

## 알려진 한계

- Action Alignment 응답에는 현재 v6의 질문 의존형 동적 RAG가 주입되지 않습니다.
- 응답 모델과 Judge 모델을 같게 두면 자기 선호 편향이 생길 수 있습니다.
- Judge JSON 파싱 실패 시 키워드 기반 fallback 점수가 사용될 수 있습니다.
- Event Matching은 후보 사건 데이터베이스와 사건 ID를 프롬프트에 제공하며, 자동 채점도 키워드 중심입니다.
- `archive/microsoft_mna_decision_evidence.json`은 여러 공개자료를 요약한 실험용 문서입니다. 현재 `main`의 원문·화자·출처 검증 기준을 충족하는 정식 증거로 사용하지 마세요.
- Nokia 등 일부 항목에는 사후 결과가 포함되어 있으므로 의사결정 시점 근거와 분리해야 합니다.
- 신규 실행기에는 독립적인 전용 테스트가 충분하지 않습니다.

## `main`과의 관계

`main`에는 구조화 기억, 질문 의존형 RAG, 블라인드 Judge, 재개 가능한 450답변 Evaluation v6가 구현되어 있습니다. 주요 과거 보고서는 `main`의 `docs/reports/local-llm-path/`에 별도로 보존되어 있습니다.

따라서 이 브랜치는 다음 용도로만 유지합니다.

1. 과거 로컬 모델 실험 재현
2. v6 천장 효과를 해석하기 위한 하위호환·반증 자료 확인
3. 특정 평가 데이터나 Prompt 변형의 선별적 참고

전체 코드 병합은 권장하지 않습니다.

## 추가 문서

B Track의 최초 Phase 1~7 진행 방식은 [`docs/b-track-amy-hood-poc/README.md`](docs/b-track-amy-hood-poc/README.md)를 참고하세요.
