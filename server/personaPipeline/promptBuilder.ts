import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { InventoryEntry } from './corpus';
import type { ModelClient } from './modelClient';
import {
  providerArtifactName,
  type ProviderName,
  type RawSource,
  type SourceAnalysis,
  type SourceChunk,
} from './types';

export interface GateResult {
  passed: boolean;
  failures: string[];
}

export interface BuildPromptOptions {
  root: string;
  provider: ProviderName;
  model: ModelClient;
}

const dataRoot = (root: string) => resolve(root, 'data/b-track/amy-hood');
export const sourceAnalysisPath = (root: string, provider: ProviderName) =>
  resolve(dataRoot(root), `source-analysis.${providerArtifactName(provider)}.jsonl`);
export const personaPromptPath = (root: string, provider: ProviderName) =>
  resolve(dataRoot(root), `AMY_HOOD_PERSONA.${providerArtifactName(provider)}.md`);
export const resumeProofPath = (root: string) =>
  resolve(dataRoot(root), '.analysis-cache/local/resume-proof.json');

const pathExists = async (path: string) => {
  try {
    await readFile(path);
    return true;
  } catch {
    return false;
  }
};

const readJson = async <T>(path: string, fallback: T): Promise<T> => {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch {
    return fallback;
  }
};

const readJsonl = async <T>(path: string): Promise<T[]> => {
  try {
    return (await readFile(path, 'utf8'))
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as T);
  } catch {
    return [];
  }
};

const readRawSources = async (root: string) => {
  const directory = resolve(dataRoot(root), 'raw-sources');
  const files = await readdir(directory).catch(() => []);
  const sources: RawSource[] = [];
  for (const file of files.filter((name) => name.endsWith('.json'))) {
    sources.push(await readJson<RawSource>(resolve(directory, file), {} as RawSource));
  }
  return sources;
};

const promptExists = (root: string) => pathExists(personaPromptPath(root, 'local'));

const collectGateFailures = async (root: string, includeFinalArtifacts: boolean) => {
  const failures: string[] = [];
  const inventory = await readJson<InventoryEntry[]>(
    resolve(dataRoot(root), 'source-inventory.json'),
    [],
  );
  const selected = inventory.filter((entry) => entry.status === 'selected');
  const holdoutIds = new Set(
    inventory.filter((entry) => entry.status === 'holdout').map((entry) => entry.source_id),
  );
  const raw = await readRawSources(root);
  const chunks = await readJson<SourceChunk[]>(
    resolve(dataRoot(root), 'chunks/manifest.json'),
    [],
  );
  const analyses = await readJsonl<SourceAnalysis>(sourceAnalysisPath(root, 'local'));

  if (selected.length !== 18 || raw.length !== 18) {
    failures.push('selected raw source count must be 18');
  }
  if (raw.some((source) => source.collectionStatus !== 'complete')) {
    failures.push('raw source collection is incomplete');
  }
  if (chunks.length === 0) failures.push('chunk manifest is missing');
  if (chunks.some((chunk) => holdoutIds.has(chunk.sourceId))) {
    failures.push('holdout chunk detected');
  }
  if (chunks.some((chunk) => chunk.tokenCount > 10_000)) {
    failures.push('chunk token limit exceeded');
  }
  if (analyses.length !== 18 || analyses.some((analysis) => analysis.status !== 'complete')) {
    failures.push('Gemma source analyses incomplete');
  }
  if (includeFinalArtifacts && !(await promptExists(root))) {
    failures.push('Gemma persona prompt missing');
  }
  if (includeFinalArtifacts && !(await pathExists(resumeProofPath(root)))) {
    failures.push('resume verification missing');
  }
  return failures;
};

export const checkGemmaGate = async (root: string): Promise<GateResult> => {
  const failures = await collectGateFailures(root, true);
  return { passed: failures.length === 0, failures };
};

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

const requiredHeadings = [
  '## Role',
  '## Identity',
  '## Decision Principles',
  '## Cross-Dimension Rules',
  '## Red Lines',
  '## Communication Style',
  '## Unknown Policy',
  '## Response Format',
];

export const buildMasterPrompt = async (options: BuildPromptOptions) => {
  if (options.model.provider !== options.provider) {
    throw new Error('model provider does not match requested provider');
  }
  if (options.provider === 'openai') {
    const gate = await checkGemmaGate(options.root);
    if (!gate.passed) throw new Error(`Gemma gate failed: ${gate.failures.join('; ')}`);
  }

  const analysesPath = sourceAnalysisPath(options.root, options.provider);
  const analyses = await readJsonl<SourceAnalysis>(analysesPath);
  if (analyses.length !== 18 || analyses.some((analysis) => analysis.status !== 'complete')) {
    throw new Error(`18 source analyses are required for ${options.provider}`);
  }
  if (options.provider === 'local') {
    const failures = await collectGateFailures(options.root, false);
    if (failures.length) throw new Error(`Gemma pre-prompt gate failed: ${failures.join('; ')}`);
  }

  const template = await readFile(
    resolve(options.root, 'agent_prompts/prompts/amy-hood-master-prompt.md'),
    'utf8',
  );
  const result = await options.model.invoke(
    template.replace('{analyses}', analyses.map((analysis) => JSON.stringify(analysis)).join('\n')),
  );
  const markdown = result.text.trim();
  const missing = requiredHeadings.filter((heading) => !markdown.includes(heading));
  if (missing.length) throw new Error(`persona prompt missing headings: ${missing.join(', ')}`);
  await atomicWrite(personaPromptPath(options.root, options.provider), `${markdown}\n`);
  return markdown;
};
