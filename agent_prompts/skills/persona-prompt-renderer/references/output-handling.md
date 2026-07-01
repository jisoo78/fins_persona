# Output Handling

LangChain 등 외부 체인에서 renderer를 호출할 때는 저장 방식을 명확히 분리한다.

## 권장 응답 wrapper

파싱 안정성이 필요하면 다음 JSON wrapper를 사용한다.

```json
{
  "title": "CFO Decision Persona Prompt",
  "format": "markdown",
  "markdown": "# CFO Decision Persona Prompt\n\n...",
  "source": {
    "pre_interview_context_id": "pre_ctx_001",
    "deep_interview_result_id": "deep_result_001"
  }
}
```

## 저장 방식

파일 저장:

```text
persona-prompts/{persona_prompt_id}.md
```

DB 저장:

```text
persona_prompts
- id
- role
- title
- markdown_content
- pre_interview_context_id
- deep_interview_result_id
- created_at
- updated_at
```

## 파싱 규칙

- `format`은 항상 `markdown`이어야 한다.
- `markdown`은 비어 있으면 안 된다.
- Markdown에는 최소한 `Role`, `Identity`, `Decision Principles`, `Cross-Dimension Rules`, `Red Lines`, `Communication Style`, `Evidence` 섹션이 있어야 한다.
- 저장 시 JSON wrapper 전체와 Markdown 본문을 모두 보존할 수 있다.
- 에이전트에 주입할 때는 Markdown 본문만 사용한다.

