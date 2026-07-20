/**
 * Test Plan:
 * 1. Happy Path:
 *    - an approved release builds four search records containing six reviewed Amy Hood quotes.
 * 2. Edge Cases:
 *    - rebuilding identical inputs preserves the deterministic index hash.
 *    - source metadata with a nullable URL remains indexable.
 *    - duplicate evidence references resolve to one indexed evidence object.
 * 3. Failure Path:
 *    - embedding failure leaves no partial index or active pointer.
 */
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

import { advisorPaths } from '../server/decisionAdvisor/paths';
import {
  buildAmyHoodMemoryIndex,
  loadActiveAmyHoodMemoryIndex,
  verifyAmyHoodMemoryIndex,
} from '../server/decisionAdvisor/memoryIndex';
import { fakeEmbeddingClient, writeAmyHoodRagFixture } from './helpers/amyHoodRagFixture';
import { runAmyHoodMemoryIndexCommand } from '../server/runAmyHoodMemoryIndex';

test('happy: builds a source-grounded immutable index', async () => {
  const root = await writeAmyHoodRagFixture();
  const built = await buildAmyHoodMemoryIndex(root, {
    embeddingClient: fakeEmbeddingClient(),
    now: '2026-07-20T00:00:00.000Z',
  });
  assert.equal(built.manifest.recordCount, 4);
  assert.equal(built.evidence.length, 6);
  assert.match(built.records.find(({ kind }) => kind === 'policy')?.searchableText ?? '', /disciplined profitability/);
  assert.match(built.evidence.map(({ exactQuote }) => exactQuote).join('\n'), /material sequential increase/);
  await verifyAmyHoodMemoryIndex(root, built.manifest.indexHash);
});

test('edge: rebuilding identical inputs preserves the index hash', async () => {
  const root = await writeAmyHoodRagFixture();
  const first = await buildAmyHoodMemoryIndex(root, { embeddingClient: fakeEmbeddingClient() });
  const second = await buildAmyHoodMemoryIndex(root, { embeddingClient: fakeEmbeddingClient() });
  assert.equal(second.manifest.indexHash, first.manifest.indexHash);
});

test('edge: source metadata remains available without a URL', async () => {
  const root = await writeAmyHoodRagFixture();
  const registryPath = advisorPaths(root).registry;
  const registry = JSON.parse(await readFile(registryPath, 'utf8'));
  const used = new Set(['source-fbb900eb7e249591', 'source-4f4085f8344669c4', 'source-6b843b4b8385078d']);
  for (const source of registry.sources) if (used.has(source.id)) source.canonicalUrl = null;
  await import('node:fs/promises').then(({ writeFile }) =>
    writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`));
  const built = await buildAmyHoodMemoryIndex(root, { embeddingClient: fakeEmbeddingClient() });
  assert.equal(built.evidence.some(({ sourceUrl }) => sourceUrl === null), true);
});

test('edge: duplicate references resolve to unique evidence objects', async () => {
  const root = await writeAmyHoodRagFixture();
  const built = await buildAmyHoodMemoryIndex(root, { embeddingClient: fakeEmbeddingClient() });
  assert.equal(new Set(built.evidence.map(({ id }) => id)).size, built.evidence.length);
});

test('failure: embedding failure leaves no partial index', async () => {
  const root = await writeAmyHoodRagFixture();
  await assert.rejects(
    buildAmyHoodMemoryIndex(root, { embeddingClient: fakeEmbeddingClient(true) }),
    /injected embedding failure/,
  );
  await assert.rejects(loadActiveAmyHoodMemoryIndex(root), /active Amy Hood memory index/);
  const entries = await readdir(advisorPaths(root).memoryIndexes).catch(() => []);
  assert.equal(entries.some((name) => name.startsWith('.staging-')), false);
});

test('happy: index CLI builds then checks without changing the pointer', async () => {
  const root = await writeAmyHoodRagFixture();
  const dependencies = { root, embeddingClient: fakeEmbeddingClient() };
  await runAmyHoodMemoryIndexCommand(['build'], dependencies);
  const before = await readFile(advisorPaths(root).activeMemoryIndex, 'utf8');
  await runAmyHoodMemoryIndexCommand(['check'], dependencies);
  assert.equal(await readFile(advisorPaths(root).activeMemoryIndex, 'utf8'), before);
});
