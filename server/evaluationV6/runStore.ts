import { mkdir, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import type { EvaluationV6Run } from '../../shared/amyHoodEvaluationV6';
import { writeJsonAtomic } from '../decisionAdvisor/jsonStore';
import { evaluationV6Paths } from './paths';

const assertId = (value: string) => {
  if (!/^[a-zA-Z0-9-]+$/.test(value)) throw new Error(`invalid Evaluation v6 run ID: ${value}`);
};
export const evaluationV6RunPath = (root: string, runId: string) => {
  assertId(runId);
  return path.join(evaluationV6Paths(root).runs, `${runId}.json`);
};
export const writeEvaluationV6Run = async (root: string, run: EvaluationV6Run) => {
  await writeJsonAtomic(evaluationV6RunPath(root, run.runId), run);
  return run;
};
export const readEvaluationV6Run = async (root: string, runId: string): Promise<EvaluationV6Run> =>
  JSON.parse(await readFile(evaluationV6RunPath(root, runId), 'utf8')) as EvaluationV6Run;
export const listEvaluationV6Runs = async (root: string) => {
  const directory = evaluationV6Paths(root).runs;
  await mkdir(directory, { recursive: true });
  const names = (await readdir(directory)).filter((name) => name.endsWith('.json'));
  return Promise.all(names.map((name) => readEvaluationV6Run(root, path.basename(name, '.json'))));
};
