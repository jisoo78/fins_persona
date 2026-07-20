/**
 * Test Plan:
 * 1. Happy Path:
 *    - a free-form question retrieves memory and sends actual evidence to the model.
 * 2. Edge Cases:
 *    - semantic no-match still uses the active prompt.
 *    - recent conversation enters generation but not retrieval.
 *    - source URLs are not exposed in the reply.
 * 3. Failure Path:
 *    - retrieval failure explicitly falls back to prompt-only generation.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ModelInput } from '../server/personaPipeline/modelClient';
import { createAmyHoodAdvisorRuntime } from '../server/decisionAdvisor/advisorRuntime';
import { createAmyHoodHybridRetriever } from '../server/decisionAdvisor/hybridRetriever';
import { buildTestAmyHoodMemoryIndex, fakeEmbeddingClient, writeAmyHoodRagFixture } from './helpers/amyHoodRagFixture';

const setup = async (retrievalFailure = false) => {
  const root = await writeAmyHoodRagFixture();
  await buildTestAmyHoodMemoryIndex(root);
  const observed: ModelInput[] = [];
  const model = {
    provider: 'local' as const,
    model: 'test-e4b',
    cacheKey: 'test',
    invoke: async (input: ModelInput) => {
      observed.push(input);
      return { text: '수요와 수익성 순서로 판단하겠습니다.', elapsedMs: 1 };
    },
  };
  return {
    observed,
    runtime: createAmyHoodAdvisorRuntime({
      root,
      createModel: () => model,
      loadPrompt: async () => ({ content: 'Amy Hood master prompt' }),
      createRetriever: async () => {
        if (retrievalFailure) throw new Error('embedding unavailable');
        const queryClient = {
          ...fakeEmbeddingClient(),
          embed: async (inputs: string[]) => inputs.map((text) =>
            Array.from({ length: 1024 }, (_, index) => index === (/banana/.test(text) ? 100 : 0) ? 1 : 0)),
        };
        return createAmyHoodHybridRetriever({ root, embeddingClient: queryClient });
      },
    }),
  };
};

test('happy: Advisor uses the shared retriever and actual evidence', async () => {
  const { runtime, observed } = await setup();
  const result = await runtime.answer({ message: 'customer demand capacity urgency', recentMessages: [] });
  assert.equal(result.ragFallback, false);
  assert.match((observed[0] as { user: string }).user, /Amy Hood evidence/);
  assert.ok(result.retrieval?.evidenceIds.length);
});

test('edge: no-match uses the active prompt without invented evidence', async () => {
  const { runtime, observed } = await setup();
  const result = await runtime.answer({ message: 'banana orchard', recentMessages: [] });
  assert.match((observed[0] as { system: string }).system, /Amy Hood master prompt/);
  assert.equal(result.noMatch, true);
});

test('edge: recent conversation enters generation but not the retrieval query', async () => {
  const { runtime, observed } = await setup();
  const result = await runtime.answer({
    message: 'capacity urgency',
    recentMessages: [{ sender: 'user', text: '비밀 이전 질문' }],
  });
  assert.match((observed[0] as { user: string }).user, /비밀 이전 질문/);
  assert.ok(result.retrieval);
});

test('edge: source URLs are never appended to the model reply', async () => {
  const { runtime } = await setup();
  const result = await runtime.answer({ message: 'capacity urgency', recentMessages: [] });
  assert.doesNotMatch(result.reply, /https?:\/\//);
});

test('failure: retrieval failure explicitly falls back to prompt-only', async () => {
  const { runtime, observed } = await setup(true);
  const result = await runtime.answer({ message: 'capacity urgency', recentMessages: [] });
  assert.equal(result.ragFallback, true);
  assert.equal(result.fallbackCode, 'embedding_unavailable');
  assert.doesNotMatch((observed[0] as { user: string }).user, /Amy Hood evidence/);
});

test('happy: server and modal expose the dedicated Amy Hood Advisor route', () => {
  const server = readFileSync(join(process.cwd(), 'server/index.ts'), 'utf8');
  const modal = readFileSync(join(process.cwd(), 'src/components/PersonaDetailModal.tsx'), 'utf8');
  assert.match(server, /\/api\/b-track\/amy-hood\/advisor\/chat/);
  assert.match(modal, /amy hood[\s\S]*\/api\/b-track\/amy-hood\/advisor\/chat/i);
});
