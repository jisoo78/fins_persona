import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { ModelClient } from './modelClient';
import type {
  AnalysisSignal,
  ChunkAnalysis,
  PipelineRunSummary,
  ProviderName,
  SourceAnalysis,
  SourceChunk,
} from './types';

export interface AnalyzeOptions {
  chunks: SourceChunk[];
  provider: ProviderName;
  model: ModelClient;
  cacheDir: string;
  prompt: string;
}

export interface MergeAnalysisOptions {
  chunks: SourceChunk[];
  provider: ProviderName;
  model: string;
  cacheDir: string;
  outputPath: string;
}

const signalFields = [
  'decisionCriteria',
  'priorities',
  'tradeoffs',
  'riskSignals',
  'communicationPatterns',
] as const;

type SignalField = (typeof signalFields)[number];
type ParsedAnalysis = Record<SignalField, AnalysisSignal[]>;

const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const analysisFingerprint = (chunk: SourceChunk, model: ModelClient, prompt: string) =>
  digest(
    JSON.stringify({
      version: 1,
      chunkSha256: chunk.sha256,
      provider: model.provider,
      model: model.model,
      modelCacheKey: model.cacheKey,
      promptSha256: digest(prompt),
    }),
  );
const cachePath = (cacheDir: string, provider: ProviderName, chunkId: string) =>
  resolve(cacheDir, provider, `${digest(chunkId)}.json`);

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

const extractJson = (text: string) => {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced ?? text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('analysis response does not contain a JSON object');
  return JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>;
};

const normalizeSignal = (value: unknown, locator: string): AnalysisSignal => {
  if (typeof value === 'string') {
    return { statement: value.trim(), conditions: [], exceptions: [], sourceLocator: locator };
  }
  if (!value || typeof value !== 'object') throw new Error('analysis signal must be an object or string');
  const record = value as Record<string, unknown>;
  const statement = String(record.statement ?? '').trim();
  if (!statement) throw new Error('analysis signal statement is required');
  const strings = (input: unknown) =>
    Array.isArray(input) ? input.map(String).map((item) => item.trim()).filter(Boolean) : [];
  return {
    statement,
    conditions: strings(record.conditions),
    exceptions: strings(record.exceptions),
    sourceLocator: String(record.sourceLocator ?? locator).trim() || locator,
  };
};

const parseAnalysis = (text: string, locator: string): ParsedAnalysis => {
  const value = extractJson(text);
  return Object.fromEntries(
    signalFields.map((field) => {
      if (!Array.isArray(value[field])) throw new Error(`analysis field must be an array: ${field}`);
      return [field, value[field].map((item) => normalizeSignal(item, locator))];
    }),
  ) as ParsedAnalysis;
};

const readCompleteCache = async (
  path: string,
  chunk: SourceChunk,
  model: ModelClient,
  fingerprint: string,
) => {
  try {
    const cached = JSON.parse(await readFile(path, 'utf8')) as ChunkAnalysis;
    return cached.status === 'complete' &&
      cached.chunkId === chunk.chunkId &&
      cached.provider === model.provider &&
      cached.model === model.model &&
      cached.fingerprint === fingerprint
      ? cached
      : null;
  } catch {
    return null;
  }
};

const analysisPrompt = (template: string, chunk: SourceChunk) =>
  template
    .replaceAll('{sourceId}', chunk.sourceId)
    .replaceAll('{chunkId}', chunk.chunkId)
    .replaceAll('{chunk}', chunk.text);

const analyzeOneChunk = async (
  chunk: SourceChunk,
  model: ModelClient,
  prompt: string,
  fingerprint: string,
): Promise<ChunkAnalysis> => {
  const result = await model.invoke(analysisPrompt(prompt, chunk));
  const parsed = parseAnalysis(result.text, `${chunk.sourceId}/${chunk.chunkId}`);
  return {
    sourceId: chunk.sourceId,
    chunkId: chunk.chunkId,
    provider: model.provider,
    model: model.model,
    fingerprint,
    ...parsed,
    status: 'complete',
    elapsedMs: result.elapsedMs,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  };
};

export const analyzeChunks = async (options: AnalyzeOptions): Promise<PipelineRunSummary> => {
  const started = Date.now();
  let completedChunks = 0;
  let failedChunks = 0;
  let reusedChunks = 0;
  for (const chunk of options.chunks) {
    const path = cachePath(options.cacheDir, options.provider, chunk.chunkId);
    const fingerprint = analysisFingerprint(chunk, options.model, options.prompt);
    const cached = await readCompleteCache(path, chunk, options.model, fingerprint);
    if (cached) {
      completedChunks += 1;
      reusedChunks += 1;
      continue;
    }

    let analysis: ChunkAnalysis | undefined;
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        analysis = await analyzeOneChunk(chunk, options.model, options.prompt, fingerprint);
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (!analysis) {
      analysis = {
        sourceId: chunk.sourceId,
        chunkId: chunk.chunkId,
        provider: options.provider,
        model: options.model.model,
        fingerprint,
        decisionCriteria: [],
        priorities: [],
        tradeoffs: [],
        riskSignals: [],
        communicationPatterns: [],
        status: 'failed',
        error: lastError instanceof Error ? lastError.message : String(lastError),
        elapsedMs: 0,
      };
    }
    await atomicWrite(path, `${JSON.stringify(analysis, null, 2)}\n`);
    if (analysis.status === 'complete') completedChunks += 1;
    else failedChunks += 1;
  }

  return {
    provider: options.provider,
    model: options.model.model,
    sourceCount: new Set(options.chunks.map((chunk) => chunk.sourceId)).size,
    chunkCount: options.chunks.length,
    completedChunks,
    failedChunks,
    reusedChunks,
    elapsedMs: Date.now() - started,
    gatePassed: false,
  };
};

const signalKey = (signal: AnalysisSignal) =>
  JSON.stringify([
    signal.statement.toLocaleLowerCase(),
    [...signal.conditions].sort(),
    [...signal.exceptions].sort(),
  ]);

const uniqueSignals = (values: AnalysisSignal[]) => {
  const seen = new Set<string>();
  return values.filter((signal) => {
    const key = signalKey(signal);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const mergeSourceAnalyses = async (options: MergeAnalysisOptions) => {
  const cacheFiles = await readdir(resolve(options.cacheDir, options.provider)).catch(() => []);
  const cached = new Map<string, ChunkAnalysis>();
  for (const file of cacheFiles.filter((name) => name.endsWith('.json'))) {
    const analysis = JSON.parse(
      await readFile(resolve(options.cacheDir, options.provider, file), 'utf8'),
    ) as ChunkAnalysis;
    cached.set(analysis.chunkId, analysis);
  }
  const failed = options.chunks.filter((chunk) => cached.get(chunk.chunkId)?.status !== 'complete');
  if (failed.length) throw new Error(`cannot merge analyses with ${failed.length} incomplete chunks`);

  const grouped = new Map<string, ChunkAnalysis[]>();
  for (const chunk of options.chunks) {
    const analysis = cached.get(chunk.chunkId)!;
    grouped.set(chunk.sourceId, [...(grouped.get(chunk.sourceId) ?? []), analysis]);
  }
  const sources: SourceAnalysis[] = [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([sourceId, analyses]) => ({
      sourceId,
      chunkIds: analyses.map((analysis) => analysis.chunkId),
      provider: options.provider,
      model: options.model,
      decisionCriteria: uniqueSignals(analyses.flatMap((analysis) => analysis.decisionCriteria)),
      priorities: uniqueSignals(analyses.flatMap((analysis) => analysis.priorities)),
      tradeoffs: uniqueSignals(analyses.flatMap((analysis) => analysis.tradeoffs)),
      riskSignals: uniqueSignals(analyses.flatMap((analysis) => analysis.riskSignals)),
      communicationPatterns: uniqueSignals(
        analyses.flatMap((analysis) => analysis.communicationPatterns),
      ),
      status: 'complete',
      inputTokens: analyses.reduce((total, analysis) => total + (analysis.inputTokens ?? 0), 0),
      outputTokens: analyses.reduce((total, analysis) => total + (analysis.outputTokens ?? 0), 0),
    }));
  await atomicWrite(
    options.outputPath,
    `${sources.map((source) => JSON.stringify(source)).join('\n')}\n`,
  );
  return sources;
};
