# General RAG vs GraphRAG Evaluation Plan

## Goal

Compare persona generation quality between General RAG and GraphRAG using the same Amy Hood / Microsoft earnings-call archive.

## Fixed Dataset

- Shared zip: `archive_collected_data_20260707.zip`
- Source folder: `archive/`
- Current file count: 50
- Subject: Amy Hood
- Target persona: CFO / finance decision persona

## Fixed Questions

Use `evaluation/rag_graphrag_questions.json`.

Both systems must answer the same 8 questions and generate the same top-level persona fields.

## Output Contract

Use `evaluation/rag_graphrag_output_contract.json`.

Both systems must return:

- `persona`
- `answers`
- `evidence`
- `limitations`

## Evaluation Criteria

Each question is scored from 1 to 5 for each criterion.

1. Groundedness: Does the answer cite or summarize real evidence from the shared data?
2. Hallucination control: Does it avoid unsupported claims and mark uncertainty as `확인 필요`?
3. Decision-rule extraction: Does it extract CFO judgment rules instead of only summarizing text?
4. Consistency: Does the persona stay stable across questions?
5. Prompt reusability: Can the output be reused as an AI advisor system prompt?

Total score per question: 25.

## Current General RAG Baseline

The current implementation is a General RAG first pass:

- Loader: `server/ragService.ts`
- Retrieval source: `archive/`
- Retrieval method: local keyword scoring over chunks
- Generation endpoint: `POST /api/reference-personas/amy-hood-rag`
- LLM: local llama.cpp OpenAI-compatible server through LangChain

This is not yet vector embedding RAG. It is intentionally fixed as the first baseline so GraphRAG can be compared against the current system.

## Next Step

1. Generate and save the General RAG result using the fixed questions.
2. Ask the GraphRAG implementation to return the same output contract.
3. Fill `evaluation/rag_graphrag_scorecard.csv`.
4. Compare totals and review qualitative differences.
