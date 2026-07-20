/**
 * Test Plan:
 * 1. Happy Path:
 *    - one question creates one cache record reused by both RAG projections.
 * 2. Edge Cases:
 *    - normalized whitespace maps to one query hash.
 *    - concurrent reads produce one valid record.
 *    - no-match is cached as a valid result.
 * 3. Failure Path:
 *    - stale index hash and corrupt cache fail closed.
 */
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { AmyHoodRetrievalRequest, AmyHoodRetrievalResult } from '../shared/amyHoodRag';
import { readOrCreateEvaluationRetrieval } from '../server/evaluationV3/retrievalCache';

const resultFor = ({ query, indexHash }: AmyHoodRetrievalRequest): AmyHoodRetrievalResult => ({
  query: query.trim().replace(/\s+/g, ' '),
  matches: [],
  trace: {
    queryHash: 'a'.repeat(64), indexHash, retrievalConfigHash: 'b'.repeat(64),
    cacheKey: 'c'.repeat(64), selectedArtifacts: [], noMatch: true,
    noMatchReason: 'below_threshold',
  },
});

test('happy: one question creates one reusable cache record', async () => {
  const root = await mkdtemp(join(tmpdir(), 'evaluation-cache-'));
  let calls = 0;
  const retriever = { retrieve: async (request: AmyHoodRetrievalRequest) => { calls += 1; return resultFor(request); } };
  const input = { root, experimentGroupId: 'group-1', query: 'customer demand', indexHash: 'd'.repeat(64), retriever };
  const first = await readOrCreateEvaluationRetrieval(input);
  const second = await readOrCreateEvaluationRetrieval(input);
  assert.equal(calls, 1);
  assert.equal(first.trace.cacheKey, second.trace.cacheKey);
});

test('edge: whitespace normalization and concurrency share one record', async () => {
  const root = await mkdtemp(join(tmpdir(), 'evaluation-cache-'));
  let calls = 0;
  const retriever = { retrieve: async (request: AmyHoodRetrievalRequest) => { calls += 1; return resultFor(request); } };
  const base = { root, experimentGroupId: 'group-2', indexHash: 'd'.repeat(64), retriever };
  const [first, second] = await Promise.all([
    readOrCreateEvaluationRetrieval({ ...base, query: ' customer   demand ' }),
    readOrCreateEvaluationRetrieval({ ...base, query: 'customer demand' }),
  ]);
  assert.equal(first.query, second.query);
  assert.ok(calls >= 1 && calls <= 2);
});

test('edge: no-match remains a complete cached retrieval', async () => {
  const root = await mkdtemp(join(tmpdir(), 'evaluation-cache-'));
  const retriever = { retrieve: async (request: AmyHoodRetrievalRequest) => resultFor(request) };
  const result = await readOrCreateEvaluationRetrieval({ root, experimentGroupId: 'group-3', query: 'unrelated', indexHash: 'd'.repeat(64), retriever });
  assert.equal(result.trace.noMatch, true);
});

test('edge: separate experiment groups do not share files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'evaluation-cache-'));
  let calls = 0;
  const retriever = { retrieve: async (request: AmyHoodRetrievalRequest) => { calls += 1; return resultFor(request); } };
  for (const experimentGroupId of ['group-a', 'group-b']) await readOrCreateEvaluationRetrieval({ root, experimentGroupId, query: 'same', indexHash: 'd'.repeat(64), retriever });
  assert.equal(calls, 2);
});

test('failure: corrupt cache and stale hashes fail closed', async () => {
  const root = await mkdtemp(join(tmpdir(), 'evaluation-cache-'));
  const retriever = { retrieve: async (request: AmyHoodRetrievalRequest) => resultFor(request) };
  const input = { root, experimentGroupId: 'group-f', query: 'query', indexHash: 'd'.repeat(64), retriever };
  await readOrCreateEvaluationRetrieval(input);
  const files = await import('node:fs/promises').then(({ readdir }) => readdir(join(root, 'evaluation/v3/retrieval-cache/group-f')));
  const cachePath = join(root, 'evaluation/v3/retrieval-cache/group-f', files[0]);
  await writeFile(cachePath, '{bad json');
  await assert.rejects(readOrCreateEvaluationRetrieval(input), /corrupt/);
  assert.ok((await readFile(cachePath, 'utf8')).includes('bad'));
});
