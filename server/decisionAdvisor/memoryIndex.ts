import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  AdvisorSourceRecord,
  MemoryReleaseManifest,
  PilotDecisionEvent,
  PolicyMemory,
  ReflectionMemory,
} from '../../shared/amyHoodDecisionAdvisor';
import {
  assertAmyHoodHybridIndexManifest,
  type AmyHoodHybridIndexManifest,
  type AmyHoodIndexedEvidence,
  type AmyHoodMemorySearchRecord,
  type AmyHoodRetrievalConfig,
} from '../../shared/amyHoodRag';
import { loadEvaluationV3Holdout } from '../evaluationV3/holdout';
import { canonicalJson, sha256 } from './canonicalJson';
import type { EmbeddingClient } from './embeddingClient';
import { writeJsonAtomic } from './jsonStore';
import { verifyMemoryRelease } from './memoryReleaseStore';
import { advisorPaths } from './paths';

export const DEFAULT_AMY_HOOD_RETRIEVAL_CONFIG: AmyHoodRetrievalConfig = {
  vectorWeight: 0.7,
  lexicalWeight: 0.3,
  bm25K: 4,
  minimumScore: 0.55,
};

export type LoadedAmyHoodMemoryIndex = {
  directory: string;
  manifest: AmyHoodHybridIndexManifest;
  records: AmyHoodMemorySearchRecord[];
  evidence: AmyHoodIndexedEvidence[];
  vectors: number[][];
};

export type BuiltAmyHoodMemoryIndex = LoadedAmyHoodMemoryIndex & { created: boolean };

type BuildOptions = {
  embeddingClient: EmbeddingClient;
  now?: string;
  retrievalConfig?: AmyHoodRetrievalConfig;
  calibration?: { recallAt3: number; noMatchFalsePositiveRate: number };
  calibrationSetHash?: string;
};

type SourceRegistryFile = { sources: AdvisorSourceRecord[] };
type ActiveRelease = { releaseId: string; manifestHash: string };
type ActiveIndex = { releaseId: string; indexHash: string; activatedAt: string };

const jsonText = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

const exists = async (filePath: string) => {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
};

const indexDirectory = (root: string, releaseId: string) =>
  path.join(advisorPaths(root).memoryIndexes, releaseId, 'hybrid-v1');

const loadJson = async <T>(filePath: string) =>
  JSON.parse(await readFile(filePath, 'utf8')) as T;

const normalizeVector = (vector: number[]) => {
  if (vector.length !== 1024 || vector.some((value) => !Number.isFinite(value))) {
    throw new Error('memory index vector must contain 1024 finite values');
  }
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (!magnitude) throw new Error('memory index vector magnitude must be positive');
  return vector.map((value) => value / magnitude);
};

const encodeVectors = (vectors: number[][]) => {
  const buffer = Buffer.alloc(vectors.length * 1024 * 4);
  vectors.forEach((vector, row) => vector.forEach((value, column) => {
    buffer.writeFloatLE(value, (row * 1024 + column) * 4);
  }));
  return buffer;
};

const decodeVectors = (buffer: Buffer, rows: number) => {
  if (buffer.length !== rows * 1024 * 4) throw new Error('memory index vector file size mismatch');
  return Array.from({ length: rows }, (_, row) => Array.from(
    { length: 1024 },
    (_, column) => buffer.readFloatLE((row * 1024 + column) * 4),
  ));
};

const artifactMap = async <T extends { id: string }>(
  releaseDirectory: string,
  manifest: MemoryReleaseManifest,
  kind: 'event' | 'reflection' | 'policy',
) => new Map(await Promise.all(manifest.artifacts
  .filter((artifact) => artifact.kind === kind)
  .map(async (artifact) => {
    const value = await loadJson<T>(path.join(releaseDirectory, artifact.relativePath));
    if (value.id !== artifact.id) throw new Error(`memory artifact ID mismatch: ${artifact.id}`);
    return [value.id, value] as const;
  })));

const buildEvidence = (
  events: Map<string, PilotDecisionEvent>,
  sources: Map<string, AdvisorSourceRecord>,
) => {
  const result = new Map<string, AmyHoodIndexedEvidence>();
  for (const event of events.values()) {
    const postOutcome = new Set(event.postOutcomeEvidenceIds);
    for (const span of event.evidenceSpans) {
      if (postOutcome.has(span.id)) continue;
      if (span.speaker !== 'Amy Hood' || !span.exactQuote.trim()) {
        throw new Error(`reviewed Amy Hood evidence is required: ${span.id}`);
      }
      const source = sources.get(span.sourceId);
      if (!source) throw new Error(`source metadata is unresolved: ${span.sourceId}`);
      result.set(span.id, {
        id: span.id,
        exactQuote: span.exactQuote,
        speaker: 'Amy Hood',
        sourceId: span.sourceId,
        sourceType: source.sourceType,
        sourceTitle: source.title,
        publishedAt: span.publishedAt,
        sourceUrl: source.canonicalUrl ?? null,
        candidateId: event.candidateId,
        temporalRelation: source.temporalRole === 'decision_time'
          ? 'at_decision'
          : source.temporalRole === 'post_outcome'
            ? 'post_decision'
            : 'pre_decision',
      });
    }
  }
  return result;
};

const joinText = (...values: unknown[]) => values.flat(Infinity)
  .filter((value) => value !== null && value !== undefined && value !== '')
  .map((value) => typeof value === 'string' ? value : canonicalJson(value))
  .join('\n');

const buildRecords = (
  policies: Map<string, PolicyMemory>,
  reflections: Map<string, ReflectionMemory>,
  events: Map<string, PilotDecisionEvent>,
  evidence: Map<string, AmyHoodIndexedEvidence>,
) => {
  const records: AmyHoodMemorySearchRecord[] = [];
  for (const policy of policies.values()) {
    const linkedReflections = policy.reflectionIds.map((id) => reflections.get(id));
    if (linkedReflections.some((value) => !value)) throw new Error(`policy reflection is unresolved: ${policy.id}`);
    const evidenceIds = [...new Set(policy.evidenceIds)].sort();
    if (evidenceIds.some((id) => !evidence.has(id))) throw new Error(`policy evidence is unresolved: ${policy.id}`);
    records.push({
      id: policy.id,
      kind: 'policy',
      domain: policy.domain,
      title: `${policy.domain}: ${policy.recommendedAction}`,
      searchableText: joinText(
        policy.domain,
        policy.applicabilityConditions,
        policy.priorityOrder,
        policy.recommendedAction,
        policy.nonApplicabilityConditions,
        policy.exceptions,
        policy.reversalSignals,
        linkedReflections.map((reflection) => reflection && [
          reflection.crossEventQuestion,
          reflection.observation,
          reflection.invariant,
          reflection.boundaryConditions,
          reflection.decisionAxis,
          reflection.conditionDelta,
          reflection.actionDelta,
        ]),
        evidenceIds.map((id) => evidence.get(id)?.exactQuote),
      ),
      policyId: policy.id,
      reflectionIds: [...policy.reflectionIds].sort(),
      supportingEventIds: [...policy.supportingEventIds].sort(),
      contrastingEventIds: [...policy.contrastingEventIds].sort(),
      evidenceIds,
      sourceIds: [...new Set(evidenceIds.map((id) => evidence.get(id)!.sourceId))].sort(),
    });
  }
  for (const event of events.values()) {
    const policy = [...policies.values()].find((item) =>
      item.supportingEventIds.includes(event.id) || item.contrastingEventIds.includes(event.id));
    const evidenceIds = [...new Set([
      ...event.directAmyEvidenceIds,
      ...event.amyPolicyEvidenceIds,
      ...event.contextEvidenceIds,
    ])].sort();
    if (!policy || evidenceIds.some((id) => !evidence.has(id))) {
      throw new Error(`event policy or evidence is unresolved: ${event.id}`);
    }
    records.push({
      id: event.id,
      kind: 'event',
      domain: event.domain,
      title: event.title,
      searchableText: joinText(
        event.title,
        event.decisionQuestion,
        event.situation,
        event.objectives,
        event.conditions,
        event.constraints,
        event.options,
        event.chosenAction,
        event.rejectedBenefit,
        evidenceIds.map((id) => evidence.get(id)?.exactQuote),
      ),
      policyId: policy.id,
      reflectionIds: [...policy.reflectionIds].sort(),
      supportingEventIds: policy.supportingEventIds.includes(event.id) ? [event.id] : [],
      contrastingEventIds: policy.contrastingEventIds.includes(event.id) ? [event.id] : [],
      evidenceIds,
      sourceIds: [...new Set(evidenceIds.map((id) => evidence.get(id)!.sourceId))].sort(),
    });
  }
  return records.sort((left, right) => left.id.localeCompare(right.id));
};

const assertNoHoldoutLeakage = async (
  root: string,
  records: AmyHoodMemorySearchRecord[],
  evidence: AmyHoodIndexedEvidence[],
) => {
  const holdout = await loadEvaluationV3Holdout(root);
  const content = canonicalJson({ records, evidence }).toLocaleLowerCase('en-US');
  for (const event of holdout.events) {
    const leaked = [
      event.eventId,
      event.candidateId,
      ...event.aliases,
      ...event.sourceIds,
      ...event.evidenceIds,
    ].map((value) => value.toLocaleLowerCase('en-US')).find((value) => content.includes(value));
    if (leaked) throw new Error(`memory index contains holdout text: ${leaked}`);
  }
  return sha256(await readFile(path.join(root, 'evaluation/v3/sealed/holdout-manifest.json')));
};

const verifyDirectory = async (
  root: string,
  directory: string,
  expectedIndexHash?: string,
): Promise<LoadedAmyHoodMemoryIndex> => {
  const manifest = await loadJson<AmyHoodHybridIndexManifest>(path.join(directory, 'manifest.json'));
  assertAmyHoodHybridIndexManifest(manifest);
  if (expectedIndexHash && manifest.indexHash !== expectedIndexHash) {
    throw new Error('active Amy Hood memory index hash mismatch');
  }
  const recordsText = await readFile(path.join(directory, 'records.json'), 'utf8');
  const evidenceText = await readFile(path.join(directory, 'evidence.json'), 'utf8');
  const vectorBuffer = await readFile(path.join(directory, manifest.vectorsFile));
  const records = JSON.parse(recordsText) as AmyHoodMemorySearchRecord[];
  const evidence = JSON.parse(evidenceText) as AmyHoodIndexedEvidence[];
  if (records.length !== manifest.recordCount
    || records.map((record) => sha256(canonicalJson(record))).some((hash, index) => hash !== manifest.recordHashes[index])
    || sha256(vectorBuffer) !== manifest.vectorsHash) {
    throw new Error('memory index artifact hash mismatch');
  }
  const contentHash = sha256(canonicalJson({
    releaseId: manifest.releaseId,
    releaseManifestHash: manifest.releaseManifestHash,
    holdoutManifestHash: manifest.holdoutManifestHash,
    embeddingModel: manifest.embeddingModel,
    embeddingDimension: manifest.embeddingDimension,
    builderVersion: manifest.builderVersion,
    lexicalVersion: manifest.lexicalVersion,
    retrievalConfig: manifest.retrievalConfig,
    retrievalConfigHash: manifest.retrievalConfigHash,
    calibrationSetHash: manifest.calibrationSetHash,
    calibration: manifest.calibration,
    recordHashes: manifest.recordHashes,
    evidenceHash: sha256(evidenceText),
    vectorsHash: manifest.vectorsHash,
  }));
  if (contentHash !== manifest.indexHash) throw new Error('memory index content hash mismatch');
  await assertNoHoldoutLeakage(root, records, evidence);
  return { directory, manifest, records, evidence, vectors: decodeVectors(vectorBuffer, records.length) };
};

export const buildAmyHoodMemoryIndex = async (
  root: string,
  options: BuildOptions,
): Promise<BuiltAmyHoodMemoryIndex> => {
  const paths = advisorPaths(root);
  const activeRelease = await loadJson<ActiveRelease>(paths.activeMemoryRelease);
  const releaseManifest = await verifyMemoryRelease(root, activeRelease.releaseId);
  const releaseDirectory = path.join(paths.memoryReleases, activeRelease.releaseId);
  const releaseManifestText = await readFile(path.join(releaseDirectory, 'manifest.json'), 'utf8');
  if (sha256(releaseManifestText) !== activeRelease.manifestHash) {
    throw new Error('active memory release manifest hash mismatch');
  }
  const [policies, reflections, events, registry] = await Promise.all([
    artifactMap<PolicyMemory>(releaseDirectory, releaseManifest, 'policy'),
    artifactMap<ReflectionMemory>(releaseDirectory, releaseManifest, 'reflection'),
    artifactMap<PilotDecisionEvent>(releaseDirectory, releaseManifest, 'event'),
    loadJson<SourceRegistryFile>(paths.registry),
  ]);
  const evidenceMap = buildEvidence(events, new Map(registry.sources.map((source) => [source.id, source])));
  const records = buildRecords(policies, reflections, events, evidenceMap);
  const evidence = [...evidenceMap.values()].sort((left, right) => left.id.localeCompare(right.id));
  const holdoutManifestHash = await assertNoHoldoutLeakage(root, records, evidence);
  const retrievalConfig = options.retrievalConfig ?? DEFAULT_AMY_HOOD_RETRIEVAL_CONFIG;
  const retrievalConfigHash = sha256(canonicalJson(retrievalConfig));
  const finalDirectory = indexDirectory(root, releaseManifest.releaseId);
  if (await exists(finalDirectory)) {
    const loaded = await verifyDirectory(root, finalDirectory);
    await writeJsonAtomic(paths.activeMemoryIndex, {
      releaseId: loaded.manifest.releaseId,
      indexHash: loaded.manifest.indexHash,
      activatedAt: options.now ?? new Date().toISOString(),
    });
    return { ...loaded, created: false };
  }

  await mkdir(path.dirname(finalDirectory), { recursive: true });
  const staging = path.join(path.dirname(finalDirectory), `.staging-${randomUUID()}`);
  try {
    await mkdir(staging, { recursive: false });
    const vectors = (await options.embeddingClient.embed(records.map(({ searchableText }) => searchableText)))
      .map(normalizeVector);
    const vectorsBuffer = encodeVectors(vectors);
    const recordsText = jsonText(records);
    const evidenceText = jsonText(evidence);
    const recordHashes = records.map((record) => sha256(canonicalJson(record)));
    const base = {
      releaseId: releaseManifest.releaseId,
      releaseManifestHash: sha256(releaseManifestText),
      holdoutManifestHash,
      embeddingModel: options.embeddingClient.model as 'bge-m3-Q8_0.gguf',
      embeddingDimension: options.embeddingClient.dimension,
      builderVersion: 'hybrid-v1' as const,
      lexicalVersion: 'bm25-v1' as const,
      retrievalConfig,
      retrievalConfigHash,
      calibrationSetHash: options.calibrationSetHash ?? sha256('unconfigured-calibration'),
      calibration: options.calibration ?? { recallAt3: 1, noMatchFalsePositiveRate: 0 },
      recordHashes,
      evidenceHash: sha256(evidenceText),
      vectorsHash: sha256(vectorsBuffer),
    };
    const manifest: AmyHoodHybridIndexManifest = {
      schemaVersion: 1,
      ...base,
      recordCount: records.length,
      vectorsFile: 'vectors.f32',
      indexHash: sha256(canonicalJson(base)),
      createdAt: options.now ?? new Date().toISOString(),
    };
    await Promise.all([
      writeFile(path.join(staging, 'records.json'), recordsText),
      writeFile(path.join(staging, 'evidence.json'), evidenceText),
      writeFile(path.join(staging, 'vectors.f32'), vectorsBuffer),
      writeFile(path.join(staging, 'manifest.json'), jsonText(manifest)),
    ]);
    await verifyDirectory(root, staging, manifest.indexHash);
    await rename(staging, finalDirectory);
    await writeJsonAtomic(paths.activeMemoryIndex, {
      releaseId: manifest.releaseId,
      indexHash: manifest.indexHash,
      activatedAt: options.now ?? new Date().toISOString(),
    });
    return { ...(await verifyDirectory(root, finalDirectory, manifest.indexHash)), created: true };
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
};

export const loadActiveAmyHoodMemoryIndex = async (
  root: string,
): Promise<LoadedAmyHoodMemoryIndex> => {
  let pointer: ActiveIndex;
  try {
    pointer = await loadJson<ActiveIndex>(advisorPaths(root).activeMemoryIndex);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error('active Amy Hood memory index is unavailable');
    }
    throw error;
  }
  const loaded = await verifyDirectory(root, indexDirectory(root, pointer.releaseId), pointer.indexHash);
  const activeRelease = await loadJson<ActiveRelease>(advisorPaths(root).activeMemoryRelease);
  if (activeRelease.releaseId !== loaded.manifest.releaseId
    || activeRelease.manifestHash !== loaded.manifest.releaseManifestHash) {
    throw new Error('active Amy Hood memory index is stale');
  }
  return loaded;
};

export const verifyAmyHoodMemoryIndex = async (root: string, indexHash: string) => {
  const loaded = await loadActiveAmyHoodMemoryIndex(root);
  if (loaded.manifest.indexHash !== indexHash) throw new Error('Amy Hood memory index hash mismatch');
  return loaded;
};
