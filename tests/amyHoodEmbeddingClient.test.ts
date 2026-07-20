/**
 * Test Plan:
 * 1. Happy Path:
 *    - model discovery and embedding return one normalized 1024-vector per input.
 * 2. Edge Cases:
 *    - a single query is sent as a one-item input array.
 *    - Korean and English text remain unchanged in the request body.
 *    - a batch preserves input/output order.
 * 3. Failure Path:
 *    - timeout, wrong model, count mismatch, dimension mismatch, and non-finite values fail explicitly.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBgeM3EmbeddingClient } from '../server/decisionAdvisor/embeddingClient';

const vector = (position = 0): number[] => Array.from(
  { length: 1024 },
  (_, index) => (index === position ? 2 : 0),
);

test('happy: validates model and embeds a normalized batch', async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    requests.push({ url: String(input), init });
    if (String(input).endsWith('/models')) {
      return Response.json({ data: [{ id: 'bge-m3-Q8_0.gguf' }] });
    }
    const inputs = JSON.parse(String(init?.body)).input as string[];
    return Response.json({
      model: 'bge-m3-Q8_0.gguf',
      data: inputs.map((_value, index) => ({ index, embedding: vector(index) })),
    });
  };
  const client = createBgeM3EmbeddingClient({ fetchImpl });
  assert.deepEqual(await client.preflight(), { model: 'bge-m3-Q8_0.gguf', dimension: 1024 });
  const embedded = await client.embed(['수요 기반 투자', 'capacity urgency']);
  assert.equal(embedded.length, 2);
  assert.equal(embedded[0][0], 1);
  assert.equal(embedded[1][1], 1);
  assert.deepEqual(JSON.parse(String(requests.at(-1)?.init?.body)).input, [
    '수요 기반 투자',
    'capacity urgency',
  ]);
});

test('edge: a single query remains a one-item input array', async () => {
  let body: unknown;
  const client = createBgeM3EmbeddingClient({
    fetchImpl: async (_input, init) => {
      body = JSON.parse(String(init?.body));
      return Response.json({ model: 'bge-m3-Q8_0.gguf', data: [{ index: 0, embedding: vector() }] });
    },
  });
  await client.embed(['하나']);
  assert.deepEqual((body as { input: string[] }).input, ['하나']);
});

test('edge: multilingual text is sent without normalization', async () => {
  const input = ['고객 수요 – AI', 'Margin & CapEx'];
  let observed: string[] = [];
  const client = createBgeM3EmbeddingClient({
    fetchImpl: async (_request, init) => {
      observed = JSON.parse(String(init?.body)).input;
      return Response.json({
        model: 'bge-m3-Q8_0.gguf',
        data: [{ index: 0, embedding: vector(0) }, { index: 1, embedding: vector(1) }],
      });
    },
  });
  await client.embed(input);
  assert.deepEqual(observed, input);
});

test('failure: malformed or unavailable embedding responses fail safely', async () => {
  const wrongModel = createBgeM3EmbeddingClient({
    fetchImpl: async () => Response.json({ model: 'wrong.gguf', data: [{ index: 0, embedding: vector() }] }),
  });
  await assert.rejects(wrongModel.embed(['query']), /model identity/);

  const wrongDimension = createBgeM3EmbeddingClient({
    fetchImpl: async () => Response.json({
      model: 'bge-m3-Q8_0.gguf',
      data: [{ index: 0, embedding: [1, 2] }],
    }),
  });
  await assert.rejects(wrongDimension.embed(['query']), /1024 finite numbers/);

  const nonFinite = vector();
  nonFinite[5] = Number.NaN;
  const invalid = createBgeM3EmbeddingClient({
    fetchImpl: async () => Response.json({
      model: 'bge-m3-Q8_0.gguf',
      data: [{ index: 0, embedding: nonFinite }],
    }),
  });
  await assert.rejects(invalid.embed(['query']), /1024 finite numbers/);
});

test('edge: long logical inputs are chunked and mean-pooled for a 512-token server batch', async () => {
  const bodies: string[][] = [];
  const client = createBgeM3EmbeddingClient({
    maxChunkCharacters: 8,
    fetchImpl: async (_request, init) => {
      const input = JSON.parse(String(init?.body)).input as string[];
      bodies.push(input);
      return Response.json({
        model: 'bge-m3-Q8_0.gguf',
        data: input.map((_text, index) => ({ index, embedding: vector(index) })),
      });
    },
  });
  const [pooled] = await client.embed(['abcdefghABCDEFGH']);
  assert.deepEqual(bodies, [['abcdefgh', 'ABCDEFGH']]);
  assert.ok(Math.abs(pooled[0] - Math.SQRT1_2) < 1e-9);
  assert.ok(Math.abs(pooled[1] - Math.SQRT1_2) < 1e-9);
});
