import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { EvaluationV3Arm } from '../../shared/amyHoodEvaluationV3';

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
  const snapshot = await readJson<EvaluationContextSnapshot>(
    resolve(base, active.version, 'evaluation-context.json'),
    'active memory release evaluation context is required',
  );
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
  return snapshot;
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
  const base = memoryReleaseRoot(root);
  const active = await readJson<ActiveMemoryRelease>(
    resolve(base, 'active.json'),
    'active memory release is required for Evaluation v3 RAG arms',
  );
  const snapshot = await loadActiveSnapshot(root);
  if (snapshot.policy.length === 0) {
    throw new Error('amy_policy_rag requires at least one policy');
  }
  if (arm === 'amy_policy_rag') {
    return {
      memoryReleaseHash: active.manifestHash,
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
    memoryReleaseHash: active.manifestHash,
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
