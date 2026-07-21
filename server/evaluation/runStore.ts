import { randomUUID } from 'node:crypto';
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { basename, resolve } from 'node:path';

import type { EvaluationRun } from '../../shared/amyHoodEvaluation';

const assertRunId = (runId: string) => {
  if (!/^[a-zA-Z0-9-]+$/.test(runId)) throw new Error(`invalid evaluation run ID: ${runId}`);
};

export const runPath = (root: string, runId: string) => {
  assertRunId(runId);
  return resolve(root, 'evaluation', 'runs', `${runId}.json`);
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

export const readRun = async (root: string, runId: string): Promise<EvaluationRun> =>
  JSON.parse(await readFile(runPath(root, runId), 'utf8')) as EvaluationRun;

export const writeRun = async (root: string, run: EvaluationRun) => {
  await atomicWrite(runPath(root, run.runId), `${JSON.stringify(run, null, 2)}\n`);
  return run;
};

export const updateRun = async (
  root: string,
  runId: string,
  updater: (current: EvaluationRun) => EvaluationRun,
) => writeRun(root, updater(await readRun(root, runId)));

export const listRuns = async (root: string) => {
  const directory = resolve(root, 'evaluation', 'runs');
  await mkdir(directory, { recursive: true });
  const names = (await readdir(directory))
    .filter((name) => name.endsWith('.json'));
  const runs = await Promise.all(
    names.map((name) => readRun(root, basename(name, '.json'))),
  );
  return runs.sort(
    (left, right) =>
      new Date(right.startedAt).getTime() - new Date(left.startedAt).getTime() ||
      right.runId.localeCompare(left.runId),
  );
};
