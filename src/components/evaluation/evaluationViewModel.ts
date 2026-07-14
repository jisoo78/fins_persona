import type {
  EvaluationAnswerKey,
  EvaluationKpi,
  EvaluationQuestion,
  EvaluationRun,
  EvaluationRunAnswer,
  QuestionReview,
} from '../../../shared/amyHoodEvaluation';
import type { EvaluationQuestionsResponse } from '../../services/evaluationApi';

export type EvaluationQuestionCard = {
  question: EvaluationQuestion;
  answer: EvaluationAnswerKey;
  review: QuestionReview;
};

export type QuestionFilters = {
  kpi: EvaluationKpi | 'all';
  status: QuestionReview['status'] | 'all';
};

export const buildQuestionCards = (
  response: EvaluationQuestionsResponse,
): EvaluationQuestionCard[] => {
  const answers = new Map(
    response.answerKey.answers.map((answer) => [answer.questionId, answer]),
  );
  const reviews = new Map(
    response.reviews.reviews.map((review) => [review.questionId, review]),
  );
  return response.questions.questions.map((question) => {
    const answer = answers.get(question.id);
    const review = reviews.get(question.id);
    if (!answer || !review) {
      throw new Error(`incomplete question author data: ${question.id}`);
    }
    return { question, answer, review };
  });
};

export const summarizeQuestionReviews = (cards: EvaluationQuestionCard[]) => ({
  total: cards.length,
  kpis: {
    past_memory_restoration: cards.filter(
      (card) => card.question.kpi === 'past_memory_restoration',
    ).length,
    github_holdout: cards.filter(
      (card) => card.question.kpi === 'github_holdout',
    ).length,
    hypothetical_scenario: cards.filter(
      (card) => card.question.kpi === 'hypothetical_scenario',
    ).length,
  },
  statuses: {
    approved: cards.filter((card) => card.review.status === 'approved').length,
    revision_required: cards.filter(
      (card) => card.review.status === 'revision_required',
    ).length,
    unreviewed: cards.filter((card) => card.review.status === 'unreviewed').length,
  },
});

export const filterQuestionCards = (
  cards: EvaluationQuestionCard[],
  filters: QuestionFilters,
) =>
  cards.filter(
    (card) =>
      (filters.kpi === 'all' || card.question.kpi === filters.kpi) &&
      (filters.status === 'all' || card.review.status === filters.status),
  );

export const summarizeRun = (run: EvaluationRun) => {
  const started = new Date(run.startedAt).getTime();
  const ended = run.completedAt ? new Date(run.completedAt).getTime() : null;
  return {
    completedQuestions: run.answers.filter((answer) => answer.status === 'complete').length,
    failedQuestions: run.answers.filter((answer) => answer.status === 'failed').length,
    pastMemory: run.scores.pastMemory,
    githubHoldout: run.scores.githubHoldout,
    subjective: run.scores.subjective,
    elapsedMs: ended === null ? null : Math.max(0, ended - started),
    comparisonReady: run.status === 'complete',
  };
};

export type EvaluationComparisonSide = {
  provider: EvaluationRun['provider'];
  model: string;
  answer: EvaluationRunAnswer;
};

export type EvaluationComparisonRow = {
  questionId: string;
  left: EvaluationComparisonSide;
  right: EvaluationComparisonSide;
};

export const compareEvaluationRuns = (
  left: EvaluationRun,
  right: EvaluationRun,
): EvaluationComparisonRow[] => {
  if (left.status !== 'complete' || right.status !== 'complete') {
    throw new Error('only complete evaluation runs can be compared');
  }
  if (left.questionSetVersion !== right.questionSetVersion) {
    throw new Error('evaluation runs must use the same question-set version');
  }
  const rightAnswers = new Map(
    right.answers.map((answer) => [answer.questionId, answer]),
  );
  const rows = left.answers.map((answer) => {
    const other = rightAnswers.get(answer.questionId);
    if (!other) throw new Error(`comparison answer missing: ${answer.questionId}`);
    return {
      questionId: answer.questionId,
      left: { provider: left.provider, model: left.model, answer },
      right: { provider: right.provider, model: right.model, answer: other },
    };
  });
  if (rows.length !== 15 || right.answers.length !== 15) {
    throw new Error('complete comparison runs must contain 15 answers');
  }
  return rows;
};
