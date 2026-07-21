# Amy Hood Action Alignment Evaluation

Date: 2026-07-20

## 목적

기존 객관식 평가와 Event Matching 평가는 점수가 전반적으로 높게 나왔다. 그래서 페르소나가 실제 상황에서 Amy Hood식 행동을 하는지 보기 위해 Action Alignment Score를 추가한다.

## 평가 방식

1. 가상 재무 의사결정 시나리오 10개를 제시한다.
2. 각 시나리오는 실제 Microsoft/Amy Hood 관련 사건과 미리 매핑한다.
3. Amy Hood 페르소나가 500자 이내로 행동 판단을 답한다.
4. LLM Judge가 답변과 정답 행동 패턴을 비교한다.
5. Judge는 먼저 한 문장 근거를 만들고, 1~10점 Action Alignment Score를 부여한다.
6. 기본 5회 반복 실행해서 평균, 최저, 최고 점수를 본다.

## 추가된 파일

- `evaluation/amy_hood_action_alignment_eval.json`
- `shared/amyHoodActionAlignmentEvaluation.ts`
- `server/evaluation/actionAlignmentRunner.ts`

## 실행 방법

```bash
npm run action-alignment:evaluate -- --model=gemma4-12b-local --repetitions=5
```

Judge 모델을 따로 지정할 수도 있다.

```bash
npm run action-alignment:evaluate -- --model=gemma4-12b-local --judge-model=phi-4-mini-local --repetitions=5
```

## 결과 파일

실행하면 아래 두 파일이 생성된다.

- `evaluation/action_alignment_runs/{runId}.json`
- `docs/action_alignment_report_{runId 앞 8자리}.md`

## 점수 해석

- 1~3점: 실제 Amy Hood식 판단과 충돌
- 4~6점: 중립 또는 기준 적용이 약함
- 7~8점: 대체로 정합
- 9~10점: 매우 정합

## 다음 확장

- Web UI에서 Action Alignment 실행/결과 확인 연결
- B트랙 Amy Hood 페르소나를 A트랙 사전 질문/심층 인터뷰에 투입
- 생성된 `Amy Hood Copy A ver.`을 다시 B트랙 평가에 넣고 원본과 비교
- 다른 CFO 사건을 넣어 Amy Hood 페르소나가 다른 방향을 제시하는지 확인
