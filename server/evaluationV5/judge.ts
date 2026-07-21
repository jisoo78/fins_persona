import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  EvaluationV5Grade,
  EvaluationV5JudgeAlignmentKey,
  EvaluationV5JudgePacket,
  EvaluationV5JudgeScenario,
  EvaluationV5PairGrade,
  EvaluationV5PairJudgeKey,
  EvaluationV5PairJudgePacket,
} from '../../shared/amyHoodEvaluationV5';
import { canonicalJson, sha256 } from '../decisionAdvisor/canonicalJson';
import { writeJsonAtomic } from '../decisionAdvisor/jsonStore';
import { evaluationV5Paths } from './paths';
import { listEvaluationV5Runs } from './runStore';
import { loadEvaluationV5Bundle } from './scenarioSet';

export type EvaluationV5JudgePrivateLink = {
  packetId: string;
  experimentGroupId: string;
  runId: string;
  arm: string;
  repetition: number;
  scenarioId: string;
};

export type EvaluationV5PairJudgePrivateLink = {
  packetId: string;
  experimentGroupId: string;
  runId: string;
  arm: string;
  repetition: number;
  pairId: string;
  initialScenarioId: string;
  changedScenarioId: string;
};

type IndividualExport = {
  experimentGroupId: string;
  batchHash: string;
  packets: EvaluationV5JudgePacket[];
};

type PairExport = {
  experimentGroupId: string;
  batchHash: string;
  packets: EvaluationV5PairJudgePacket[];
};

type JudgeExportOptions = {
  repetition?: 1 | 2 | 3 | 4 | 5;
};

const packetDirectory = (root: string, groupId: string) => {
  if (!/^[a-zA-Z0-9-]+$/.test(groupId)) throw new Error('invalid Evaluation v5 group ID');
  return path.join(evaluationV5Paths(root).judgePackets, groupId);
};

const forbiddenKeys = new Set([
  'arm',
  'model',
  'provider',
  'runId',
  'retrieval',
  'externalEventId',
  'actualHistoricalAction',
  'outcomeEvidenceIds',
  'organization',
  'executiveName',
  'scenarioId',
  'pairId',
  'phase',
  'sourceIds',
  'primarySourceId',
  'secondarySourceIds',
]);

export const assertEvaluationV5JudgePacketsBlind = (value: unknown) => {
  const visit = (item: unknown): void => {
    if (Array.isArray(item)) return item.forEach(visit);
    if (!item || typeof item !== 'object') return;
    for (const [key, child] of Object.entries(item as Record<string, unknown>)) {
      if (forbiddenKeys.has(key)) throw new Error(`Evaluation v5 blind packet leakage: ${key}`);
      visit(child);
    }
  };
  visit(value);
};

const judgeScenario = ({ title, situation, decisionQuestion }: {
  title: string;
  situation: string;
  decisionQuestion: string;
}): EvaluationV5JudgeScenario => ({ title, situation, decisionQuestion });

const judgeAlignmentKey = ({ scenarioId: _scenarioId, phase: _phase, ...key }: {
  scenarioId: string;
  phase: string;
} & EvaluationV5JudgeAlignmentKey): EvaluationV5JudgeAlignmentKey => key;

const judgePairKey = ({
  pairId: _pairId,
  initialScenarioId: _initialScenarioId,
  changedScenarioId: _changedScenarioId,
  ...key
}: {
  pairId: string;
  initialScenarioId: string;
  changedScenarioId: string;
} & EvaluationV5PairJudgeKey): EvaluationV5PairJudgeKey => key;

const loadCompleteRuns = async (
  root: string,
  experimentGroupId: string,
  options: JudgeExportOptions = {},
) => {
  const matching = (await listEvaluationV5Runs(root))
    .filter((run) => run.experimentGroupId === experimentGroupId);
  const runs = options.repetition === undefined
    ? matching
    : matching.filter(({ repetition }) => repetition === options.repetition);
  const expectedRuns = options.repetition === undefined ? 15 : 3;
  if (runs.length !== expectedRuns
    || runs.some(({ status, answers }) => status !== 'complete' || answers.length !== 30)) {
    throw new Error(`Evaluation v5 judge export requires ${expectedRuns} complete runs`);
  }
  const cells = new Set(runs.map(({ repetition, arm }) => `${repetition}:${arm}`));
  if (cells.size !== expectedRuns) throw new Error('Evaluation v5 judge export contains duplicate experiment cells');
  return runs.sort((left, right) => left.runId.localeCompare(right.runId));
};

export const exportEvaluationV5JudgePackets = async (
  root: string,
  experimentGroupId: string,
  options: JudgeExportOptions = {},
): Promise<IndividualExport> => {
  const [bundle, runs] = await Promise.all([
    loadEvaluationV5Bundle(root),
    loadCompleteRuns(root, experimentGroupId, options),
  ]);
  const scenarioById = new Map(bundle.scenarios.map((scenario) => [scenario.id, scenario]));
  const keyById = new Map(bundle.alignmentKeys.map((key) => [key.scenarioId, key]));
  const packets: EvaluationV5JudgePacket[] = [];
  const links: EvaluationV5JudgePrivateLink[] = [];
  for (const run of runs) {
    for (const answer of run.answers) {
      const scenario = scenarioById.get(answer.scenarioId);
      const alignmentKey = keyById.get(answer.scenarioId);
      if (!scenario || !alignmentKey || answer.status !== 'complete' || !answer.response) {
        throw new Error(`Evaluation v5 answer is not judgeable: ${answer.scenarioId}`);
      }
      const packetId = `packet-${sha256(canonicalJson({
        experimentGroupId,
        runId: run.runId,
        scenarioId: answer.scenarioId,
      })).slice(0, 20)}`;
      const base = {
        packetId,
        scenario: judgeScenario(scenario),
        candidateResponse: answer.response,
        alignmentKey: judgeAlignmentKey(alignmentKey),
        anchorChecklist: ['action', 'priority', 'guardrails', 'reversal'] as EvaluationV5JudgePacket['anchorChecklist'],
      };
      packets.push({ ...base, packetHash: sha256(canonicalJson(base)) });
      links.push({
        packetId,
        experimentGroupId,
        runId: run.runId,
        arm: run.arm,
        repetition: run.repetition,
        scenarioId: answer.scenarioId,
      });
    }
  }
  packets.sort((left, right) => left.packetId.localeCompare(right.packetId));
  links.sort((left, right) => left.packetId.localeCompare(right.packetId));
  assertEvaluationV5JudgePacketsBlind(packets);
  const output = { experimentGroupId, batchHash: sha256(canonicalJson(packets)), packets };
  const directory = packetDirectory(root, experimentGroupId);
  await Promise.all([
    writeJsonAtomic(path.join(directory, 'individual-packets.json'), output),
    writeJsonAtomic(path.join(directory, 'individual-private-links.json'), { experimentGroupId, links }),
  ]);
  return output;
};

export const exportEvaluationV5PairJudgePackets = async (
  root: string,
  experimentGroupId: string,
): Promise<PairExport> => {
  const [bundle, runs] = await Promise.all([
    loadEvaluationV5Bundle(root),
    loadCompleteRuns(root, experimentGroupId),
  ]);
  const scenarioById = new Map(bundle.scenarios.map((scenario) => [scenario.id, scenario]));
  const pairById = new Map(bundle.pairKeys.map((key) => [key.pairId, key]));
  const packets: EvaluationV5PairJudgePacket[] = [];
  const links: EvaluationV5PairJudgePrivateLink[] = [];
  for (const run of runs) {
    const answerById = new Map(run.answers.map((answer) => [answer.scenarioId, answer]));
    for (const pairId of [...pairById.keys()].sort()) {
      const pairKey = pairById.get(pairId)!;
      const initialScenario = scenarioById.get(pairKey.initialScenarioId);
      const changedScenario = scenarioById.get(pairKey.changedScenarioId);
      const initialAnswer = answerById.get(pairKey.initialScenarioId);
      const changedAnswer = answerById.get(pairKey.changedScenarioId);
      if (!initialScenario || !changedScenario || initialAnswer?.status !== 'complete'
        || changedAnswer?.status !== 'complete' || !initialAnswer.response || !changedAnswer.response) {
        throw new Error(`Evaluation v5 pair is not judgeable: ${pairId}`);
      }
      const packetId = `pair-${sha256(canonicalJson({
        experimentGroupId,
        runId: run.runId,
        pairId,
      })).slice(0, 20)}`;
      const base = {
        packetId,
        initialScenario: judgeScenario(initialScenario),
        changedScenario: judgeScenario(changedScenario),
        initialCandidateResponse: initialAnswer.response,
        changedCandidateResponse: changedAnswer.response,
        pairKey: judgePairKey(pairKey),
        anchorChecklist: ['expected_response', 'changed_signal', 'invariant'] as EvaluationV5PairJudgePacket['anchorChecklist'],
      };
      packets.push({ ...base, packetHash: sha256(canonicalJson(base)) });
      links.push({
        packetId,
        experimentGroupId,
        runId: run.runId,
        arm: run.arm,
        repetition: run.repetition,
        pairId,
        initialScenarioId: pairKey.initialScenarioId,
        changedScenarioId: pairKey.changedScenarioId,
      });
    }
  }
  packets.sort((left, right) => left.packetId.localeCompare(right.packetId));
  links.sort((left, right) => left.packetId.localeCompare(right.packetId));
  assertEvaluationV5JudgePacketsBlind(packets);
  const output = { experimentGroupId, batchHash: sha256(canonicalJson(packets)), packets };
  const directory = packetDirectory(root, experimentGroupId);
  await Promise.all([
    writeJsonAtomic(path.join(directory, 'pair-packets.json'), output),
    writeJsonAtomic(path.join(directory, 'pair-private-links.json'), { experimentGroupId, links }),
  ]);
  return output;
};

const validateProvenance = (grade: {
  judgeProvider: string;
  judgeModel: string;
  rationalePromptHash: string;
  scorePromptHash: string;
  gradedAt: string;
}) => {
  if (!['codex', 'openai', 'local'].includes(grade.judgeProvider) || !grade.judgeModel.trim()
    || !/^[a-f0-9]{64}$/.test(grade.rationalePromptHash)
    || !/^[a-f0-9]{64}$/.test(grade.scorePromptHash)
    || Number.isNaN(new Date(grade.gradedAt).valueOf())
    || new Date(grade.gradedAt).toISOString() !== grade.gradedAt) {
    throw new Error('Evaluation v5 grade provenance is invalid');
  }
};

const validateRationale = (rationale: string) => {
  if (rationale.length < 1 || rationale.length > 500 || /[\r\n]/.test(rationale)) {
    throw new Error('Evaluation v5 rationale must be single-line and 1-500 characters');
  }
};

const validateGrade = (grade: EvaluationV5Grade, packet: EvaluationV5JudgePacket) => {
  const anchors = ['action', 'priority', 'guardrails', 'reversal'];
  const allowed = ['aligned', 'partial', 'missing', 'conflict'];
  if (grade.packetHash !== packet.packetHash) throw new Error(`Evaluation v5 packet hash mismatch: ${grade.packetId}`);
  if (!Number.isInteger(grade.score) || grade.score < 1 || grade.score > 10) {
    throw new Error('Evaluation v5 grade score must be 1-10');
  }
  validateRationale(grade.rationale);
  if (Object.keys(grade.anchorFindings).length !== 4
    || anchors.some((anchor) => !allowed.includes(
      grade.anchorFindings[anchor as keyof typeof grade.anchorFindings],
    ))) {
    throw new Error('Evaluation v5 grade requires four anchor findings');
  }
  validateProvenance(grade);
};

const validatePairGrade = (grade: EvaluationV5PairGrade, packet: EvaluationV5PairJudgePacket) => {
  if (grade.packetHash !== packet.packetHash) throw new Error(`Evaluation v5 pair packet hash mismatch: ${grade.packetId}`);
  validateRationale(grade.rationale);
  const allowed = ['aligned', 'partial', 'conflict'];
  if (typeof grade.aligned !== 'boolean'
    || !allowed.includes(grade.expectedResponseFinding)
    || !allowed.includes(grade.changedSignalFinding)
    || !allowed.includes(grade.invariantFinding)) {
    throw new Error('Evaluation v5 pair grade requires complete transition findings');
  }
  validateProvenance(grade);
};

const importGrades = async <TGrade extends { packetId: string }, TPacket extends { packetId: string }>(
  root: string,
  experimentGroupId: string,
  options: {
    grades: TGrade[];
    expectedCount: number;
    packetFile: string;
    gradeRoot: string;
    validate(grade: TGrade, packet: TPacket): void;
  },
) => {
  const exported = JSON.parse(await readFile(
    path.join(packetDirectory(root, experimentGroupId), options.packetFile),
    'utf8',
  )) as { batchHash: string; packets: TPacket[] };
  const expectedCount = exported.packets.length;
  if (!Array.isArray(options.grades) || options.grades.length !== expectedCount) {
    throw new Error(`Evaluation v5 grade import requires exactly ${expectedCount} grades`);
  }
  const packetById = new Map(exported.packets.map((packet) => [packet.packetId, packet]));
  if (new Set(options.grades.map(({ packetId }) => packetId)).size !== expectedCount) {
    throw new Error('Evaluation v5 grades must have unique packet IDs');
  }
  for (const grade of options.grades) {
    const packet = packetById.get(grade.packetId);
    if (!packet) throw new Error(`Evaluation v5 grade references unknown packet: ${grade.packetId}`);
    options.validate(grade, packet);
  }
  const ordered = [...options.grades].sort((left, right) => left.packetId.localeCompare(right.packetId));
  const batchHash = sha256(canonicalJson({
    experimentGroupId,
    packetBatchHash: exported.batchHash,
    grades: ordered,
  }));
  const directory = path.join(options.gradeRoot, experimentGroupId);
  const payload = {
    experimentGroupId,
    packetBatchHash: exported.batchHash,
    batchHash,
    grades: ordered,
  };
  await writeJsonAtomic(path.join(directory, batchHash, 'grades.json'), payload);
  await writeJsonAtomic(path.join(directory, 'active.json'), { experimentGroupId, batchHash });
  return payload;
};

export const importEvaluationV5Grades = async (
  root: string,
  experimentGroupId: string,
  input: EvaluationV5Grade[] | { grades: EvaluationV5Grade[] },
) => importGrades<EvaluationV5Grade, EvaluationV5JudgePacket>(root, experimentGroupId, {
  grades: Array.isArray(input) ? input : input.grades,
  expectedCount: 450,
  packetFile: 'individual-packets.json',
  gradeRoot: evaluationV5Paths(root).grades,
  validate: validateGrade,
});

export const importEvaluationV5PairGrades = async (
  root: string,
  experimentGroupId: string,
  input: EvaluationV5PairGrade[] | { grades: EvaluationV5PairGrade[] },
) => importGrades<EvaluationV5PairGrade, EvaluationV5PairJudgePacket>(root, experimentGroupId, {
  grades: Array.isArray(input) ? input : input.grades,
  expectedCount: 225,
  packetFile: 'pair-packets.json',
  gradeRoot: evaluationV5Paths(root).pairGrades,
  validate: validatePairGrade,
});

const loadActive = async <T>(directory: string, missingMessage: string): Promise<T> => {
  let active: { batchHash: string };
  try {
    active = JSON.parse(await readFile(path.join(directory, 'active.json'), 'utf8')) as { batchHash: string };
  } catch {
    throw new Error(missingMessage);
  }
  return JSON.parse(await readFile(path.join(directory, active.batchHash, 'grades.json'), 'utf8')) as T;
};

export const loadActiveEvaluationV5Grades = (root: string, experimentGroupId: string) =>
  loadActive<{
    experimentGroupId: string;
    packetBatchHash: string;
    batchHash: string;
    grades: EvaluationV5Grade[];
  }>(
    path.join(evaluationV5Paths(root).grades, experimentGroupId),
    'Evaluation v5 active individual grades are required',
  );

export const loadActiveEvaluationV5PairGrades = (root: string, experimentGroupId: string) =>
  loadActive<{
    experimentGroupId: string;
    packetBatchHash: string;
    batchHash: string;
    grades: EvaluationV5PairGrade[];
  }>(
    path.join(evaluationV5Paths(root).pairGrades, experimentGroupId),
    'Evaluation v5 active pair grades are required',
  );

export const loadEvaluationV5JudgeLinks = async (root: string, experimentGroupId: string) =>
  JSON.parse(await readFile(
    path.join(packetDirectory(root, experimentGroupId), 'individual-private-links.json'),
    'utf8',
  )) as { experimentGroupId: string; links: EvaluationV5JudgePrivateLink[] };

export const loadEvaluationV5PairJudgeLinks = async (root: string, experimentGroupId: string) =>
  JSON.parse(await readFile(
    path.join(packetDirectory(root, experimentGroupId), 'pair-private-links.json'),
    'utf8',
  )) as { experimentGroupId: string; links: EvaluationV5PairJudgePrivateLink[] };
