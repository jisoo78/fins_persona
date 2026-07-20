import { readdir } from 'node:fs/promises';

import type { ModelClient } from '../personaPipeline/modelClient';
import { createModelClient } from '../personaPipeline/modelClient';
import {
  activateMemoryRelease,
  buildMemoryRelease,
  verifyMemoryRelease,
} from './memoryReleaseStore';
import { advisorPaths } from './paths';
import { buildPolicyProposals } from './policyMemory';
import { loadPolicyMemoryInput } from './policyMemoryInput';
import {
  approvePolicyMemoryArtifact,
  buildPolicyMemoryGateReport,
  loadApprovedReflections,
  reviewPolicyMemoryArtifact,
  savePolicyBuild,
  saveReflectionBuild,
} from './policyMemoryStore';
import { buildReflectionProposals } from './reflectionMemory';

export type PolicyMemoryCliDependencies = {
  createModel(): ModelClient;
  now(): string;
  log(value: string): void;
};

const defaultDependencies: PolicyMemoryCliDependencies = {
  createModel: () => createModelClient('local', { maxTokens: 3_000 }),
  now: () => new Date().toISOString(),
  log: (value) => console.log(value),
};

const optionValue = (args: string[], option: string) => {
  const index = args.indexOf(option);
  return index < 0 ? undefined : args[index + 1];
};

const requiredKind = (args: string[]): 'reflection' | 'policy' => {
  const kind = optionValue(args, '--kind');
  if (kind !== 'reflection' && kind !== 'policy') {
    throw new Error('policy memory command requires --kind reflection|policy');
  }
  return kind;
};

const runBuild = async (
  root: string,
  args: string[],
  dependencies: PolicyMemoryCliDependencies,
) => {
  const kind = requiredKind(args);
  const graph = await loadPolicyMemoryInput(root);
  if (kind === 'reflection') {
    const result = await buildReflectionProposals(graph, dependencies.createModel(), {
      now: dependencies.now(),
    });
    await saveReflectionBuild(root, result);
    dependencies.log(JSON.stringify(result, null, 2));
    return true;
  }
  const reflections = await loadApprovedReflections(root);
  const result = await buildPolicyProposals(
    reflections,
    graph,
    dependencies.createModel(),
    { now: dependencies.now() },
  );
  await savePolicyBuild(root, result);
  dependencies.log(JSON.stringify(result, null, 2));
  return true;
};

const runCheck = async (
  root: string,
  dependencies: PolicyMemoryCliDependencies,
) => {
  const graph = await loadPolicyMemoryInput(root);
  const report = await buildPolicyMemoryGateReport(root, graph, { now: dependencies.now() });
  dependencies.log(JSON.stringify(report, null, 2));
  return true;
};

const runApprove = async (
  root: string,
  args: string[],
  dependencies: PolicyMemoryCliDependencies,
) => {
  const kind = requiredKind(args);
  const rationale = optionValue(args, '--rationale');
  if (!args.includes('--all-passing')
    || !args.includes('--review-confirmed')
    || optionValue(args, '--reviewer') !== 'Codex'
    || !rationale?.trim()) {
    throw new Error(
      'review evidence before approving: require --all-passing --review-confirmed '
      + '--reviewer Codex and a nonblank --rationale',
    );
  }
  const graph = await loadPolicyMemoryInput(root);
  const report = await buildPolicyMemoryGateReport(root, graph, { now: dependencies.now() });
  const ids = [...report.passing[kind === 'reflection' ? 'reflections' : 'policies']].sort();
  for (const id of ids) {
    await approvePolicyMemoryArtifact(root, {
      kind,
      id,
      reviewer: 'Codex',
      reviewedAt: dependencies.now(),
      rationale,
    }, graph);
  }
  dependencies.log(JSON.stringify({ kind, approvedIds: ids }, null, 2));
  return true;
};

const runReview = async (
  root: string,
  args: string[],
  dependencies: PolicyMemoryCliDependencies,
) => {
  const kind = requiredKind(args);
  const id = optionValue(args, '--id');
  const decision = optionValue(args, '--decision');
  const rationale = optionValue(args, '--rationale');
  if (!id || (decision !== 'approved' && decision !== 'rejected')
    || optionValue(args, '--reviewer') !== 'Codex' || !rationale?.trim()) {
    throw new Error(
      'memory:review requires --id --decision approved|rejected '
      + '--reviewer Codex and a nonblank --rationale',
    );
  }
  const graph = await loadPolicyMemoryInput(root);
  const artifact = await reviewPolicyMemoryArtifact(root, {
    kind,
    id,
    decision,
    reviewer: 'Codex',
    reviewedAt: dependencies.now(),
    rationale,
  }, graph);
  dependencies.log(JSON.stringify(artifact, null, 2));
  return true;
};

const runRelease = async (
  root: string,
  args: string[],
  dependencies: PolicyMemoryCliDependencies,
) => {
  const profile = optionValue(args, '--profile');
  if (profile && profile !== 'evaluation-v4') {
    throw new Error(`unsupported memory release profile: ${profile}`);
  }
  const graph = await loadPolicyMemoryInput(root);
  const result = await buildMemoryRelease(root, {
    graph,
    now: dependencies.now(),
    minimumPolicySchema: profile === 'evaluation-v4' ? 2 : undefined,
  });
  dependencies.log(JSON.stringify(result, null, 2));
  return true;
};

const newestVerifiedRelease = async (root: string) => {
  let names: string[];
  try {
    names = await readdir(advisorPaths(root).memoryReleases);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error('no verified memory release is available');
    }
    throw error;
  }
  const manifests = await Promise.all(names
    .filter((name) => /^v1-[a-f0-9]{12}$/.test(name))
    .map((name) => verifyMemoryRelease(root, name)));
  if (manifests.length === 0) throw new Error('no verified memory release is available');
  return manifests.sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt) || right.version.localeCompare(left.version))[0];
};

const runActivate = async (
  root: string,
  args: string[],
  dependencies: PolicyMemoryCliDependencies,
) => {
  const requestedVersion = optionValue(args, '--version');
  if (!args.includes('--latest') && !requestedVersion) {
    throw new Error('memory:activate requires --latest or --version');
  }
  if (args.includes('--latest') && requestedVersion) {
    throw new Error('memory:activate accepts only one of --latest or --version');
  }
  const version = requestedVersion ?? (await newestVerifiedRelease(root)).version;
  const pointer = await activateMemoryRelease(root, version, dependencies.now());
  dependencies.log(JSON.stringify(pointer, null, 2));
  return true;
};

export const runPolicyMemoryCommand = async (
  root: string,
  args: string[],
  dependencies: PolicyMemoryCliDependencies = defaultDependencies,
): Promise<boolean> => {
  const command = args[0];
  if (!command?.startsWith('memory:')) return false;
  if (command === 'memory:build') return runBuild(root, args, dependencies);
  if (command === 'memory:check') return runCheck(root, dependencies);
  if (command === 'memory:review') return runReview(root, args, dependencies);
  if (command === 'memory:approve') return runApprove(root, args, dependencies);
  if (command === 'memory:release') return runRelease(root, args, dependencies);
  if (command === 'memory:activate') return runActivate(root, args, dependencies);
  throw new Error(`unknown policy memory command: ${command}`);
};
