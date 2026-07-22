# Llama 3.1 8B Prompt Tuning v5 - Minimal Guardrails

## 배경

v4도 baseline보다 점수는 올랐지만, 판단 보조축이 평가 rubric에 가깝게 보일 수 있다는 피드백이 있었다.

따라서 v5는 원래 Before 프롬프트를 거의 유지하고, Llama 3.1 8B가 자주 흔들리는 부분만 최소한으로 보완했다.

## 목표

- 정답지 성향을 더 줄인다.
- 평가셋에 맞춘 사건명, playbook, answer key성 기준을 넣지 않는다.
- 원래 Amy Hood 프롬프트의 역할, 정체성, 의사결정 원칙을 최대한 유지한다.
- 추측, 없는 숫자 생성, hindsight 사용만 줄인다.

## 제거/완화한 것

- 상황 분류, tradeoff, main risk, validation condition을 강하게 요구하던 v4 문구를 줄였다.
- `Trust vs. Monetization`, `Commitment vs. Optionality` 같은 rubric처럼 보일 수 있는 별도 판단축을 제거했다.
- 답변 순서를 강하게 고정하지 않았다.

## 최소 추가한 것

- `Evidence discipline`: 근거가 불완전하면 아는 것과 확인 필요한 것을 구분한다.
- 특정 숫자, 계약 조건, 내부 정보가 없으면 추측하지 않는다.
- hindsight를 당시 판단 근거처럼 쓰지 않는다.
- 의사결정에 필요한 정보가 없으면 부족한 정보를 짧게 말한다.

## 재평가 기준

- 모델: `meta-llama/Llama-3.1-8B`
- 평가셋: `evaluation/amy_hood_action_alignment_eval.en.json`
- baseline: `6.48 / 10`
- v4: `7.28 / 10`
- v5 목표: 점수 상승폭은 작아도 정답지 성향을 낮춘 상태에서 baseline 대비 개선 확인

## 보고용 한 문장

v5는 점수를 직접 끌어올리기 위한 판단축을 대부분 제거하고, 기존 Amy Hood 프롬프트에 근거 경계와 추측 방지 장치만 최소한으로 추가한 버전이다.
