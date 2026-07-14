import type {
  EvaluationQuestion,
  EvaluationRun,
  EvaluationRunAnswer,
} from '../../../shared/amyHoodEvaluation';

export type SingleRunReportModel = {
  runId: string;
  status: EvaluationRun['status'];
  gradingStatus: EvaluationRun['gradingStatus'];
  provider: EvaluationRun['provider'];
  model: string;
  promptLabel: string;
  questionSetVersion: string;
  scores: EvaluationRun['scores'];
  rows: Array<{ question: EvaluationQuestion; answer: EvaluationRunAnswer | null }>;
};

export type ComparisonRunReportModel = {
  left: SingleRunReportModel;
  right: SingleRunReportModel;
  scoreDeltas: {
    pastMemory: number;
    githubHoldout: number;
    subjective: number | null;
  };
  rows: Array<{
    question: EvaluationQuestion;
    left: EvaluationRunAnswer;
    right: EvaluationRunAnswer;
  }>;
};

export const buildSingleRunReport = (
  run: EvaluationRun,
  questions: EvaluationQuestion[],
): SingleRunReportModel => {
  const answerMap = new Map(run.answers.map((answer) => [answer.questionId, answer]));
  return {
    runId: run.runId,
    status: run.status,
    gradingStatus: run.gradingStatus,
    provider: run.provider,
    model: run.model,
    promptLabel: run.promptVersionId
      ? `프롬프트 버전 · ${run.promptVersionId}`
      : `레거시 프롬프트 · ${run.promptHash}`,
    questionSetVersion: run.questionSetVersion,
    scores: { ...run.scores },
    rows: questions.map((question) => ({
      question,
      answer: answerMap.get(question.id) ?? null,
    })),
  };
};

export const buildComparisonReport = (
  leftRun: EvaluationRun,
  rightRun: EvaluationRun,
  questions: EvaluationQuestion[],
): ComparisonRunReportModel => {
  if (leftRun.runId === rightRun.runId) {
    throw new Error('comparison requires different evaluation runs');
  }
  if (leftRun.questionSetVersion !== rightRun.questionSetVersion) {
    throw new Error('comparison requires the same question-set version');
  }
  if (leftRun.answers.length !== 15 || rightRun.answers.length !== 15) {
    throw new Error('comparison requires 15 answers in each run');
  }

  const left = buildSingleRunReport(leftRun, questions);
  const right = buildSingleRunReport(rightRun, questions);
  const rows = questions.map((question) => {
    const leftAnswer = leftRun.answers.find((answer) => answer.questionId === question.id);
    const rightAnswer = rightRun.answers.find((answer) => answer.questionId === question.id);
    if (!leftAnswer || !rightAnswer) {
      throw new Error(`comparison requires matching answers for ${question.id}`);
    }
    return { question, left: leftAnswer, right: rightAnswer };
  });

  return {
    left,
    right,
    scoreDeltas: {
      pastMemory: right.scores.pastMemory - left.scores.pastMemory,
      githubHoldout: right.scores.githubHoldout - left.scores.githubHoldout,
      subjective: left.scores.subjective === null || right.scores.subjective === null
        ? null
        : right.scores.subjective - left.scores.subjective,
    },
    rows,
  };
};
