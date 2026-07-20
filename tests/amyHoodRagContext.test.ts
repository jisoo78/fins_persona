/**
 * Test Plan:
 * 1. Happy Path:
 *    - a policy result renders action, exact Amy Hood quotes, and source metadata.
 * 2. Edge Cases:
 *    - no-match renders an explicit empty-memory marker.
 *    - a tight budget drops whole evidence blocks without slicing quotes.
 *    - duplicate evidence references render once.
 * 3. Failure Path:
 *    - stale retrieval hashes fail safely.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAmyHoodMemoryIndex } from '../server/decisionAdvisor/memoryIndex';
import { createAmyHoodHybridRetriever } from '../server/decisionAdvisor/hybridRetriever';
import { buildAmyHoodRagContext } from '../server/decisionAdvisor/ragContext';
import { fakeEmbeddingClient, writeAmyHoodRagFixture } from './helpers/amyHoodRagFixture';

const fixture = async (query = 'customer demand capacity urgency') => {
  const root = await writeAmyHoodRagFixture();
  const built = await buildAmyHoodMemoryIndex(root, { embeddingClient: fakeEmbeddingClient() });
  const retriever = await createAmyHoodHybridRetriever({ root, embeddingClient: fakeEmbeddingClient() });
  return { root, retrieval: await retriever.retrieve({ query, indexHash: built.manifest.indexHash }) };
};

test('happy: renders actual evidence text', async () => {
  const input = await fixture();
  const context = await buildAmyHoodRagContext({ ...input, projection: 'full' });
  assert.match(context.text, /Recommended action: scale_infrastructure_constrain_opex/);
  assert.match(context.text, /We expect capital expenditures to have a material sequential increase/);
  assert.match(context.text, /Published: 2023-04-25/);
});

test('edge: no-match renders an explicit empty marker', async () => {
  const input = await fixture('banana orchard');
  input.retrieval.matches = [];
  input.retrieval.trace.noMatch = true;
  input.retrieval.trace.noMatchReason = 'below_threshold';
  const context = await buildAmyHoodRagContext({ ...input, projection: 'policy' });
  assert.match(context.text, /No approved memory matched/);
});

test('edge: evidence is deduplicated and whole-block budgeted', async () => {
  const input = await fixture();
  const context = await buildAmyHoodRagContext({ ...input, projection: 'policy', maxContextTokens: 250 });
  assert.equal(new Set(context.trace.evidenceIds).size, context.trace.evidenceIds.length);
  assert.ok(context.trace.contextTokens <= 250);
  assert.doesNotMatch(context.text, /\.\.\.$/);
});

test('edge: policy and full projections preserve one retrieval cache key', async () => {
  const input = await fixture();
  const policy = await buildAmyHoodRagContext({ ...input, projection: 'policy' });
  const full = await buildAmyHoodRagContext({ ...input, projection: 'full' });
  assert.equal(policy.trace.cacheKey, full.trace.cacheKey);
});

test('failure: stale retrieval hash fails closed', async () => {
  const input = await fixture();
  input.retrieval.trace.indexHash = 'a'.repeat(64);
  await assert.rejects(buildAmyHoodRagContext({ ...input, projection: 'full' }), /hash mismatch/);
});
