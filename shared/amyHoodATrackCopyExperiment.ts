export type AmyHoodATrackCopyExperimentRun = {
  runId: string;
  status: 'running' | 'complete' | 'incomplete';
  model: string;
  sourcePromptVersionId: string;
  sourcePromptHash: string;
  startedAt: string;
  completedAt: string | null;
  preInterviewAnswers: Array<{
    source_question_id: number;
    category: string;
    stage: string;
    question: string;
    selected_option_id: number;
    answer: string;
    rationale: string;
    response_time_ms: number;
    response_signal: string;
  }>;
  deepQuestions: Array<{
    id: string | number;
    category: string;
    question: string;
    options: string[];
  }>;
  deepAnswers: string[];
  copyPromptPath: string;
  finalOutputPath: string;
  actionAlignmentRunId: string | null;
  actionAlignmentAverageScore: number | null;
  reportPath: string;
};
