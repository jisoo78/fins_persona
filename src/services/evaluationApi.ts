import type {
  EvaluationAnswerKeyFile,
  EvaluationQuestionFile,
  QuestionReview,
  QuestionReviewFile,
} from '../../shared/amyHoodEvaluation';

export type EvaluationQuestionsResponse = {
  ok: true;
  questions: EvaluationQuestionFile;
  answerKey: EvaluationAnswerKeyFile;
  reviews: QuestionReviewFile;
};

export const request = async <T>(
  input: RequestInfo | URL,
  init: RequestInit = {},
  fetchImpl: typeof fetch = fetch,
): Promise<T> => {
  const response = await fetchImpl(input, init);
  const payload = (await response.json()) as T & { message?: string };
  if (!response.ok) {
    throw new Error(payload.message ?? `request failed with ${response.status}`);
  }
  return payload;
};

export const fetchEvaluationQuestions = (fetchImpl: typeof fetch = fetch) =>
  request<EvaluationQuestionsResponse>(
    '/api/evaluation/questions',
    {},
    fetchImpl,
  );

export const saveEvaluationQuestionReview = (
  questionId: string,
  input: Pick<QuestionReview, 'status' | 'revisionNote'>,
  fetchImpl: typeof fetch = fetch,
) =>
  request<{ ok: true; reviews: QuestionReviewFile }>(
    `/api/evaluation/questions/${questionId}/review`,
    {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    },
    fetchImpl,
  );
