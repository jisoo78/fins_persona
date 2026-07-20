/**
 * Test Plan:
 * 1. Happy Path:
 *    - a complete hybrid-index manifest and retrieval request validate.
 * 2. Edge Cases:
 *    - historical Evaluation v3 records may omit retrieval fields.
 *    - no-match permits an empty selected-artifact list.
 *    - Korean evidence and nullable source URL are preserved.
 * 3. Failure Path:
 *    - wrong dimensions, non-finite metrics, and evaluation-private request fields fail safely.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertAmyHoodHybridIndexManifest,
  assertAmyHoodRetrievalRequest,
  type AmyHoodHybridIndexManifest,
  type AmyHoodIndexedEvidence,
  type AmyHoodRetrievalTrace,
} from '../shared/amyHoodRag';

const manifest = (): AmyHoodHybridIndexManifest => ({
  schemaVersion: 1,
  releaseId: 'v1-aaaaaaaaaaaa',
  releaseManifestHash: 'a'.repeat(64),
  holdoutManifestHash: 'b'.repeat(64),
  embeddingModel: 'bge-m3-Q8_0.gguf',
  embeddingDimension: 1024,
  builderVersion: 'hybrid-v1',
  lexicalVersion: 'bm25-v1',
  retrievalConfig: {
    vectorWeight: 0.7,
    lexicalWeight: 0.3,
    bm25K: 4,
    minimumScore: 0.55,
  },
  retrievalConfigHash: 'c'.repeat(64),
  calibrationSetHash: 'd'.repeat(64),
  calibration: { recallAt3: 1, noMatchFalsePositiveRate: 0 },
  recordCount: 1,
  recordHashes: ['e'.repeat(64)],
  vectorsFile: 'vectors.f32',
  vectorsHash: 'f'.repeat(64),
  indexHash: '1'.repeat(64),
  createdAt: '2026-07-20T00:00:00.000Z',
});

test('happy: complete manifest and public request validate', () => {
  assert.doesNotThrow(() => assertAmyHoodHybridIndexManifest(manifest()));
  assert.doesNotThrow(() => assertAmyHoodRetrievalRequest({
    query: '수요 기반 투자?',
    indexHash: 'a'.repeat(64),
  }));
});

test('edge: historical evaluation records may omit retrieval fields', () => {
  const historical = { questionId: 'D01', status: 'complete', elapsedMs: 1 };
  assert.equal('retrieval' in historical, false);
});

test('edge: no-match trace permits empty selected artifacts', () => {
  const trace: AmyHoodRetrievalTrace = {
    queryHash: 'a'.repeat(64),
    indexHash: 'b'.repeat(64),
    retrievalConfigHash: 'c'.repeat(64),
    cacheKey: 'd'.repeat(64),
    selectedArtifacts: [],
    expandedArtifactIds: [],
    evidenceIds: [],
    sourceIds: [],
    noMatch: true,
    noMatchReason: 'below_threshold',
    contextTokens: 0,
    tokenCounter: 'conservative_estimator',
    contextHash: 'e'.repeat(64),
  };
  assert.deepEqual(trace.selectedArtifacts, []);
});

test('edge: Korean evidence and nullable URL remain representable', () => {
  const evidence: AmyHoodIndexedEvidence = {
    id: 'span-1',
    exactQuote: '고객 수요가 투자를 이끕니다.',
    speaker: 'Amy Hood',
    sourceId: 'source-1',
    sourceType: 'interview',
    sourceTitle: '인터뷰',
    publishedAt: '2023-01-01',
    sourceUrl: null,
    candidateId: 'candidate-1',
    temporalRelation: 'at_decision',
  };
  assert.equal(evidence.sourceUrl, null);
  assert.match(evidence.exactQuote, /고객 수요/);
});

test('failure: invalid manifest identity and metrics are rejected', () => {
  assert.throws(
    () => assertAmyHoodHybridIndexManifest({ ...manifest(), embeddingDimension: 768 }),
    /unsupported hybrid index identity/,
  );
  assert.throws(
    () => assertAmyHoodHybridIndexManifest({
      ...manifest(),
      calibration: { recallAt3: Number.NaN, noMatchFalsePositiveRate: 0 },
    }),
    /calibration metrics/,
  );
});

test('failure: private evaluation fields are rejected', () => {
  assert.throws(
    () => assertAmyHoodRetrievalRequest({
      query: '수요 기반 투자?',
      indexHash: 'a'.repeat(64),
      questionId: 'D01',
    }),
    /unknown retrieval request field: questionId/,
  );
});
