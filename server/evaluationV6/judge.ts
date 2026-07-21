import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import type {
  EvaluationV6Grade,
  EvaluationV6IdentityKey,
  EvaluationV6JudgePacket,
  EvaluationV6PairGrade,
  EvaluationV6PairJudgePacket,
  EvaluationV6Run,
  EvaluationV6Scenario,
} from '../../shared/amyHoodEvaluationV6';
import type { EvaluationV5CandidateResponse } from '../../shared/amyHoodEvaluationV5';
import { canonicalJson, sha256 } from '../decisionAdvisor/canonicalJson';
import { writeJsonAtomic } from '../decisionAdvisor/jsonStore';
import { evaluationV6Paths } from './paths';
import { computeEvaluationV6IdentityScore } from './scoring';
import { loadEvaluationV6Bundle } from './scenarioSet';

type ExportOptions = { repetition?: 1 | 2 | 3 | 4 | 5 };

const forbiddenKeys = new Set([
  'arm', 'model', 'provider', 'runId', 'retrieval', 'policyId', 'scenarioId',
  'pairId', 'phase', 'predecessorScenarioId', 'evidenceClass', 'amyEvidenceIds',
  'externalMotifEventId', 'externalEventId', 'executiveName', 'organization',
  'sourceIds', 'primarySourceId', 'secondarySourceIds', 'actualHistoricalAction',
]);

export const assertEvaluationV6JudgePacketsBlind = (value: unknown) => {
  const visit = (item: unknown): void => {
    if (Array.isArray(item)) return item.forEach(visit);
    if (!item || typeof item !== 'object') return;
    for (const [key, child] of Object.entries(item as Record<string, unknown>)) {
      if (forbiddenKeys.has(key)) throw new Error(`Evaluation v6 blind packet leakage: ${key}`);
      visit(child);
    }
  };
  visit(value);
};

const publicScenario = ({ title, situation, decisionQuestion }: EvaluationV6Scenario) => ({
  title, situation, decisionQuestion,
});

const publicIdentityKey = ({
  scenarioId: _scenarioId,
  policyId: _policyId,
  evidenceClass: _evidenceClass,
  amyEvidenceIds: _amyEvidenceIds,
  externalMotifEventId: _externalMotifEventId,
  ...identityKey
}: EvaluationV6IdentityKey) => identityKey;

export const buildEvaluationV6JudgePacket = (
  scenario: EvaluationV6Scenario,
  candidateResponse: EvaluationV5CandidateResponse,
  identityKey: EvaluationV6IdentityKey,
  packetId = `packet-${sha256(canonicalJson({ scenario: scenario.id, candidateResponse })).slice(0, 20)}`,
): EvaluationV6JudgePacket => {
  if (scenario.id !== identityKey.scenarioId) {
    throw new Error('Evaluation v6 scenario and identity key do not match');
  }
  const base = {
    packetId,
    scenario: publicScenario(scenario),
    candidateResponse,
    identityKey: publicIdentityKey(identityKey),
  };
  const packet = { ...base, packetHash: sha256(canonicalJson(base)) };
  assertEvaluationV6JudgePacketsBlind(packet);
  return packet;
};

const packetDirectory = (root: string, groupId: string) => {
  if (!/^[a-zA-Z0-9-]+$/.test(groupId)) throw new Error('invalid Evaluation v6 group ID');
  return path.join(evaluationV6Paths(root).judgePackets, groupId);
};

const listRuns = async (root: string): Promise<EvaluationV6Run[]> => {
  let names: string[];
  try {
    names = (await readdir(evaluationV6Paths(root).runs)).filter((name) => name.endsWith('.json'));
  } catch {
    return [];
  }
  return Promise.all(names.map(async (name) => JSON.parse(await readFile(
    path.join(evaluationV6Paths(root).runs, name), 'utf8',
  )) as EvaluationV6Run));
};

const loadCompleteRuns = async (root: string, groupId: string, options: ExportOptions = {}) => {
  const matching = (await listRuns(root)).filter(({ experimentGroupId }) => experimentGroupId === groupId);
  const runs = options.repetition === undefined
    ? matching
    : matching.filter(({ repetition }) => repetition === options.repetition);
  const expected = options.repetition === undefined ? 15 : 3;
  if (runs.length !== expected || runs.some(({ status, answers }) =>
    status !== 'complete' || answers.length !== 30 || answers.some(({ status }) => status !== 'complete'))) {
    throw new Error(`Evaluation v6 judge export requires ${expected} complete runs`);
  }
  if (new Set(runs.map(({ repetition, arm }) => `${repetition}:${arm}`)).size !== expected) {
    throw new Error('Evaluation v6 judge export contains duplicate experiment cells');
  }
  return runs;
};

export const exportEvaluationV6JudgePackets = async (
  root: string,
  experimentGroupId: string,
  options: ExportOptions = {},
) => {
  const [bundle, runs] = await Promise.all([
    loadEvaluationV6Bundle(root),
    loadCompleteRuns(root, experimentGroupId, options),
  ]);
  const scenarioById = new Map(bundle.scenarios.map((scenario) => [scenario.id, scenario]));
  const keyById = new Map(bundle.identityKeys.map((key) => [key.scenarioId, key]));
  const packets: EvaluationV6JudgePacket[] = [];
  const links: Array<Record<string, unknown>> = [];
  for (const run of runs) {
    for (const answer of run.answers) {
      const scenario = scenarioById.get(answer.scenarioId);
      const key = keyById.get(answer.scenarioId);
      if (!scenario || !key || !answer.response) throw new Error(`Evaluation v6 answer is not judgeable: ${answer.scenarioId}`);
      const packetId = `packet-${sha256(canonicalJson({ experimentGroupId, runId: run.runId, scenarioId: answer.scenarioId })).slice(0, 20)}`;
      packets.push(buildEvaluationV6JudgePacket(scenario, answer.response, key, packetId));
      links.push({ packetId, experimentGroupId, runId: run.runId, arm: run.arm, repetition: run.repetition, scenarioId: answer.scenarioId });
    }
  }
  packets.sort((left, right) => left.packetId.localeCompare(right.packetId));
  links.sort((left, right) => String(left.packetId).localeCompare(String(right.packetId)));
  const output = { experimentGroupId, batchHash: sha256(canonicalJson(packets)), packets };
  const directory = packetDirectory(root, experimentGroupId);
  await Promise.all([
    writeJsonAtomic(path.join(directory, 'individual-packets.json'), output),
    writeJsonAtomic(path.join(directory, 'individual-private-links.json'), { experimentGroupId, links }),
  ]);
  return output;
};

export const exportEvaluationV6PairJudgePackets = async (root: string, experimentGroupId: string) => {
  const [bundle, runs] = await Promise.all([loadEvaluationV6Bundle(root), loadCompleteRuns(root, experimentGroupId)]);
  const scenarioById = new Map(bundle.scenarios.map((scenario) => [scenario.id, scenario]));
  const keyById = new Map(bundle.identityKeys.map((key) => [key.scenarioId, key]));
  const packets: EvaluationV6PairJudgePacket[] = [];
  const links: Array<Record<string, unknown>> = [];
  for (const run of runs) {
    const answerById = new Map(run.answers.map((answer) => [answer.scenarioId, answer]));
    for (const pairKey of bundle.pairKeys) {
      const initialScenario = scenarioById.get(pairKey.initialScenarioId)!;
      const changedScenario = scenarioById.get(pairKey.changedScenarioId)!;
      const initialAnswer = answerById.get(pairKey.initialScenarioId);
      const changedAnswer = answerById.get(pairKey.changedScenarioId);
      const initialIdentityKey = keyById.get(pairKey.initialScenarioId)!;
      const changedIdentityKey = keyById.get(pairKey.changedScenarioId)!;
      if (!initialAnswer?.response || !changedAnswer?.response) throw new Error(`Evaluation v6 pair is not judgeable: ${pairKey.pairId}`);
      const packetId = `pair-${sha256(canonicalJson({ experimentGroupId, runId: run.runId, pairId: pairKey.pairId })).slice(0, 20)}`;
      const { pairId: _pairId, initialScenarioId: _initialId, changedScenarioId: _changedId, ...publicPairKey } = pairKey;
      const base = {
        packetId,
        initialScenario: publicScenario(initialScenario),
        changedScenario: publicScenario(changedScenario),
        initialCandidateResponse: initialAnswer.response,
        changedCandidateResponse: changedAnswer.response,
        initialIdentityKey: publicIdentityKey(initialIdentityKey),
        changedIdentityKey: publicIdentityKey(changedIdentityKey),
        pairKey: publicPairKey,
      };
      const packet = { ...base, packetHash: sha256(canonicalJson(base)) };
      assertEvaluationV6JudgePacketsBlind(packet);
      packets.push(packet);
      links.push({ packetId, experimentGroupId, runId: run.runId, arm: run.arm, repetition: run.repetition, pairId: pairKey.pairId, initialScenarioId: pairKey.initialScenarioId, changedScenarioId: pairKey.changedScenarioId });
    }
  }
  packets.sort((left, right) => left.packetId.localeCompare(right.packetId));
  links.sort((left, right) => String(left.packetId).localeCompare(String(right.packetId)));
  const output = { experimentGroupId, batchHash: sha256(canonicalJson(packets)), packets };
  const directory = packetDirectory(root, experimentGroupId);
  await Promise.all([
    writeJsonAtomic(path.join(directory, 'pair-packets.json'), output),
    writeJsonAtomic(path.join(directory, 'pair-private-links.json'), { experimentGroupId, links }),
  ]);
  return output;
};

const validateGrade = (grade: EvaluationV6Grade, packet: EvaluationV6JudgePacket | EvaluationV6PairJudgePacket) => {
  if (grade.packetHash !== packet.packetHash) throw new Error(`Evaluation v6 grade packet identity is stale: ${grade.packetId}`);
  if (!grade.rationale.trim() || grade.rationale.length > 500 || /[\r\n]/.test(grade.rationale)) {
    throw new Error('Evaluation v6 grade rationale is invalid');
  }
  if (!['codex', 'openai', 'local'].includes(grade.judgeProvider) || !grade.judgeModel.trim()
    || !/^[a-f0-9]{64}$/.test(grade.rationalePromptHash)
    || !/^[a-f0-9]{64}$/.test(grade.assessmentPromptHash)
    || Number.isNaN(Date.parse(grade.gradedAt))) {
    throw new Error('Evaluation v6 grade provenance is invalid');
  }
  const recomputed = computeEvaluationV6IdentityScore(grade);
  if (grade.score !== recomputed.score || grade.uncappedScore !== recomputed.uncappedScore
    || canonicalJson(grade.ceilingApplied) !== canonicalJson(recomputed.ceilingApplied)) {
    throw new Error(`Evaluation v6 grade score is not reproducible: ${grade.packetId}`);
  }
};

const importGrades = async <TGrade extends EvaluationV6Grade, TPacket extends EvaluationV6JudgePacket | EvaluationV6PairJudgePacket>(
  root: string,
  experimentGroupId: string,
  input: TGrade[] | { grades: TGrade[] },
  packetFile: string,
  gradeRoot: string,
  validateExtra: (grade: TGrade) => void = () => undefined,
) => {
  const grades = Array.isArray(input) ? input : input.grades;
  const exported = JSON.parse(await readFile(
    path.join(packetDirectory(root, experimentGroupId), packetFile), 'utf8',
  )) as { batchHash: string; packets: TPacket[] };
  if (!Array.isArray(grades) || grades.length !== exported.packets.length) {
    throw new Error(`Evaluation v6 grade import requires exactly ${exported.packets.length} grades`);
  }
  if (new Set(grades.map(({ packetId }) => packetId)).size !== grades.length) {
    throw new Error('Evaluation v6 grades contain duplicate packet IDs');
  }
  const packetById = new Map(exported.packets.map((packet) => [packet.packetId, packet]));
  for (const grade of grades) {
    const packet = packetById.get(grade.packetId);
    if (!packet) throw new Error(`Evaluation v6 grade references unknown packet: ${grade.packetId}`);
    validateGrade(grade, packet);
    validateExtra(grade);
  }
  const ordered = [...grades].sort((left, right) => left.packetId.localeCompare(right.packetId));
  const batchHash = sha256(canonicalJson({ experimentGroupId, packetBatchHash: exported.batchHash, grades: ordered }));
  const payload = { experimentGroupId, packetBatchHash: exported.batchHash, batchHash, grades: ordered };
  const directory = path.join(gradeRoot, experimentGroupId);
  await writeJsonAtomic(path.join(directory, batchHash, 'grades.json'), payload);
  await writeJsonAtomic(path.join(directory, 'active.json'), { experimentGroupId, batchHash, activatedAt: new Date().toISOString() });
  return payload;
};

export const importEvaluationV6Grades = (
  root: string,
  experimentGroupId: string,
  input: EvaluationV6Grade[] | { grades: EvaluationV6Grade[] },
) => importGrades(root, experimentGroupId, input, 'individual-packets.json', evaluationV6Paths(root).grades);

export const importEvaluationV6PairGrades = (
  root: string,
  experimentGroupId: string,
  input: EvaluationV6PairGrade[] | { grades: EvaluationV6PairGrade[] },
) => importGrades(root, experimentGroupId, input, 'pair-packets.json', evaluationV6Paths(root).pairGrades, (grade) => {
  const allowed = new Set(['aligned', 'partial', 'conflict']);
  if (typeof grade.aligned !== 'boolean' || !allowed.has(grade.expectedResponseFinding)
    || !allowed.has(grade.changedSignalFinding) || !allowed.has(grade.invariantFinding)) {
    throw new Error('Evaluation v6 pair grade transition findings are invalid');
  }
});

const loadActiveGrades = async <TGrade>(directory: string, missingMessage: string) => {
  let active: { batchHash: string };
  try {
    active = JSON.parse(await readFile(path.join(directory, 'active.json'), 'utf8')) as { batchHash: string };
  } catch {
    throw new Error(missingMessage);
  }
  return JSON.parse(await readFile(path.join(directory, active.batchHash, 'grades.json'), 'utf8')) as {
    experimentGroupId: string;
    packetBatchHash: string;
    batchHash: string;
    grades: TGrade[];
  };
};

export const loadActiveEvaluationV6Grades = (root: string, experimentGroupId: string) =>
  loadActiveGrades<EvaluationV6Grade>(
    path.join(evaluationV6Paths(root).grades, experimentGroupId),
    'Evaluation v6 active individual grades are required',
  );

export const loadActiveEvaluationV6PairGrades = (root: string, experimentGroupId: string) =>
  loadActiveGrades<EvaluationV6PairGrade>(
    path.join(evaluationV6Paths(root).pairGrades, experimentGroupId),
    'Evaluation v6 active pair grades are required',
  );

export const loadEvaluationV6JudgeLinks = async (root: string, experimentGroupId: string) =>
  JSON.parse(await readFile(
    path.join(packetDirectory(root, experimentGroupId), 'individual-private-links.json'), 'utf8',
  )) as { experimentGroupId: string; links: Array<{ packetId: string; runId: string; arm: string; repetition: number; scenarioId: string }> };

export const loadEvaluationV6PairJudgeLinks = async (root: string, experimentGroupId: string) =>
  JSON.parse(await readFile(
    path.join(packetDirectory(root, experimentGroupId), 'pair-private-links.json'), 'utf8',
  )) as { experimentGroupId: string; links: Array<{ packetId: string; runId: string; arm: string; repetition: number; pairId: string }> };
