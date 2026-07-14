import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type {
  EvaluationAnswerKeyFile,
  EvaluationBundle,
  EvaluationKpi,
  EvaluationQuestionFile,
  QuestionReview,
  QuestionReviewFile,
} from '../../shared/amyHoodEvaluation';
import { assertQuestionDifficulty } from './questionQuality';

const questionsPath = (root: string) =>
  resolve(root, 'evaluation/amy_hood_eval_questions.json');
const answerKeyPath = (root: string) =>
  resolve(root, 'evaluation/amy_hood_eval_answer_key.json');
const reviewPath = (root: string) =>
  resolve(root, 'evaluation/amy_hood_eval_question_reviews.json');

const readJson = async <T>(path: string): Promise<T> =>
  JSON.parse(await readFile(path, 'utf8')) as T;

const atomicWrite = async (path: string, text: string) => {
  await mkdir(resolve(path, '..'), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, text, 'utf8');
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
};

const expectedKpiCounts: Record<EvaluationKpi, number> = {
  past_memory_restoration: 7,
  github_holdout: 5,
  hypothetical_scenario: 3,
};

const assertUnique = (ids: string[], label: string) => {
  if (new Set(ids).size !== ids.length) {
    throw new Error(`${label} IDs must be unique`);
  }
};

export const assertEvaluationBundle = (
  questions: EvaluationQuestionFile,
  answerKey: EvaluationAnswerKeyFile,
) => {
  if (questions.dataset !== 'amy_hood_blind_evaluation') {
    throw new Error('invalid evaluation question dataset');
  }
  if (answerKey.dataset !== 'amy_hood_blind_evaluation_answer_key') {
    throw new Error('invalid evaluation answer-key dataset');
  }
  if (questions.version !== answerKey.version) {
    throw new Error('question and answer-key versions must match');
  }
  if (questions.questions.length !== 15) {
    throw new Error(`expected 15 evaluation questions, got ${questions.questions.length}`);
  }

  const questionIds = questions.questions.map((question) => question.id);
  const answerIds = answerKey.answers.map((answer) => answer.questionId);
  assertUnique(questionIds, 'question');
  assertUnique(answerIds, 'answer');
  if (questionIds.join('\n') !== answerIds.join('\n')) {
    throw new Error('question and answer IDs must match exactly and in order');
  }

  for (const [kpi, count] of Object.entries(expectedKpiCounts)) {
    const actual = questions.questions.filter((question) => question.kpi === kpi).length;
    if (actual !== count) throw new Error(`expected ${count} ${kpi} questions, got ${actual}`);
  }

  questions.questions.forEach((question, index) => {
    const answer = answerKey.answers[index];
    if (!question.id.trim() || !question.prompt.trim()) {
      throw new Error(`question ${index + 1} is missing id or prompt`);
    }
    if (question.type === 'multiple_choice') {
      if (!Array.isArray(question.options) || question.options.length !== 4) {
        throw new Error(`${question.id} must have exactly four options`);
      }
      if (question.options.some((option) => !option.trim())) {
        throw new Error(`${question.id} has an empty option`);
      }
      if (![1, 2, 3, 4].includes(answer.correctChoice ?? 0)) {
        throw new Error(`${question.id} must have a correct choice from 1 to 4`);
      }
      if (!answer.correctIntent?.trim() || !answer.trapIntents) {
        throw new Error(`${question.id} is missing answer intentions`);
      }
      if (answer.rubric) throw new Error(`${question.id} must not have a subjective rubric`);
      return;
    }

    if (question.options || answer.correctChoice || answer.trapIntents) {
      throw new Error(`${question.id} subjective question must not contain choices`);
    }
    if (!answer.rubric) throw new Error(`${question.id} is missing a subjective rubric`);
  });
  assertQuestionDifficulty(questions, answerKey);
};

export const loadEvaluationBundle = async (root: string): Promise<EvaluationBundle> => {
  const questions = await readJson<EvaluationQuestionFile>(questionsPath(root));
  const answerKey = await readJson<EvaluationAnswerKeyFile>(answerKeyPath(root));
  assertEvaluationBundle(questions, answerKey);
  return { questions, answerKey };
};

export const loadQuestionReview = async (root: string): Promise<QuestionReviewFile> => {
  const bundle = await loadEvaluationBundle(root);
  const review = await readJson<QuestionReviewFile>(reviewPath(root));
  if (review.questionSetVersion !== bundle.questions.version) {
    throw new Error('review and question-set versions must match');
  }
  const expectedIds = bundle.questions.questions.map((question) => question.id);
  const reviewIds = review.reviews.map((item) => item.questionId);
  if (expectedIds.join('\n') !== reviewIds.join('\n')) {
    throw new Error('question and review IDs must match exactly and in order');
  }
  return review;
};

export const saveQuestionReview = async (
  root: string,
  questionId: string,
  input: Pick<QuestionReview, 'status' | 'revisionNote'>,
): Promise<QuestionReviewFile> => {
  const bundle = await loadEvaluationBundle(root);
  const review = await loadQuestionReview(root);
  if (!bundle.questions.questions.some((question) => question.id === questionId)) {
    throw new Error(`unknown evaluation question: ${questionId}`);
  }
  if (!['unreviewed', 'approved', 'revision_required'].includes(input.status)) {
    throw new Error(`invalid review status: ${input.status}`);
  }
  if (input.status === 'revision_required' && !input.revisionNote.trim()) {
    throw new Error('revision note is required');
  }

  const reviews = review.reviews.map((item) =>
    item.questionId === questionId
      ? {
          ...item,
          status: input.status,
          revisionNote: input.revisionNote.trim(),
          reviewedAt: new Date().toISOString(),
        }
      : item,
  );
  const next = { questionSetVersion: review.questionSetVersion, reviews };
  await atomicWrite(reviewPath(root), `${JSON.stringify(next, null, 2)}\n`);
  return next;
};
