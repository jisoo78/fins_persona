import { mkdir, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import type { EvaluationV4Run } from '../../shared/amyHoodEvaluationV4';
import { writeJsonAtomic } from '../decisionAdvisor/jsonStore';
import { evaluationV4Paths } from './paths';

const assertId = (value: string) => {
  if (!/^[a-zA-Z0-9-]+$/.test(value)) throw new Error(`invalid Evaluation v4 run ID: ${value}`);
};

export const evaluationV4RunPath = (root: string, runId: string) => {
  assertId(runId);
  return path.join(evaluationV4Paths(root).runs, `${runId}.json`);
};

export const writeEvaluationV4Run = async (root: string, run: EvaluationV4Run) => {
  await writeJsonAtomic(evaluationV4RunPath(root, run.runId), run);
  return run;
};

export const readEvaluationV4Run = async (root: string, runId: string): Promise<EvaluationV4Run> =>
  JSON.parse(await readFile(evaluationV4RunPath(root, runId), 'utf8')) as EvaluationV4Run;

export const listEvaluationV4Runs = async (root: string) => {
  const directory = evaluationV4Paths(root).runs;
  await mkdir(directory, { recursive: true });
  const names = (await readdir(directory)).filter((name) => name.endsWith('.json'));
  return Promise.all(names.map((name) => readEvaluationV4Run(root, path.basename(name, '.json'))));
};
