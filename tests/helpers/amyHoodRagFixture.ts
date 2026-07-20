import { cp, mkdir, mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { EmbeddingClient } from '../../server/decisionAdvisor/embeddingClient';

export const writeAmyHoodRagFixture = async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'amy-hood-rag-'));
  const source = process.cwd();
  await mkdir(path.join(root, 'data/b-track/amy-hood/advisor'), { recursive: true });
  await mkdir(path.join(root, 'evaluation/v3/sealed'), { recursive: true });
  await cp(
    path.join(source, 'data/b-track/amy-hood/advisor/memory-releases'),
    path.join(root, 'data/b-track/amy-hood/advisor/memory-releases'),
    { recursive: true },
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
    return input.map((text, row) => {
      const vector = Array.from({ length: 1024 }, () => 0);
      vector[row % 1024] = text.length || 1;
      return vector;
    });
  },
});
