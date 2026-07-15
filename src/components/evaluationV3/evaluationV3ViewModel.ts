import {
  EVALUATION_V3_ARMS,
  type EvaluationV3Answer,
  type EvaluationV3Arm,
  type EvaluationV3Category,
  type EvaluationV3ExperimentReport,
  type EvaluationV3Question,
  type EvaluationV3Review,
  type EvaluationV3Run,
} from '../../../shared/amyHoodEvaluationV3';
import type { EvaluationV3QuestionsResponse } from '../../services/evaluationApi';

export type EvaluationVersion = 'v2' | 'v3';

export type EvaluationV3QuestionCard = {
  question: EvaluationV3Question;
  answer: EvaluationV3Answer;
  review: EvaluationV3Review;
};

export const EVALUATION_V3_ARM_LABELS: Record<EvaluationV3Arm, string> = {
  generic_cfo: '일반 CFO',
  amy_prompt: 'Amy Main Prompt',
  amy_policy_rag: 'Amy 정책 RAG',
  amy_full_rag: 'Amy 전체 RAG',
};

export const EVALUATION_V3_LIFT_LABELS = {
  amyPromptLift: 'Amy Prompt vs 일반 CFO',
  policyRagLift: '정책 RAG vs Amy Prompt',
  fullRagLift: '전체 RAG vs 정책 RAG',
  fullVsGenericLift: '전체 RAG vs 일반 CFO',
} as const;

export const buildEvaluationV3QuestionCards = (
  response: Pick<EvaluationV3QuestionsResponse, 'questions' | 'answerKey' | 'reviews'>,
): EvaluationV3QuestionCard[] => {
  const answerById = new Map(response.answerKey.answers.map((answer) => [answer.questionId, answer]));
  const reviewById = new Map(response.reviews.reviews.map((review) => [review.questionId, review]));
  return response.questions.questions.map((question) => {
    const answer = answerById.get(question.id);
    if (!answer) throw new Error(`missing answer record: ${question.id}`);
    const review = reviewById.get(question.id);
    if (!review) throw new Error(`missing review record: ${question.id}`);
    return { question, answer, review };
  });
};

export const summarizeEvaluationV3Questions = (cards: EvaluationV3QuestionCard[]) => ({
  total: cards.length,
  categories: {
    D: cards.filter(({ question }) => question.id.startsWith('D')).length,
    H: cards.filter(({ question }) => question.id.startsWith('H')).length,
    C: cards.filter(({ question }) => question.id.startsWith('C')).length,
    T: cards.filter(({ question }) => question.id.startsWith('T')).length,
  },
  statuses: {
    unreviewed: cards.filter(({ review }) => review.status === 'unreviewed').length,
    approved: cards.filter(({ review }) => review.status === 'approved').length,
    revision_required: cards.filter(({ review }) => review.status === 'revision_required').length,
  },
  allApproved: cards.length === 30
    && cards.every(({ review }) => review.status === 'approved'),
});

export const filterEvaluationV3QuestionCards = (
  cards: EvaluationV3QuestionCard[],
  filters: {
    category: EvaluationV3Category | 'all';
    status: EvaluationV3Review['status'] | 'all';
  },
) => cards.filter(({ question, review }) =>
  (filters.category === 'all' || question.category === filters.category)
  && (filters.status === 'all' || review.status === filters.status));

export const buildEvaluationV3ReportView = (
  report: EvaluationV3ExperimentReport,
  runs: EvaluationV3Run[],
) => {
  if (runs.some(({ version }) => version !== '3.0.0')) {
    throw new Error('mixed Evaluation versions are not supported');
  }
  if (runs.some(({ experimentGroupId }) =>
    experimentGroupId !== report.experimentGroupId)) {
    throw new Error('mixed Evaluation experiment groups are not supported');
  }
  return {
    experimentGroupId: report.experimentGroupId,
    benchmarkRejected: report.benchmarkRejected,
    allComplete: runs.length > 0 && runs.every(({ status }) => status === 'complete'),
    armCards: EVALUATION_V3_ARMS.map((arm) => ({
      arm,
      label: EVALUATION_V3_ARM_LABELS[arm],
      ...report.armAggregates[arm],
    })),
    repetitions: report.repetitions,
    liftLabels: EVALUATION_V3_LIFT_LABELS,
    exposureWarnings: report.warnings.filter((warning) =>
      warning.includes('known_prior_exposure')),
    warnings: report.warnings,
    diagnostics: report.diagnostics,
  };
};
