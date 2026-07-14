import type {
  EvaluationAnswerKeyFile,
  EvaluationQuestionFile,
} from '../../shared/amyHoodEvaluation';

const obviousShortcut = /모든|무조건|영구적으로|한도를 두지 않고|전액을 한 분기에/;

export const assertQuestionDifficulty = (
  questions: EvaluationQuestionFile,
  answerKey: EvaluationAnswerKeyFile,
) => {
  const multipleChoice = questions.questions.filter(
    (question) => question.type === 'multiple_choice',
  );
  const keys = new Map(
    answerKey.answers.map((answer) => [answer.questionId, answer]),
  );
  const positions = new Map<number, number>([
    [1, 0],
    [2, 0],
    [3, 0],
    [4, 0],
  ]);
  let uniqueLongestCorrect = 0;

  for (const question of multipleChoice) {
    const answer = keys.get(question.id)!;
    const correctIndex = answer.correctChoice! - 1;
    const lengths = question.options!.map((option) => [...option].length);
    const distractorLengths = lengths.filter((_, index) => index !== correctIndex);
    const distractorMean =
      distractorLengths.reduce((sum, value) => sum + value, 0) /
      distractorLengths.length;
    const deviation =
      Math.abs(lengths[correctIndex] - distractorMean) / distractorMean;
    if (deviation > 0.1) {
      throw new Error(`${question.id} correct option length leaks the answer`);
    }
    if (
      lengths[correctIndex] === Math.max(...lengths) &&
      lengths.filter((value) => value === lengths[correctIndex]).length === 1
    ) {
      uniqueLongestCorrect += 1;
    }
    if (question.options!.some((option) => obviousShortcut.test(option))) {
      throw new Error(
        `${question.id} contains an obvious absolute-choice shortcut`,
      );
    }
    positions.set(
      answer.correctChoice!,
      positions.get(answer.correctChoice!)! + 1,
    );
  }

  if (uniqueLongestCorrect > 3) {
    throw new Error('too many uniquely longest correct options');
  }
  for (const [position, count] of positions) {
    if (count < 2 || count > 4) {
      throw new Error(`answer position ${position} count must be from 2 to 4`);
    }
  }
};
