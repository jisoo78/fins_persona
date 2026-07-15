import type {
  EvaluationAnswerKeyFile,
  EvaluationExperimentLaunch,
  EvaluationProvider,
  EvaluationQuestionFile,
  EvaluationRun,
  QuestionReview,
  QuestionReviewFile,
  SubjectiveGrade,
} from '../../shared/amyHoodEvaluation';
import type {
  EvaluationV3AnswerKeyFile,
  EvaluationV3ExperimentLaunch,
  EvaluationV3ExperimentReport,
  EvaluationV3QuestionFile,
  EvaluationV3Repetitions,
  EvaluationV3Review,
  EvaluationV3ReviewFile,
  EvaluationV3Run,
} from '../../shared/amyHoodEvaluationV3';

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
  let response: Response;
  try {
    response = await fetchImpl(input, init);
  } catch (error) {
    throw new Error(
      `API request failed: ${error instanceof Error ? error.message : 'network unavailable'}`,
    );
  }
  const text = await response.text();
  if (!text) {
    throw new Error(`API request failed with ${response.status} and an empty response`);
  }
  let payload: T & { message?: string };
  try {
    payload = JSON.parse(text) as T & { message?: string };
  } catch {
    throw new Error(`API request failed with ${response.status}: ${text.slice(0, 200)}`);
  }
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

export const listEvaluationRuns = (fetchImpl: typeof fetch = fetch) =>
  request<{ ok: true; runs: EvaluationRun[] }>(
    '/api/evaluation/runs',
    {},
    fetchImpl,
  );

export const getEvaluationRun = (
  runId: string,
  fetchImpl: typeof fetch = fetch,
) =>
  request<{ ok: true; run: EvaluationRun }>(
    `/api/evaluation/runs/${runId}`,
    {},
    fetchImpl,
  );

export const createEvaluationRun = (
  provider: EvaluationProvider,
  fetchImpl: typeof fetch = fetch,
) =>
  request<{ ok: true; run: EvaluationRun }>(
    '/api/evaluation/runs',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ provider }),
    },
    fetchImpl,
  );

export const createEvaluationExperiment = (fetchImpl: typeof fetch = fetch) =>
  request<{ ok: true } & EvaluationExperimentLaunch>(
    '/api/evaluation/experiments',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ provider: 'local' }),
    },
    fetchImpl,
  );

export const resumeEvaluationRun = (
  runId: string,
  fetchImpl: typeof fetch = fetch,
) =>
  request<{ ok: true; run: EvaluationRun }>(
    `/api/evaluation/runs/${runId}/resume`,
    { method: 'POST' },
    fetchImpl,
  );

const assertGradeTotal = (grade: SubjectiveGrade) => {
  const total =
    grade.decision +
    grade.reasoning +
    grade.tradeoff +
    grade.personaConsistency;
  if (grade.score !== total) {
    throw new Error(`grade total does not match dimensions: ${grade.questionId}`);
  }
};

export const submitSubjectiveGrades = async (
  runId: string,
  grades: SubjectiveGrade[],
  fetchImpl: typeof fetch = fetch,
) => {
  grades.forEach(assertGradeTotal);
  return request<{ ok: true; run: EvaluationRun }>(
    `/api/evaluation/runs/${runId}/subjective-grades`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ grades }),
    },
    fetchImpl,
  );
};

export type EvaluationV3QuestionsResponse = {
  ok: true;
  questions: EvaluationV3QuestionFile;
  answerKey: EvaluationV3AnswerKeyFile;
  reviews: EvaluationV3ReviewFile;
  readiness: {
    allApproved: boolean;
    structuredMemoryAvailable: boolean;
  };
};

export const fetchEvaluationV3Questions = (fetchImpl: typeof fetch = fetch) =>
  request<EvaluationV3QuestionsResponse>(
    '/api/evaluation/v3/questions',
    {},
    fetchImpl,
  );

export const saveEvaluationV3QuestionReview = (
  questionId: string,
  input: Pick<EvaluationV3Review, 'status' | 'revisionNote'>,
  fetchImpl: typeof fetch = fetch,
) => request<{ ok: true; reviews: EvaluationV3ReviewFile }>(
  `/api/evaluation/v3/questions/${questionId}/review`,
  {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  },
  fetchImpl,
);

export const listEvaluationV3Runs = (fetchImpl: typeof fetch = fetch) =>
  request<{ ok: true; runs: EvaluationV3Run[] }>(
    '/api/evaluation/v3/runs',
    {},
    fetchImpl,
  );

export const getEvaluationV3Run = (
  runId: string,
  fetchImpl: typeof fetch = fetch,
) => request<{ ok: true; run: EvaluationV3Run }>(
  `/api/evaluation/v3/runs/${runId}`,
  {},
  fetchImpl,
);

export const createEvaluationV3Experiment = (
  repetitions: EvaluationV3Repetitions,
  fetchImpl: typeof fetch = fetch,
) => request<{ ok: true } & EvaluationV3ExperimentLaunch>(
  '/api/evaluation/v3/experiments',
  {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ provider: 'local', repetitions }),
  },
  fetchImpl,
);

export const resumeEvaluationV3Run = (
  runId: string,
  fetchImpl: typeof fetch = fetch,
) => request<{ ok: true; run: EvaluationV3Run }>(
  `/api/evaluation/v3/runs/${runId}/resume`,
  { method: 'POST' },
  fetchImpl,
);

export const fetchEvaluationV3Report = (
  groupId: string,
  fetchImpl: typeof fetch = fetch,
) => request<{ ok: true; report: EvaluationV3ExperimentReport }>(
  `/api/evaluation/v3/reports/${groupId}`,
  {},
  fetchImpl,
);
