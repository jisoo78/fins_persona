import path from 'node:path';

import type {
  EvaluationV6Grade,
  EvaluationV6JudgeAssessment,
  EvaluationV6JudgePacket,
  EvaluationV6PairGrade,
  EvaluationV6PairJudgePacket,
} from '../../shared/amyHoodEvaluationV6';
import { EVALUATION_V6_COMPONENTS, assertEvaluationV6ComponentRating } from '../../shared/amyHoodEvaluationV6';
import { canonicalJson, sha256 } from '../decisionAdvisor/canonicalJson';
import { readJsonFile, writeJsonAtomic } from '../decisionAdvisor/jsonStore';
import { activateEvaluationV6Calibration, validateEvaluationV6Calibration } from './calibration';
import {
  assertEvaluationV6JudgePacketsBlind,
  activateEvaluationV6FormalIndividualGrades,
  buildEvaluationV6JudgePacket,
  exportEvaluationV6JudgePackets,
  exportEvaluationV6PairJudgePackets,
  importEvaluationV6Grades,
  importEvaluationV6PairGrades,
} from './judge';
import { evaluationV6Paths } from './paths';
import { listEvaluationV6Runs } from './runStore';
import { EVALUATION_V6_SCORING_CONFIG, computeEvaluationV6IdentityScore } from './scoring';
import { buildEvaluationV6CandidateHash, loadEvaluationV6CandidateBundle } from './scenarioSet';

export const IDENTITY_RATIONALE_SYSTEM = [
  'You are a blind evaluator of Amy Hood decision-policy fidelity, not general CFO answer quality.',
  'Use only the anonymous scenario, candidate response, and frozen Amy Identity Key.',
  'Judge the candidate response exactly as written; do not rewrite, repair, improve, or answer the scenario yourself.',
  'First identify one Amy-specific priority, boundary, reversal, or conflict that distinguishes the candidate from a generic CFO answer.',
  'Fluency, detail, confidence, and generic financial prudence do not increase fidelity.',
  'Return exactly one Korean sentence and no numeric score.',
].join(' ');

export const IDENTITY_ASSESSMENT_SYSTEM = [
  'Evaluate Amy Hood identity fidelity only.',
  'Judge the candidate response exactly as written. Do not rewrite, repair, or improve the candidate response and do not answer the scenario yourself.',
  'Return exactly this JSON shape and no other keys:',
  '{"identityVerdict":"amy_aligned|amy_partial|generic_cfo|amy_conflict","components":{"action":0,"priorityOrder":0,"boundaries":0,"reversal":0,"identitySpecificity":0},"anchorFindings":{"action":"aligned|partial|missing|conflict","priority":"aligned|partial|missing|conflict","guardrails":"aligned|partial|missing|conflict","reversal":"aligned|partial|missing|conflict"},"distinguishingAnchor":{"kind":"action|priority_order|boundary_condition|reversal_rule|identity_conflict","statement":"one concrete distinguishing statement"}}.',
  'Replace each pipe-separated placeholder with exactly one allowed value.',
  'Each component value is one integer from 0 through 4.',
  'anchorFindings must use exactly action, priority, guardrails, and reversal; do not invent descriptive keys.',
  'distinguishingAnchor must be an object with exactly kind and statement.',
  'Do not return score, uncappedScore, or ceilingApplied; the host calculates them.',
].join(' ');

type LocalBatchOptions = {
  root: string;
  experimentGroupId: string;
  batchKind: 'calibration' | 'individual' | 'pair';
  batchHash: string;
  packets: EvaluationV6JudgePacket[];
  baseUrl: string;
  judgeModel: string;
  checkpointScope?: string;
  fetchImpl?: typeof fetch;
  now?: () => string;
};

type LocalDraft = {
  schemaVersion: 1;
  experimentGroupId: string;
  batchKind: LocalBatchOptions['batchKind'];
  packetBatchHash: string;
  judgeModel: string;
  baseUrl: string;
  rationalePromptHash: string;
  assessmentPromptHash: string;
  scoringConfigHash: string;
  grades: EvaluationV6Grade[];
  failures: Array<{ packetId: string; packetHash: string; error: string; failedAt: string }>;
};

const normalizeBaseUrl = (value: string) => value.replace(/\/+$/, '');

const responseText = async (response: Response) => {
  if (!response.ok) throw new Error(`local judge request failed: HTTP ${response.status}`);
  const payload = await response.json() as { choices?: Array<{ message?: { content?: unknown } }> };
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new Error('local judge returned empty content');
  return content.trim();
};

const invoke = async (options: {
  baseUrl: string;
  fetchImpl: typeof fetch;
  model: string;
  system: string;
  userPayload: unknown;
  maxTokens: number;
}) => responseText(await options.fetchImpl(`${options.baseUrl}/chat/completions`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    model: options.model,
    temperature: 0,
    stream: false,
    max_tokens: options.maxTokens,
    chat_template_kwargs: { enable_thinking: false },
    messages: [
      { role: 'system', content: options.system },
      { role: 'user', content: canonicalJson(options.userPayload) },
    ],
  }),
}));

const assertIdentityRationale = (value: string) => {
  const normalized = value.trim();
  if (!normalized || normalized.length > 500 || /[\r\n]/.test(normalized)
    || /\b\d{1,2}\s*점\b/.test(normalized)) {
    throw new Error('Evaluation v6 Judge rationale must be one non-numeric sentence');
  }
  return normalized;
};

export const parseEvaluationV6JudgeAssessment = (
  text: string,
): Omit<EvaluationV6JudgeAssessment, 'rationale'> => {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const value = JSON.parse(cleaned) as Record<string, unknown>;
  const allowedKeys = ['identityVerdict', 'components', 'anchorFindings', 'distinguishingAnchor'];
  if (Object.keys(value).length !== allowedKeys.length || Object.keys(value).some((key) => !allowedKeys.includes(key))) {
    throw new Error('Evaluation v6 Judge assessment has unknown or missing fields');
  }
  const components = value.components as Record<string, unknown>;
  if (!components || Object.keys(components).length !== EVALUATION_V6_COMPONENTS.length
    || Object.keys(components).some((key) => !EVALUATION_V6_COMPONENTS.includes(key as typeof EVALUATION_V6_COMPONENTS[number]))) {
    throw new Error('Evaluation v6 Judge components are invalid');
  }
  for (const component of EVALUATION_V6_COMPONENTS) assertEvaluationV6ComponentRating(components[component]);
  if (!new Set(['amy_aligned', 'amy_partial', 'generic_cfo', 'amy_conflict']).has(String(value.identityVerdict))) {
    throw new Error('Evaluation v6 Judge identity verdict is invalid');
  }
  const anchors = value.anchorFindings as Record<string, unknown>;
  const anchorNames = ['action', 'priority', 'guardrails', 'reversal'];
  const findings = new Set(['aligned', 'partial', 'missing', 'conflict']);
  if (!anchors || Object.keys(anchors).length !== 4
    || Object.keys(anchors).some((key) => !anchorNames.includes(key))
    || anchorNames.some((name) => !findings.has(String(anchors[name])))) {
    throw new Error('Evaluation v6 Judge anchor findings are invalid');
  }
  const distinguishing = value.distinguishingAnchor as Record<string, unknown>;
  const kinds = new Set(['action', 'priority_order', 'boundary_condition', 'reversal_rule', 'identity_conflict']);
  if (!distinguishing || Object.keys(distinguishing).length !== 2
    || !kinds.has(String(distinguishing.kind))
    || typeof distinguishing.statement !== 'string' || !distinguishing.statement.trim()) {
    throw new Error('Evaluation v6 Judge distinguishing anchor is invalid');
  }
  return value as Omit<EvaluationV6JudgeAssessment, 'rationale'>;
};

const assessPacket = async (options: {
  packet: EvaluationV6JudgePacket;
  baseUrl: string;
  fetchImpl: typeof fetch;
  model: string;
  now: () => string;
  rationalePromptHash: string;
  assessmentPromptHash: string;
}): Promise<EvaluationV6Grade> => {
  const rationale = assertIdentityRationale(await invoke({
    ...options, system: IDENTITY_RATIONALE_SYSTEM, userPayload: options.packet, maxTokens: 300,
  }));
  const payload = { packet: options.packet, rationale };
  const firstText = await invoke({
    ...options, system: IDENTITY_ASSESSMENT_SYSTEM, userPayload: payload, maxTokens: 420,
  });
  let assessment: Omit<EvaluationV6JudgeAssessment, 'rationale'>;
  let repairApplied = false;
  try {
    assessment = parseEvaluationV6JudgeAssessment(firstText);
  } catch (firstError) {
    const repairedText = await invoke({
      ...options,
      system: `${IDENTITY_ASSESSMENT_SYSTEM} The previous response failed validation. Return corrected JSON only.`,
      userPayload: { ...payload, invalidResponse: firstText },
      maxTokens: 420,
    });
    try {
      assessment = parseEvaluationV6JudgeAssessment(repairedText);
      repairApplied = true;
    } catch {
      throw firstError;
    }
  }
  const completeAssessment: EvaluationV6JudgeAssessment = { rationale, ...assessment };
  const score = computeEvaluationV6IdentityScore(completeAssessment);
  return {
    packetId: options.packet.packetId,
    packetHash: options.packet.packetHash,
    ...completeAssessment,
    ...score,
    judgeProvider: 'local',
    judgeModel: options.model,
    rationalePromptHash: options.rationalePromptHash,
    assessmentPromptHash: options.assessmentPromptHash,
    repairApplied,
    gradedAt: options.now(),
  };
};

const draftPath = (options: Pick<LocalBatchOptions, 'root' | 'experimentGroupId' | 'batchKind' | 'checkpointScope'>) => {
  if (!/^[a-zA-Z0-9-]+$/.test(options.experimentGroupId)) throw new Error('invalid Evaluation v6 group ID');
  if (options.checkpointScope && !/^[a-zA-Z0-9-]+$/.test(options.checkpointScope)) {
    throw new Error('invalid Evaluation v6 Judge checkpoint scope');
  }
  const name = options.checkpointScope
    ? `${options.batchKind}-${options.checkpointScope}`
    : options.batchKind;
  return path.join(evaluationV6Paths(options.root).localJudgeDrafts, options.experimentGroupId, `${name}.json`);
};

export const runEvaluationV6LocalPacketBatch = async (options: LocalBatchOptions) => {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => new Date().toISOString());
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  if (!/^https?:\/\//.test(baseUrl) || !options.judgeModel.trim() || !/^[a-f0-9]{64}$/.test(options.batchHash)) {
    throw new Error('Evaluation v6 local Judge configuration is invalid');
  }
  assertEvaluationV6JudgePacketsBlind(options.packets);
  const identity: Omit<LocalDraft, 'grades' | 'failures'> = {
    schemaVersion: 1,
    experimentGroupId: options.experimentGroupId,
    batchKind: options.batchKind,
    packetBatchHash: options.batchHash,
    judgeModel: options.judgeModel,
    baseUrl,
    rationalePromptHash: sha256(IDENTITY_RATIONALE_SYSTEM),
    assessmentPromptHash: sha256(IDENTITY_ASSESSMENT_SYSTEM),
    scoringConfigHash: sha256(canonicalJson(EVALUATION_V6_SCORING_CONFIG)),
  };
  const location = draftPath(options);
  const existing = await readJsonFile<LocalDraft | null>(location, null);
  if (existing) {
    for (const key of Object.keys(identity) as Array<keyof typeof identity>) {
      if (existing[key] !== identity[key]) throw new Error(`Evaluation v6 local Judge draft is stale: ${key}`);
    }
  }
  const grades = existing?.grades ?? [];
  let failures = existing?.failures ?? [];
  const packetById = new Map(options.packets.map((packet) => [packet.packetId, packet]));
  if (packetById.size !== options.packets.length) throw new Error('Evaluation v6 local Judge packets contain duplicates');
  for (const grade of grades) {
    if (packetById.get(grade.packetId)?.packetHash !== grade.packetHash) {
      throw new Error(`Evaluation v6 local Judge draft contains stale packet: ${grade.packetId}`);
    }
  }
  const completed = new Set(grades.map(({ packetId }) => packetId));
  const resumedCount = completed.size;
  for (const packet of options.packets) {
    if (completed.has(packet.packetId)) continue;
    try {
      grades.push(await assessPacket({
        packet,
        baseUrl,
        fetchImpl,
        model: options.judgeModel,
        now,
        rationalePromptHash: identity.rationalePromptHash,
        assessmentPromptHash: identity.assessmentPromptHash,
      }));
      failures = failures.filter(({ packetId }) => packetId !== packet.packetId);
    } catch (error) {
      failures = [
        ...failures.filter(({ packetId }) => packetId !== packet.packetId),
        {
          packetId: packet.packetId,
          packetHash: packet.packetHash,
          error: error instanceof Error ? error.message : 'unknown Evaluation v6 Judge error',
          failedAt: now(),
        },
      ];
      await writeJsonAtomic(location, { ...identity, grades, failures } satisfies LocalDraft);
      throw error;
    }
    grades.sort((left, right) => left.packetId.localeCompare(right.packetId));
    await writeJsonAtomic(location, { ...identity, grades, failures } satisfies LocalDraft);
  }
  return { grades, packetCount: options.packets.length, resumedCount, gradedCount: grades.length - resumedCount };
};

const discoverModel = async (baseUrl: string, fetchImpl: typeof fetch) => {
  const response = await fetchImpl(`${normalizeBaseUrl(baseUrl)}/models`);
  if (!response.ok) throw new Error(`local judge model discovery failed: HTTP ${response.status}`);
  const payload = await response.json() as { data?: Array<{ id?: unknown }> };
  const ids = [...new Set((payload.data ?? []).map(({ id }) => typeof id === 'string' ? id.trim() : '').filter(Boolean))];
  if (ids.length !== 1) throw new Error('local judge requires exactly one discoverable model');
  return ids[0];
};

export const runEvaluationV6LocalJudge = async (options: {
  root: string;
  experimentGroupId: string;
  repetition: 1 | 2 | 3 | 4 | 5;
  baseUrl: string;
  fetchImpl?: typeof fetch;
}) => {
  const fetchImpl = options.fetchImpl ?? fetch;
  const [exported, judgeModel] = await Promise.all([
    exportEvaluationV6JudgePackets(options.root, options.experimentGroupId, { repetition: options.repetition }),
    discoverModel(options.baseUrl, fetchImpl),
  ]);
  if (exported.packets.length !== 90) throw new Error('Evaluation v6 local Judge repetition requires exactly 90 packets');
  const result = await runEvaluationV6LocalPacketBatch({
    ...options,
    batchKind: 'individual',
    batchHash: exported.batchHash,
    packets: exported.packets,
    checkpointScope: `repetition-${options.repetition}`,
    judgeModel,
    fetchImpl,
  });
  const runCount = (await listEvaluationV6Runs(options.root))
    .filter(({ experimentGroupId }) => experimentGroupId === options.experimentGroupId).length;
  if (![3, 15].includes(runCount)) throw new Error('Evaluation v6 local Judge group must contain three or fifteen runs');
  const imported = runCount === 3
    ? await importEvaluationV6Grades(options.root, options.experimentGroupId, result.grades)
    : null;
  return {
    ...result,
    judgeModel,
    meanAas: result.grades.reduce((sum, grade) => sum + grade.score, 0) / result.grades.length,
    batchHash: imported?.batchHash ?? null,
    formalActivationPending: runCount === 15,
  };
};

export const activateEvaluationV6FormalLocalGrades = async (root: string, experimentGroupId: string) => {
  await exportEvaluationV6JudgePackets(root, experimentGroupId);
  const repetitionGrades = await Promise.all(([1, 2, 3, 4, 5] as const).map(async (repetition) => {
    const draft = await readJsonFile<LocalDraft | null>(draftPath({
      root,
      experimentGroupId,
      batchKind: 'individual',
      checkpointScope: `repetition-${repetition}`,
    }), null);
    if (!draft || draft.grades.length !== 90 || draft.failures.length) {
      throw new Error(`Evaluation v6 repetition ${repetition} local Judge draft is incomplete`);
    }
    return { repetition, grades: draft.grades };
  }));
  return activateEvaluationV6FormalIndividualGrades(root, experimentGroupId, repetitionGrades);
};

export const runEvaluationV6LocalCalibration = async (options: {
  root: string;
  baseUrl: string;
  fetchImpl?: typeof fetch;
  manualReviews?: Parameters<typeof activateEvaluationV6Calibration>[3];
}) => {
  const fetchImpl = options.fetchImpl ?? fetch;
  const bundle = await loadEvaluationV6CandidateBundle(options.root);
  const judgeModel = await discoverModel(options.baseUrl, fetchImpl);
  const scenarioById = new Map(bundle.scenarios.map((scenario) => [scenario.id, scenario]));
  const keyById = new Map(bundle.identityKeys.map((key) => [key.scenarioId, key]));
  const packets = bundle.calibrationAnswers.map((answer) => buildEvaluationV6JudgePacket(
    scenarioById.get(answer.scenarioId)!, answer.candidateResponse, keyById.get(answer.scenarioId)!, answer.calibrationId,
  )).sort((left, right) => left.packetId.localeCompare(right.packetId));
  const candidateBundleHash = buildEvaluationV6CandidateHash(bundle);
  const packetBatchHash = sha256(canonicalJson(packets));
  const result = await runEvaluationV6LocalPacketBatch({
    root: options.root,
    experimentGroupId: `calibration-${candidateBundleHash.slice(0, 16)}`,
    batchKind: 'calibration',
    batchHash: packetBatchHash,
    packets,
    baseUrl: options.baseUrl,
    judgeModel,
    fetchImpl,
  });
  const validated = validateEvaluationV6Calibration(bundle.calibrationAnswers, result.grades);
  const batchHash = sha256(canonicalJson({ candidateBundleHash, packetBatchHash, grades: result.grades }));
  await writeJsonAtomic(path.join(evaluationV6Paths(options.root).calibration, batchHash, 'grades.json'), {
    batchHash, candidateBundleHash, packetBatchHash, grades: result.grades, metrics: validated.metrics,
  });
  const replacementIds = bundle.replacements.map(({ replacementScenarioId }) => replacementScenarioId);
  const manualReviews = options.manualReviews ?? await readJsonFile(
    evaluationV6Paths(options.root).calibrationManualReview, [],
  );
  await activateEvaluationV6Calibration(options.root, {
    batchHash, candidateBundleHash, metrics: validated.metrics,
  }, replacementIds, manualReviews);
  return { ...result, judgeModel, batchHash, candidateBundleHash, metrics: validated.metrics };
};

export const IDENTITY_PAIR_ASSESSMENT_SYSTEM = [
  'Evaluate Amy Hood identity fidelity only.',
  'Judge the initial and changed candidate responses exactly as written. Do not rewrite, repair, or improve either response and do not answer the scenarios yourself.',
  'Compare the initial and changed answers against both Amy Identity Keys and the frozen pair transition key.',
  'Return exactly this JSON shape and no other keys:',
  '{"identityVerdict":"amy_aligned|amy_partial|generic_cfo|amy_conflict","components":{"action":0,"priorityOrder":0,"boundaries":0,"reversal":0,"identitySpecificity":0},"anchorFindings":{"action":"aligned|partial|missing|conflict","priority":"aligned|partial|missing|conflict","guardrails":"aligned|partial|missing|conflict","reversal":"aligned|partial|missing|conflict"},"distinguishingAnchor":{"kind":"action|priority_order|boundary_condition|reversal_rule|identity_conflict","statement":"one concrete distinguishing statement"},"aligned":true,"expectedResponseFinding":"aligned|partial|conflict","changedSignalFinding":"aligned|partial|conflict","invariantFinding":"aligned|partial|conflict"}.',
  'Replace each pipe-separated placeholder with exactly one allowed value.',
  'Each component value is one integer from 0 through 4.',
  'aligned must be a JSON boolean, true or false.',
  'anchorFindings must use exactly action, priority, guardrails, and reversal; do not invent descriptive keys.',
  'distinguishingAnchor must be an object with exactly kind and statement.',
  'Do not return score, uncappedScore, or ceilingApplied; the host calculates them.',
  'A fluent transition that crosses an unsupported Amy reversal boundary is amy_conflict.',
].join(' ');

const parsePairAssessment = (text: string) => {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const value = JSON.parse(cleaned) as Record<string, unknown>;
  const base = Object.fromEntries(['identityVerdict', 'components', 'anchorFindings', 'distinguishingAnchor']
    .map((key) => [key, value[key]]));
  const assessment = parseEvaluationV6JudgeAssessment(JSON.stringify(base));
  const findings = new Set(['aligned', 'partial', 'conflict']);
  if (typeof value.aligned !== 'boolean'
    || !findings.has(String(value.expectedResponseFinding))
    || !findings.has(String(value.changedSignalFinding))
    || !findings.has(String(value.invariantFinding))) {
    throw new Error('Evaluation v6 pair Judge assessment is invalid');
  }
  return {
    assessment,
    aligned: value.aligned,
    expectedResponseFinding: String(value.expectedResponseFinding) as 'aligned' | 'partial' | 'conflict',
    changedSignalFinding: String(value.changedSignalFinding) as 'aligned' | 'partial' | 'conflict',
    invariantFinding: String(value.invariantFinding) as 'aligned' | 'partial' | 'conflict',
  } as const;
};

export const runEvaluationV6LocalPairJudge = async (options: {
  root: string;
  experimentGroupId: string;
  baseUrl: string;
  fetchImpl?: typeof fetch;
  now?: () => string;
}) => {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => new Date().toISOString());
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const [exported, judgeModel] = await Promise.all([
    exportEvaluationV6PairJudgePackets(options.root, options.experimentGroupId),
    discoverModel(baseUrl, fetchImpl),
  ]);
  if (exported.packets.length !== 225) throw new Error('Evaluation v6 pair Judge requires exactly 225 packets');
  const location = path.join(evaluationV6Paths(options.root).localJudgeDrafts, options.experimentGroupId, 'pair.json');
  const identity = {
    schemaVersion: 1 as const,
    experimentGroupId: options.experimentGroupId,
    packetBatchHash: exported.batchHash,
    judgeModel,
    baseUrl,
    rationalePromptHash: sha256(IDENTITY_RATIONALE_SYSTEM),
    assessmentPromptHash: sha256(IDENTITY_PAIR_ASSESSMENT_SYSTEM),
    scoringConfigHash: sha256(canonicalJson(EVALUATION_V6_SCORING_CONFIG)),
  };
  const existing = await readJsonFile<({ grades: EvaluationV6PairGrade[] } & typeof identity) | null>(location, null);
  if (existing && Object.keys(identity).some((key) => existing[key as keyof typeof identity] !== identity[key as keyof typeof identity])) {
    throw new Error('Evaluation v6 pair Judge draft is stale');
  }
  const grades = existing?.grades ?? [];
  const completed = new Set(grades.map(({ packetId }) => packetId));
  const resumedCount = completed.size;
  for (const packet of exported.packets) {
    if (completed.has(packet.packetId)) continue;
    const rationale = assertIdentityRationale(await invoke({
      baseUrl, fetchImpl, model: judgeModel, system: IDENTITY_RATIONALE_SYSTEM, userPayload: packet, maxTokens: 300,
    }));
    const payload = { packet, rationale };
    let text = await invoke({ baseUrl, fetchImpl, model: judgeModel, system: IDENTITY_PAIR_ASSESSMENT_SYSTEM, userPayload: payload, maxTokens: 520 });
    let parsed: ReturnType<typeof parsePairAssessment>;
    let repairApplied = false;
    try {
      parsed = parsePairAssessment(text);
    } catch (firstError) {
      text = await invoke({
        baseUrl, fetchImpl, model: judgeModel,
        system: `${IDENTITY_PAIR_ASSESSMENT_SYSTEM} The previous response failed validation. Return corrected JSON only.`,
        userPayload: { ...payload, invalidResponse: text }, maxTokens: 520,
      });
      try { parsed = parsePairAssessment(text); repairApplied = true; } catch { throw firstError; }
    }
    const complete: EvaluationV6JudgeAssessment = { rationale, ...parsed.assessment };
    grades.push({
      packetId: packet.packetId, packetHash: packet.packetHash, ...complete,
      ...computeEvaluationV6IdentityScore(complete),
      aligned: parsed.aligned,
      expectedResponseFinding: parsed.expectedResponseFinding,
      changedSignalFinding: parsed.changedSignalFinding,
      invariantFinding: parsed.invariantFinding,
      judgeProvider: 'local', judgeModel,
      rationalePromptHash: identity.rationalePromptHash,
      assessmentPromptHash: identity.assessmentPromptHash,
      repairApplied, gradedAt: now(),
    });
    grades.sort((left, right) => left.packetId.localeCompare(right.packetId));
    await writeJsonAtomic(location, { ...identity, grades });
  }
  const imported = await importEvaluationV6PairGrades(options.root, options.experimentGroupId, grades);
  return { judgeModel, packetCount: exported.packets.length, resumedCount, gradedCount: grades.length - resumedCount, batchHash: imported.batchHash };
};
