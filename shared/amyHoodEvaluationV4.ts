import type { DecisionDomain } from './amyHoodDecisionAdvisor';
import type { AmyHoodRetrievalTrace } from './amyHoodRag';

export const EVALUATION_V4_DOMAINS: DecisionDomain[] = [
  'm_and_a',
  'ai_cloud_capex',
  'pricing_monetization',
  'cost_efficiency',
  'shareholder_return_risk',
];

export const EVALUATION_V4_VARIANTS = [
  'base_transfer',
  'boundary',
  'reversal',
] as const;

export const EVALUATION_V4_ARMS = [
  'generic_cfo',
  'amy_prompt',
  'amy_policy_rag',
  'amy_full_rag',
] as const;

export type EvaluationV4Variant = typeof EVALUATION_V4_VARIANTS[number];
export type EvaluationV4Arm = typeof EVALUATION_V4_ARMS[number];
export type EvaluationV4Repetitions = 1 | 5;
export type EvaluationV4Stage = 'calibration' | 'benchmark';
export type EvaluationV4ReviewStatus = 'unreviewed' | 'approved' | 'revision_required';

export type EvaluationV4Scenario = {
  id: string;
  domain: DecisionDomain;
  variant: EvaluationV4Variant;
  title: string;
  situation: string;
  decisionQuestion: string;
};

export type EvaluationV4ScenarioFile = {
  dataset: 'amy_hood_action_alignment_scenarios';
  version: '4.0.0';
  stage: EvaluationV4Stage;
  frozenAt: string;
  scenarios: EvaluationV4Scenario[];
};

export type EvaluationV4ScenarioReview = {
  scenarioId: string;
  status: EvaluationV4ReviewStatus;
  revisionNote: string;
  provenanceComplete: boolean;
  alignmentKeyComplete: boolean;
  reviewedAt: string | null;
};

export type EvaluationV4ReviewFile = {
  scenarioSetVersion: '4.0.0';
  reviews: EvaluationV4ScenarioReview[];
};

export type EvaluationV4Provenance = {
  scenarioId: string;
  externalEventId: string;
  sourceIds: string[];
  decisionCutoff: string;
  actualHistoricalAction: string;
  outcomeEvidenceIds: string[];
};

export type EvaluationV4AlignmentKey = {
  scenarioId: string;
  policyId: string;
  scenarioVariant: EvaluationV4Variant;
  expectedAction: string;
  priorityOrder: [string, string, string];
  guardrails: string[];
  reversalSignals: string[];
  acceptableVariants: string[];
  identityConflicts: string[];
  referenceRationale: string;
};

export type EvaluationV4ExternalEventIdentity = {
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

export type EvaluationV4FrozenManifest = {
  schemaVersion: 1;
  stage: EvaluationV4Stage;
  scenarioSetVersion: '4.0.0';
  frozenAt: string;
  scenarioIds: string[];
  hashes: {
    scenarios: string;
    reviews: string;
    provenance: string;
    alignmentKeys: string;
    externalSources: string;
  };
  bundleHash: string;
};

export type EvaluationV4BundleInput = {
  stage: EvaluationV4Stage;
  scenarioFile: EvaluationV4ScenarioFile;
  reviewFile: EvaluationV4ReviewFile;
  provenance: EvaluationV4Provenance[];
  alignmentKeys: EvaluationV4AlignmentKey[];
  externalEvents: EvaluationV4ExternalEventIdentity[];
  externalSourceHash: string;
  manifest: EvaluationV4FrozenManifest | null;
};

export type EvaluationV4CandidateResponse = {
  action: string;
  priorities: [string, string, string];
  guardrails: string[];
  reversalSignals: string[];
  rationale: string;
};

export type EvaluationV4RunAnswer = {
  scenarioId: string;
  status: 'complete' | 'failed';
  response?: EvaluationV4CandidateResponse;
  elapsedMs: number;
  inputTokens?: number;
  outputTokens?: number;
  retrieval?: AmyHoodRetrievalTrace;
  error?: string;
};

export type EvaluationV4Run = {
  runId: string;
  version: '4.0.0';
  experimentGroupId: string;
  repetition: 1 | 2 | 3 | 4 | 5;
  orderSeed: string;
  arm: EvaluationV4Arm;
  provider: 'local';
  model: string;
  scenarioSetHash: string;
  promptVersionId: string | null;
  promptHash: string;
  memoryReleaseId: string | null;
  memoryReleaseHash: string | null;
  memoryIndexHash: string | null;
  retrievalConfigHash: string | null;
  status: 'queued' | 'running' | 'incomplete' | 'complete';
  answers: EvaluationV4RunAnswer[];
  startedAt: string;
  completedAt: string | null;
  runError?: {
    code: 'artifact_stale' | 'configuration_error' | 'execution_error';
    message: string;
    retryable: boolean;
  };
};

export type EvaluationV4ExperimentLaunch = {
  experimentGroupId: string;
  repetitions: EvaluationV4Repetitions;
  runs: EvaluationV4Run[];
};

export type EvaluationV4JudgePacket = {
  packetId: string;
  packetHash: string;
  scenario: EvaluationV4Scenario;
  candidateResponse: EvaluationV4CandidateResponse;
  alignmentKey: EvaluationV4AlignmentKey;
  anchorChecklist: ['action', 'priority', 'guardrails', 'reversal'];
};

export type EvaluationV4AnchorFinding = 'aligned' | 'partial' | 'missing' | 'conflict';

export type EvaluationV4Grade = {
  packetId: string;
  packetHash: string;
  rationale: string;
  anchorFindings: Record<
    'action' | 'priority' | 'guardrails' | 'reversal',
    EvaluationV4AnchorFinding
  >;
  score: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
  judgeProvider: 'codex' | 'openai';
  judgeModel: string;
  rationalePromptHash: string;
  scorePromptHash: string;
  gradedAt: string;
};

export type EvaluationV4ExperimentReport = {
  experimentGroupId: string;
  scenarioSetHash: string;
  repetitions: EvaluationV4Repetitions;
  benchmarkRejected: boolean;
  rejectionReasons: string[];
  personaEvidencePassed: boolean;
  armMeans: Record<EvaluationV4Arm, number | null>;
  pairedLift: Record<'amy_prompt' | 'amy_policy_rag' | 'amy_full_rag', number | null>;
  domainMeans: Record<EvaluationV4Arm, Partial<Record<DecisionDomain, number>>>;
  variantMeans: Record<EvaluationV4Arm, Partial<Record<EvaluationV4Variant, number>>>;
  scoreBands: Record<EvaluationV4Arm, {
    high8To10Rate: number;
    neutral5Rate: number;
    conflict1To4Rate: number;
  }>;
  retrieval: {
    mappedPolicyRate: number;
    noMatchRate: number;
    wrongDomainRate: number;
    cacheAgreementRate: number;
    evidenceAttachmentRate: number;
    contextWithinBudgetRate: number;
    meanContextTokens: number;
  };
  reliability: {
    sampleSize: number;
    withinOneRate: number;
    meanAbsoluteDifference: number;
    passed: boolean;
  };
  stability: {
    withinScenarioStdDev: number | null;
    perScenarioStdDev: Record<string, number>;
    passed: boolean;
  };
  diagnostics: {
    completeAnswers: number;
    failedAnswers: number;
    validGrades: number;
  };
};

const unwrapJson = (text: string) => {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1] : trimmed;
};

const nonemptyStrings = (
  value: unknown,
  label: string,
  exactLength?: number,
) => {
  if (!Array.isArray(value)
    || value.length === 0
    || value.some((item) => typeof item !== 'string' || !item.trim())) {
    throw new Error(`${label} requires non-empty strings`);
  }
  if (exactLength !== undefined && value.length !== exactLength) {
    throw new Error(`${label} requires exactly ${exactLength} values`);
  }
  return value.map((item) => item.trim());
};

export const parseEvaluationV4CandidateResponse = (
  text: string,
): EvaluationV4CandidateResponse => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(unwrapJson(text));
  } catch {
    throw new Error('Evaluation v4 response must be valid JSON');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Evaluation v4 response must be a JSON object');
  }
  const record = parsed as Record<string, unknown>;
  const allowed = new Set([
    'action',
    'priorities',
    'guardrails',
    'reversalSignals',
    'rationale',
  ]);
  const unknown = Object.keys(record).find((key) => !allowed.has(key));
  if (unknown) throw new Error(`unknown candidate response field: ${unknown}`);
  if (typeof record.action !== 'string' || !record.action.trim()
    || typeof record.rationale !== 'string' || !record.rationale.trim()) {
    throw new Error('action and rationale are required');
  }
  const priorities = nonemptyStrings(
    record.priorities,
    'priorities',
    3,
  ) as [string, string, string];
  return {
    action: record.action.trim(),
    priorities,
    guardrails: nonemptyStrings(record.guardrails, 'guardrails'),
    reversalSignals: nonemptyStrings(record.reversalSignals, 'reversalSignals'),
    rationale: record.rationale.trim(),
  };
};
