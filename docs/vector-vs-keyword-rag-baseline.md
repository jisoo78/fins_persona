# Keyword RAG vs bge-m3 Vector RAG Baseline

## Generated Files

- Keyword baseline: `evaluation/keyword_rag_result.lock.json`
- bge-m3 Vector baseline: `evaluation/vector_rag_bge_m3_result.lock.json`
- Shared questions: `evaluation/rag_graphrag_questions.json`
- Scorecard: `evaluation/rag_graphrag_scorecard.csv`

Both baselines use the same `archive/` dataset and the same 8 evaluation questions.

## Retrieval Methods

Keyword baseline:

```text
local_keyword_chunk_retrieval
```

Vector baseline:

```text
local_bge_m3_vector_retrieval
```

Both baselines currently use:

```text
offline_fixed_baseline
```

This means the comparison fixes retrieval evidence first. Full local LLM judging can be run later, but is intentionally separated because local generation is slower and memory-sensitive.

## Early Observation

Keyword RAG tends to retrieve exact lexical matches from `microsoft_amy_hood.csv` and `microsoft_amy_hood.json`.

Vector RAG retrieves broader semantic matches from the full earnings-call archive, including analyst questions, Satya remarks, and Amy Hood answers around the same topic.

This is useful for comparison:

- Keyword RAG is more literal and often keeps closer to Amy-specific text.
- Vector RAG can discover broader context, but may need reranking or speaker filtering to avoid overusing non-Amy turns.

## Next Evaluation Step

Use `evaluation/rag_graphrag_scorecard.csv` to score:

1. Groundedness
2. Hallucination control
3. Decision-rule extraction
4. Consistency
5. Prompt reusability

Recommended next improvement for Vector RAG:

```text
Add a lightweight reranker or speaker-aware boost so Amy Hood turns remain preferred when scores are close.
```
