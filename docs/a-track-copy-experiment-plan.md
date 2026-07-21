# A Track Copy Experiment

## 목적

B트랙에서 만든 Amy Hood 공개 데이터 기반 페르소나를 A트랙 흐름에 태워서, 사전 질문과 심층 인터뷰만으로 다시 Amy Hood Copy A ver. 페르소나를 만들 수 있는지 확인한다.

## 실행 흐름

1. 현재 활성 B트랙 Amy Hood 메인 프롬프트를 읽는다.
2. `pre_question.json`의 사전 질문 40개를 Amy Hood 페르소나가 객관식으로 답한다.
3. 응답을 `PreInterviewContext` 형태로 묶는다.
4. `PreInterviewContext`를 심층 인터뷰 생성 로직에 넣어 심층 질문을 만든다.
5. Amy Hood 페르소나가 심층 질문에 답한다.
6. 사전 질문과 심층 인터뷰 결과를 바탕으로 `Amy Hood Copy A ver.` 프롬프트를 생성한다.
7. 생성된 Copy A 프롬프트를 Action Alignment 평가에 다시 넣어 점수를 비교한다.

## 실행 명령어

```bash
npm run a-track-copy:evaluate -- --model=gemma4-12b-local --repetitions=5
```

프롬프트 생성까지만 확인하려면 아래처럼 실행한다.

```bash
npm run a-track-copy:evaluate -- --model=gemma4-12b-local --skip-evaluation
```

## 산출물

- `evaluation/a_track_copy_runs/{runId}/pre_interview_context.json`
- `evaluation/a_track_copy_runs/{runId}/final_output.json`
- `evaluation/a_track_copy_runs/{runId}/amy_hood_copy_a_prompt.md`
- `evaluation/a_track_copy_runs/{runId}/run.json`
- `docs/a_track_copy_experiment_{runId}.md`

Action Alignment까지 실행한 경우 기존 평가 산출물도 함께 생성된다.

- `evaluation/action_alignment_runs/{runId}.json`
- `docs/action_alignment_report_{runId}.md`

## 주의

이 실험은 사전 질문 40개, 심층 인터뷰, 프롬프트 생성, Action Alignment 반복 평가를 모두 호출하므로 로컬 LLM 기준 시간이 오래 걸릴 수 있다.
