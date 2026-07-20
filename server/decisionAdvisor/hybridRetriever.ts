import { canonicalJson, sha256 } from './canonicalJson';
import { readFile } from 'node:fs/promises';
import type { EmbeddingClient } from './embeddingClient';
import { loadActiveAmyHoodMemoryIndex, type LoadedAmyHoodMemoryIndex } from './memoryIndex';
import { scoreBm25 } from './lexicalScorer';
import { advisorPaths } from './paths';
import { assertAmyHoodRetrievalRequest, type AmyHoodRetrievalRequest, type AmyHoodRetrievalResult } from '../../shared/amyHoodRag';

const normalizeQuery = (query: string) => query.normalize('NFKC').trim().replace(/\s+/g, ' ');
const cosine = (left: number[], right: number[]) => left.reduce((sum, value, index) => sum + value * right[index], 0);

type RankableIndex = Pick<LoadedAmyHoodMemoryIndex, 'records' | 'vectors'> & {
  manifest: Pick<LoadedAmyHoodMemoryIndex['manifest'], 'indexHash' | 'retrievalConfig' | 'retrievalConfigHash'>;
};

export type RetrievalCalibrationMetrics = {
  probeCount: number;
  positiveProbeCount: number;
  noMatchProbeCount: number;
  recallAt3: number;
  noMatchFalsePositiveRate: number;
};

type CalibrationCandidate = Pick<LoadedAmyHoodMemoryIndex, 'records' | 'vectors'> & {
  retrievalConfig: LoadedAmyHoodMemoryIndex['manifest']['retrievalConfig'];
};

export const rankAmyHoodMemory = (
  index: RankableIndex,
  queryInput: string,
  queryVector: number[],
): AmyHoodRetrievalResult => {
  const query = normalizeQuery(queryInput);
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
  const cacheKey = sha256(canonicalJson({ query, indexHash: index.manifest.indexHash, retrievalConfigHash: index.manifest.retrievalConfigHash }));
  return { query, matches, trace: { queryHash, indexHash: index.manifest.indexHash, retrievalConfigHash: index.manifest.retrievalConfigHash, cacheKey, selectedArtifacts: matches, noMatch: matches.length === 0, noMatchReason: matches.length ? null : 'below_threshold' } };
};

export const evaluateAmyHoodRetrievalCalibration = async ({ root, candidate, embeddingClient }: {
  root: string;
  candidate: CalibrationCandidate;
  embeddingClient: EmbeddingClient;
}): Promise<RetrievalCalibrationMetrics> => {
  const file = JSON.parse(await readFile(advisorPaths(root).retrievalCalibration, 'utf8')) as {
    probes: Array<{ id: string; query: string; expectedArtifactIds: string[]; expectNoMatch: boolean }>;
  };
  if (!Array.isArray(file.probes) || new Set(file.probes.map(({ id }) => id)).size !== file.probes.length
    || file.probes.some(({ id, query }) => !id || !query.trim())) throw new Error('retrieval calibration dataset is invalid');
  const positives = file.probes.filter(({ expectNoMatch }) => !expectNoMatch);
  const noMatches = file.probes.filter(({ expectNoMatch }) => expectNoMatch);
  if (!positives.length || !noMatches.length) throw new Error('retrieval calibration requires positive and no-match probes');
  const vectors = await embeddingClient.embed(file.probes.map(({ query }) => query));
  const retrievalConfigHash = sha256(canonicalJson(candidate.retrievalConfig));
  const index: RankableIndex = {
    records: candidate.records,
    vectors: candidate.vectors,
    manifest: { indexHash: '0'.repeat(64), retrievalConfig: candidate.retrievalConfig, retrievalConfigHash },
  };
  const results = new Map(file.probes.map((probe, indexPosition) => [
    probe.id,
    rankAmyHoodMemory(index, probe.query, vectors[indexPosition]),
  ]));
  const recallAt3 = positives.reduce((sum, probe) => {
    const returned = new Set(results.get(probe.id)!.matches.slice(0, 3).map(({ id }) => id));
    return sum + probe.expectedArtifactIds.filter((id) => returned.has(id)).length / probe.expectedArtifactIds.length;
  }, 0) / positives.length;
  const noMatchFalsePositiveRate = noMatches.filter((probe) => !results.get(probe.id)!.trace.noMatch).length / noMatches.length;
  return { probeCount: file.probes.length, positiveProbeCount: positives.length, noMatchProbeCount: noMatches.length, recallAt3, noMatchFalsePositiveRate };
};

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
      return rankAmyHoodMemory(index, query, queryVector);
    },
  };
};
