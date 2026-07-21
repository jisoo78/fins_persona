export type AmyHoodActualDecisionEvent = {
  id: string;
  name: string;
  year: number;
  category: 'acquisition' | 'cloud_transition' | 'ai_infrastructure' | 'portfolio_restructuring';
  decisionContext: string;
  decisionSignals: string[];
  knownLimits: string[];
};

export type AmyHoodEventMatchingQuestion = {
  id: string;
  type: 'subjective_event_matching';
  virtualEvent: string;
  task: string;
  expectedSimilarEventIds: string[];
  expectedDecisionCriteria: string[];
  gradingNotes: string;
};

export type AmyHoodEventMatchingRubric = {
  similarEventSelection: string;
  decisionCriteriaSimilarity: string;
  evidenceUse: string;
  uncertaintyControl: string;
  finalRecommendation: string;
};

export type AmyHoodEventMatchingEvaluationFile = {
  dataset: 'amy_hood_event_matching_evaluation';
  version: string;
  subject: 'Amy Hood';
  purpose: string;
  actualEvents: AmyHoodActualDecisionEvent[];
  questions: AmyHoodEventMatchingQuestion[];
  rubric: AmyHoodEventMatchingRubric;
};

export type AmyHoodEventMatchingScore = {
  questionId: string;
  similarEventSelection: 0 | 1 | 2;
  decisionCriteriaSimilarity: 0 | 1 | 2;
  evidenceUse: 0 | 1 | 2;
  uncertaintyControl: 0 | 1 | 2;
  finalRecommendation: 0 | 1 | 2;
  total: number;
  notes: string[];
};

export type AmyHoodEventMatchingRunAnswer = {
  questionId: string;
  status: 'complete' | 'failed';
  text?: string;
  expectedSimilarEventIds: string[];
  score?: AmyHoodEventMatchingScore;
  elapsedMs: number;
  inputTokens?: number;
  outputTokens?: number;
  error?: string;
};

export type AmyHoodEventMatchingRun = {
  runId: string;
  status: 'running' | 'complete' | 'incomplete';
  provider: 'local' | 'openai';
  model: string;
  datasetVersion: string;
  promptVersionId: string;
  promptHash: string;
  startedAt: string;
  completedAt: string | null;
  answers: AmyHoodEventMatchingRunAnswer[];
  totalScore: number | null;
  maxScore: number;
};
