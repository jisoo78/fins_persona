import type { DecisionDomain } from './amyHoodDecisionAdvisor';
import type { EvaluationV5CandidateResponse } from './amyHoodEvaluationV5';
import type { AmyHoodRetrievalTrace } from './amyHoodRag';

export const EVALUATION_V6_ARMS = ['amy_prompt', 'amy_policy_rag', 'amy_full_rag'] as const;
export const EVALUATION_V6_DOMAINS: DecisionDomain[] = [
  'm_and_a',
  'ai_cloud_capex',
  'pricing_monetization',
  'cost_efficiency',
  'shareholder_return_risk',
];
export const EVALUATION_V6_EVIDENCE_CLASSES = [
  'direct_observed',
  'contrast_observed',
  'bounded_policy_transfer',
  'unsupported_reversal',
  'generic_only',
  'ambiguous_key',
] as const;
export const EVALUATION_V6_COMPONENTS = [
  'action',
  'priorityOrder',
  'boundaries',
  'reversal',
  'identitySpecificity',
] as const;

export type EvaluationV6Arm = typeof EVALUATION_V6_ARMS[number];
export type EvaluationV6EvidenceClass = typeof EVALUATION_V6_EVIDENCE_CLASSES[number];
export type EvaluationV6Component = typeof EVALUATION_V6_COMPONENTS[number];
export type EvaluationV6ComponentRating = 0 | 1 | 2 | 3 | 4;

export type EvaluationV6ItemAudit = {
  scenarioId: string;
  domain: DecisionDomain;
  policyId: string;
  decisionAxis: string;
  amyDirectEvidenceIds: string[];
  amySupportingEventIds: string[];
  amyContrastingEventIds: string[];
  explicitReversalEvidenceIds: string[];
  externalMotifEventId: string;
  keyEvidenceClass: EvaluationV6EvidenceClass;
  requiresObservedReversal: boolean;
  identityDiscriminability: 'passed' | 'failed';
  decision: 'retain' | 'replace';
  rationale: string;
  reviewer: 'Codex';
  reviewedAt: string;
};

export type EvaluationV6ReplacementRecord = {
  predecessorScenarioId: string;
  replacementScenarioId: string;
  originalDomain: DecisionDomain;
  replacementDomain: DecisionDomain;
  reason: string;
  amyEvidenceIds: string[];
  externalMotifEventId: string;
  status: 'admitted' | 'research_required';
  reviewer: 'Codex' | null;
  reviewedAt: string | null;
};

export type EvaluationV6Scenario = {
  id: string;
  predecessorScenarioId: string | null;
  pairId: string;
  domain: DecisionDomain;
  phase: 'initial' | 'changed';
  title: string;
  situation: string;
  decisionQuestion: string;
};

export type EvaluationV6ScenarioFile = {
  dataset: 'amy_hood_identity_action_alignment_scenarios';
  version: '6.0.0';
  stage: 'benchmark';
  frozenAt: string;
  scenarios: EvaluationV6Scenario[];
};

export type EvaluationV6ScenarioReview = {
  scenarioId: string;
  status: 'unreviewed' | 'approved' | 'revision_required';
  evidenceAuditPassed: boolean;
  identityKeyComplete: boolean;
  calibrationPassed: boolean;
  identityMaskingComplete: boolean;
  reviewedAt: string | null;
};

export type EvaluationV6GenericCfoFoil = {
  action: string;
  whyReasonable: string;
  whyNotAmy: string;
};

export type EvaluationV6IdentityKey = {
  scenarioId: string;
  policyId: string;
  expectedAction: string;
  amyPriorityOrder: string[];
  amyBoundaryConditions: string[];
  amyReversalRule: string[];
  amySpecificRationale: string;
  acceptableVariants: string[];
  genericCfoFoil: EvaluationV6GenericCfoFoil;
  identityConflicts: string[];
  evidenceClass: Extract<EvaluationV6EvidenceClass, 'direct_observed' | 'contrast_observed' | 'bounded_policy_transfer'>;
  amyEvidenceIds: string[];
  externalMotifEventId: string;
};

export type EvaluationV6PairKey = {
  pairId: string;
  initialScenarioId: string;
  changedScenarioId: string;
  expectedResponseType: 'guardrail_adjustment' | 'resource_reallocation' | 'pause_or_reverse';
  primaryChangedSignal: string;
  supportingChangedSignal: string | null;
  expectedActionDelta: string;
  invariants: string[];
  gradingAnchors: string[];
};

export type EvaluationV6AnchorKind =
  | 'action'
  | 'priority_order'
  | 'boundary_condition'
  | 'reversal_rule'
  | 'identity_conflict';
export type EvaluationV6JudgeComponents = Record<EvaluationV6Component, EvaluationV6ComponentRating>;
export type EvaluationV6IdentityVerdict = 'amy_aligned' | 'amy_partial' | 'generic_cfo' | 'amy_conflict';
export type EvaluationV6AnchorFinding = 'aligned' | 'partial' | 'missing' | 'conflict';

export type EvaluationV6JudgeAssessment = {
  rationale: string;
  identityVerdict: EvaluationV6IdentityVerdict;
  components: EvaluationV6JudgeComponents;
  anchorFindings: Record<'action' | 'priority' | 'guardrails' | 'reversal', EvaluationV6AnchorFinding>;
  distinguishingAnchor: { kind: EvaluationV6AnchorKind; statement: string };
};

export type EvaluationV6Grade = EvaluationV6JudgeAssessment & {
  packetId: string;
  packetHash: string;
  score: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
  uncappedScore: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
  ceilingApplied: string[];
  judgeProvider: 'codex' | 'openai' | 'local';
  judgeModel: string;
  rationalePromptHash: string;
  assessmentPromptHash: string;
  repairApplied: boolean;
  gradedAt: string;
};

export type EvaluationV6CalibrationAnswer = {
  calibrationId: string;
  scenarioId: string;
  answerType: 'amy_aligned' | 'generic_cfo' | 'amy_conflict';
  expectedAnchor: EvaluationV6AnchorKind;
  expectedAnchorTerms: string[];
  candidateResponse: EvaluationV5CandidateResponse;
};

export type EvaluationV6FrozenManifest = {
  schemaVersion: 1;
  stage: 'benchmark';
  scenarioSetVersion: '6.0.0';
  frozenAt: string;
  predecessorV5BundleHash: string;
  candidateBundleHash: string;
  judgeCalibrationBatchHash: string;
  scenarioIds: string[];
  pairIds: string[];
  hashes: Record<'audit' | 'replacementLedger' | 'scenarios' | 'reviews' | 'provenance' | 'identityKeys' | 'pairKeys' | 'calibrationAnswers', string>;
  bundleHash: string;
};

export type EvaluationV6Provenance = {
  pairId: string;
  externalMotifEventId: string;
  amyEvidenceIds: string[];
  decisionCutoff: string;
  reviewer: 'Codex';
  reviewedAt: string;
};

export type EvaluationV6BundleInput = {
  scenarioFile: EvaluationV6ScenarioFile;
  reviews: EvaluationV6ScenarioReview[];
  audits: EvaluationV6ItemAudit[];
  replacements: EvaluationV6ReplacementRecord[];
  provenance: EvaluationV6Provenance[];
  identityKeys: EvaluationV6IdentityKey[];
  pairKeys: EvaluationV6PairKey[];
  calibrationAnswers: EvaluationV6CalibrationAnswer[];
  predecessorV5BundleHash: string;
  manifest: EvaluationV6FrozenManifest | null;
};

export type EvaluationV6JudgeIdentityKey = Omit<
  EvaluationV6IdentityKey,
  'scenarioId' | 'policyId' | 'evidenceClass' | 'amyEvidenceIds' | 'externalMotifEventId'
>;

export type EvaluationV6JudgePacket = {
  packetId: string;
  packetHash: string;
  scenario: Pick<EvaluationV6Scenario, 'title' | 'situation' | 'decisionQuestion'>;
  candidateResponse: EvaluationV5CandidateResponse;
  identityKey: EvaluationV6JudgeIdentityKey;
};

export type EvaluationV6PairJudgePacket = {
  packetId: string;
  packetHash: string;
  initialScenario: Pick<EvaluationV6Scenario, 'title' | 'situation' | 'decisionQuestion'>;
  changedScenario: Pick<EvaluationV6Scenario, 'title' | 'situation' | 'decisionQuestion'>;
  initialCandidateResponse: EvaluationV5CandidateResponse;
  changedCandidateResponse: EvaluationV5CandidateResponse;
  initialIdentityKey: EvaluationV6JudgeIdentityKey;
  changedIdentityKey: EvaluationV6JudgeIdentityKey;
  pairKey: Omit<EvaluationV6PairKey, 'pairId' | 'initialScenarioId' | 'changedScenarioId'>;
};

export type EvaluationV6PairGrade = EvaluationV6Grade & {
  aligned: boolean;
  expectedResponseFinding: 'aligned' | 'partial' | 'conflict';
  changedSignalFinding: 'aligned' | 'partial' | 'conflict';
  invariantFinding: 'aligned' | 'partial' | 'conflict';
};

export type EvaluationV6RunAnswer = {
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

export type EvaluationV6Run = {
  runId: string;
  version: '6.0.0';
  stage: 'benchmark';
  experimentGroupId: string;
  repetition: 1 | 2 | 3 | 4 | 5;
  orderSeed: string;
  scenarioOrder: string[];
  arm: EvaluationV6Arm;
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
  answers: EvaluationV6RunAnswer[];
  startedAt: string;
  completedAt: string | null;
};

export const assertEvaluationV6EvidenceClass = (value: unknown): EvaluationV6EvidenceClass => {
  if (!EVALUATION_V6_EVIDENCE_CLASSES.includes(value as EvaluationV6EvidenceClass)) {
    throw new Error('invalid Evaluation v6 evidence class');
  }
  return value as EvaluationV6EvidenceClass;
};

export const assertEvaluationV6ComponentRating = (value: unknown): EvaluationV6ComponentRating => {
  if (!Number.isInteger(value) || Number(value) < 0 || Number(value) > 4) {
    throw new Error('invalid Evaluation v6 component rating');
  }
  return value as EvaluationV6ComponentRating;
};
