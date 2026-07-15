import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

import type { EvaluationV3Run } from '../../shared/amyHoodEvaluationV3';

const assertRunId = (runId: string) => {
  if (!/^[a-zA-Z0-9-]+$/.test(runId)) {
    throw new Error(`invalid Evaluation v3 run ID: ${runId}`);
  }
};

export const evaluationV3RunPath = (root: string, runId: string) => {
  assertRunId(runId);
  return resolve(root, 'evaluation/v3/runs', `${runId}.json`);
};

const atomicWrite = async (path: string, text: string) => {
  await mkdir(resolve(path, '..'), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, text, 'utf8');
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
};

export const readEvaluationV3Run = async (
  root: string,
  runId: string,
): Promise<EvaluationV3Run> =>
  JSON.parse(await readFile(evaluationV3RunPath(root, runId), 'utf8')) as EvaluationV3Run;

export const writeEvaluationV3Run = async (root: string, run: EvaluationV3Run) => {
  await atomicWrite(
    evaluationV3RunPath(root, run.runId),
    `${JSON.stringify(run, null, 2)}\n`,
  );
  return run;
};

export const listEvaluationV3Runs = async (root: string) => {
  const directory = resolve(root, 'evaluation/v3/runs');
  await mkdir(directory, { recursive: true });
  const names = (await readdir(directory))
    .filter((name) => name.endsWith('.json'))
    .sort()
    .reverse();
  return Promise.all(names.map((name) =>
    readEvaluationV3Run(root, basename(name, '.json'))));
};
