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
import { createAmyHoodHybridRetriever } from '../server/decisionAdvisor/hybridRetriever';
import { buildAmyHoodRagContext } from '../server/decisionAdvisor/ragContext';
import { buildTestAmyHoodMemoryIndex, fakeEmbeddingClient, writeAmyHoodRagFixture } from './helpers/amyHoodRagFixture';

const fixture = async (query = 'customer demand capacity urgency') => {
  const root = await writeAmyHoodRagFixture();
  const built = await buildTestAmyHoodMemoryIndex(root);
  const retriever = await createAmyHoodHybridRetriever({ root, embeddingClient: fakeEmbeddingClient() });
  return { root, retrieval: await retriever.retrieve({ query, indexHash: built.manifest.indexHash }) };
};

test('happy: renders actual evidence text', async () => {
  const input = await fixture();
  const context = await buildAmyHoodRagContext({
    ...input,
    projection: 'full',
    systemPrompt: 'Amy Hood system prompt',
    userPrompt: 'AI 인프라와 운영비를 어떤 순서로 관리합니까?',
  });
  assert.match(context.text, /Recommended action: Scale infrastructure while constraining operating expense growth/);
  assert.match(context.text, /we expect FY24 operating expense growth to remain low/);
  assert.match(context.text, /Published: 2023-04-25/);
  assert.match(context.text, /Decision axis:/);
  assert.match(context.text, /Condition delta:/);
  assert.match(context.text, /event-ai-capacity-opex-pivot-2023/);
  assert.ok(context.trace.requestTokens <= 12_000);
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
  assert.match(context.text, /No approved memory fit the context budget/);
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

test('failure: complete request above 12000 tokens fails closed', async () => {
  const input = await fixture();
  await assert.rejects(buildAmyHoodRagContext({
    ...input,
    projection: 'full',
    systemPrompt: 'x'.repeat(40_000),
    userPrompt: 'question',
  }), /complete model request exceeds 12000 tokens/);
});
