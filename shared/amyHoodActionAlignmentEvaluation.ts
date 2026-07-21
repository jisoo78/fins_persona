export type AmyHoodActionAlignmentScenario = {
  id: string;
  scenario: string;
  prompt: string;
  mappedActualEventIds: string[];
  expectedActionPattern: string[];
  misalignmentSignals: string[];
  referenceAnswer: string;
};

export type AmyHoodActionAlignmentEvaluationFile = {
  dataset: 'amy_hood_action_alignment_evaluation';
  version: string;
  subject: 'Amy Hood';
  purpose: string;
  responseLimitChars: number;
  repetitions: number;
  scale: {
    min: 1;
    neutral: 5;
    max: 10;
    description: string;
  };
  scenarios: AmyHoodActionAlignmentScenario[];
};

export type AmyHoodActionAlignmentJudgeScore = {
  scenarioId: string;
  repetition: number;
  evidenceSentence: string;
  score: number;
  alignmentLabel: 'contradictory' | 'weak' | 'neutral' | 'aligned' | 'strongly_aligned';
  notes: string[];
};

export type AmyHoodActionAlignmentRunAnswer = {
  scenarioId: string;
  repetition: number;
  status: 'complete' | 'failed';
  responseText?: string;
  judge?: AmyHoodActionAlignmentJudgeScore;
  elapsedMs: number;
  judgeElapsedMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  error?: string;
};

export type AmyHoodActionAlignmentRun = {
  runId: string;
  status: 'running' | 'complete' | 'incomplete';
  provider: 'local' | 'openai';
  model: string;
  judgeProvider: 'local' | 'openai';
  judgeModel: string;
  datasetVersion: string;
  promptVersionId: string;
  promptHash: string;
  repetitions: number;
  startedAt: string;
  completedAt: string | null;
  answers: AmyHoodActionAlignmentRunAnswer[];
  averageScore: number | null;
  minScore: number | null;
  maxScore: number | null;
};
