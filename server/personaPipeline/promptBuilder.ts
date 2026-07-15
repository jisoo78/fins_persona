import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { InventoryEntry } from './corpus';
import { CORPUS_NORMALIZATION_VERSION } from './corpus';
import type { ModelClient } from './modelClient';
import { modelRequestSettings, modelSettingsFingerprint } from './modelClient';
import { assertValidPersonaPrompt } from './promptValidation';
import {
  activatePromptVersion,
  createPromptVersion,
  listPromptVersions,
  ensurePromptVersionStore,
} from '../promptVersions/store';
import {
  assertNoEvaluationV3Holdout,
  loadEvaluationV3Holdout,
} from '../evaluationV3/holdout';
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

interface ResumeProof {
  verified: true;
  chunkCount: number;
  reusedChunks: number;
  selectedSourceIds: string[];
  manifestSha256: string;
  analysisPromptSha256: string;
  masterPromptSha256: string;
  sourceAnalysisSha256: string;
  personaPromptSha256: string;
  model: string;
  modelCacheKey: string;
}

const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const fileDigest = async (path: string) => digest(await readFile(path, 'utf8'));
const sorted = (values: Iterable<string>) => [...values].sort((left, right) => left.localeCompare(right));
const sameSet = (left: Iterable<string>, right: Iterable<string>) =>
  JSON.stringify(sorted(new Set(left))) === JSON.stringify(sorted(new Set(right)));

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

export const createResumeProof = async (
  root: string,
  model: ModelClient,
  chunkCount: number,
  reusedChunks: number,
): Promise<ResumeProof> => {
  const inventory = await readJson<InventoryEntry[]>(
    resolve(dataRoot(root), 'source-inventory.json'),
    [],
  );
  return {
    verified: true,
    chunkCount,
    reusedChunks,
    selectedSourceIds: sorted(
      inventory.filter((entry) => entry.status === 'selected').map((entry) => entry.source_id),
    ),
    manifestSha256: await fileDigest(resolve(dataRoot(root), 'chunks/manifest.json')),
    analysisPromptSha256: await fileDigest(
      resolve(root, 'agent_prompts/prompts/amy-hood-source-analysis.md'),
    ),
    masterPromptSha256: await fileDigest(
      resolve(root, 'agent_prompts/prompts/amy-hood-master-prompt.md'),
    ),
    sourceAnalysisSha256: await fileDigest(sourceAnalysisPath(root, 'local')),
    personaPromptSha256: await fileDigest(personaPromptPath(root, 'local')),
    model: model.model,
    modelCacheKey: model.cacheKey,
  };
};

export const resumeProofIsCurrent = async (root: string, model?: ModelClient) => {
  const proof = await readJson<ResumeProof | null>(resumeProofPath(root), null);
  if (!proof?.verified) return false;
  const expectedModel = model?.model ?? modelRequestSettings('local').model;
  const expectedCacheKey = model?.cacheKey ?? modelSettingsFingerprint('local');
  const inventory = await readJson<InventoryEntry[]>(
    resolve(dataRoot(root), 'source-inventory.json'),
    [],
  );
  const selectedIds = inventory
    .filter((entry) => entry.status === 'selected')
    .map((entry) => entry.source_id);
  try {
    return (
      proof.model === expectedModel &&
      proof.modelCacheKey === expectedCacheKey &&
      sameSet(proof.selectedSourceIds, selectedIds) &&
      proof.manifestSha256 ===
        (await fileDigest(resolve(dataRoot(root), 'chunks/manifest.json'))) &&
      proof.analysisPromptSha256 ===
        (await fileDigest(resolve(root, 'agent_prompts/prompts/amy-hood-source-analysis.md'))) &&
      proof.masterPromptSha256 ===
        (await fileDigest(resolve(root, 'agent_prompts/prompts/amy-hood-master-prompt.md'))) &&
      proof.sourceAnalysisSha256 === (await fileDigest(sourceAnalysisPath(root, 'local'))) &&
      proof.personaPromptSha256 === (await fileDigest(personaPromptPath(root, 'local')))
    );
  } catch {
    return false;
  }
};

const collectGateFailures = async (
  root: string,
  includeFinalArtifacts: boolean,
  localModel?: ModelClient,
) => {
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
  const selectedIds = selected.map((entry) => entry.source_id);

  if (selected.length !== 18 || raw.length !== 18) {
    failures.push('selected raw source count must be 18');
  }
  if (raw.some((source) => source.collectionStatus !== 'complete')) {
    failures.push('raw source collection is incomplete');
  }
  if (raw.some((source) => source.normalizationVersion !== CORPUS_NORMALIZATION_VERSION)) {
    failures.push('raw source normalization is stale');
  }
  if (!sameSet(selectedIds, raw.map((source) => source.sourceId))) {
    failures.push('selected and raw source IDs differ');
  }
  if (chunks.length === 0) failures.push('chunk manifest is missing');
  if (chunks.some((chunk) => holdoutIds.has(chunk.sourceId))) {
    failures.push('holdout chunk detected');
  }
  if (chunks.some((chunk) => chunk.tokenCount > 10_000)) {
    failures.push('chunk token limit exceeded');
  }
  if (!sameSet(selectedIds, chunks.map((chunk) => chunk.sourceId))) {
    failures.push('selected and chunk source IDs differ');
  }
  if (analyses.length !== 18 || analyses.some((analysis) => analysis.status !== 'complete')) {
    failures.push('Gemma source analyses incomplete');
  }
  if (!sameSet(selectedIds, analyses.map((analysis) => analysis.sourceId))) {
    failures.push('selected and analysis source IDs differ');
  }
  if (!sameSet(chunks.map((chunk) => chunk.chunkId), analyses.flatMap((analysis) => analysis.chunkIds))) {
    failures.push('analysis chunk IDs differ from manifest');
  }
  if (includeFinalArtifacts && !(await promptExists(root))) {
    failures.push('Gemma persona prompt missing');
  }
  if (includeFinalArtifacts && !(await resumeProofIsCurrent(root, localModel))) {
    failures.push('resume verification missing or stale');
  }
  return failures;
};

export const checkGemmaGate = async (
  root: string,
  localModel?: ModelClient,
): Promise<GateResult> => {
  const failures = await collectGateFailures(root, true, localModel);
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

const compactSignals = (signals: SourceAnalysis['decisionCriteria']) =>
  signals.slice(0, 2).map(({ statement, conditions, exceptions }) => ({
    statement,
    conditions,
    exceptions,
  }));

export const compactAnalysesForPrompt = (analyses: SourceAnalysis[]) =>
  analyses.map((analysis) => ({
    sourceId: analysis.sourceId,
    decisionCriteria: compactSignals(analysis.decisionCriteria),
    priorities: compactSignals(analysis.priorities),
    tradeoffs: compactSignals(analysis.tradeoffs),
    riskSignals: compactSignals(analysis.riskSignals),
    communicationPatterns: compactSignals(analysis.communicationPatterns),
  }));

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

  const holdout = await loadEvaluationV3Holdout(options.root);
  assertNoEvaluationV3Holdout(
    'main_prompt',
    analyses.map(({ sourceId }) => ({ artifactClass: 'source', id: sourceId })),
    holdout,
  );

  const template = await readFile(
    resolve(options.root, 'agent_prompts/prompts/amy-hood-master-prompt.md'),
    'utf8',
  );
  const promptAnalyses = compactAnalysesForPrompt(analyses);
  const result = await options.model.invoke(
    template.replace(
      '{analyses}',
      promptAnalyses.map((analysis) => JSON.stringify(analysis)).join('\n'),
    ),
  );
  const markdown = result.text.trim();
  assertValidPersonaPrompt(markdown);
  const content = `${markdown}\n`;
  if (options.provider === 'local') {
    try {
      const manifest = await listPromptVersions(options.root);
      const saved = await createPromptVersion(options.root, {
        content,
        basedOnVersionId: manifest.activeVersionId,
      });
      await activatePromptVersion(options.root, saved.versionId);
    } catch (error) {
      if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'ENOENT') {
        throw error;
      }
      await atomicWrite(personaPromptPath(options.root, options.provider), content);
      await ensurePromptVersionStore(options.root);
    }
  } else {
    await atomicWrite(personaPromptPath(options.root, options.provider), content);
  }
  return markdown;
};
