import type { RagChunk } from './ragService';

interface CohereRerankResult {
  index: number;
  relevance_score: number;
}

interface CohereRerankResponse {
  results?: CohereRerankResult[];
}

const cohereEndpoint = 'https://api.cohere.com/v2/rerank';
let nextCohereRequestAt = 0;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForCohereRateLimit = async () => {
  const interval = Number(process.env.COHERE_RERANK_MIN_INTERVAL_MS ?? 6500);
  const now = Date.now();
  const waitMs = Math.max(0, nextCohereRequestAt - now);
  nextCohereRequestAt = Math.max(now, nextCohereRequestAt) + interval;
  if (waitMs > 0) await wait(waitMs);
};

const chunkToRerankDocument = (chunk: RagChunk) =>
  [
    `title: ${chunk.title}`,
    chunk.speaker ? `speaker: ${chunk.speaker}` : '',
    chunk.fiscalYear && chunk.fiscalQuarter ? `period: FY${chunk.fiscalYear} Q${chunk.fiscalQuarter}` : '',
    chunk.section ? `section: ${chunk.section}` : '',
    `file: ${chunk.fileName}`,
    `text: ${chunk.text}`,
  ]
    .filter(Boolean)
    .join('\n');

export const shouldUseCohereReranker = () =>
  process.env.RAG_RERANKER === 'cohere' && Boolean(process.env.COHERE_API_KEY);

export const rerankChunksWithCohere = async (
  query: string,
  chunks: RagChunk[],
  limit: number,
): Promise<RagChunk[] | null> => {
  if (!shouldUseCohereReranker() || chunks.length === 0) return null;

  await waitForCohereRateLimit();

  const response = await fetch(cohereEndpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.COHERE_API_KEY}`,
      'Content-Type': 'application/json',
      'X-Client-Name': 'fins-persona-rag',
    },
    body: JSON.stringify({
      model: process.env.COHERE_RERANK_MODEL ?? 'rerank-v3.5',
      query,
      documents: chunks.map(chunkToRerankDocument),
      top_n: limit,
      max_tokens_per_doc: Number(process.env.COHERE_RERANK_MAX_TOKENS_PER_DOC ?? 1200),
    }),
    signal: AbortSignal.timeout(Number(process.env.COHERE_RERANK_TIMEOUT_MS ?? 20000)),
  });

  if (!response.ok) {
    const errorText = await response.text();
    if (response.status === 429 && process.env.COHERE_RERANK_RETRY_ON_429 !== 'false') {
      const retryDelayMs = Number(process.env.COHERE_RERANK_429_RETRY_DELAY_MS ?? 12000);
      console.warn(`Cohere rerank rate limited. Retrying after ${retryDelayMs}ms.`);
      await wait(retryDelayMs);
      return rerankChunksWithCohere(query, chunks, limit);
    }
    throw new Error(`Cohere rerank failed: ${response.status} ${errorText.slice(0, 300)}`);
  }

  const data = (await response.json()) as CohereRerankResponse;
  if (!data.results?.length) return null;

  return data.results
    .flatMap((result) => {
      const chunk = chunks[result.index];
      if (!chunk) return [];
      return [{
        ...chunk,
        vectorScore: chunk.score,
        rerankScore: result.relevance_score,
        score: result.relevance_score,
      }];
    });
};
