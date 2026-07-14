import type {
  EvaluationAnswerKey,
  EvaluationKpi,
  EvaluationQuestion,
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
