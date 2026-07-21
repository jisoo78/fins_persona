import { fileURLToPath } from 'node:url';

import type { EvaluationV6BundleInput } from '../shared/amyHoodEvaluationV6';
import { checkEvaluationV6Audit, initializeEvaluationV6Audit } from './evaluationV6/audit';
import { loadActiveEvaluationV6Calibration } from './evaluationV6/calibration';
import { runEvaluationV6LocalCalibration, runEvaluationV6LocalJudge, runEvaluationV6LocalPairJudge } from './evaluationV6/localJudge';
import { runEvaluationV6Formal } from './evaluationV6/formalRun';
import { writeEvaluationV6HtmlReport } from './evaluationV6/report';
import { createEvaluationV6Runner } from './evaluationV6/runner';
import {
  checkEvaluationV6Bundle,
  checkEvaluationV6CandidateBundle,
  freezeEvaluationV6Bundle,
  loadEvaluationV6CandidateInput,
} from './evaluationV6/scenarioSet';
import { loadEvaluationV5Bundle } from './evaluationV5/scenarioSet';
import { createModelClient } from './personaPipeline/modelClient';

const option = (args: string[], name: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const requiredOption = (args: string[], name: string) => {
  const value = option(args, name);
  if (!value) throw new Error(`missing required option ${name}`);
  return value;
};
const parseRepetitions = (value: string): 1 | 5 => {
  const parsed = Number(value);
  if (parsed !== 1 && parsed !== 5) throw new Error('repetitions must be 1 or 5');
  return parsed;
};
const parseRepetition = (value: string): 1 | 2 | 3 | 4 | 5 => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 5) throw new Error('repetition must be 1 through 5');
  return parsed as 1 | 2 | 3 | 4 | 5;
};

const loadUnfrozenInput = async (root: string): Promise<EvaluationV6BundleInput> => {
  const [candidate, predecessor] = await Promise.all([
    loadEvaluationV6CandidateInput(root),
    loadEvaluationV5Bundle(root),
  ]);
  if (!predecessor.manifest?.bundleHash) throw new Error('Evaluation v5 frozen predecessor is required');
  return { ...candidate, predecessorV5BundleHash: predecessor.manifest.bundleHash, manifest: null };
};

export const runAmyHoodEvaluationV6Command = async (args: string[], root = process.cwd()) => {
  const command = args[0];
  if (command === 'audit-init') return initializeEvaluationV6Audit(root);
  if (command === 'audit-check') return checkEvaluationV6Audit(root);
  if (command === 'candidate-check') return checkEvaluationV6CandidateBundle(root);
  if (command === 'calibrate-local') {
    return runEvaluationV6LocalCalibration({ root, baseUrl: requiredOption(args, '--base-url').replace(/\/+$/, '') });
  }
  if (command === 'freeze') {
    return freezeEvaluationV6Bundle(root, await loadUnfrozenInput(root), await loadActiveEvaluationV6Calibration(root));
  }
  if (command === 'check') return checkEvaluationV6Bundle(root);
  if (command === 'judge-local') {
    const group = option(args, '--group');
    const repetition = option(args, '--repetition');
    const baseUrl = option(args, '--base-url');
    if (!group || !repetition || !baseUrl) throw new Error('judge-local requires --group, --repetition, and --base-url');
    return runEvaluationV6LocalJudge({ root, experimentGroupId: group, repetition: parseRepetition(repetition), baseUrl: baseUrl.replace(/\/+$/, '') });
  }
  if (command === 'judge-pairs-local') {
    return runEvaluationV6LocalPairJudge({
      root,
      experimentGroupId: requiredOption(args, '--group'),
      baseUrl: requiredOption(args, '--base-url').replace(/\/+$/, ''),
    });
  }
  if (command === 'formal-run') {
    const candidateBaseUrl = option(args, '--candidate-base-url');
    const embeddingBaseUrl = option(args, '--embedding-base-url');
    const judgeBaseUrl = option(args, '--judge-base-url');
    const htmlPath = option(args, '--html');
    if (!candidateBaseUrl || !embeddingBaseUrl || !judgeBaseUrl || !htmlPath) {
      throw new Error('formal-run requires --candidate-base-url, --embedding-base-url, --judge-base-url, and --html');
    }
    return runEvaluationV6Formal({
      root,
      candidateBaseUrl,
      embeddingBaseUrl,
      judgeBaseUrl,
      htmlPath,
      ...(option(args, '--group') ? { experimentGroupId: option(args, '--group') } : {}),
    });
  }
  const runner = createEvaluationV6Runner({
    root,
    createModel: () => createModelClient('local', { maxTokens: 900 }),
  });
  if (command === 'create') return runner.createExperiment({ repetitions: parseRepetitions(requiredOption(args, '--repetitions')) });
  if (command === 'execute') return runner.executeExperiment(requiredOption(args, '--group'));
  if (command === 'resume') return runner.resumeRun(requiredOption(args, '--run'));
  if (command === 'report') {
    return writeEvaluationV6HtmlReport(root, requiredOption(args, '--group'), requiredOption(args, '--html'));
  }
  throw new Error('expected audit-init, audit-check, candidate-check, calibrate-local, freeze, check, create, execute, resume, judge-local, judge-pairs-local, formal-run, or report');
};

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  void runAmyHoodEvaluationV6Command(process.argv.slice(2)).then((output) => {
    console.log(JSON.stringify(output, null, 2));
  }).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
