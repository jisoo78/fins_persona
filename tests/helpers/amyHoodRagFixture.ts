import { cp, mkdir, mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { EmbeddingClient } from '../../server/decisionAdvisor/embeddingClient';
import { buildAmyHoodMemoryIndex } from '../../server/decisionAdvisor/memoryIndex';
import { activateAmyHoodMemoryIndex } from '../../server/decisionAdvisor/memoryIndex';

export const passingCalibration = {
  probeCount: 6,
  positiveProbeCount: 4,
  noMatchProbeCount: 2,
  recallAt3: 1,
  noMatchFalsePositiveRate: 0,
};

export const writeAmyHoodRagFixture = async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'amy-hood-rag-'));
  const source = process.cwd();
  await mkdir(path.join(root, 'data/b-track/amy-hood/advisor'), { recursive: true });
  await mkdir(path.join(root, 'evaluation/v3/sealed'), { recursive: true });
  await mkdir(path.join(root, 'evaluation/retrieval'), { recursive: true });
  await cp(
    path.join(source, 'data/b-track/amy-hood/advisor/memory-releases'),
    path.join(root, 'data/b-track/amy-hood/advisor/memory-releases'),
    { recursive: true },
  );
  await cp(
    path.join(source, 'evaluation/retrieval/amy-hood-memory-dev-v1.json'),
    path.join(root, 'evaluation/retrieval/amy-hood-memory-dev-v1.json'),
  );
  await cp(
    path.join(source, 'data/b-track/amy-hood/advisor/source-registry.json'),
    path.join(root, 'data/b-track/amy-hood/advisor/source-registry.json'),
  );
  await cp(
    path.join(source, 'evaluation/v3/sealed/holdout-manifest.json'),
    path.join(root, 'evaluation/v3/sealed/holdout-manifest.json'),
  );
  return root;
};

export const fakeEmbeddingClient = (fail = false): EmbeddingClient => ({
  model: 'bge-m3-Q8_0.gguf',
  dimension: 1024,
  preflight: async () => ({ model: 'bge-m3-Q8_0.gguf', dimension: 1024 }),
  embed: async (input) => {
    if (fail) throw new Error('injected embedding failure');
    return input.map((text) => {
      const vector = Array.from({ length: 1024 }, () => 0);
      for (const token of text.toLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? []) {
        let hash = 2166136261;
        for (const character of token) hash = Math.imul(hash ^ character.codePointAt(0)!, 16777619);
        vector[(hash >>> 0) % vector.length] += 1;
      }
      return vector;
    });
  },
});

export const buildTestAmyHoodMemoryIndex = (
  root: string,
  embeddingClient = fakeEmbeddingClient(),
) => buildAmyHoodMemoryIndex(root, {
  embeddingClient,
  evaluateCalibration: async () => passingCalibration,
}).then(async (built) => {
  await activateAmyHoodMemoryIndex(root, built.manifest.indexHash);
  return built;
});
