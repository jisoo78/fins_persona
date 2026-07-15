import type { DatasetSplit, DecisionDomain } from './amyHoodDecisionAdvisor';

export type EvaluationV3Category =
  | 'amy_specific_discrimination'
  | 'temporal_holdout'
  | 'counterfactual_pair'
  | 'new_advisory_transfer';

export type EvaluationV3Arm =
  | 'generic_cfo'
  | 'amy_prompt'
  | 'amy_policy_rag'
  | 'amy_full_rag';

export const EVALUATION_V3_ARMS: EvaluationV3Arm[] = [
  'generic_cfo',
  'amy_prompt',
  'amy_policy_rag',
  'amy_full_rag',
];

export const isEvaluationV3Arm = (value: string): value is EvaluationV3Arm =>
  EVALUATION_V3_ARMS.includes(value as EvaluationV3Arm);

export type EvaluationV3Repetitions = 1 | 5;

export type EvaluationV3BlueprintSlot = {
  id: string;
  category: EvaluationV3Category;
  type: 'multiple_choice';
  domain: DecisionDomain;
  pairId?: 'C01' | 'C02' | 'C03';
  pairVariant?: 'a' | 'b';
  requiredSplit: DatasetSplit | 'none';
};

export type EvaluationV3Blueprint = {
  dataset: 'amy_hood_decision_advisor_evaluation_blueprint';
  version: '3.0.0';
  slots: EvaluationV3BlueprintSlot[];
};

export type EvaluationV3Question = EvaluationV3BlueprintSlot & {
  prompt: string;
  options: [string, string, string, string];
};

export type EvaluationV3TrapMechanism =
  | 'wrong_priority_order'
  | 'premature_application'
  | 'missing_boundary_condition'
  | 'short_term_financial_optics'
  | 'wrong_execution_sequence'
  | 'overgeneralized_rule'
  | 'miscalibrated_reversal_signal';

export type EvaluationV3Answer = {
  questionId: string;
  correctChoice: 1 | 2 | 3 | 4;
  correctIntent: string;
  trapIntents: Record<'1' | '2' | '3' | '4', string>;
  trapMechanisms: Partial<
    Record<'1' | '2' | '3' | '4', EvaluationV3TrapMechanism>
  >;
  evidenceRefs: string[];
  sealedEventIds: string[];
  expectedPairBehavior?: 'reverse' | 'stable';
};

export type EvaluationV3QuestionFile = {
  dataset: 'amy_hood_decision_advisor_evaluation';
  version: '3.0.0';
  frozenAt: string;
  questions: EvaluationV3Question[];
};

export type EvaluationV3AnswerKeyFile = {
  dataset: 'amy_hood_decision_advisor_evaluation_answer_key';
  version: '3.0.0';
  answers: EvaluationV3Answer[];
};

export type EvaluationV3Review = {
  questionId: string;
  status: 'unreviewed' | 'approved' | 'revision_required';
  revisionNote: string;
  reviewedAt: string | null;
};

export type EvaluationV3ReviewFile = {
  questionSetVersion: '3.0.0';
  reviews: EvaluationV3Review[];
};

export type EvaluationV3RunAnswer = {
  questionId: string;
  status: 'complete' | 'failed';
  choice?: 1 | 2 | 3 | 4;
  reason?: string;
  correct?: boolean;
  mismatch?: boolean;
  elapsedMs: number;
  inputTokens?: number;
  outputTokens?: number;
  error?: string;
};

export type EvaluationV3RunScores = {
  discrimination: number;
  holdout: number;
  counterfactual: number;
  transfer: number;
  total: number;
  percent: number;
};

export type EvaluationV3Run = {
  runId: string;
  version: '3.0.0';
  experimentGroupId: string;
  repetition: 1 | 2 | 3 | 4 | 5;
  arm: EvaluationV3Arm;
  provider: 'local';
  model: string;
  questionSetVersion: '3.0.0';
  questionSetHash: string;
  answerKeyHash: string;
  promptVersionId: string | null;
  promptHash: string;
  memoryReleaseId: string | null;
  memoryReleaseHash: string | null;
  holdoutManifestHash: string;
  status: 'queued' | 'running' | 'incomplete' | 'complete';
  answers: EvaluationV3RunAnswer[];
  scores: EvaluationV3RunScores;
  startedAt: string;
  completedAt: string | null;
  runError?: {
    code: 'artifact_stale' | 'configuration_error' | 'execution_error';
    message: string;
    retryable: boolean;
  };
};

export type EvaluationV3ExperimentLaunch = {
  experimentGroupId: string;
  repetitions: EvaluationV3Repetitions;
  runs: EvaluationV3Run[];
};

export type EvaluationV3Statistic = {
  mean: number;
  min: number;
  max: number;
  populationStdDev: number;
};

export type EvaluationV3CategoryResult = {
  correct: number;
  total: number;
};

export type EvaluationV3RunReport = {
  runId: string;
  status: EvaluationV3Run['status'];
  percent: number | null;
  categories: {
    discrimination: EvaluationV3CategoryResult;
    holdout: EvaluationV3CategoryResult;
    counterfactual: EvaluationV3CategoryResult;
    transfer: EvaluationV3CategoryResult;
  };
  pairConsistency: number | null;
};

export type EvaluationV3LiftReport = {
  amyPromptLift: number | null;
  policyRagLift: number | null;
  fullRagLift: number | null;
  fullVsGenericLift: number | null;
};

export type EvaluationV3ArmAggregate = {
  arm: EvaluationV3Arm;
  completedRuns: number;
  totalRuns: number;
  percent: EvaluationV3Statistic | null;
  choiceAgreement: Record<string, number>;
  overallChoiceAgreement: number | null;
};

export type EvaluationV3ExperimentReport = {
  experimentGroupId: string;
  benchmarkRejected: boolean;
  warnings: string[];
  repetitions: Array<{
    repetition: 1 | 2 | 3 | 4 | 5;
    arms: Record<EvaluationV3Arm, EvaluationV3RunReport>;
    lifts: EvaluationV3LiftReport;
    comparisonReady: boolean;
  }>;
  armAggregates: Record<EvaluationV3Arm, EvaluationV3ArmAggregate>;
  diagnostics: {
    inputTokens: number;
    outputTokens: number;
    elapsedMs: number;
    mismatchCount: number;
    failedQuestions: number;
  };
};
