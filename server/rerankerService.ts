import type { RagChunk } from './ragService';

interface CohereRerankResult {
  index: number;
  relevance_score: number;
}

interface CohereRerankResponse {
  results?: CohereRerankResult[];
}

const cohereEndpoint = 'https://api.cohere.com/v2/rerank';

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
