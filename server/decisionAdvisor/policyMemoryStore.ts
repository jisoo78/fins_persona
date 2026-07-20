import { readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';

import type {
  ArtifactReview,
  PolicyMemory,
  PolicyMemoryModelRun,
  ReflectionMemory,
} from '../../shared/amyHoodDecisionAdvisor';
import { canonicalJson, sha256 } from './canonicalJson';
import { readJsonFile, writeJsonAtomic } from './jsonStore';
import { advisorPaths } from './paths';
import type { PolicyBuildResult } from './policyMemory';
import { validatePolicyMemory } from './policyMemory';
import type { PolicyMemoryInputGraph } from './policyMemoryInput';
import type { ReflectionBuildResult } from './reflectionMemory';
import { validateReflectionMemory } from './reflectionMemory';

export type PolicyMemoryGateReport = {
  generatedAt: string;
  inputEventIds: string[];
  passing: { reflections: string[]; policies: string[] };
  reviewed: {
    approved: { reflections: string[]; policies: string[] };
    rejected: { reflections: string[]; policies: string[] };
  };
  safeStop: {
    status: 'blocked';
    reason: string;
    downstreamBlocked: Array<'policy_build' | 'memory_release' | 'evaluation_v3'>;
  } | null;
  activeReleaseVersion: string | null;
  reviewRequired: Array<{
    kind: 'reflection' | 'policy';
    id: string;
    errors: string[];
  }>;
  blocked: string[];
};

export type PolicyMemoryApprovalInput = {
  kind: 'reflection' | 'policy';
  id: string;
  reviewer: 'Codex';
  reviewedAt: string;
  rationale: string;
};

export type PolicyMemoryReviewInput = PolicyMemoryApprovalInput & {
  decision: 'approved' | 'rejected';
};

type StoreDependencies = {
  write(filePath: string, value: unknown): Promise<void>;
};

type GateOptions = {
  now?: string;
};

const defaultDependencies: StoreDependencies = { write: writeJsonAtomic };

const assertArtifactId = (kind: 'reflection' | 'policy', id: string) => {
  const expression = kind === 'reflection'
    ? /^reflection-[a-f0-9]{16}$/
    : /^policy-[a-f0-9]{16}$/;
  if (!expression.test(id)) throw new Error(`invalid ${kind} ID: ${id}`);
};

const assertModelRunId = (id: string) => {
  if (!/^model-run-[a-f0-9]{16}$/.test(id)) throw new Error(`invalid model run ID: ${id}`);
};

const proposalPath = (root: string, kind: 'reflection' | 'policy', id: string) => {
  assertArtifactId(kind, id);
  const directory = kind === 'reflection'
    ? advisorPaths(root).reflectionProposals
    : advisorPaths(root).policyProposals;
  return path.join(directory, `${id}.json`);
};

const reviewedArtifactPath = (
  root: string,
  kind: 'reflection' | 'policy',
  decision: 'approved' | 'rejected',
  id: string,
) => {
  assertArtifactId(kind, id);
  const paths = advisorPaths(root);
  const directory = decision === 'approved'
    ? kind === 'reflection' ? paths.approvedReflections : paths.approvedPolicies
    : kind === 'reflection' ? paths.rejectedReflections : paths.rejectedPolicies;
  return path.join(directory, `${id}.json`);
};

const reviewPath = (root: string, kind: 'reflection' | 'policy', id: string) => {
  assertArtifactId(kind, id);
  return path.join(advisorPaths(root).policyReviews, `${kind}-${id}.json`);
};

const modelRunPath = (root: string, id: string) => {
  assertModelRunId(id);
  return path.join(advisorPaths(root).policyModelRuns, `${id}.json`);
};

const readDirectoryJson = async <T>(directory: string): Promise<T[]> => {
  let names: string[];
  try {
    names = await readdir(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  return Promise.all(names
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map(async (name) => JSON.parse(await readFile(path.join(directory, name), 'utf8')) as T));
};

export const loadReflectionProposals = (root: string) =>
  readDirectoryJson<ReflectionMemory>(advisorPaths(root).reflectionProposals);

export const loadPolicyProposals = (root: string) =>
  readDirectoryJson<PolicyMemory>(advisorPaths(root).policyProposals);

export const loadApprovedReflections = (root: string) =>
  readDirectoryJson<ReflectionMemory>(advisorPaths(root).approvedReflections);

export const loadApprovedPolicies = (root: string) =>
  readDirectoryJson<PolicyMemory>(advisorPaths(root).approvedPolicies);

export const loadRejectedReflections = (root: string) =>
  readDirectoryJson<ReflectionMemory>(advisorPaths(root).rejectedReflections);

export const loadRejectedPolicies = (root: string) =>
  readDirectoryJson<PolicyMemory>(advisorPaths(root).rejectedPolicies);

export const loadPolicyMemoryModelRuns = (root: string) =>
  readDirectoryJson<PolicyMemoryModelRun>(advisorPaths(root).policyModelRuns);

export const saveReflectionBuild = async (
  root: string,
  result: ReflectionBuildResult,
  dependencies: StoreDependencies = defaultDependencies,
) => {
  assertModelRunId(result.modelRun.id);
  await dependencies.write(modelRunPath(root, result.modelRun.id), result.modelRun);
  if (result.modelRun.status === 'failed') return;
  for (const artifact of result.artifacts) {
    assertArtifactId('reflection', artifact.id);
    await dependencies.write(proposalPath(root, 'reflection', artifact.id), artifact);
  }
};

export const savePolicyBuild = async (
  root: string,
  result: PolicyBuildResult,
  dependencies: StoreDependencies = defaultDependencies,
) => {
  assertModelRunId(result.modelRun.id);
  await dependencies.write(modelRunPath(root, result.modelRun.id), result.modelRun);
  if (result.modelRun.status === 'failed') return;
  for (const artifact of result.artifacts) {
    assertArtifactId('policy', artifact.id);
    await dependencies.write(proposalPath(root, 'policy', artifact.id), artifact);
  }
};

export const buildPolicyMemoryGateReport = async (
  root: string,
  graph: PolicyMemoryInputGraph,
  options: GateOptions = {},
): Promise<PolicyMemoryGateReport> => {
  const [
    reflections,
    policies,
    approvedReflections,
    approvedPolicies,
    modelRuns,
    rejectedReflections,
    rejectedPolicies,
    activeRelease,
  ] = await Promise.all([
    loadReflectionProposals(root),
    loadPolicyProposals(root),
    loadApprovedReflections(root),
    loadApprovedPolicies(root),
    loadPolicyMemoryModelRuns(root),
    loadRejectedReflections(root),
    loadRejectedPolicies(root),
    readJsonFile<{ version?: unknown } | null>(advisorPaths(root).activeMemoryRelease, null),
  ]);
  const rejectedIds = new Set([
    ...rejectedReflections.map(({ id }) => id),
    ...rejectedPolicies.map(({ id }) => id),
  ]);
  const rejected = [...rejectedIds].sort().map((id) => `review_rejected:${id}`);
  const approvedReflectionIds = approvedReflections.map(({ id }) => id).sort();
  const approvedPolicyIds = approvedPolicies.map(({ id }) => id).sort();
  const rejectedReflectionIds = rejectedReflections.map(({ id }) => id).sort();
  const rejectedPolicyIds = rejectedPolicies.map(({ id }) => id).sort();
  const safeStop = approvedReflectionIds.length === 0
    ? {
        status: 'blocked' as const,
        reason: 'approved reflection count = 0; sealed event evidence lacks a qualified contrast',
        downstreamBlocked: [
          'policy_build',
          'memory_release',
          'evaluation_v3',
        ] as Array<'policy_build' | 'memory_release' | 'evaluation_v3'>,
      }
    : approvedPolicyIds.length === 0
      ? {
          status: 'blocked' as const,
          reason: 'approved policy count = 0; no deployable policy memory is available',
          downstreamBlocked: [
            'memory_release',
            'evaluation_v3',
          ] as Array<'policy_build' | 'memory_release' | 'evaluation_v3'>,
        }
      : null;
  const reflectionResults = reflections.map((artifact) => ({
    artifact,
    validation: validateReflectionMemory(artifact, graph),
  }));
  const policyResults = policies.map((artifact) => ({
    artifact,
    validation: validatePolicyMemory(artifact, approvedReflections, graph),
  }));
  const report: PolicyMemoryGateReport = {
    generatedAt: options.now ?? new Date().toISOString(),
    inputEventIds: graph.events.map(({ id }) => id).sort(),
    passing: {
      reflections: reflectionResults
        .filter(({ artifact, validation }) => validation.passed && !rejectedIds.has(artifact.id))
        .map(({ artifact }) => artifact.id)
        .sort(),
      policies: policyResults
        .filter(({ artifact, validation }) =>
          validation.passed
          && validation.computedConfidence !== 'low'
          && artifact.policyKind === 'deployable_policy'
          && !rejectedIds.has(artifact.id))
        .map(({ artifact }) => artifact.id)
        .sort(),
    },
    reviewed: {
      approved: { reflections: approvedReflectionIds, policies: approvedPolicyIds },
      rejected: { reflections: rejectedReflectionIds, policies: rejectedPolicyIds },
    },
    safeStop,
    activeReleaseVersion: typeof activeRelease?.version === 'string'
      ? activeRelease.version
      : null,
    reviewRequired: [
      ...reflectionResults
        .filter(({ validation }) => !validation.passed)
        .map(({ artifact, validation }) => ({
          kind: 'reflection' as const,
          id: artifact.id,
          errors: validation.errors,
        })),
      ...policyResults
        .filter(({ artifact, validation }) =>
          !validation.passed
          || validation.computedConfidence === 'low'
          || artifact.policyKind !== 'deployable_policy')
        .map(({ artifact, validation }) => ({
          kind: 'policy' as const,
          id: artifact.id,
          errors: validation.errors.length > 0
            ? validation.errors
            : ['policy is not deployable'],
        })),
    ].sort((left, right) => `${left.kind}:${left.id}`.localeCompare(`${right.kind}:${right.id}`)),
    blocked: [
      ...modelRuns.filter(({ status }) => status === 'failed').map(({ id }) => id),
      ...rejected,
    ].sort(),
  };
  await writeJsonAtomic(advisorPaths(root).policyGateReport, report);
  return report;
};

const assertReviewInput = (input: PolicyMemoryReviewInput) => {
  assertArtifactId(input.kind, input.id);
  if (input.reviewer !== 'Codex') throw new Error('policy memory reviewer must be Codex');
  const parsed = new Date(input.reviewedAt);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== input.reviewedAt) {
    throw new Error('policy memory review timestamp is invalid');
  }
  if (!input.rationale.trim()) throw new Error('policy memory review rationale is required');
};

const readPriorJson = async (filePath: string) => {
  try {
    return JSON.parse(await readFile(filePath, 'utf8')) as unknown;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
};

const restoreDestination = async (
  filePath: string,
  prior: unknown,
  dependencies: StoreDependencies,
) => {
  if (prior === undefined) {
    await rm(filePath, { force: true });
    return;
  }
  await dependencies.write(filePath, prior);
};

const commitApprovalPairWithRollback = async (
  artifactPath: string,
  artifact: ReflectionMemory | PolicyMemory,
  artifactReviewPath: string,
  review: ArtifactReview,
  dependencies: StoreDependencies,
) => {
  const [priorArtifact, priorReview] = await Promise.all([
    readPriorJson(artifactPath),
    readPriorJson(artifactReviewPath),
  ]);
  try {
    await dependencies.write(artifactPath, artifact);
    await dependencies.write(artifactReviewPath, review);
  } catch (operationError) {
    const compensationErrors: unknown[] = [];
    for (const [destination, prior] of [
      [artifactPath, priorArtifact],
      [artifactReviewPath, priorReview],
    ] as const) {
      try {
        await restoreDestination(destination, prior, dependencies);
      } catch (error) {
        compensationErrors.push(error);
      }
    }
    if (compensationErrors.length > 0) {
      throw new AggregateError(
        [operationError, ...compensationErrors],
        'policy memory approval failed and compensation was incomplete',
      );
    }
    throw operationError;
  }
};

export const reviewPolicyMemoryArtifact = async (
  root: string,
  input: PolicyMemoryReviewInput,
  graph: PolicyMemoryInputGraph,
  dependencies: StoreDependencies = defaultDependencies,
): Promise<ReflectionMemory | PolicyMemory> => {
  assertReviewInput(input);
  const proposal = await readJsonFile<ReflectionMemory | PolicyMemory | null>(
    proposalPath(root, input.kind, input.id),
    null,
  );
  if (!proposal) throw new Error(`unknown ${input.kind} proposal: ${input.id}`);
  const existingReview = await readJsonFile<ArtifactReview | null>(
    reviewPath(root, input.kind, input.id),
    null,
  );
  if (existingReview) {
    if (existingReview.decision !== input.decision) {
      throw new Error(
        `${input.kind} ${input.id} is already ${existingReview.decision}; review decisions are terminal`,
      );
    }
    const existingArtifact = await readJsonFile<ReflectionMemory | PolicyMemory | null>(
      reviewedArtifactPath(root, input.kind, input.decision, input.id),
      null,
    );
    if (!existingArtifact) {
      throw new Error(`${input.kind} ${input.id} has an inconsistent stored review`);
    }
    return existingArtifact;
  }
  const validation = input.kind === 'reflection'
    ? validateReflectionMemory(proposal as ReflectionMemory, graph)
    : validatePolicyMemory(
      proposal as PolicyMemory,
      await loadApprovedReflections(root),
      graph,
    );
  if (input.decision === 'approved' && !validation.passed) {
    throw new Error(`cannot approve ${input.id}: ${validation.errors.join('; ')}`);
  }
  if (input.decision === 'approved' && input.kind === 'policy') {
    const policy = proposal as PolicyMemory;
    if (policy.policyKind !== 'deployable_policy' || validation.computedConfidence === 'low') {
      throw new Error(`cannot approve nondeployable policy: ${input.id}`);
    }
  }
  const review: ArtifactReview = {
    reviewer: 'Codex',
    reviewedAt: input.reviewedAt,
    decision: input.decision,
    rationale: input.rationale.trim(),
    validationHash: sha256(canonicalJson(validation)),
  };
  const reviewed = {
    ...proposal,
    confidence: validation.computedConfidence,
    status: input.decision,
    review,
  };
  await commitApprovalPairWithRollback(
    reviewedArtifactPath(root, input.kind, input.decision, input.id),
    reviewed,
    reviewPath(root, input.kind, input.id),
    review,
    dependencies,
  );
  return reviewed;
};

export const approvePolicyMemoryArtifact = async (
  root: string,
  input: PolicyMemoryApprovalInput,
  graph: PolicyMemoryInputGraph,
  dependencies: StoreDependencies = defaultDependencies,
) => reviewPolicyMemoryArtifact(root, {
  ...input,
  decision: 'approved',
}, graph, dependencies);
