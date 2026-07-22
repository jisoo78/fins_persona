# Llama 3.1 8B Local Evaluation

## 목적

Gemma 4 계열에서 점수가 높게 나오는 상황이 모델 성능 때문인지, 평가 문항 난이도 때문인지 확인하기 위해 더 오래된 오픈소스 모델인 `meta-llama/Llama-3.1-8B`를 비교 후보로 추가했다.

## 적용 내용

- 화면 모델 선택 목록에 `Llama 3.1 8B (local)` 추가
- Action Alignment runner가 `ACTION_ALIGNMENT_EVAL_PATH`로 평가셋 파일을 바꿔 읽을 수 있게 수정
- Llama 3.1 8B 비교용 영어 평가셋 추가 예정

## 주의

`meta-llama/Llama-3.1-8B`는 Hugging Face 접근 승인이 필요한 모델일 수 있다. 또한 현재 앱은 Python `transformers` 객체를 직접 호출하지 않고, OpenAI 호환 API 서버를 호출한다.

따라서 아래 조건이 필요하다.

1. 로컬에서 Llama 3.1 8B가 실행 중이어야 한다.
2. 서버가 OpenAI 호환 `/v1/chat/completions` API를 제공해야 한다.
3. 서버의 model 이름이 `meta-llama/Llama-3.1-8B`로 노출되어야 한다.
4. 영어 평가셋을 사용해야 한다.

## 실행 예시

```bash
ACTION_ALIGNMENT_EVAL_PATH=evaluation/amy_hood_action_alignment_eval.en.json \
npm run action-alignment:evaluate -- --model=llama-3.1-8b-local --repetitions=5
```

화면에서 실행하려면 `.env`에 아래 값을 넣고 API 서버를 재시작한다.

```bash
ACTION_ALIGNMENT_EVAL_PATH="evaluation/amy_hood_action_alignment_eval.en.json"
```

그 다음 평가 화면에서 `Llama 3.1 8B (local)`을 선택한다.
