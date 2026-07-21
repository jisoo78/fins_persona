import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import type { EvaluationV5BundleInput } from '../shared/amyHoodEvaluationV5';
import { EVALUATION_V5_ARMS } from '../shared/amyHoodEvaluationV5';
import { canonicalJson, sha256 } from './decisionAdvisor/canonicalJson';
import {
  assertEvaluationV4PolicyCoverage,
  loadEvaluationV4PolicyCoverage,
} from './evaluationV4/policyCoverage';
import {
  exportEvaluationV5JudgePackets,
  exportEvaluationV5PairJudgePackets,
  importEvaluationV5Grades,
  importEvaluationV5PairGrades,
} from './evaluationV5/judge';
import { evaluationV5Paths } from './evaluationV5/paths';
import { buildEvaluationV5Report, writeEvaluationV5HtmlReport } from './evaluationV5/report';
import { listEvaluationV5Runs } from './evaluationV5/runStore';
import { createEvaluationV5Runner } from './evaluationV5/runner';
import {
  freezeEvaluationV5Bundle,
  loadEvaluationV5Bundle,
} from './evaluationV5/scenarioSet';
import { loadEvaluationV5ExternalSources } from './evaluationV5/sourceSet';
import { createModelClient } from './personaPipeline/modelClient';

const option = (args: string[], name: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

const readJson = async <T>(filePath: string): Promise<T> =>
  JSON.parse(await readFile(filePath, 'utf8')) as T;

const loadUnfrozenInput = async (root: string): Promise<EvaluationV5BundleInput> => {
  const paths = evaluationV5Paths(root);
  const [scenarioFile, reviewFile, provenanceFile, alignmentFile, pairFile, external] = await Promise.all([
    readJson<EvaluationV5BundleInput['scenarioFile']>(paths.scenarios),
    readJson<EvaluationV5BundleInput['reviewFile']>(paths.reviews),
    readJson<{ provenance: EvaluationV5BundleInput['provenance'] }>(paths.provenance),
    readJson<{ alignmentKeys: EvaluationV5BundleInput['alignmentKeys'] }>(paths.alignmentKeys),
    readJson<{ pairKeys: EvaluationV5BundleInput['pairKeys'] }>(paths.pairKeys),
    loadEvaluationV5ExternalSources(root),
  ]);
  return {
    scenarioFile,
    reviewFile,
    provenance: provenanceFile.provenance,
    alignmentKeys: alignmentFile.alignmentKeys,
    pairKeys: pairFile.pairKeys,
    externalEvents: external.events,
    externalSourceHash: sha256(canonicalJson({ sources: external.sources, events: external.events })),
    manifest: null,
  };
};

export const runAmyHoodEvaluationV5Command = async (
  args: string[],
  root = process.cwd(),
) => {
  const command = args[0];
  if (command === 'freeze') {
    const output = await freezeEvaluationV5Bundle(root, await loadUnfrozenInput(root));
    console.log(JSON.stringify(output, null, 2));
    return output;
  }
  if (command === 'check') {
    const [bundle, coverage] = await Promise.all([
      loadEvaluationV5Bundle(root),
      loadEvaluationV4PolicyCoverage(root),
    ]);
    assertEvaluationV4PolicyCoverage(coverage);
    const output = {
      version: '5.0.0',
      stage: 'benchmark',
      scenarioCount: bundle.scenarios.length,
      pairCount: bundle.pairs.length,
      arms: EVALUATION_V5_ARMS,
      repetitions: 5,
      expectedRuns: 15,
      expectedAnswers: 450,
      scenarioSetHash: bundle.manifest?.bundleHash,
      domainCounts: bundle.domainCounts,
      changeTypeCounts: bundle.changeTypeCounts,
      policyCoverage: coverage,
    };
    console.log(JSON.stringify(output, null, 2));
    return output;
  }
  const runner = createEvaluationV5Runner({
    root,
    createModel: () => createModelClient('local', { maxTokens: 900 }),
  });
  if (command === 'create') {
    const output = await runner.createExperiment();
    console.log(JSON.stringify(output, null, 2));
    return output;
  }
  if (command === 'execute') {
    const group = option(args, '--group');
    if (!group) throw new Error('execute requires --group');
    const armOrder = new Map(EVALUATION_V5_ARMS.map((arm, index) => [arm, index]));
    const runs = (await listEvaluationV5Runs(root))
      .filter(({ experimentGroupId }) => experimentGroupId === group)
      .sort((left, right) => left.repetition - right.repetition
        || armOrder.get(left.arm)! - armOrder.get(right.arm)!);
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
  if (command === 'export-judge') {
    const group = option(args, '--group');
    if (!group) throw new Error('export-judge requires --group');
    const output = await exportEvaluationV5JudgePackets(root, group);
    console.log(JSON.stringify(output, null, 2));
    return output;
  }
  if (command === 'import-grades') {
    const group = option(args, '--group');
    const file = option(args, '--file');
    if (!group || !file) throw new Error('import-grades requires --group and --file');
    const output = await importEvaluationV5Grades(root, group, await readJson(file));
    console.log(JSON.stringify(output, null, 2));
    return output;
  }
  if (command === 'export-pair-judge') {
    const group = option(args, '--group');
    if (!group) throw new Error('export-pair-judge requires --group');
    const output = await exportEvaluationV5PairJudgePackets(root, group);
    console.log(JSON.stringify(output, null, 2));
    return output;
  }
  if (command === 'import-pair-grades') {
    const group = option(args, '--group');
    const file = option(args, '--file');
    if (!group || !file) throw new Error('import-pair-grades requires --group and --file');
    const output = await importEvaluationV5PairGrades(root, group, await readJson(file));
    console.log(JSON.stringify(output, null, 2));
    return output;
  }
  if (command === 'report') {
    const group = option(args, '--group');
    if (!group) throw new Error('report requires --group');
    const html = option(args, '--html');
    const output = html
      ? await writeEvaluationV5HtmlReport(root, group, html)
      : await buildEvaluationV5Report(root, group);
    console.log(JSON.stringify(output, null, 2));
    return output;
  }
  throw new Error(
    'expected freeze, check, create, execute, resume, export-judge, import-grades, export-pair-judge, import-pair-grades, or report',
  );
};

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  void runAmyHoodEvaluationV5Command(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
