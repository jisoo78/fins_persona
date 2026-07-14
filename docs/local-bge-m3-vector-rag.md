# Local bge-m3 Vector RAG

## Purpose

This adds a local embedding layer to the current General RAG baseline.

- Generator LLM: local llama.cpp Gemma/Fable model
- Embedding model: `BAAI/bge-m3`
- Source data: `archive/`
- Vector index output: `data/vector_index/`

## Setup

Run once after creating and activating the Python virtual environment:

```bash
pip install sentence-transformers
```

The user already verified the model with:

```python
from sentence_transformers import SentenceTransformer
model = SentenceTransformer("BAAI/bge-m3")
embeddings = model.encode(["test"])
print(embeddings.shape)
```

Expected dimension:

```text
(1, 1024)
```

## Build Vector Index

From the project root:

```bash
source .venv/bin/activate
npm run rag:index:bge-m3
```

This creates:

```text
data/vector_index/bge_m3_metadata.json
data/vector_index/bge_m3_vectors.f32
```

These files are ignored by git because they are local generated artifacts.

## Use In App

Restart the API server after the index is created:

```bash
npm run api
```

Then click:

```text
페르소나 > Amy Hood RAG로 생성
```

If the vector index exists, the API uses:

```text
general-vector-rag-bge-m3
```

If the vector index is missing, the API falls back to:

```text
general-keyword-rag-fallback
```

## Evaluation

The legacy keyword/vector evaluator entrypoints have been retired. Run the isolated decision-similarity baseline with the active B Track Main Prompt:

```bash
source .venv/bin/activate
npm run rag:evaluate:decision-similarity
```

It writes:

```text
evaluation/amy_hood_decision_similarity_general_rag_answers.lock.json
```

Use `retrieval.method`, `retrieval.prompt_version_id`, and `retrieval.prompt_hash` to confirm the retrieval and immutable Main Prompt inputs.
