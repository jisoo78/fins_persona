import { canonicalJson, sha256 } from './canonicalJson';
import type { EmbeddingClient } from './embeddingClient';
import { loadActiveAmyHoodMemoryIndex } from './memoryIndex';
import { scoreBm25 } from './lexicalScorer';
import { assertAmyHoodRetrievalRequest, type AmyHoodRetrievalRequest, type AmyHoodRetrievalResult } from '../../shared/amyHoodRag';

const normalizeQuery = (query: string) => query.normalize('NFKC').trim().replace(/\s+/g, ' ');
const cosine = (left: number[], right: number[]) => left.reduce((sum, value, index) => sum + value * right[index], 0);

export const createAmyHoodHybridRetriever = async ({ root, embeddingClient }: {
  root: string;
  embeddingClient: EmbeddingClient;
}) => {
  const index = await loadActiveAmyHoodMemoryIndex(root);
  return {
    indexHash: index.manifest.indexHash,
    retrieve: async (request: AmyHoodRetrievalRequest): Promise<AmyHoodRetrievalResult> => {
      assertAmyHoodRetrievalRequest(request);
      if (request.indexHash !== index.manifest.indexHash) throw new Error('Amy Hood memory index hash mismatch');
      const query = normalizeQuery(request.query);
      const [queryVector] = await embeddingClient.embed([query]);
      const lexical = new Map(scoreBm25(query, index.records).map(({ id, score }) => [id, score]));
      const byPolicy = new Map<string, { vectorScore: number; lexicalScore: number; fusedScore: number }>();
      index.records.forEach((record, row) => {
        const vectorScore = (Math.max(-1, Math.min(1, cosine(queryVector, index.vectors[row]))) + 1) / 2;
        const bm25 = lexical.get(record.id) ?? 0;
        const lexicalScore = bm25 <= 0 ? 0 : bm25 / (bm25 + index.manifest.retrievalConfig.bm25K);
        const fusedScore = index.manifest.retrievalConfig.vectorWeight * vectorScore
          + index.manifest.retrievalConfig.lexicalWeight * lexicalScore;
        const policyId = record.policyId ?? record.id;
        const previous = byPolicy.get(policyId);
        if (!previous || fusedScore > previous.fusedScore) byPolicy.set(policyId, { vectorScore, lexicalScore, fusedScore });
      });
      const matches = [...byPolicy].map(([id, scores]) => ({ id, kind: 'policy' as const, ...scores }))
        .filter(({ fusedScore }) => fusedScore >= index.manifest.retrievalConfig.minimumScore)
        .sort((a, b) => b.fusedScore - a.fusedScore || a.id.localeCompare(b.id)).slice(0, 2);
      const queryHash = sha256(query);
      const cacheKey = sha256(canonicalJson({ query, indexHash: request.indexHash, retrievalConfigHash: index.manifest.retrievalConfigHash }));
      return {
        query,
        matches,
        trace: {
          queryHash,
          indexHash: request.indexHash,
          retrievalConfigHash: index.manifest.retrievalConfigHash,
          cacheKey,
          selectedArtifacts: matches,
          noMatch: matches.length === 0,
          noMatchReason: matches.length ? null : 'below_threshold',
        },
      };
    },
  };
};
