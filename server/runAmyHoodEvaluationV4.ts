import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import type { EvaluationV4Stage } from '../shared/amyHoodEvaluationV4';
import { createModelClient } from './personaPipeline/modelClient';
import { createEvaluationV4Runner } from './evaluationV4/runner';
import { listEvaluationV4Runs } from './evaluationV4/runStore';
import { loadEvaluationV4Bundle } from './evaluationV4/scenarioSet';
import { assertEvaluationV4PolicyCoverage, loadEvaluationV4PolicyCoverage } from './evaluationV4/policyCoverage';

const option = (args: string[], name: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

const requiredStage = (args: string[]): EvaluationV4Stage => {
  const stage = option(args, '--stage');
  if (stage !== 'calibration' && stage !== 'benchmark') throw new Error('--stage calibration|benchmark is required');
  return stage;
};

export const runAmyHoodEvaluationV4Command = async (
  args: string[],
  root = process.cwd(),
) => {
  const command = args[0];
  if (command === 'check') {
    const stage = requiredStage(args);
    const [bundle, coverage] = await Promise.all([
      loadEvaluationV4Bundle(root, stage), loadEvaluationV4PolicyCoverage(root),
    ]);
    assertEvaluationV4PolicyCoverage(coverage);
    const output = {
      stage, scenarioCount: bundle.scenarios.length,
      scenarioSetHash: bundle.manifest?.bundleHash, policyCoverage: coverage,
    };
    console.log(JSON.stringify(output, null, 2));
    return output;
  }
  const runner = createEvaluationV4Runner({
    root,
    createModel: () => createModelClient('local', { maxTokens: 900 }),
  });
  if (command === 'create') {
    const output = await runner.createExperiment({ stage: requiredStage(args) });
    console.log(JSON.stringify(output, null, 2));
    return output;
  }
  if (command === 'execute') {
    const group = option(args, '--group');
    if (!group) throw new Error('execute requires --group');
    const runs = (await listEvaluationV4Runs(root))
      .filter(({ experimentGroupId }) => experimentGroupId === group)
      .sort((left, right) => left.startedAt.localeCompare(right.startedAt));
    const output = await runner.executeExperiment(runs.map(({ runId }) => runId));
    console.log(JSON.stringify(output, null, 2));
    return output;
  }
  if (command === 'resume') {
    const runId = option(args, '--run');
    if (!runId) throw new Error('resume requires --run');
    const output = await runner.resumeRun(runId);
    console.log(JSON.stringify(output, null, 2));
    return output;
  }
  if (command === 'read-json') {
    const file = option(args, '--file');
    if (!file) throw new Error('read-json requires --file');
    return JSON.parse(await readFile(file, 'utf8'));
  }
  throw new Error('expected check, create, execute, or resume');
};

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  void runAmyHoodEvaluationV4Command(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
