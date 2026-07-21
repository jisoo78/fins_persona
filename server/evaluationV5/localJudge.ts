import path from 'node:path';

import type {
  EvaluationV5AnchorFinding,
  EvaluationV5Grade,
  EvaluationV5JudgePacket,
} from '../../shared/amyHoodEvaluationV5';
import { canonicalJson, sha256 } from '../decisionAdvisor/canonicalJson';
import { readJsonFile, writeJsonAtomic } from '../decisionAdvisor/jsonStore';
import {
  assertEvaluationV5JudgePacketsBlind,
  exportEvaluationV5JudgePackets,
  importEvaluationV5Grades,
} from './judge';
import { evaluationV5Paths } from './paths';

type Repetition = 1 | 2 | 3 | 4 | 5;

type LocalJudgeDraft = {
  schemaVersion: 1;
  experimentGroupId: string;
  repetition: Repetition;
  packetBatchHash: string;
  judgeModel: string;
  baseUrl: string;
  rationalePromptHash: string;
  scorePromptHash: string;
  grades: EvaluationV5Grade[];
};

type LocalJudgeOptions = {
  root: string;
  experimentGroupId: string;
  repetition: Repetition;
  baseUrl: string;
  fetchImpl?: typeof fetch;
  now?: () => string;
};

export type LocalJudgeResult = {
  experimentGroupId: string;
  repetition: Repetition;
  judgeModel: string;
  packetCount: number;
  resumedCount: number;
  gradedCount: number;
  meanAas: number;
  batchHash: string;
};

const RATIONALE_SYSTEM = [
  'You are an independent blind CFO decision-alignment evaluator.',
  'Evaluate only the supplied frozen packet. Do not infer the generating system.',
  'Return exactly one Korean sentence explaining alignment or conflict and no numeric score.',
].join(' ');

const SCORE_SYSTEM = [
  'Score only from the frozen packet and prior rationale.',
  'Return JSON only with keys score and anchorFindings.',
  'score must be an integer from 1 to 10.',
  'anchorFindings must contain action, priority, guardrails, reversal, each set to aligned, partial, missing, or conflict.',
].join(' ');

const normalizeBaseUrl = (value: string) => value.replace(/\/+$/, '');

const assertGroupId = (value: string) => {
  if (!/^[a-zA-Z0-9-]+$/.test(value)) throw new Error('invalid Evaluation v5 group ID');
};

export const localJudgeDraftPath = (
  root: string,
  experimentGroupId: string,
  repetition: Repetition,
) => {
  assertGroupId(experimentGroupId);
  return path.join(
    evaluationV5Paths(root).localJudgeDrafts,
    experimentGroupId,
    `repetition-${repetition}.json`,
  );
};

export const parseLocalJudgeScore = (
  text: string,
): Pick<EvaluationV5Grade, 'score' | 'anchorFindings'> => {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const value = JSON.parse(cleaned) as Record<string, unknown>;
  const anchors = ['action', 'priority', 'guardrails', 'reversal'] as const;
  const allowed = new Set<EvaluationV5AnchorFinding>(['aligned', 'partial', 'missing', 'conflict']);
  const findings = value.anchorFindings;
  if (!Number.isInteger(value.score) || Number(value.score) < 1 || Number(value.score) > 10
    || !findings || typeof findings !== 'object'
    || Object.keys(findings).length !== anchors.length
    || anchors.some((anchor) => !allowed.has(
      String((findings as Record<string, unknown>)[anchor]) as EvaluationV5AnchorFinding,
    ))) {
    throw new Error('local judge score response is invalid');
  }
  return {
    score: Number(value.score) as EvaluationV5Grade['score'],
    anchorFindings: findings as EvaluationV5Grade['anchorFindings'],
  };
};

const responseText = async (response: Response) => {
  if (!response.ok) throw new Error(`local judge request failed: HTTP ${response.status}`);
  const payload = await response.json() as {
    choices?: Array<{ message?: { content?: unknown } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('local judge returned empty content');
  }
  return content.trim();
};

const discoverModel = async (baseUrl: string, fetchImpl: typeof fetch) => {
  const response = await fetchImpl(`${baseUrl}/models`);
  if (!response.ok) throw new Error(`local judge model discovery failed: HTTP ${response.status}`);
  const payload = await response.json() as {
    data?: Array<{ id?: unknown }>;
    models?: Array<{ id?: unknown; model?: unknown; name?: unknown }>;
  };
  const candidates = payload.data ?? payload.models ?? [];
  const ids = [...new Set(candidates.map((item) => {
    const value = 'id' in item && typeof item.id === 'string'
      ? item.id
      : 'model' in item && typeof item.model === 'string'
        ? item.model
        : 'name' in item && typeof item.name === 'string'
          ? item.name
          : '';
    return value.trim();
  }).filter(Boolean))];
  if (ids.length !== 1) throw new Error('local judge requires exactly one discoverable model');
  return ids[0];
};

const invoke = async (options: {
  baseUrl: string;
  fetchImpl: typeof fetch;
  model: string;
  system: string;
  user: string;
  maxTokens: number;
}) => responseText(await options.fetchImpl(`${options.baseUrl}/chat/completions`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    model: options.model,
    temperature: 0,
    stream: false,
    max_tokens: options.maxTokens,
    messages: [
      { role: 'system', content: options.system },
      { role: 'user', content: options.user },
    ],
  }),
}));

const assertRationale = (value: string) => {
  if (!value || value.length > 500 || /[\r\n]/.test(value)) {
    throw new Error('local judge rationale must be single-line and 1-500 characters');
  }
  return value;
};

const assertDraftIdentity = (
  draft: LocalJudgeDraft,
  expected: Omit<LocalJudgeDraft, 'grades'>,
) => {
  for (const key of [
    'schemaVersion',
    'experimentGroupId',
    'repetition',
    'packetBatchHash',
    'judgeModel',
    'baseUrl',
    'rationalePromptHash',
    'scorePromptHash',
  ] as const) {
    if (draft[key] !== expected[key]) throw new Error(`local judge draft is stale: ${key}`);
  }
};

const gradePacket = async (options: {
  packet: EvaluationV5JudgePacket;
  baseUrl: string;
  fetchImpl: typeof fetch;
  model: string;
  rationalePromptHash: string;
  scorePromptHash: string;
  now: () => string;
}): Promise<EvaluationV5Grade> => {
  const packetJson = canonicalJson(options.packet);
  const rationale = assertRationale(await invoke({
    ...options,
    system: RATIONALE_SYSTEM,
    user: packetJson,
    maxTokens: 300,
  }));
  const scoreUser = canonicalJson({ packet: options.packet, rationale });
  let scoreText = await invoke({
    ...options,
    system: SCORE_SYSTEM,
    user: scoreUser,
    maxTokens: 220,
  });
  let score: Pick<EvaluationV5Grade, 'score' | 'anchorFindings'>;
  try {
    score = parseLocalJudgeScore(scoreText);
  } catch (firstError) {
    scoreText = await invoke({
      ...options,
      system: `${SCORE_SYSTEM} Your previous response failed validation. Return corrected JSON only.`,
      user: canonicalJson({ packet: options.packet, rationale, invalidResponse: scoreText }),
      maxTokens: 220,
    });
    try {
      score = parseLocalJudgeScore(scoreText);
    } catch {
      throw firstError;
    }
  }
  return {
    packetId: options.packet.packetId,
    packetHash: options.packet.packetHash,
    rationale,
    ...score,
    judgeProvider: 'local',
    judgeModel: options.model,
    rationalePromptHash: options.rationalePromptHash,
    scorePromptHash: options.scorePromptHash,
    gradedAt: options.now(),
  };
};

export const runEvaluationV5LocalJudge = async (
  options: LocalJudgeOptions,
): Promise<LocalJudgeResult> => {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => new Date().toISOString());
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  if (!/^https?:\/\//.test(baseUrl)) throw new Error('local judge base URL must use HTTP or HTTPS');
  const [exported, judgeModel] = await Promise.all([
    exportEvaluationV5JudgePackets(options.root, options.experimentGroupId, {
      repetition: options.repetition,
    }),
    discoverModel(baseUrl, fetchImpl),
  ]);
  assertEvaluationV5JudgePacketsBlind(exported.packets);
  if (exported.packets.length !== 90) throw new Error('local judge repetition requires exactly 90 packets');
  const identity: Omit<LocalJudgeDraft, 'grades'> = {
    schemaVersion: 1,
    experimentGroupId: options.experimentGroupId,
    repetition: options.repetition,
    packetBatchHash: exported.batchHash,
    judgeModel,
    baseUrl,
    rationalePromptHash: sha256(RATIONALE_SYSTEM),
    scorePromptHash: sha256(SCORE_SYSTEM),
  };
  const draftPath = localJudgeDraftPath(options.root, options.experimentGroupId, options.repetition);
  const existing = await readJsonFile<LocalJudgeDraft | null>(draftPath, null);
  if (existing) assertDraftIdentity(existing, identity);
  const grades = existing?.grades ?? [];
  const packetById = new Map(exported.packets.map((packet) => [packet.packetId, packet]));
  for (const grade of grades) {
    const packet = packetById.get(grade.packetId);
    if (!packet || packet.packetHash !== grade.packetHash) {
      throw new Error(`local judge draft contains stale packet: ${grade.packetId}`);
    }
  }
  const completed = new Set(grades.map(({ packetId }) => packetId));
  const resumedCount = completed.size;
  for (const packet of exported.packets) {
    if (completed.has(packet.packetId)) continue;
    grades.push(await gradePacket({
      packet,
      baseUrl,
      fetchImpl,
      model: judgeModel,
      rationalePromptHash: identity.rationalePromptHash,
      scorePromptHash: identity.scorePromptHash,
      now,
    }));
    grades.sort((left, right) => left.packetId.localeCompare(right.packetId));
    await writeJsonAtomic(draftPath, { ...identity, grades } satisfies LocalJudgeDraft);
  }
  const imported = await importEvaluationV5Grades(
    options.root,
    options.experimentGroupId,
    grades,
  );
  return {
    experimentGroupId: options.experimentGroupId,
    repetition: options.repetition,
    judgeModel,
    packetCount: exported.packets.length,
    resumedCount,
    gradedCount: grades.length - resumedCount,
    meanAas: grades.reduce((sum, grade) => sum + grade.score, 0) / grades.length,
    batchHash: imported.batchHash,
  };
};
