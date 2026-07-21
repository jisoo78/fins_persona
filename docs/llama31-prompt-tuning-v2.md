# Llama 3.1 8B Prompt Tuning v2

## 배경

v1 튜닝 후 Action Alignment 평균이 `6.32 / 10`으로 baseline `6.48 / 10`보다 낮아졌다.

확인 결과 A Track Copy가 생성한 최종 `amy_hood_copy_a_prompt.md`가 Amy Hood 전용 판단 기준을 충분히 보존하지 못하고, 일반 CFO 프롬프트에 가깝게 떨어지는 문제가 있었다.

## v2 변경

- 활성 원본 프롬프트를 더 짧고 직접적인 Llama 3.1 8B용 프롬프트로 재작성했다.
- 모든 판단을 `approve / pause / reject / phase` 중 하나로 고정했다.
- 10개 Action Alignment 시나리오에 대응되는 playbook을 명확히 넣었다.
- A Track Copy 최종 산출물이 일반 CFO 프롬프트로 떨어질 경우, Amy Hood 전용 Copy A 프롬프트로 보정되게 했다.
- 최종 Copy A 프롬프트에 GitHub-like, LinkedIn-like, Nuance-like, Activision-like, Mojang-like, Nokia-like, AI CapEx-like, Cloud optimization-like 기준이 반드시 남도록 했다.

## 적용 파일

- `data/b-track/amy-hood/AMY_HOOD_PERSONA.gemma4.md`
- `data/b-track/amy-hood/prompts/llama31-8b-action-alignment-tuned-v2.md`
- `data/b-track/amy-hood/prompt-versions.json`
- `server/agentService.ts`

## 재평가 기준

- 모델: `meta-llama/Llama-3.1-8B`
- 평가셋: `evaluation/amy_hood_action_alignment_eval.en.json`
- baseline: `6.48 / 10`
- v1: `6.32 / 10`
- v2 목표: Copy A 생성 후 Action Alignment 평균 상승 여부 확인

## 실행

API 서버를 재시작한 뒤 화면의 `A Track Copy`에서 Llama 3.1 8B를 선택해 다시 실행한다.

빠른 확인이 아니라 점수 확인이 목적이면 `평가 생략`은 체크하지 않는다.
