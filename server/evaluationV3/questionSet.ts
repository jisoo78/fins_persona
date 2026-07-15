import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type {
  EvaluationV3AnswerKeyFile,
  EvaluationV3QuestionFile,
  EvaluationV3Review,
  EvaluationV3ReviewFile,
} from '../../shared/amyHoodEvaluationV3';
import { assertEvaluationV3QuestionQuality } from './questionQuality';

const paths = (root: string) => ({
  questions: resolve(root, 'evaluation/v3/public/questions.json'),
  answerKey: resolve(root, 'evaluation/v3/sealed/answer-key.json'),
  reviews: resolve(root, 'evaluation/v3/public/reviews.json'),
});

const readJson = async <T>(filePath: string): Promise<T> =>
  JSON.parse(await readFile(filePath, 'utf8')) as T;

const writeJsonAtomic = async (filePath: string, value: unknown) => {
  await mkdir(resolve(filePath, '..'), { recursive: true });
  const temporary = `${filePath}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await rename(temporary, filePath);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
};

const expectedIds = [
  ...Array.from({ length: 10 }, (_, index) => `D${String(index + 1).padStart(2, '0')}`),
  ...Array.from({ length: 10 }, (_, index) => `H${String(index + 1).padStart(2, '0')}`),
  'C01A', 'C01B', 'C02A', 'C02B', 'C03A', 'C03B',
  'T01', 'T02', 'T03', 'T04',
];

export const assertEvaluationV3Bundle = (
  questions: EvaluationV3QuestionFile,
  answerKey: EvaluationV3AnswerKeyFile,
) => {
  if (questions.dataset !== 'amy_hood_decision_advisor_evaluation'
    || answerKey.dataset !== 'amy_hood_decision_advisor_evaluation_answer_key'
    || questions.version !== '3.0.0'
    || answerKey.version !== questions.version) {
    throw new Error('invalid evaluation v3 bundle identity');
  }
  const questionIds = questions.questions.map(({ id }) => id);
  const answerIds = answerKey.answers.map(({ questionId }) => questionId);
  if (new Set(questionIds).size !== questionIds.length || new Set(answerIds).size !== answerIds.length) {
    throw new Error('evaluation v3 IDs must be unique');
  }
  if (questionIds.join('\n') !== expectedIds.join('\n')
    || answerIds.join('\n') !== expectedIds.join('\n')) {
    throw new Error('evaluation v3 question and answer IDs must match D10/H10/C6/T4 exactly');
  }
  const counts = {
    D: questionIds.filter((id) => id.startsWith('D')).length,
    H: questionIds.filter((id) => id.startsWith('H')).length,
    C: questionIds.filter((id) => id.startsWith('C')).length,
    T: questionIds.filter((id) => id.startsWith('T')).length,
  };
  if (counts.D !== 10 || counts.H !== 10 || counts.C !== 6 || counts.T !== 4) {
    throw new Error('evaluation v3 requires D10/H10/C6/T4');
  }
  const pairs = new Map<string, Array<{ id: string; variant?: string }>>();
  for (const question of questions.questions.filter(({ id }) => id.startsWith('C'))) {
    const members = pairs.get(question.pairId ?? '') ?? [];
    members.push({ id: question.id, variant: question.pairVariant });
    pairs.set(question.pairId ?? '', members);
  }
  for (const pairId of ['C01', 'C02', 'C03']) {
    const members = pairs.get(pairId) ?? [];
    if (members.length !== 2 || members.map(({ variant }) => variant).sort().join('') !== 'ab') {
      throw new Error(`invalid counterfactual pair: ${pairId}`);
    }
    const behaviors = answerKey.answers
      .filter(({ questionId }) => members.some(({ id }) => id === questionId))
      .map(({ expectedPairBehavior }) => expectedPairBehavior);
    if (behaviors.length !== 2 || behaviors.some((value) => value !== 'reverse' && value !== 'stable')) {
      throw new Error(`counterfactual pair ${pairId} requires expected behavior`);
    }
  }
  assertEvaluationV3QuestionQuality(questions, answerKey);
};

export const loadEvaluationV3Bundle = async (root: string) => {
  const location = paths(root);
  const [questions, answerKey] = await Promise.all([
    readJson<EvaluationV3QuestionFile>(location.questions),
    readJson<EvaluationV3AnswerKeyFile>(location.answerKey),
  ]);
  assertEvaluationV3Bundle(questions, answerKey);
  return { questions, answerKey };
};

export const loadEvaluationV3Reviews = async (root: string): Promise<EvaluationV3ReviewFile> => {
  const bundle = await loadEvaluationV3Bundle(root);
  const reviews = await readJson<EvaluationV3ReviewFile>(paths(root).reviews);
  const expected = bundle.questions.questions.map(({ id }) => id);
  if (reviews.questionSetVersion !== '3.0.0'
    || reviews.reviews.map(({ questionId }) => questionId).join('\n') !== expected.join('\n')) {
    throw new Error('evaluation v3 review IDs must match questions exactly');
  }
  return reviews;
};

export const saveEvaluationV3Review = async (
  root: string,
  questionId: string,
  input: Pick<EvaluationV3Review, 'status' | 'revisionNote'>,
) => {
  const reviews = await loadEvaluationV3Reviews(root);
  if (!reviews.reviews.some((review) => review.questionId === questionId)) {
    throw new Error(`unknown evaluation v3 question: ${questionId}`);
  }
  if (!['unreviewed', 'approved', 'revision_required'].includes(input.status)) {
    throw new Error(`invalid evaluation v3 review status: ${input.status}`);
  }
  if (input.status === 'revision_required' && !input.revisionNote.trim()) {
    throw new Error('evaluation v3 revision note is required');
  }
  const next: EvaluationV3ReviewFile = {
    ...reviews,
    reviews: reviews.reviews.map((review) => review.questionId === questionId
      ? {
          ...review,
          status: input.status,
          revisionNote: input.revisionNote.trim(),
          reviewedAt: new Date().toISOString(),
        }
      : review),
  };
  await writeJsonAtomic(paths(root).reviews, next);
  return next;
};
