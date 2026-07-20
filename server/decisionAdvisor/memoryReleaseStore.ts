import { randomUUID } from 'node:crypto';
import {
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';

import type {
  MemoryArtifactRef,
  MemoryReleaseManifest,
  PilotDecisionEvent,
  PolicyMemory,
  ReflectionMemory,
} from '../../shared/amyHoodDecisionAdvisor';
import {
  assertNoEvaluationV3Holdout,
  loadEvaluationV3Holdout,
  type EvaluationV3ArtifactReference,
  type EvaluationV3HoldoutManifest,
} from '../evaluationV3/holdout';
import { canonicalJson, sha256 } from './canonicalJson';
import { writeJsonAtomic } from './jsonStore';
import { advisorPaths } from './paths';
import { validatePolicyMemory } from './policyMemory';
import type { PolicyMemoryInputGraph } from './policyMemoryInput';
import {
  loadApprovedPolicies,
  loadApprovedReflections,
} from './policyMemoryStore';
import { validateReflectionMemory } from './reflectionMemory';

type EvaluationContextSnapshot = {
  releaseId: string;
  policy: string[];
  reflections: string[];
  events: string[];
  counterexamples: string[];
  counterexampleStatus: 'reviewed';
  references: EvaluationV3ArtifactReference[];
};

export type BuiltMemoryRelease = {
  manifest: MemoryReleaseManifest;
  directory: string;
  created: boolean;
};

type BuildOptions = {
  graph: PolicyMemoryInputGraph;
  now?: string;
  minimumPolicySchema?: 1 | 2;
};

type ActivationDependencies = {
  write(filePath: string, value: unknown): Promise<void>;
};

const defaultActivationDependencies: ActivationDependencies = { write: writeJsonAtomic };

const jsonText = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

const releasePath = (root: string, version: string) => {
  if (!/^v1-[a-f0-9]{12}$/.test(version)) {
    throw new Error(`invalid memory release version: ${version}`);
  }
  return path.join(advisorPaths(root).memoryReleases, version);
};

const pathExists = async (filePath: string) => {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
};

const writeText = async (filePath: string, text: string) => {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, text, 'utf8');
};

const artifactText = (value: unknown) => jsonText(value);

const policyProjection = (policy: PolicyMemory) => canonicalJson({
  schemaVersion: policy.schemaVersion,
  id: policy.id,
  domain: policy.domain,
  applicabilityConditions: policy.applicabilityConditions,
  priorityOrder: policy.priorityOrder,
  recommendedAction: policy.recommendedAction,
  nonApplicabilityConditions: policy.nonApplicabilityConditions,
  guardrails: policy.guardrails ?? [],
  exceptions: policy.exceptions,
  reversalSignals: policy.reversalSignals,
  confidence: policy.confidence,
  supportingEventIds: policy.supportingEventIds,
  contrastingEventIds: policy.contrastingEventIds,
  evidenceIds: policy.evidenceIds,
  directPolicyEvidenceIds: policy.directPolicyEvidenceIds,
});

const reflectionProjection = (reflection: ReflectionMemory) => canonicalJson({
  id: reflection.id,
  domain: reflection.domain,
  crossEventQuestion: reflection.crossEventQuestion,
  observation: reflection.observation,
  invariant: reflection.invariant,
  boundaryConditions: reflection.boundaryConditions,
  unresolvedConflicts: reflection.unresolvedConflicts,
  decisionAxis: reflection.decisionAxis,
  supportPattern: reflection.supportPattern,
  contrastPattern: reflection.contrastPattern,
  conditionDelta: reflection.conditionDelta,
  actionDelta: reflection.actionDelta,
  confidence: reflection.confidence,
  supportingEventIds: reflection.supportingEventIds,
  contrastingEventIds: reflection.contrastingEventIds,
  evidenceIds: reflection.evidenceIds,
});

const eventProjection = (event: PilotDecisionEvent) => canonicalJson({
  id: event.id,
  candidateId: event.candidateId,
  title: event.title,
  domain: event.domain,
  decisionDate: event.decisionDate,
  situation: event.situation,
  objectives: event.objectives,
  conditions: event.conditions,
  constraints: event.constraints,
  chosenAction: event.chosenAction,
  rejectedBenefit: event.rejectedBenefit,
  evidenceIds: [
    ...event.directAmyEvidenceIds,
    ...event.amyPolicyEvidenceIds,
    ...event.contextEvidenceIds,
  ].sort(),
});

const releaseReferences = (
  graph: PolicyMemoryInputGraph,
  events: PilotDecisionEvent[],
  reflections: ReflectionMemory[],
  policies: PolicyMemory[],
) => {
  const eventIds = new Set(events.map(({ id }) => id));
  const candidateIds = new Set(events.map(({ candidateId }) => candidateId));
  const evidenceIds = new Set([
    ...reflections.flatMap(({ evidenceIds: ids }) => ids),
    ...policies.flatMap(({ evidenceIds: ids }) => ids),
  ]);
  const directPolicyIds = new Set(policies.flatMap(({ directPolicyEvidenceIds }) =>
    directPolicyEvidenceIds));
  const sourceIds = new Set<string>();
  for (const evidenceId of evidenceIds) {
    const span = graph.evidenceSpans.find(({ id }) => id === evidenceId);
    if (span) sourceIds.add(span.sourceId);
  }
  for (const directId of directPolicyIds) {
    const record = graph.policyEvidence.find(({ record: item }) => item.id === directId)?.record;
    if (record) sourceIds.add(record.sourceId);
  }
  return graph.references.filter((reference) => {
    if (reference.artifactClass === 'event') return eventIds.has(reference.id);
    if (reference.artifactClass === 'candidate') return candidateIds.has(reference.id);
    if (reference.artifactClass === 'source' || reference.artifactClass === 'raw_source') {
      return sourceIds.has(reference.id);
    }
    if (reference.artifactClass === 'evidence') {
      return evidenceIds.has(reference.id) || directPolicyIds.has(reference.id)
        || Boolean(graph.policyEvidence.some(({ record, span }) =>
          span.id === reference.id && directPolicyIds.has(record.id)));
    }
    return false;
  });
};

const assertNoTextLeakage = (
  snapshot: EvaluationContextSnapshot,
  manifest: EvaluationV3HoldoutManifest,
) => {
  const content = [
    ...snapshot.policy,
    ...snapshot.reflections,
    ...snapshot.events,
    ...snapshot.counterexamples,
  ].join('\n').toLocaleLowerCase('en-US');
  for (const event of manifest.events) {
    const leaked = [
      event.candidateId,
      event.eventId,
      ...event.sourceIds,
      ...event.evidenceIds,
      ...event.aliases,
    ].map((value) => value.toLocaleLowerCase('en-US'))
      .find((value) => content.includes(value));
    if (leaked) throw new Error(`memory release contains holdout text: ${leaked}`);
  }
};

const releaseableMemory = async (
  root: string,
  graph: PolicyMemoryInputGraph,
  minimumPolicySchema: 1 | 2 = 1,
) => {
  const [allReflections, approvedPolicies] = await Promise.all([
    loadApprovedReflections(root),
    loadApprovedPolicies(root),
  ]);
  const policies = approvedPolicies.filter((policy) =>
    minimumPolicySchema === 1 || policy.schemaVersion === 2);
  if (policies.length === 0) throw new Error('no deployable policy is approved');
  const reflectionIds = new Set(policies.flatMap(({ reflectionIds }) => reflectionIds));
  const reflections = allReflections.filter(({ id }) => reflectionIds.has(id));
  if (reflections.length === 0 || reflectionIds.size !== reflections.length) {
    throw new Error('approved policy requires approved reflections');
  }
  for (const reflection of reflections) {
    const validation = validateReflectionMemory(reflection, graph);
    if (!validation.passed || reflection.status !== 'approved' || !reflection.review) {
      throw new Error(`reflection is not releaseable: ${reflection.id}`);
    }
  }
  for (const policy of policies) {
    const validation = validatePolicyMemory(policy, reflections, graph);
    if (!validation.passed
      || validation.computedConfidence === 'low'
      || policy.policyKind !== 'deployable_policy'
      || policy.status !== 'approved'
      || !policy.review) {
      throw new Error(`policy is not releaseable: ${policy.id}`);
    }
  }
  const eventIds = new Set([
    ...reflections.flatMap(({ supportingEventIds }) => supportingEventIds),
    ...reflections.flatMap(({ contrastingEventIds }) => contrastingEventIds),
    ...policies.flatMap(({ supportingEventIds }) => supportingEventIds),
    ...policies.flatMap(({ contrastingEventIds }) => contrastingEventIds),
  ]);
  const events = graph.events.filter(({ id }) => eventIds.has(id));
  if (events.length === 0 || eventIds.size !== events.length) {
    throw new Error('memory release has unresolved events');
  }
  return {
    policies: policies.sort((left, right) => left.id.localeCompare(right.id)),
    reflections: reflections.sort((left, right) => left.id.localeCompare(right.id)),
    events: events.sort((left, right) => left.id.localeCompare(right.id)),
  };
};

const buildContext = (
  releaseId: string,
  memory: Awaited<ReturnType<typeof releaseableMemory>>,
  graph: PolicyMemoryInputGraph,
): EvaluationContextSnapshot => {
  const supportingIds = new Set([
    ...memory.reflections.flatMap(({ supportingEventIds }) => supportingEventIds),
    ...memory.policies.flatMap(({ supportingEventIds }) => supportingEventIds),
  ]);
  const contrastIds = new Set([
    ...memory.reflections.flatMap(({ contrastingEventIds }) => contrastingEventIds),
    ...memory.policies.flatMap(({ contrastingEventIds }) => contrastingEventIds),
  ]);
  return {
    releaseId,
    policy: memory.policies.map(policyProjection),
    reflections: memory.reflections.map(reflectionProjection),
    events: memory.events.filter(({ id }) => supportingIds.has(id)).map(eventProjection),
    counterexamples: memory.events.filter(({ id }) => contrastIds.has(id)).map(eventProjection),
    counterexampleStatus: 'reviewed',
    references: releaseReferences(
      graph,
      memory.events,
      memory.reflections,
      memory.policies,
    ),
  };
};

const artifactEntries = (
  memory: Awaited<ReturnType<typeof releaseableMemory>>,
) => [
  ...memory.events.map((artifact) => ({ kind: 'event' as const, artifact })),
  ...memory.reflections.map((artifact) => ({ kind: 'reflection' as const, artifact })),
  ...memory.policies.map((artifact) => ({ kind: 'policy' as const, artifact })),
].sort((left, right) => `${left.kind}:${left.artifact.id}`
  .localeCompare(`${right.kind}:${right.artifact.id}`));

const hashFile = async (filePath: string) => sha256(await readFile(filePath));

const fixedInputHashes = async (root: string) => ({
  sourceRegistryHash: await hashFile(advisorPaths(root).registry),
  pilotManifestHash: await hashFile(advisorPaths(root).pilotManifest),
  holdoutManifestHash: await hashFile(
    path.resolve(root, 'evaluation/v3/sealed/holdout-manifest.json'),
  ),
});

const writeReleasePayload = async (
  directory: string,
  memory: Awaited<ReturnType<typeof releaseableMemory>>,
  context: EvaluationContextSnapshot,
) => {
  const artifacts: MemoryArtifactRef[] = [];
  for (const { kind, artifact } of artifactEntries(memory)) {
    const directoryName = kind === 'policy' ? 'policies' : `${kind}s`;
    const relativePath = `${directoryName}/${artifact.id}.json`;
    const text = artifactText(artifact);
    await writeText(path.join(directory, relativePath), text);
    artifacts.push({ id: artifact.id, kind, relativePath, sha256: sha256(text) });
  }
  const reviewLedger = [
    ...memory.reflections.map(({ id, review }) => ({ kind: 'reflection', id, review })),
    ...memory.policies.map(({ id, review }) => ({ kind: 'policy', id, review })),
  ].sort((left, right) => `${left.kind}:${left.id}`.localeCompare(`${right.kind}:${right.id}`));
  const reviewLedgerText = jsonText(reviewLedger);
  const contextText = jsonText(context);
  await writeText(path.join(directory, 'review-ledger.json'), reviewLedgerText);
  await writeText(path.join(directory, 'evaluation-context.json'), contextText);
  return {
    artifacts,
    reviewLedgerHash: sha256(reviewLedgerText),
    evaluationContextHash: sha256(contextText),
  };
};

const assertManifest = (manifest: MemoryReleaseManifest, version: string) => {
  if (manifest.schemaVersion !== 1
    || manifest.releaseId !== version
    || manifest.version !== version
    || !/^v1-[a-f0-9]{12}$/.test(version)
    || !Array.isArray(manifest.artifacts)
    || manifest.artifacts.length === 0
    || manifest.evaluationContextPath !== 'evaluation-context.json') {
    throw new Error('memory release manifest is invalid');
  }
};

const verifyReleaseDirectory = async (
  directory: string,
  manifest: MemoryReleaseManifest,
  holdout: EvaluationV3HoldoutManifest,
) => {
  assertManifest(manifest, manifest.version);
  for (const artifact of manifest.artifacts) {
    if (path.isAbsolute(artifact.relativePath) || artifact.relativePath.includes('..')) {
      throw new Error(`memory release artifact path is invalid: ${artifact.relativePath}`);
    }
    const actual = await hashFile(path.join(directory, artifact.relativePath));
    if (actual !== artifact.sha256) {
      throw new Error(`memory release artifact hash mismatch: ${artifact.id}`);
    }
  }
  const contextText = await readFile(path.join(directory, 'evaluation-context.json'), 'utf8');
  if (sha256(contextText) !== manifest.evaluationContextHash) {
    throw new Error('memory release evaluation context hash mismatch');
  }
  const reviewText = await readFile(path.join(directory, 'review-ledger.json'), 'utf8');
  if (sha256(reviewText) !== manifest.reviewLedgerHash) {
    throw new Error('memory release review ledger hash mismatch');
  }
  const snapshot = JSON.parse(contextText) as EvaluationContextSnapshot;
  if (snapshot.releaseId !== manifest.releaseId
    || snapshot.counterexampleStatus !== 'reviewed'
    || snapshot.policy.length === 0
    || snapshot.reflections.length === 0
    || snapshot.events.length === 0
    || snapshot.counterexamples.length === 0
    || snapshot.references.length === 0) {
    throw new Error('memory release evaluation context is invalid');
  }
  assertNoEvaluationV3Holdout('memory_release', snapshot.references, holdout);
  assertNoTextLeakage(snapshot, holdout);
};

export const verifyMemoryRelease = async (
  root: string,
  version: string,
): Promise<MemoryReleaseManifest> => {
  const directory = releasePath(root, version);
  const manifest = JSON.parse(
    await readFile(path.join(directory, 'manifest.json'), 'utf8'),
  ) as MemoryReleaseManifest;
  assertManifest(manifest, version);
  await verifyReleaseDirectory(directory, manifest, await loadEvaluationV3Holdout(root));
  return manifest;
};

export const buildMemoryRelease = async (
  root: string,
  input: BuildOptions,
): Promise<BuiltMemoryRelease> => {
  const memory = await releaseableMemory(
    root,
    input.graph,
    input.minimumPolicySchema,
  );
  const holdout = await loadEvaluationV3Holdout(root);
  const inputs = await fixedInputHashes(root);
  const provisionalContext = buildContext('pending', memory, input.graph);
  assertNoEvaluationV3Holdout('memory_release', provisionalContext.references, holdout);
  assertNoTextLeakage(provisionalContext, holdout);
  const contentHash = sha256(canonicalJson({
    inputs,
    ...(input.minimumPolicySchema === 2 ? { policySchemaVersion: 2 } : {}),
    artifacts: artifactEntries(memory).map(({ kind, artifact }) => ({ kind, artifact })),
    context: { ...provisionalContext, releaseId: null },
    reviews: [
      ...memory.reflections.map(({ id, review }) => ({ kind: 'reflection', id, review })),
      ...memory.policies.map(({ id, review }) => ({ kind: 'policy', id, review })),
    ],
  }));
  const version = `v1-${contentHash.slice(0, 12)}`;
  const directory = releasePath(root, version);
  if (await pathExists(directory)) {
    return { manifest: await verifyMemoryRelease(root, version), directory, created: false };
  }

  await mkdir(advisorPaths(root).memoryReleases, { recursive: true });
  const staging = path.join(
    advisorPaths(root).memoryReleases,
    `.staging-${randomUUID()}`,
  );
  try {
    await mkdir(staging, { recursive: false });
    const context = buildContext(version, memory, input.graph);
    const payload = await writeReleasePayload(staging, memory, context);
    const manifest: MemoryReleaseManifest = {
      schemaVersion: 1,
      releaseId: version,
      version,
      createdAt: input.now ?? new Date().toISOString(),
      ...inputs,
      ...(input.minimumPolicySchema === 2 ? { policySchemaVersion: 2 as const } : {}),
      artifacts: payload.artifacts,
      evaluationContextPath: 'evaluation-context.json',
      evaluationContextHash: payload.evaluationContextHash,
      reviewLedgerHash: payload.reviewLedgerHash,
    };
    await writeText(path.join(staging, 'manifest.json'), jsonText(manifest));
    await verifyReleaseDirectory(staging, manifest, holdout);
    await rename(staging, directory);
    return {
      manifest: await verifyMemoryRelease(root, version),
      directory,
      created: true,
    };
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
};

export const activateMemoryRelease = async (
  root: string,
  version: string,
  activatedAt = new Date().toISOString(),
  dependencies: ActivationDependencies = defaultActivationDependencies,
) => {
  const parsed = new Date(activatedAt);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== activatedAt) {
    throw new Error('memory release activation timestamp is invalid');
  }
  const manifest = await verifyMemoryRelease(root, version);
  const manifestText = await readFile(
    path.join(releasePath(root, version), 'manifest.json'),
    'utf8',
  );
  const pointer = {
    releaseId: manifest.releaseId,
    version: manifest.version,
    manifestHash: sha256(manifestText),
    activatedAt,
  };
  await dependencies.write(advisorPaths(root).activeMemoryRelease, pointer);
  return pointer;
};
