# Llama 3.1 8B Prompt Tuning v4 - Baseline Plus

## 배경

v2는 점수는 `9.20 / 10`까지 올랐지만, 평가셋에 등장하는 사건명을 직접 playbook으로 넣어 정답지에 가까운 문제가 있었다.

v3에서는 사건명을 제거했지만, 여전히 원래 프롬프트와는 꽤 다른 구조였다.

따라서 v4는 원래 Before 프롬프트를 다시 기반으로 삼고, 범용적으로 필요한 최소 판단 보조축만 추가했다.

## 목표

- 점수만 올리는 프롬프트를 피한다.
- 평가셋 사건명이나 정답 패턴을 직접 넣지 않는다.
- 기존 Amy Hood 프롬프트의 성격을 유지한다.
- Llama 3.1 8B가 흔들리는 부분만 최소한으로 보완한다.
- baseline `6.48 / 10`에서 1점 이상 개선되는지 확인한다.

## 제거한 것

- Amy Hood 전용 Copy A 강제 보정 로직 제거
- GitHub-like, LinkedIn-like 등 사건명 playbook 제거
- 평가셋에 직접 대응되는 정답지형 문구 제거

## 추가한 것

기존 프롬프트에 아래 정도만 추가했다.

- 상황 분류
- 핵심 tradeoff 확인
- main risk 확인
- 결정을 바꿀 validation condition 제시
- trust vs monetization
- commitment vs optionality
- hindsight 금지
- 숫자나 내부 정보 추측 금지 강화

## 적용 파일

- `server/agentService.ts`
- `data/b-track/amy-hood/AMY_HOOD_PERSONA.gemma4.md`
- `data/b-track/amy-hood/prompts/llama31-8b-baseline-plus-v4.md`
- `data/b-track/amy-hood/prompt-versions.json`

## 재평가 기준

- 모델: `meta-llama/Llama-3.1-8B`
- 평가셋: `evaluation/amy_hood_action_alignment_eval.en.json`
- baseline: `6.48 / 10`
- 목표: 최소 1점 이상 상승

## 보고용 문장

기존 v2는 점수는 높았지만 평가셋에 과적합될 수 있어 제거했고, v4에서는 원래 프롬프트를 기반으로 판단 절차와 검증 조건만 최소한으로 보강해 범용성을 유지하는 방향으로 다시 튜닝했다.
