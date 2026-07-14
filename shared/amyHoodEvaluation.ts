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
