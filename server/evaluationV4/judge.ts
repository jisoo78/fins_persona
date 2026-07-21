import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  EvaluationV4Grade,
  EvaluationV4JudgePacket,
} from '../../shared/amyHoodEvaluationV4';
import { canonicalJson, sha256 } from '../decisionAdvisor/canonicalJson';
import { writeJsonAtomic } from '../decisionAdvisor/jsonStore';
import { evaluationV4Paths } from './paths';
import { listEvaluationV4Runs } from './runStore';
import { loadEvaluationV4Bundle } from './scenarioSet';

export type EvaluationV4JudgePrivateLink = {
  packetId: string;
  experimentGroupId: string;
  runId: string;
  arm: string;
  repetition: number;
  scenarioId: string;
};

type Exported = {
  experimentGroupId: string;
  batchHash: string;
  packets: EvaluationV4JudgePacket[];
};

const packetDirectory = (root: string, groupId: string) => {
  if (!/^[a-zA-Z0-9-]+$/.test(groupId)) throw new Error('invalid Evaluation v4 group ID');
  return path.join(evaluationV4Paths(root).judgePackets, groupId);
};

const forbiddenKeys = new Set([
  'arm', 'model', 'runId', 'retrieval', 'externalEventId',
  'actualHistoricalAction', 'outcomeEvidenceIds',
]);

export const assertEvaluationV4JudgePacketsBlind = (value: unknown) => {
  const visit = (item: unknown): void => {
    if (Array.isArray(item)) return item.forEach(visit);
    if (!item || typeof item !== 'object') return;
    for (const [key, child] of Object.entries(item as Record<string, unknown>)) {
      if (forbiddenKeys.has(key)) throw new Error(`Evaluation v4 blind packet leakage: ${key}`);
      visit(child);
    }
  };
  visit(value);
};

export const exportEvaluationV4JudgePackets = async (
  root: string,
  experimentGroupId: string,
): Promise<Exported> => {
  const [bundle, allRuns] = await Promise.all([
    loadEvaluationV4Bundle(root, 'calibration'), listEvaluationV4Runs(root),
  ]);
  const runs = allRuns.filter((run) => run.experimentGroupId === experimentGroupId);
  if (runs.length !== 4 || runs.some(({ status, answers }) => status !== 'complete' || answers.length !== 10)) {
    throw new Error('Evaluation v4 judge export requires four complete runs');
  }
  const scenarioById = new Map(bundle.scenarios.map((scenario) => [scenario.id, scenario]));
  const keyById = new Map(bundle.alignmentKeys.map((key) => [key.scenarioId, key]));
  const packets: EvaluationV4JudgePacket[] = [];
  const links: EvaluationV4JudgePrivateLink[] = [];
  for (const run of runs.sort((left, right) => left.runId.localeCompare(right.runId))) {
    for (const answer of run.answers) {
      const scenario = scenarioById.get(answer.scenarioId);
      const alignmentKey = keyById.get(answer.scenarioId);
      if (!scenario || !alignmentKey || answer.status !== 'complete' || !answer.response) {
        throw new Error(`Evaluation v4 answer is not judgeable: ${answer.scenarioId}`);
      }
      const packetId = `packet-${sha256(canonicalJson({
        experimentGroupId, runId: run.runId, scenarioId: answer.scenarioId,
      })).slice(0, 20)}`;
      const base = {
        packetId, scenario, candidateResponse: answer.response, alignmentKey,
        anchorChecklist: ['action', 'priority', 'guardrails', 'reversal'] as EvaluationV4JudgePacket['anchorChecklist'],
      };
      packets.push({ ...base, packetHash: sha256(canonicalJson(base)) });
      links.push({
        packetId, experimentGroupId, runId: run.runId, arm: run.arm,
        repetition: run.repetition, scenarioId: answer.scenarioId,
      });
    }
  }
  packets.sort((left, right) => left.packetId.localeCompare(right.packetId));
  links.sort((left, right) => left.packetId.localeCompare(right.packetId));
  assertEvaluationV4JudgePacketsBlind(packets);
  const output = { experimentGroupId, batchHash: sha256(canonicalJson(packets)), packets };
  const directory = packetDirectory(root, experimentGroupId);
  await Promise.all([
    writeJsonAtomic(path.join(directory, 'packets.json'), output),
    writeJsonAtomic(path.join(directory, 'private-links.json'), { experimentGroupId, links }),
  ]);
  return output;
};

const validateGrade = (grade: EvaluationV4Grade, packet: EvaluationV4JudgePacket) => {
  const anchors = ['action', 'priority', 'guardrails', 'reversal'];
  const allowedFindings = ['aligned', 'partial', 'missing', 'conflict'];
  if (grade.packetHash !== packet.packetHash) throw new Error(`Evaluation v4 packet hash mismatch: ${grade.packetId}`);
  if (!Number.isInteger(grade.score) || grade.score < 1 || grade.score > 10) throw new Error('Evaluation v4 grade score must be 1-10');
  if (grade.rationale.length < 1 || grade.rationale.length > 500 || /[\r\n]/.test(grade.rationale)) {
    throw new Error('Evaluation v4 rationale must be single-line and 1-500 characters');
  }
  if (Object.keys(grade.anchorFindings).length !== 4
    || anchors.some((key) => !allowedFindings.includes(grade.anchorFindings[key as keyof typeof grade.anchorFindings]))) {
    throw new Error('Evaluation v4 grade requires four anchor findings');
  }
  if (!['codex', 'openai'].includes(grade.judgeProvider) || !grade.judgeModel.trim()
    || !/^[a-f0-9]{64}$/.test(grade.rationalePromptHash)
    || !/^[a-f0-9]{64}$/.test(grade.scorePromptHash)
    || Number.isNaN(new Date(grade.gradedAt).valueOf())
    || new Date(grade.gradedAt).toISOString() !== grade.gradedAt) {
    throw new Error('Evaluation v4 grade provenance is invalid');
  }
};

export const importEvaluationV4Grades = async (
  root: string,
  experimentGroupId: string,
  input: EvaluationV4Grade[] | { grades: EvaluationV4Grade[] },
) => {
  const grades = Array.isArray(input) ? input : input.grades;
  if (!Array.isArray(grades) || grades.length !== 40) {
    throw new Error('Evaluation v4 grade import requires exactly forty grades');
  }
  const exported = JSON.parse(await readFile(
    path.join(packetDirectory(root, experimentGroupId), 'packets.json'), 'utf8',
  )) as Exported;
  const packetById = new Map(exported.packets.map((packet) => [packet.packetId, packet]));
  if (new Set(grades.map(({ packetId }) => packetId)).size !== 40) {
    throw new Error('Evaluation v4 grades must have unique packet IDs');
  }
  for (const grade of grades) {
    const packet = packetById.get(grade.packetId);
    if (!packet) throw new Error(`Evaluation v4 grade references unknown packet: ${grade.packetId}`);
    validateGrade(grade, packet);
  }
  const ordered = [...grades].sort((left, right) => left.packetId.localeCompare(right.packetId));
  const batchHash = sha256(canonicalJson({ experimentGroupId, packetBatchHash: exported.batchHash, grades: ordered }));
  const directory = path.join(evaluationV4Paths(root).grades, experimentGroupId);
  const payload = { experimentGroupId, packetBatchHash: exported.batchHash, batchHash, grades: ordered };
  await writeJsonAtomic(path.join(directory, batchHash, 'grades.json'), payload);
  await writeJsonAtomic(path.join(directory, 'active.json'), { experimentGroupId, batchHash });
  return payload;
};

export const loadActiveEvaluationV4Grades = async (root: string, experimentGroupId: string) => {
  const directory = path.join(evaluationV4Paths(root).grades, experimentGroupId);
  let active: { batchHash: string };
  try {
    active = JSON.parse(await readFile(path.join(directory, 'active.json'), 'utf8')) as { batchHash: string };
  } catch {
    throw new Error('Evaluation v4 active grades are required');
  }
  return JSON.parse(await readFile(path.join(directory, active.batchHash, 'grades.json'), 'utf8')) as {
    experimentGroupId: string; packetBatchHash: string; batchHash: string; grades: EvaluationV4Grade[];
  };
};

export const loadEvaluationV4JudgeLinks = async (root: string, experimentGroupId: string) =>
  JSON.parse(await readFile(
    path.join(packetDirectory(root, experimentGroupId), 'private-links.json'), 'utf8',
  )) as { experimentGroupId: string; links: EvaluationV4JudgePrivateLink[] };
