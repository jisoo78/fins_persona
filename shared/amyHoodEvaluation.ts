export type EvaluationKpi =
  | 'past_memory_restoration'
  | 'github_holdout'
  | 'hypothetical_scenario';

export type EvaluationQuestion = {
  id: string;
  kpi: EvaluationKpi;
  type: 'multiple_choice' | 'subjective';
  prompt: string;
  options?: [string, string, string, string];
  retrievalQuery?: string;
};

export type SubjectiveRubric = {
  decision: string;
  reasoning: string;
  tradeoff: string;
  personaConsistency: string;
};

export type EvaluationAnswerKey = {
  questionId: string;
  correctChoice?: 1 | 2 | 3 | 4;
  correctIntent?: string;
  trapIntents?: Record<'1' | '2' | '3' | '4', string>;
  rubric?: SubjectiveRubric;
  evidenceRefs: string[];
};

export type EvaluationQuestionFile = {
  dataset: 'amy_hood_blind_evaluation';
  version: string;
  subject: 'Amy Hood';
  questions: EvaluationQuestion[];
};

export type EvaluationAnswerKeyFile = {
  dataset: 'amy_hood_blind_evaluation_answer_key';
  version: string;
  answers: EvaluationAnswerKey[];
};

export type QuestionReview = {
  questionId: string;
  status: 'unreviewed' | 'approved' | 'revision_required';
  revisionNote: string;
  reviewedAt: string | null;
};

export type QuestionReviewFile = {
  questionSetVersion: string;
  reviews: QuestionReview[];
};

export type EvaluationProvider = 'local' | 'openai';

export type EvaluationBundle = {
  questions: EvaluationQuestionFile;
  answerKey: EvaluationAnswerKeyFile;
};

export type SubjectiveGrade = {
  questionId: string;
  decision: 0 | 1 | 2;
  reasoning: 0 | 1 | 2;
  tradeoff: 0 | 1 | 2;
  personaConsistency: 0 | 1 | 2;
  score: number;
  summary: string;
};

export type EvaluationRunAnswer = {
  questionId: string;
  status: 'complete' | 'failed';
  choice?: 1 | 2 | 3 | 4;
  reason?: string;
  text?: string;
  correct?: boolean;
  objectiveScore?: 0 | 1;
  grade?: SubjectiveGrade;
  elapsedMs: number;
  inputTokens?: number;
  outputTokens?: number;
  error?: string;
};

export type EvaluationRun = {
  runId: string;
  status: 'queued' | 'running' | 'incomplete' | 'complete';
  gradingStatus: 'pending' | 'complete';
  provider: EvaluationProvider;
  model: string;
  promptVersionId?: string;
  promptHash: string;
  ragSnapshotId: string;
  questionSetVersion: string;
  answers: EvaluationRunAnswer[];
  scores: {
    pastMemory: number;
    githubHoldout: number;
    subjective: number | null;
  };
  startedAt: string;
  completedAt: string | null;
};
