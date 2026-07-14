# Cohere Reranker Setup

## 목적

bge-m3 vector search가 가져온 후보 청크를 Cohere Reranker로 다시 정렬해서, LLM에 더 관련성 높은 근거만 주입한다.

## 흐름

1. bge-m3 vector search로 후보 청크를 넉넉히 검색한다.
2. Cohere Reranker가 질문과 후보 청크의 관련도를 다시 계산한다.
3. 재정렬된 상위 청크만 RAG 답변 생성에 사용한다.
4. Cohere 키가 없거나 API 호출이 실패하면 기존 bge-m3 순서로 자동 fallback한다.

## .env 설정

```env
RAG_RERANKER="cohere"
COHERE_API_KEY="발급받은_COHERE_API_KEY"
COHERE_RERANK_MODEL="rerank-v3.5"
COHERE_RERANK_CANDIDATE_LIMIT="40"
COHERE_RERANK_MAX_TOKENS_PER_DOC="1200"
COHERE_RERANK_TIMEOUT_MS="20000"
COHERE_RERANK_MIN_INTERVAL_MS="6500"
COHERE_RERANK_RETRY_ON_429="true"
COHERE_RERANK_429_RETRY_DELAY_MS="12000"
```

## 실행

```bash
npm run rag:evaluate:decision-similarity
npm run rag:score:decision-similarity
```

## 참고

- 후보 수를 늘리면 품질이 좋아질 수 있지만 Cohere 사용량과 지연 시간이 증가한다.
- 무료 Trial 키는 분당 호출 수 제한이 있으므로 기본값은 약 6.5초 간격으로 호출한다.
- 최종 비교에서는 RAG와 GraphRAG가 같은 질문지, 같은 Judge 기준, 같은 reranker 조건을 쓰는 편이 좋다.
