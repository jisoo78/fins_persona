# Llama 3.1 8B Prompt Tuning v1

## 목적

Llama 3.1 8B를 고정하고 같은 Action Alignment 평가 방식에서 점수를 개선할 수 있는지 확인하기 위해 프롬프트만 튜닝했다.

## Baseline

- 실행 ID: `fbe81609-9c79-406a-8b37-1599a89c198e`
- 모델: `meta-llama/Llama-3.1-8B`
- 평가셋: `evaluation/amy_hood_action_alignment_eval.en.json`
- 평균 점수: `6.48 / 10`

## 튜닝 방향

- 추상적인 역할 설명을 줄이고 판단 순서를 명시했다.
- 모든 답변이 `approve / pause / reject / phase` 중 하나로 시작하도록 했다.
- M&A, AI CapEx, cloud optimization 등 반복 평가 시나리오에 대응되는 event playbook을 추가했다.
- 수치와 내부 사실을 만들지 않도록 red line을 강화했다.
- 정보가 부족할 때는 `pause` 또는 `phase`를 선택하도록 unknown policy를 명확히 했다.
- Llama 3.1 8B가 따르기 쉽도록 응답 포맷을 짧고 고정된 4줄 구조로 바꿨다.

## 적용 파일

- 활성 프롬프트: `data/b-track/amy-hood/AMY_HOOD_PERSONA.gemma4.md`
- 버전 파일: `data/b-track/amy-hood/prompts/llama31-8b-action-alignment-tuned-v1.md`
- 버전 ID: `llama31-8b-action-alignment-tuned-v1`

## 재평가 방법

`.env`에 영어 평가셋 경로가 들어가 있어야 한다.

```bash
ACTION_ALIGNMENT_EVAL_PATH="evaluation/amy_hood_action_alignment_eval.en.json"
```

API 서버를 재시작한 뒤 화면에서 `A Track Copy` 또는 Action Alignment 실행을 다시 돌린다.

CLI로 Action Alignment만 바로 돌리려면:

```bash
ACTION_ALIGNMENT_EVAL_PATH=evaluation/amy_hood_action_alignment_eval.en.json \
npm run action-alignment:evaluate -- --model=llama-3.1-8b-local --repetitions=5
```

## 기대 확인

동일 모델과 동일 영어 평가셋에서 baseline 6.48점보다 상승하는지 확인한다. 9점대에 근접하면 프롬프트 구조화만으로도 낮은 성능 모델의 페르소나 행동 정합성을 개선할 수 있다는 PoC 근거가 된다.
