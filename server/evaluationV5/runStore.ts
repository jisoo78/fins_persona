import { mkdir, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import type { EvaluationV5Run } from '../../shared/amyHoodEvaluationV5';
import { writeJsonAtomic } from '../decisionAdvisor/jsonStore';
import { evaluationV5Paths } from './paths';

const assertId = (value: string) => {
  if (!/^[a-zA-Z0-9-]+$/.test(value)) throw new Error(`invalid Evaluation v5 run ID: ${value}`);
};

export const evaluationV5RunPath = (root: string, runId: string) => {
  assertId(runId);
  return path.join(evaluationV5Paths(root).runs, `${runId}.json`);
};

export const writeEvaluationV5Run = async (root: string, run: EvaluationV5Run) => {
  await writeJsonAtomic(evaluationV5RunPath(root, run.runId), run);
  return run;
};

export const readEvaluationV5Run = async (root: string, runId: string): Promise<EvaluationV5Run> =>
  JSON.parse(await readFile(evaluationV5RunPath(root, runId), 'utf8')) as EvaluationV5Run;

export const listEvaluationV5Runs = async (root: string) => {
  const directory = evaluationV5Paths(root).runs;
  await mkdir(directory, { recursive: true });
  const names = (await readdir(directory)).filter((name) => name.endsWith('.json'));
  return Promise.all(names.map((name) => readEvaluationV5Run(root, path.basename(name, '.json'))));
};
