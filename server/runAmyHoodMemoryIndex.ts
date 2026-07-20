import { fileURLToPath } from 'node:url';
import type { EmbeddingClient } from './decisionAdvisor/embeddingClient';
import { createBgeM3EmbeddingClient } from './decisionAdvisor/embeddingClient';
import { buildAmyHoodMemoryIndex, loadActiveAmyHoodMemoryIndex } from './decisionAdvisor/memoryIndex';
import { activateAmyHoodMemoryIndex } from './decisionAdvisor/memoryIndex';
import { evaluateAmyHoodRetrievalCalibration, type RetrievalCalibrationMetrics } from './decisionAdvisor/hybridRetriever';

export const runAmyHoodMemoryIndexCommand = async (
  args: string[],
  dependencies: {
    root: string;
    embeddingClient: EmbeddingClient;
    evaluateCalibration?: (candidate: Parameters<typeof evaluateAmyHoodRetrievalCalibration>[0]['candidate']) => Promise<RetrievalCalibrationMetrics>;
  } = {
    root: process.cwd(),
    embeddingClient: createBgeM3EmbeddingClient(),
  },
) => {
  const command = args[0];
  if (command !== 'build' && command !== 'check') throw new Error('expected build or check');
  await dependencies.embeddingClient.preflight();
  const result = command === 'build'
    ? await buildAmyHoodMemoryIndex(dependencies.root, {
      embeddingClient: dependencies.embeddingClient,
      evaluateCalibration: dependencies.evaluateCalibration ?? ((candidate) =>
        evaluateAmyHoodRetrievalCalibration({ root: dependencies.root, candidate, embeddingClient: dependencies.embeddingClient })),
    })
    : await loadActiveAmyHoodMemoryIndex(dependencies.root);
  if (command === 'build') {
    await activateAmyHoodMemoryIndex(dependencies.root, result.manifest.indexHash);
  }
  console.log(JSON.stringify({ command, releaseId: result.manifest.releaseId, indexHash: result.manifest.indexHash, records: result.records.length }));
  return result;
};

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  void runAmyHoodMemoryIndexCommand(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
