# Llama 3.1 8B Prompt Tuning v3 - Generalizable Version

## 배경

v2는 Action Alignment Score가 `9.20 / 10`까지 상승했지만, 평가셋에 등장하는 사건을 `GitHub-like`, `LinkedIn-like`, `Nuance-like`처럼 직접 playbook으로 넣어 정답지에 가깝다는 문제가 있었다.

따라서 v3에서는 점수를 잘 받기 위한 사건명 매핑을 제거하고, 범용 페르소나로 사용할 수 있는 판단축 중심 프롬프트로 다시 튜닝했다.

## v3 목표

- 특정 평가 문항에 과적합하지 않는다.
- 사건명을 직접 암기시키지 않는다.
- 새로운 의사결정 상황에도 적용 가능한 판단 구조를 유지한다.
- Llama 3.1 8B가 따라갈 수 있도록 짧고 명확한 응답 구조는 유지한다.

## Before 문제

v2는 아래처럼 평가 문항과 대응되는 실제 사건명을 직접 포함했다.

- GitHub-like
- LinkedIn-like
- Nuance-like
- Activision-like
- Mojang-like
- Nokia Devices-like
- AI CapEx-like
- Cloud optimization-like

이 방식은 점수는 높일 수 있지만, 모델이 실제 판단 기준을 일반화했다기보다 평가셋 힌트를 활용한 것으로 볼 수 있어 PoC 설득력이 약해진다.

## v3 변경

사건명을 제거하고 아래 판단축으로 바꿨다.

- Strategic fit vs. execution burden
- Trust vs. monetization speed
- Demand vs. capacity
- Growth vs. margin
- Acquisition value vs. integration risk
- Optionality vs. lock-in
- Portfolio efficiency vs. future relevance

또한 의사결정 절차를 아래처럼 범용화했다.

1. 의사결정 유형 분류
2. 장기 플랫폼 가치 확인
3. 이해관계자 신뢰 리스크 확인
4. 재무 가드레일 확인
5. approve / pause / reject / phase 중 하나 선택
6. 결정을 바꿀 조건 제시

## 적용 파일

- `data/b-track/amy-hood/AMY_HOOD_PERSONA.gemma4.md`
- `data/b-track/amy-hood/prompts/llama31-8b-generalizable-tuned-v3.md`
- `data/b-track/amy-hood/prompt-versions.json`
- `server/agentService.ts`

## 재평가 기준

- baseline: `6.48 / 10`
- v1: `6.32 / 10`
- v2: `9.20 / 10`, 단 평가셋 과적합 우려
- v3: 범용성 유지 상태에서 재평가 필요

## 보고용 한 문장

v2는 점수는 높았지만 평가셋 사건명을 직접 반영해 과적합 우려가 있었고, v3에서는 사건명 대신 판단축과 재무 가드레일 중심으로 바꿔 범용 프롬프트로 다시 정리했다.
