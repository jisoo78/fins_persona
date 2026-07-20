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
import { mkdir, readdir, readFile, symlink, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

import { advisorPaths } from '../server/decisionAdvisor/paths';
import {
  buildAmyHoodMemoryIndex,
  activateAmyHoodMemoryIndex,
  loadActiveAmyHoodMemoryIndex,
  verifyAmyHoodMemoryIndex,
} from '../server/decisionAdvisor/memoryIndex';
import { buildTestAmyHoodMemoryIndex, fakeEmbeddingClient, passingCalibration, writeAmyHoodRagFixture } from './helpers/amyHoodRagFixture';
import { runAmyHoodMemoryIndexCommand } from '../server/runAmyHoodMemoryIndex';

test('happy: builds a source-grounded immutable index', async () => {
  const root = await writeAmyHoodRagFixture();
  const built = await buildTestAmyHoodMemoryIndex(root);
  assert.equal(built.manifest.recordCount, 4);
  assert.equal(built.evidence.length, 6);
  assert.match(built.records.find(({ kind }) => kind === 'policy')?.searchableText ?? '', /disciplined profitability/);
  assert.match(built.evidence.map(({ exactQuote }) => exactQuote).join('\n'), /material sequential increase/);
  await verifyAmyHoodMemoryIndex(root, built.manifest.indexHash);
});

test('edge: rebuilding identical inputs preserves the index hash', async () => {
  const root = await writeAmyHoodRagFixture();
  const first = await buildTestAmyHoodMemoryIndex(root);
  const second = await buildTestAmyHoodMemoryIndex(root);
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
  const built = await buildTestAmyHoodMemoryIndex(root);
  assert.equal(built.evidence.some(({ sourceUrl }) => sourceUrl === null), true);
});

test('edge: duplicate references resolve to unique evidence objects', async () => {
  const root = await writeAmyHoodRagFixture();
  const built = await buildTestAmyHoodMemoryIndex(root);
  assert.equal(new Set(built.evidence.map(({ id }) => id)).size, built.evidence.length);
});

test('failure: embedding failure leaves no partial index', async () => {
  const root = await writeAmyHoodRagFixture();
  await assert.rejects(
    buildAmyHoodMemoryIndex(root, {
      embeddingClient: fakeEmbeddingClient(true),
      evaluateCalibration: async () => passingCalibration,
    }),
    /injected embedding failure/,
  );
  await assert.rejects(loadActiveAmyHoodMemoryIndex(root), /active Amy Hood memory index/);
  const entries = await readdir(advisorPaths(root).memoryIndexes).catch(() => []);
  assert.equal(entries.some((name) => name.startsWith('.staging-')), false);
});

test('failure: release artifacts cannot escape into Evaluation v4 through a symlink', async () => {
  const root = await writeAmyHoodRagFixture();
  const active = JSON.parse(await readFile(advisorPaths(root).activeMemoryRelease, 'utf8'));
  const releaseDirectory = join(advisorPaths(root).memoryReleases, active.releaseId);
  const manifest = JSON.parse(await readFile(join(releaseDirectory, 'manifest.json'), 'utf8'));
  const policyRef = manifest.artifacts.find(({ kind }: { kind: string }) => kind === 'policy');
  assert.ok(policyRef);

  const policyPath = join(releaseDirectory, policyRef.relativePath);
  const evaluationDirectory = join(root, 'evaluation/v4/sources/normalized');
  const evaluationPath = join(evaluationDirectory, 'forbidden-policy.json');
  await mkdir(evaluationDirectory, { recursive: true });
  await writeFile(evaluationPath, await readFile(policyPath));
  await unlink(policyPath);
  await symlink(evaluationPath, policyPath);

  await assert.rejects(() => buildAmyHoodMemoryIndex(root, {
    embeddingClient: fakeEmbeddingClient(),
    evaluateCalibration: async () => passingCalibration,
  }), /artifact path.*release directory/i);
});

test('happy: index CLI builds then checks without changing the pointer', async () => {
  const root = await writeAmyHoodRagFixture();
  const dependencies = {
    root,
    embeddingClient: fakeEmbeddingClient(),
    evaluateCalibration: async () => passingCalibration,
  };
  await runAmyHoodMemoryIndexCommand(['build'], dependencies);
  const before = await readFile(advisorPaths(root).activeMemoryIndex, 'utf8');
  await runAmyHoodMemoryIndexCommand(['check'], dependencies);
  assert.equal(await readFile(advisorPaths(root).activeMemoryIndex, 'utf8'), before);
});

test('failure: a candidate is not active until measured calibration is verified', async () => {
  const root = await writeAmyHoodRagFixture();
  const built = await buildAmyHoodMemoryIndex(root, {
    embeddingClient: fakeEmbeddingClient(),
    evaluateCalibration: async () => passingCalibration,
  });
  await assert.rejects(loadActiveAmyHoodMemoryIndex(root), /active Amy Hood memory index/);
  await activateAmyHoodMemoryIndex(root, built.manifest.indexHash);
  assert.equal((await loadActiveAmyHoodMemoryIndex(root)).manifest.calibration.recallAt3, 1);
});

test('failure: failed CLI calibration preserves the previous active pointer', async () => {
  const root = await writeAmyHoodRagFixture();
  const existing = await buildTestAmyHoodMemoryIndex(root);
  await activateAmyHoodMemoryIndex(root, existing.manifest.indexHash);
  const before = await readFile(advisorPaths(root).activeMemoryIndex, 'utf8');
  await assert.rejects(runAmyHoodMemoryIndexCommand(['build'], {
    root,
    embeddingClient: fakeEmbeddingClient(),
    evaluateCalibration: async () => ({ ...passingCalibration, recallAt3: 0.5 }),
  }), /Recall@3 gate failed/);
  assert.equal(await readFile(advisorPaths(root).activeMemoryIndex, 'utf8'), before);
});
