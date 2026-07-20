/**
 * Test Plan:
 * 1. Happy Path:
 *    - an AI capacity question retrieves the approved policy through hybrid search.
 * 2. Edge Cases:
 *    - an unrelated acquisition query returns no-match.
 *    - equal scores use stable artifact-ID ordering.
 *    - repeated normalized queries return the same cache key.
 * 3. Failure Path:
 *    - private evaluation fields and stale hashes fail safely.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAmyHoodMemoryIndex } from '../server/decisionAdvisor/memoryIndex';
import { createAmyHoodHybridRetriever } from '../server/decisionAdvisor/hybridRetriever';
import { fakeEmbeddingClient, writeAmyHoodRagFixture } from './helpers/amyHoodRagFixture';

test('happy: retrieves the approved capacity policy', async () => {
  const root = await writeAmyHoodRagFixture();
  const built = await buildAmyHoodMemoryIndex(root, { embeddingClient: fakeEmbeddingClient() });
  const retriever = await createAmyHoodHybridRetriever({ root, embeddingClient: fakeEmbeddingClient() });
  const result = await retriever.retrieve({ query: 'customer demand capacity urgency profitability', indexHash: built.manifest.indexHash });
  assert.equal(result.matches[0].id, 'policy-c4203c075dbd61d3');
});

test('edge: unrelated query returns no-match', async () => {
  const root = await writeAmyHoodRagFixture();
  const built = await buildAmyHoodMemoryIndex(root, { embeddingClient: fakeEmbeddingClient() });
  const orthogonal = { ...fakeEmbeddingClient(), embed: async () => [Array.from({ length: 1024 }, (_, i) => i === 100 ? 1 : 0)] };
  const result = await (await createAmyHoodHybridRetriever({ root, embeddingClient: orthogonal })).retrieve({ query: 'banana orchard', indexHash: built.manifest.indexHash });
  assert.equal(result.trace.noMatch, true);
});

test('edge: repeated normalized queries reuse the cache key', async () => {
  const root = await writeAmyHoodRagFixture();
  const built = await buildAmyHoodMemoryIndex(root, { embeddingClient: fakeEmbeddingClient() });
  const retriever = await createAmyHoodHybridRetriever({ root, embeddingClient: fakeEmbeddingClient() });
  const a = await retriever.retrieve({ query: ' customer   demand ', indexHash: built.manifest.indexHash });
  const b = await retriever.retrieve({ query: 'customer demand', indexHash: built.manifest.indexHash });
  assert.equal(a.trace.cacheKey, b.trace.cacheKey);
});

test('edge: score ties preserve stable artifact ordering', async () => {
  const root = await writeAmyHoodRagFixture();
  const built = await buildAmyHoodMemoryIndex(root, { embeddingClient: fakeEmbeddingClient() });
  const retriever = await createAmyHoodHybridRetriever({ root, embeddingClient: fakeEmbeddingClient() });
  const result = await retriever.retrieve({ query: 'capacity', indexHash: built.manifest.indexHash });
  assert.deepEqual([...result.matches].sort((a, b) => b.fusedScore - a.fusedScore || a.id.localeCompare(b.id)), result.matches);
});

test('failure: private fields and stale hashes are rejected', async () => {
  const root = await writeAmyHoodRagFixture();
  const built = await buildAmyHoodMemoryIndex(root, { embeddingClient: fakeEmbeddingClient() });
  const retriever = await createAmyHoodHybridRetriever({ root, embeddingClient: fakeEmbeddingClient() });
  await assert.rejects(retriever.retrieve({ query: 'x', indexHash: built.manifest.indexHash, correctIntent: 'secret' } as never), /unknown retrieval request field/);
  await assert.rejects(retriever.retrieve({ query: 'x', indexHash: 'a'.repeat(64) }), /hash mismatch/);
});
