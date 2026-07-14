export type DatasetSplit = 'train' | 'development' | 'holdout';

export type DecisionDomain =
  | 'm_and_a'
  | 'ai_cloud_capex'
  | 'pricing_monetization'
  | 'cost_efficiency'
  | 'shareholder_return_risk';

export type ArtifactStatus =
  | 'candidate'
  | 'review_required'
  | 'approved'
  | 'indexed'
  | 'superseded';

export type EvaluationV3Category =
  | 'amy_specific_discrimination'
  | 'temporal_holdout'
  | 'counterfactual_pair'
  | 'new_advisory_scenario';

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

export const EVALUATION_V3_REPETITIONS = 5;

export type EvaluationV3BlueprintSlot = {
  id: string;
  category: EvaluationV3Category;
  type: 'multiple_choice' | 'subjective';
  domain: DecisionDomain;
  pairId?: string;
  pairVariant?: 'a' | 'b';
  requiredSplit: DatasetSplit | 'none';
  scoreDimensions: Array<Exclude<keyof EvaluationV3Score, 'total'>>;
};

export type EvaluationV3Blueprint = {
  dataset: 'amy_hood_decision_advisor_evaluation_blueprint';
  version: '3.0.0';
  slots: EvaluationV3BlueprintSlot[];
};

export type EvaluationV3Question = EvaluationV3BlueprintSlot & {
  prompt: string;
  options?: [string, string, string, string];
};

export type EvaluationV3QuestionFile = {
  dataset: 'amy_hood_decision_advisor_evaluation';
  version: '3.0.0';
  frozenAt: string;
  questions: EvaluationV3Question[];
};

export type EvaluationV3SubjectiveRubric = {
  decision: string;
  criteriaPriority: string;
  conditionalTransfer: string;
  evidenceBounding: string;
  actionability: string;
};

export type EvaluationV3Answer = {
  questionId: string;
  correctChoice?: 1 | 2 | 3 | 4;
  correctIntent?: string;
  trapIntents?: Record<'1' | '2' | '3' | '4', string>;
  criteriaInPriorityOrder: string[];
  reversalSignal?: string;
  evidenceRefs: string[];
  sealedEventIds: string[];
  rubric?: EvaluationV3SubjectiveRubric;
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

export type EvaluationV3Score = {
  decisionSelection: number;
  criteriaPriority: number;
  conditionSensitivity: number;
  evidenceFaithfulness: number;
  actionability: number;
  total: number;
};

export type SourceTier = 1 | 2 | 3 | 'discovery_only';

export type CollectionStatus =
  | 'discovered'
  | 'queued'
  | 'collected'
  | 'normalized'
  | 'review_required'
  | 'approved'
  | 'failed';

export type CollectionFailureReason =
  | 'access_denied'
  | 'paywalled'
  | 'transcript_missing'
  | 'speaker_uncertain'
  | 'duplicate'
  | 'insufficient_decision_context'
  | 'post_outcome_only'
  | 'network_error'
  | 'invalid_content';

export type EventCandidate = {
  id: string;
  workingTitle: string;
  domain: DecisionDomain;
  decisionWindowStart: string;
  decisionWindowEnd: string;
  discoveryUrls: string[];
  notes: string;
  status: 'candidate' | 'approved_for_collection' | 'rejected';
};

export type AdvisorSourceRecord = {
  id: string;
  canonicalUrl: string;
  eventCandidateIds: string[];
  tier: SourceTier;
  title: string;
  publisher: string;
  publishedAt: string | null;
  speaker: string | null;
  sourceType: string;
  collector:
    | 'microsoft_ir'
    | 'microsoft_source'
    | 'sec_edgar'
    | 'public_html'
    | 'transcript_import'
    | 'manual_import';
  temporalRole: 'pre_decision' | 'decision_time' | 'post_outcome';
  rightsNote: string;
  approvedPublicHost: boolean;
  collectionStatus: CollectionStatus;
  rawPath: string | null;
  normalizedPath: string | null;
  sha256: string | null;
  capturedAt: string | null;
  failureReason: CollectionFailureReason | null;
};

export type AdvisorRawSource = {
  sourceId: string;
  canonicalUrl: string;
  title: string;
  mediaType: string;
  bodyBase64: string;
  metadata: Omit<
    AdvisorSourceRecord,
    'rawPath' | 'normalizedPath' | 'failureReason'
  >;
};
