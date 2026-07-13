import 'dotenv/config';

import { randomUUID } from 'node:crypto';
import { readFile, rename, rm, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

import { analyzeChunks, mergeSourceAnalyses } from './personaPipeline/analyzer';
import { buildChunks, type TokenCounter } from './personaPipeline/chunker';
import {
  collectSelectedCorpus,
  loadCollectedCorpus,
  type InventoryEntry,
} from './personaPipeline/corpus';
import { createModelClient, type ModelClient } from './personaPipeline/modelClient';
import { evaluatePersona } from './personaPipeline/evaluator';
import {
  buildMasterPrompt,
  checkGemmaGate,
  personaPromptPath,
  resumeProofPath,
  sourceAnalysisPath,
} from './personaPipeline/promptBuilder';
import type {
  PipelineRunSummary,
  ProviderName,
  RawSource,
  SourceChunk,
} from './personaPipeline/types';

export interface RunOptions {
  root: string;
  provider?: ProviderName;
  model?: ModelClient;
  tokenCounter?: TokenCounter;
  fetchImpl?: typeof fetch;
}

const dataRoot = (root: string) => resolve(root, 'data/b-track/amy-hood');
const manifestPath = (root: string) => resolve(dataRoot(root), 'chunks/manifest.json');

const atomicWrite = async (path: string, text: string) => {
  await mkdir(resolve(path, '..'), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, text, 'utf8');
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
};

const readInventory = async (root: string) =>
  JSON.parse(
    await readFile(resolve(dataRoot(root), 'source-inventory.json'), 'utf8'),
  ) as InventoryEntry[];

const readManifest = async (root: string) =>
  JSON.parse(await readFile(manifestPath(root), 'utf8')) as SourceChunk[];

export const createLocalTokenCounter = (
  baseUrl = process.env.LOCAL_LLM_BASE_URL || 'http://127.0.0.1:8080/v1',
): TokenCounter => {
  const endpoint = `${baseUrl.replace(/\/v1\/?$/, '')}/tokenize`;
  return async (text) => {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: text, add_special: false }),
    });
    if (!response.ok) throw new Error(`tokenize failed with ${response.status}`);
    const payload = (await response.json()) as { tokens?: unknown[] };
    if (!Array.isArray(payload.tokens)) throw new Error('tokenize response missing tokens');
    return payload.tokens.length;
  };
};

const buildCommonManifest = async (
  root: string,
  sources: RawSource[],
  tokenCounter: TokenCounter,
) => {
  const maxSourceTokens = Number(process.env.LOCAL_LLM_CHUNK_TOKENS || 10_000);
  const contextSize = Number(process.env.LOCAL_LLM_CONTEXT_SIZE || 16_384);
  if (maxSourceTokens + 2_000 + 3_000 + 1_384 > contextSize) {
    throw new Error(`chunk budget exceeds local context size ${contextSize}`);
  }
  const chunks: SourceChunk[] = [];
  for (const source of sources) {
    chunks.push(
      ...(await buildChunks(source, tokenCounter, {
        maxSourceTokens,
        overlapMinTokens: 500,
        overlapMaxTokens: 800,
      })),
    );
  }
  await atomicWrite(manifestPath(root), `${JSON.stringify(chunks, null, 2)}\n`);
  return chunks;
};

const ensureProviderMatches = (provider: ProviderName, model: ModelClient) => {
  if (provider !== model.provider) throw new Error('model provider does not match pipeline provider');
};

const promptExists = async (root: string, provider: ProviderName) => {
  try {
    await readFile(personaPromptPath(root, provider));
    return true;
  } catch {
    return false;
  }
};

export const runPersonaPipeline = async (
  options: RunOptions,
): Promise<PipelineRunSummary> => {
  const started = Date.now();
  const provider = options.provider ?? 'local';
  const model = options.model ?? createModelClient(provider);
  ensureProviderMatches(provider, model);
  const inventory = await readInventory(options.root);

  if (provider === 'openai') {
    const gate = await checkGemmaGate(options.root);
    if (!gate.passed) throw new Error(`Gemma gate failed: ${gate.failures.join('; ')}`);
  }

  const sources =
    provider === 'local'
      ? await collectSelectedCorpus({
          root: options.root,
          entries: inventory,
          fetchImpl: options.fetchImpl,
        })
      : await loadCollectedCorpus(options.root, inventory);
  const chunks =
    provider === 'local'
      ? await buildCommonManifest(
          options.root,
          sources,
          options.tokenCounter ?? createLocalTokenCounter(),
        )
      : await readManifest(options.root);

  if (new Set(chunks.map((chunk) => chunk.sourceId)).size !== 18) {
    throw new Error('chunk manifest must include all 18 selected sources');
  }
  const analysisPrompt = await readFile(
    resolve(options.root, 'agent_prompts/prompts/amy-hood-source-analysis.md'),
    'utf8',
  );
  const cacheDir = resolve(dataRoot(options.root), '.analysis-cache');
  const summary = await analyzeChunks({
    chunks,
    provider,
    model,
    cacheDir,
    prompt: analysisPrompt,
  });
  if (summary.failedChunks > 0) {
    return { ...summary, elapsedMs: Date.now() - started, gatePassed: false };
  }

  await mergeSourceAnalyses({
    chunks,
    provider,
    model: model.model,
    cacheDir,
    outputPath: sourceAnalysisPath(options.root, provider),
  });

  if (!(summary.reusedChunks === summary.chunkCount && (await promptExists(options.root, provider)))) {
    await buildMasterPrompt({ root: options.root, provider, model });
  }
  if (provider === 'local' && summary.reusedChunks === summary.chunkCount) {
    await atomicWrite(
      resumeProofPath(options.root),
      `${JSON.stringify({ verified: true, chunkCount: summary.chunkCount, reusedChunks: summary.reusedChunks }, null, 2)}\n`,
    );
  }
  const gate = await checkGemmaGate(options.root);
  return { ...summary, elapsedMs: Date.now() - started, gatePassed: gate.passed };
};

const readProviderFlag = (args: string[]): ProviderName => {
  const index = args.indexOf('--provider');
  if (index < 0) return 'local';
  const value = args[index + 1];
  if (value !== 'local' && value !== 'openai') throw new Error(`invalid provider: ${value}`);
  return value;
};

const main = async () => {
  const command = process.argv[2] ?? 'analyze';
  const provider = readProviderFlag(process.argv.slice(3));
  if (command === 'check') {
    const gate = await checkGemmaGate(process.cwd());
    console.log(JSON.stringify(gate, null, 2));
    if (!gate.passed) process.exitCode = 1;
    return;
  }
  if (command === 'evaluate') {
    const model = createModelClient(provider);
    const evaluation = await evaluatePersona({ root: process.cwd(), provider, model });
    console.log(
      JSON.stringify(
        { provider, model: model.model, answerCount: evaluation.answers.length },
        null,
        2,
      ),
    );
    return;
  }
  if (command !== 'analyze') throw new Error(`unknown command: ${command}`);
  const summary = await runPersonaPipeline({ root: process.cwd(), provider });
  console.log(JSON.stringify(summary, null, 2));
  if (summary.failedChunks) process.exitCode = 1;
};

if (process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
