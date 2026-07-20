import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { EvaluationV3Arm } from '../../shared/amyHoodEvaluationV3';
import type { MemoryReleaseManifest } from '../../shared/amyHoodDecisionAdvisor';
import {
  assertNoEvaluationV3Holdout,
  loadEvaluationV3Holdout,
  type EvaluationV3ArtifactReference,
} from './holdout';

export type EvaluationV3ContextPackage = {
  memoryReleaseId: string | null;
  policy: string[];
  reflections: string[];
  events: string[];
  counterexamples: string[];
};

export type ActiveMemoryRelease = {
  releaseId: string;
  version: string;
  manifestHash: string;
  activatedAt: string;
};

type EvaluationContextSnapshot = Omit<EvaluationV3ContextPackage, 'memoryReleaseId'> & {
  releaseId: string;
  counterexampleStatus: 'reviewed' | 'no_reviewed_counterexample';
  references: EvaluationV3ArtifactReference[];
};

const memoryReleaseRoot = (root: string) =>
  resolve(root, 'data/b-track/amy-hood/advisor/memory-releases');

export const emptyEvaluationV3Context = (): EvaluationV3ContextPackage => ({
  memoryReleaseId: null,
  policy: [],
  reflections: [],
  events: [],
  counterexamples: [],
});

const readJson = async <T>(path: string, errorMessage: string): Promise<T> => {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch {
    throw new Error(errorMessage);
  }
};

const assertStringArray: (
  value: unknown,
  label: string,
) => asserts value is string[] = (value, label) => {
  if (!Array.isArray(value)
    || value.some((item) => typeof item !== 'string' || item.trim().length === 0)) {
    throw new Error(`memory release ${label} must contain non-empty strings`);
  }
};

const loadActiveSnapshot = async (root: string) => {
  const base = memoryReleaseRoot(root);
  const active = await readJson<ActiveMemoryRelease>(
    resolve(base, 'active.json'),
    'active memory release is required for Evaluation v3 RAG arms',
  );
  if (!active.releaseId || !active.version || !active.manifestHash) {
    throw new Error('active memory release pointer is invalid');
  }
  const releaseRoot = resolve(base, active.version);
  let manifestText: string;
  let releaseManifest: MemoryReleaseManifest;
  try {
    manifestText = await readFile(resolve(releaseRoot, 'manifest.json'), 'utf8');
    releaseManifest = JSON.parse(manifestText) as MemoryReleaseManifest;
  } catch {
    throw new Error('active memory release manifest is required');
  }
  const manifestHash = createHash('sha256').update(manifestText).digest('hex');
  if (manifestHash !== active.manifestHash) {
    throw new Error('active memory release manifest hash mismatch');
  }
  if (releaseManifest.schemaVersion !== 1
    || releaseManifest.releaseId !== active.releaseId
    || releaseManifest.version !== active.version
    || releaseManifest.evaluationContextPath !== 'evaluation-context.json') {
    throw new Error('active memory release manifest does not match pointer');
  }
  const contextPath = resolve(releaseRoot, releaseManifest.evaluationContextPath);
  let contextText: string;
  let snapshot: EvaluationContextSnapshot;
  try {
    contextText = await readFile(contextPath, 'utf8');
    snapshot = JSON.parse(contextText) as EvaluationContextSnapshot;
  } catch {
    throw new Error('active memory release evaluation context is required');
  }
  const contextHash = createHash('sha256').update(contextText).digest('hex');
  if (contextHash !== releaseManifest.evaluationContextHash) {
    throw new Error('active memory release evaluation context hash mismatch');
  }
  if (snapshot.releaseId !== active.releaseId) {
    throw new Error('active memory release ID does not match evaluation context');
  }
  assertStringArray(snapshot.policy, 'policy');
  assertStringArray(snapshot.reflections, 'reflections');
  assertStringArray(snapshot.events, 'events');
  assertStringArray(snapshot.counterexamples, 'counterexamples');
  if (snapshot.counterexampleStatus !== 'reviewed'
    && snapshot.counterexampleStatus !== 'no_reviewed_counterexample') {
    throw new Error('memory release counterexample status is invalid');
  }
  if (!Array.isArray(snapshot.references) || snapshot.references.length === 0) {
    throw new Error('memory release artifact references are required');
  }
  const allowedClasses = new Set([
    'candidate', 'event', 'source', 'evidence', 'alias', 'raw_source',
  ]);
  if (snapshot.references.some((reference) =>
    !reference || typeof reference.id !== 'string' || !reference.id
    || !allowedClasses.has(reference.artifactClass))) {
    throw new Error('memory release artifact reference is invalid');
  }
  const manifest = await loadEvaluationV3Holdout(root);
  const content = [
    ...snapshot.policy,
    ...snapshot.reflections,
    ...snapshot.events,
    ...snapshot.counterexamples,
  ].join('\n').toLocaleLowerCase('en-US');
  const inferred: EvaluationV3ArtifactReference[] = [];
  for (const event of manifest.events) {
    if (content.includes(event.candidateId.toLocaleLowerCase('en-US'))) {
      inferred.push({ artifactClass: 'candidate', id: event.candidateId });
    }
    if (content.includes(event.eventId.toLocaleLowerCase('en-US'))) {
      inferred.push({ artifactClass: 'event', id: event.eventId });
    }
    event.sourceIds.forEach((sourceId) => {
      if (content.includes(sourceId.toLocaleLowerCase('en-US'))) {
        inferred.push({ artifactClass: 'source', id: sourceId });
      }
    });
    event.evidenceIds.forEach((evidenceId) => {
      if (content.includes(evidenceId.toLocaleLowerCase('en-US'))) {
        inferred.push({ artifactClass: 'evidence', id: evidenceId });
      }
    });
    event.aliases.forEach((alias) => {
      if (content.includes(alias.toLocaleLowerCase('en-US'))) {
        inferred.push({ artifactClass: 'alias', id: alias });
      }
    });
  }
  assertNoEvaluationV3Holdout(
    'runtime_index',
    [...snapshot.references, ...inferred],
    manifest,
  );
  return {
    snapshot,
    contextHash,
  };
};

export const resolveEvaluationV3ArmContext = async (
  root: string,
  arm: EvaluationV3Arm,
): Promise<{
  context: EvaluationV3ContextPackage;
  memoryReleaseHash: string | null;
}> => {
  if (arm === 'generic_cfo' || arm === 'amy_prompt') {
    return { context: emptyEvaluationV3Context(), memoryReleaseHash: null };
  }
  const { snapshot, contextHash } = await loadActiveSnapshot(root);
  if (snapshot.policy.length === 0) {
    throw new Error('amy_policy_rag requires at least one policy');
  }
  if (arm === 'amy_policy_rag') {
    return {
      memoryReleaseHash: contextHash,
      context: {
        memoryReleaseId: snapshot.releaseId,
        policy: snapshot.policy,
        reflections: [],
        events: [],
        counterexamples: [],
      },
    };
  }
  if (snapshot.reflections.length === 0 || snapshot.events.length === 0) {
    throw new Error('amy_full_rag requires at least one reflection and event');
  }
  if (snapshot.counterexamples.length === 0
    && snapshot.counterexampleStatus !== 'no_reviewed_counterexample') {
    throw new Error('reviewed counterexample or explicit absence marker is required');
  }
  return {
    memoryReleaseHash: contextHash,
    context: {
      memoryReleaseId: snapshot.releaseId,
      policy: snapshot.policy,
      reflections: snapshot.reflections,
      events: snapshot.events,
      counterexamples: snapshot.counterexamples,
    },
  };
};

export const loadEvaluationV3ArmContext = async (
  root: string,
  arm: EvaluationV3Arm,
): Promise<EvaluationV3ContextPackage> =>
  (await resolveEvaluationV3ArmContext(root, arm)).context;
