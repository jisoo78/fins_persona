import type { DecisionDomain } from './amyHoodDecisionAdvisor';
import type { AmyHoodRetrievalTrace } from './amyHoodRag';

export const EVALUATION_V5_DOMAINS: DecisionDomain[] = [
  'm_and_a',
  'ai_cloud_capex',
  'pricing_monetization',
  'cost_efficiency',
  'shareholder_return_risk',
];

export const EVALUATION_V5_ARMS = [
  'amy_prompt',
  'amy_policy_rag',
  'amy_full_rag',
] as const;

export const EVALUATION_V5_PHASES = ['initial', 'changed'] as const;
export const EVALUATION_V5_CHANGE_TYPES = [
  'guardrail_adjustment',
  'resource_reallocation',
  'pause_or_reverse',
] as const;

export type EvaluationV5Arm = typeof EVALUATION_V5_ARMS[number];
export type EvaluationV5Phase = typeof EVALUATION_V5_PHASES[number];
export type EvaluationV5ChangeType = typeof EVALUATION_V5_CHANGE_TYPES[number];
export type EvaluationV5ReviewStatus = 'unreviewed' | 'approved' | 'revision_required';

export type EvaluationV5Scenario = {
  id: string;
  pairId: string;
  domain: DecisionDomain;
  phase: EvaluationV5Phase;
  title: string;
  situation: string;
  decisionQuestion: string;
};

export type EvaluationV5ScenarioFile = {
  dataset: 'amy_hood_paired_behavior_change_scenarios';
  version: '5.0.0';
  stage: 'benchmark';
  frozenAt: string;
  scenarios: EvaluationV5Scenario[];
};

export type EvaluationV5ScenarioReview = {
  scenarioId: string;
  status: EvaluationV5ReviewStatus;
  revisionNote: string;
  provenanceComplete: boolean;
  alignmentKeyComplete: boolean;
  pairKeyComplete: boolean;
  identityMaskingComplete: boolean;
  reviewedAt: string | null;
};

export type EvaluationV5ReviewFile = {
  scenarioSetVersion: '5.0.0';
  reviews: EvaluationV5ScenarioReview[];
};

export type EvaluationV5EventProvenance = {
  pairId: string;
  externalEventId: string;
  sourceIds: string[];
  decisionCutoff: string;
  actualHistoricalAction: string;
  outcomeEvidenceIds: string[];
  initialHistoricalFacts: string[];
  changedCounterfactualFacts: string[];
  reviewer: 'Codex';
  reviewedAt: string;
};

export type EvaluationV5AlignmentKey = {
  scenarioId: string;
  policyId: string;
  phase: EvaluationV5Phase;
  expectedAction: string;
  priorityOrder: [string, string, string];
  guardrails: string[];
  reversalSignals: string[];
  acceptableVariants: string[];
  identityConflicts: string[];
  referenceRationale: string;
};

export type EvaluationV5PairKey = {
  pairId: string;
  initialScenarioId: string;
  changedScenarioId: string;
  expectedResponseType: EvaluationV5ChangeType;
  primaryChangedSignal: string;
  supportingChangedSignal: string | null;
  expectedActionDelta: string;
  invariants: string[];
  gradingAnchors: string[];
};

export type EvaluationV5ExternalEventIdentity = {
  id: string;
  domain: DecisionDomain;
  executiveName: string;
  organization: string;
  primarySourceId: string;
  secondarySourceIds: string[];
  secondarySourceStatus: 'present' | 'documented_unavailable';
  secondarySourceRationale: string;
  actualHistoricalAction: string;
  outcomeEvidenceIds: string[];
};

export type EvaluationV5FrozenManifest = {
  schemaVersion: 1;
  stage: 'benchmark';
  scenarioSetVersion: '5.0.0';
  frozenAt: string;
  scenarioIds: string[];
  pairIds: string[];
  hashes: {
    scenarios: string;
    reviews: string;
    provenance: string;
    alignmentKeys: string;
    pairKeys: string;
    externalSources: string;
  };
  bundleHash: string;
};

export type EvaluationV5BundleInput = {
  scenarioFile: EvaluationV5ScenarioFile;
  reviewFile: EvaluationV5ReviewFile;
  provenance: EvaluationV5EventProvenance[];
  alignmentKeys: EvaluationV5AlignmentKey[];
  pairKeys: EvaluationV5PairKey[];
  externalEvents: EvaluationV5ExternalEventIdentity[];
  externalSourceHash: string;
  manifest: EvaluationV5FrozenManifest | null;
};

export type EvaluationV5CandidateResponse = {
  action: string;
  priorities: [string, string, string];
  guardrails: string[];
  reversalSignals: string[];
  rationale: string;
};

export type EvaluationV5RunAnswer = {
  scenarioId: string;
  status: 'complete' | 'failed';
  response?: EvaluationV5CandidateResponse;
  elapsedMs: number;
  inputTokens?: number;
  outputTokens?: number;
  retrieval?: AmyHoodRetrievalTrace;
  rawOutput?: string;
  error?: string;
};

export type EvaluationV5Run = {
  runId: string;
  version: '5.0.0';
  stage: 'benchmark';
  scenarioSetVersion: '5.0.0';
  experimentGroupId: string;
  repetition: 1 | 2 | 3 | 4 | 5;
  orderSeed: string;
  scenarioOrder: string[];
  arm: EvaluationV5Arm;
  provider: 'local';
  model: string;
  scenarioSetHash: string;
  promptVersionId: string;
  promptHash: string;
  memoryReleaseId: string | null;
  memoryReleaseHash: string | null;
  memoryIndexHash: string | null;
  retrievalConfigHash: string | null;
  status: 'queued' | 'running' | 'incomplete' | 'complete';
  answers: EvaluationV5RunAnswer[];
  startedAt: string;
  completedAt: string | null;
  runError?: {
    code: 'artifact_stale' | 'configuration_error' | 'execution_error';
    message: string;
    retryable: boolean;
  };
};

export type EvaluationV5ExperimentLaunch = {
  experimentGroupId: string;
  repetitions: 5;
  runs: EvaluationV5Run[];
};

const unwrapJson = (text: string) => {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1] : trimmed;
};

const nonemptyStrings = (value: unknown, label: string, exactLength?: number) => {
  if (!Array.isArray(value) || value.length === 0
    || value.some((item) => typeof item !== 'string' || !item.trim())) {
    throw new Error(`${label} requires non-empty strings`);
  }
  if (exactLength !== undefined && value.length !== exactLength) {
    throw new Error(`${label} requires exactly ${exactLength} values`);
  }
  return value.map((item) => item.trim());
};

export const parseEvaluationV5CandidateResponse = (
  text: string,
): EvaluationV5CandidateResponse => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(unwrapJson(text));
  } catch {
    throw new Error('Evaluation v5 response must be valid JSON');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Evaluation v5 response must be a JSON object');
  }
  const record = parsed as Record<string, unknown>;
  const allowed = new Set(['action', 'priorities', 'guardrails', 'reversalSignals', 'rationale']);
  const unknown = Object.keys(record).find((key) => !allowed.has(key));
  if (unknown) throw new Error(`unknown candidate response field: ${unknown}`);
  if (typeof record.action !== 'string' || !record.action.trim()
    || typeof record.rationale !== 'string' || !record.rationale.trim()) {
    throw new Error('action and rationale are required');
  }
  return {
    action: record.action.trim(),
    priorities: nonemptyStrings(record.priorities, 'priorities', 3) as [string, string, string],
    guardrails: nonemptyStrings(record.guardrails, 'guardrails'),
    reversalSignals: nonemptyStrings(record.reversalSignals, 'reversalSignals'),
    rationale: record.rationale.trim(),
  };
};
