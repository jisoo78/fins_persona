# 2017-2019 Holdout Evaluation Setup

## Purpose

The evaluation is shifting from simple retrieval quality to persona decision quality.

The current setup intentionally excludes FY2017-FY2019 data from the searchable RAG knowledge base. Those years are kept as holdout data for future evaluation questions.

## Dataset Split

Original source data remains unchanged:

```text
archive/
```

Generated evaluation split:

```text
archive_eval/train/
archive_eval/holdout/
```

Train excludes FY2017-FY2019:

```text
train files: 38
```

Holdout contains FY2017-FY2019:

```text
holdout files: 12
```

Holdout files:

```text
fy2017_q1.json
fy2017_q2.json
fy2017_q3.json
fy2017_q4.json
fy2018_q1.json
fy2018_q2.json
fy2018_q3.json
fy2018_q4.json
fy2019_q1.json
fy2019_q2.json
fy2019_q3.json
fy2019_q4.json
```

## Current Vector Index

The active local bge-m3 vector index was rebuilt from:

```text
archive_eval/train
```

Metadata:

```text
embedding model: BAAI/bge-m3
dimension: 1024
chunk count: 2377
```

## Generated Baseline

The holdout-aware Vector RAG baseline is stored at:

```text
evaluation/vector_rag_bge_m3_train_holdout_2017_2019.lock.json
```

Retrieval method:

```text
local_bge_m3_vector_retrieval
```

## Rebuild Commands

Prepare split:

```bash
npm run rag:prepare:holdout
```

Build train-only vector index:

```bash
RAG_ARCHIVE_DIR=archive_eval/train .venv/bin/python scripts/build_bge_m3_index.py
```

Generate train-only Vector RAG baseline:

```bash
RAG_ARCHIVE_DIR=archive_eval/train npm run rag:evaluate:vector
```

## Next Evaluation Direction

The next question set should include:

- Past memory restoration questions using data outside the holdout period
- Future scenario questions that are not directly present in the knowledge base
- Holdout event questions where FY2017-FY2019 events act as the answer key
- Model-based judgment questions measuring similarity to Amy Hood-style decision logic
