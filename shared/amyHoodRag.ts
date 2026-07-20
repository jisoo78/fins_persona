import type { DecisionDomain } from './amyHoodDecisionAdvisor';

export type AmyHoodRetrievalConfig = {
  vectorWeight: number;
  lexicalWeight: number;
  bm25K: number;
  minimumScore: number;
};

export type AmyHoodHybridIndexManifest = {
  schemaVersion: 1;
  releaseId: string;
  releaseManifestHash: string;
  holdoutManifestHash: string;
  embeddingModel: 'bge-m3-Q8_0.gguf';
  embeddingDimension: 1024;
  builderVersion: 'hybrid-v1';
  lexicalVersion: 'bm25-v1';
  retrievalConfig: AmyHoodRetrievalConfig;
  retrievalConfigHash: string;
  calibrationSetHash: string;
  calibration: { recallAt3: number; noMatchFalsePositiveRate: number };
  recordCount: number;
  recordHashes: string[];
  vectorsFile: 'vectors.f32';
  vectorsHash: string;
  indexHash: string;
  createdAt: string;
};

export type AmyHoodRetrievalRequest = {
  query: string;
  indexHash: string;
};

export type AmyHoodIndexedEvidence = {
  id: string;
  exactQuote: string;
  speaker: 'Amy Hood';
  sourceId: string;
  sourceType: string;
  sourceTitle: string;
  publishedAt: string;
  sourceUrl: string | null;
  candidateId: string;
  temporalRelation: 'pre_decision' | 'at_decision' | 'post_decision';
};

export type AmyHoodMemorySearchRecord = {
  id: string;
  kind: 'policy' | 'event';
  domain: DecisionDomain;
  title: string;
  searchableText: string;
  policyId: string | null;
  reflectionIds: string[];
  supportingEventIds: string[];
  contrastingEventIds: string[];
  evidenceIds: string[];
  sourceIds: string[];
};

export type AmyHoodRetrievedArtifact = {
  id: string;
  kind: 'policy' | 'event';
  vectorScore: number;
  lexicalScore: number;
  fusedScore: number;
};

export type AmyHoodRetrievalTrace = {
  queryHash: string;
  indexHash: string;
  retrievalConfigHash: string;
  cacheKey: string;
  selectedArtifacts: AmyHoodRetrievedArtifact[];
  expandedArtifactIds: string[];
  evidenceIds: string[];
  sourceIds: string[];
  noMatch: boolean;
  noMatchReason: 'below_threshold' | null;
  contextTokens: number;
  tokenCounter: 'llama_server' | 'conservative_estimator';
  contextHash: string;
};

export type AmyHoodRetrievalResult = {
  query: string;
  matches: AmyHoodRetrievedArtifact[];
  trace: Omit<
    AmyHoodRetrievalTrace,
    | 'expandedArtifactIds'
    | 'evidenceIds'
    | 'sourceIds'
    | 'contextTokens'
    | 'tokenCounter'
    | 'contextHash'
  >;
};

export type AmyHoodRenderedContext = {
  projection: 'policy' | 'full';
  text: string;
  trace: AmyHoodRetrievalTrace;
};

const SHA256_PATTERN = /^[a-f0-9]{64}$/;

const isSha256 = (value: unknown): value is string =>
  typeof value === 'string' && SHA256_PATTERN.test(value);

export const assertAmyHoodRetrievalRequest: (
  value: unknown,
) => asserts value is AmyHoodRetrievalRequest = (value) => {
  if (!value || typeof value !== 'object') {
    throw new Error('retrieval request must be an object');
  }
  const record = value as Record<string, unknown>;
  const allowed = new Set(['query', 'indexHash']);
  const unknown = Object.keys(record).find((key) => !allowed.has(key));
  if (unknown) throw new Error(`unknown retrieval request field: ${unknown}`);
  if (
    typeof record.query !== 'string'
    || !record.query.trim()
    || !isSha256(record.indexHash)
  ) {
    throw new Error('retrieval request requires query and indexHash');
  }
};

export const assertAmyHoodHybridIndexManifest: (
  value: unknown,
) => asserts value is AmyHoodHybridIndexManifest = (value) => {
  if (!value || typeof value !== 'object') {
    throw new Error('hybrid index manifest must be an object');
  }
  const manifest = value as Record<string, unknown>;
  const config = manifest.retrievalConfig as Record<string, unknown> | undefined;
  const calibration = manifest.calibration as Record<string, unknown> | undefined;
  if (
    manifest.schemaVersion !== 1
    || manifest.embeddingModel !== 'bge-m3-Q8_0.gguf'
    || manifest.embeddingDimension !== 1024
    || manifest.builderVersion !== 'hybrid-v1'
    || manifest.lexicalVersion !== 'bm25-v1'
  ) {
    throw new Error('unsupported hybrid index identity');
  }
  for (const key of [
    'releaseManifestHash',
    'holdoutManifestHash',
    'retrievalConfigHash',
    'calibrationSetHash',
    'vectorsHash',
    'indexHash',
  ]) {
    if (!isSha256(manifest[key])) throw new Error(`invalid SHA-256 field: ${key}`);
  }
  if (
    !Array.isArray(manifest.recordHashes)
    || manifest.recordHashes.some((hash) => !isSha256(hash))
    || !Number.isInteger(manifest.recordCount)
    || manifest.recordCount !== manifest.recordHashes.length
  ) {
    throw new Error('record count and hashes must agree');
  }
  if (
    !config
    || !['vectorWeight', 'lexicalWeight', 'bm25K', 'minimumScore'].every(
      (key) => typeof config[key] === 'number' && Number.isFinite(config[key]),
    )
  ) {
    throw new Error('retrieval config must contain finite numbers');
  }
  if (
    !calibration
    || !['recallAt3', 'noMatchFalsePositiveRate'].every(
      (key) => typeof calibration[key] === 'number'
        && Number.isFinite(calibration[key])
        && Number(calibration[key]) >= 0
        && Number(calibration[key]) <= 1,
    )
  ) {
    throw new Error('calibration metrics must be in [0, 1]');
  }
  if (
    manifest.vectorsFile !== 'vectors.f32'
    || typeof manifest.releaseId !== 'string'
    || !manifest.releaseId
    || typeof manifest.createdAt !== 'string'
    || Number.isNaN(Date.parse(manifest.createdAt))
  ) {
    throw new Error('invalid hybrid index metadata');
  }
};
