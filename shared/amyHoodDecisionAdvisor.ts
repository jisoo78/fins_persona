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

export type EventDiscriminatorKind =
  | 'named_entity'
  | 'decision_action'
  | 'event_specific';

export type EventFingerprintAlias = {
  kind: EventDiscriminatorKind;
  canonicalValue: string;
  value: string;
  sourceUrl: string;
  reviewStatus: 'reviewed';
  reviewerNote: string;
};

export type EventCandidate = {
  id: string;
  workingTitle: string;
  domain: DecisionDomain;
  decisionWindowStart: string;
  decisionWindowEnd: string;
  discoveryUrls: string[];
  decisionWindowBasis: {
    summary: string;
    sourceUrls: string[];
    reviewerNote: string;
  };
  eventFingerprint: {
    primaryEntity: string;
    decisionAction: string;
    eventSpecificIdentifier: string;
    sourceUrls: string[];
    reviewStatus: 'reviewed';
    reviewerNote: string;
    aliases?: EventFingerprintAlias[];
  };
  sourceAssociations: EventSourceAssociation[];
  directEvidenceGap: {
    reviewStatus: 'reviewed';
    reason: string;
    reviewerNote: string;
  } | null;
  phase3Status: 'eligible' | 'evidence_gap';
  notes: string;
  status: 'candidate' | 'approved_for_collection' | 'rejected';
};

export type EventSourceAssociation = {
  canonicalUrl: string;
  role: 'direct_amy' | 'contemporaneous_context' | 'counterevidence' | 'post_outcome';
  sourceType: string;
  documentFamilyId?: string;
  publishedAt: string | null;
  temporalRelation: 'pre_decision' | 'decision_time' | 'post_outcome';
  relevanceClaim: string;
  evidenceLocator: {
    exactQuote: string;
    exactRelevancePassage: string;
    anchorTerms: string[];
    eventDiscriminators: Array<{
      value: string;
      kind: EventDiscriminatorKind;
    }>;
    speaker: 'Amy Hood' | null;
  } | null;
  reviewStatus: 'unreviewed' | 'reviewed' | 'rejected';
  reviewerNote: string;
};

export type AdvisorSourceRecord = {
  id: string;
  canonicalUrl: string;
  finalUrl?: string;
  redirectChain?: string[];
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
  requestedCanonicalUrl?: string;
  finalUrl?: string;
  redirectChain?: string[];
  speakerSegments?: EvidenceSpeakerSegment[];
  title: string;
  mediaType: string;
  bodyBase64: string;
  metadata: Omit<
    AdvisorSourceRecord,
    'rawPath' | 'normalizedPath' | 'failureReason'
  >;
};

export type EvidenceSpeakerSegment = {
  speaker: string;
  startChar: number;
  endChar: number;
};

export type PilotEvidenceRole =
  | 'direct_amy'
  | 'amy_policy'
  | 'decision_context'
  | 'post_outcome';

export type PilotPolicyTag =
  | 'value_based_pricing'
  | 'capital_allocation_return'
  | 'investment_consistency'
  | 'cost_revenue_alignment'
  | 'resource_reallocation'
  | 'platform_shift_commitment'
  | 'risk_and_optionality';

export type PilotPolicyEvidenceRecord = {
  id: string;
  candidateId: string;
  sourceId: string;
  exactQuote: string;
  startChar: number;
  endChar: number;
  publishedAt: string;
  speaker: 'Amy Hood';
  policyTags: PilotPolicyTag[];
  eventLinkRationale: string;
  reviewer: string;
  reviewedAt: string;
};

export type PilotEvidenceSpan = {
  id: string;
  sourceId: string;
  eventCandidateId: string;
  role: PilotEvidenceRole;
  exactQuote: string;
  startChar: number;
  endChar: number;
  publishedAt: string;
  speaker: 'Amy Hood' | null;
};

export type PilotDecisionOption = {
  id: string;
  description: string;
  expectedBenefit: string;
  principalRisk: string;
  selected: boolean;
};

export type PilotEvidenceGap =
  | 'missing_amy_judgment'
  | 'missing_decision_context'
  | 'missing_immutable_artifact'
  | 'invalid_quote_offsets'
  | 'post_outcome_leakage'
  | 'single_document_family'
  | 'model_response_invalid';

export type PilotDecisionEvent = {
  id: string;
  candidateId: string;
  title: string;
  domain: DecisionDomain;
  decisionDate: string;
  decisionQuestion: string;
  situation: string;
  objectives: string[];
  conditions: string[];
  constraints: string[];
  options: PilotDecisionOption[];
  chosenAction: string;
  rejectedBenefit: string;
  observations: string[];
  inferences: string[];
  directAmyEvidenceIds: string[];
  amyPolicyEvidenceIds: string[];
  contextEvidenceIds: string[];
  postOutcomeEvidenceIds: string[];
  sourceIds: string[];
  documentFamilyIds: string[];
  evidenceSpans: PilotEvidenceSpan[];
  status: 'approved' | 'incomplete';
  gaps: PilotEvidenceGap[];
  reviewer: string | null;
  reviewedAt: string | null;
  updatedAt: string;
};

export type PilotManifestTarget = {
  candidateId: string;
  domain: DecisionDomain;
  priority: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
  replacementReason?: string;
};

export type PilotManifest = {
  dataset: 'amy_hood_phase_3_pilot';
  version: '1.0.0';
  targets: PilotManifestTarget[];
};
