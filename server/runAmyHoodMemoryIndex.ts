import { fileURLToPath } from 'node:url';
import type { EmbeddingClient } from './decisionAdvisor/embeddingClient';
import { createBgeM3EmbeddingClient } from './decisionAdvisor/embeddingClient';
import { buildAmyHoodMemoryIndex, loadActiveAmyHoodMemoryIndex } from './decisionAdvisor/memoryIndex';

export const runAmyHoodMemoryIndexCommand = async (
  args: string[],
  dependencies: { root: string; embeddingClient: EmbeddingClient } = {
    root: process.cwd(),
    embeddingClient: createBgeM3EmbeddingClient(),
  },
) => {
  const command = args[0];
  if (command !== 'build' && command !== 'check') throw new Error('expected build or check');
  await dependencies.embeddingClient.preflight();
  const result = command === 'build'
    ? await buildAmyHoodMemoryIndex(dependencies.root, { embeddingClient: dependencies.embeddingClient })
    : await loadActiveAmyHoodMemoryIndex(dependencies.root);
  console.log(JSON.stringify({ command, releaseId: result.manifest.releaseId, indexHash: result.manifest.indexHash, records: result.records.length }));
  return result;
};

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  void runAmyHoodMemoryIndexCommand(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
