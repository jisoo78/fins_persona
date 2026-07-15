import type {
  EvaluationV3AnswerKeyFile,
  EvaluationV3QuestionFile,
} from '../../shared/amyHoodEvaluationV3';

const forbiddenLabels = /(?:정답|오답|권장\s*답|correct\s*answer)/i;
const allowedMechanisms = new Set([
  'wrong_priority_order',
  'premature_application',
  'missing_boundary_condition',
  'short_term_financial_optics',
  'wrong_execution_sequence',
  'overgeneralized_rule',
  'miscalibrated_reversal_signal',
]);

export const assertEvaluationV3QuestionQuality = (
  questions: EvaluationV3QuestionFile,
  answerKey: EvaluationV3AnswerKeyFile,
) => {
  const positionCounts = new Map<number, number>([[1, 0], [2, 0], [3, 0], [4, 0]]);
  questions.questions.forEach((question, index) => {
    const answer = answerKey.answers[index];
    if (!Array.isArray(question.options) || question.options.length !== 4) {
      throw new Error(`${question.id} must have exactly four options`);
    }
    const options = question.options.map((option) => option.trim());
    if (options.some((option) => !option) || new Set(options).size !== 4) {
      throw new Error(`${question.id} options must be non-empty and unique`);
    }
    if (options.some((option) => forbiddenLabels.test(option))) {
      throw new Error(`${question.id} contains an answer label`);
    }
    const meanLength = options.reduce((sum, option) => sum + option.length, 0) / 4;
    if (options.some((option) => option.length < meanLength * 0.7 || option.length > meanLength * 1.3)) {
      throw new Error(`${question.id} options must have comparable specificity`);
    }
    if (![1, 2, 3, 4].includes(answer.correctChoice)) {
      throw new Error(`${question.id} correct choice must be 1 through 4`);
    }
    positionCounts.set(answer.correctChoice, (positionCounts.get(answer.correctChoice) ?? 0) + 1);
    if (!answer.correctIntent.trim()) throw new Error(`${question.id} correct intent is required`);
    for (const choice of [1, 2, 3, 4] as const) {
      const key = String(choice) as '1' | '2' | '3' | '4';
      if (!answer.trapIntents[key]?.trim()) {
        throw new Error(`${question.id} option ${choice} intent is required`);
      }
      if (choice !== answer.correctChoice && !allowedMechanisms.has(answer.trapMechanisms[key] ?? '')) {
        throw new Error(`${question.id} requires three valid trap mechanisms`);
      }
    }
  });
  for (const [position, count] of positionCounts) {
    if (count < 6 || count > 9) {
      throw new Error(`correct-choice position ${position} must occur 6 through 9 times, got ${count}`);
    }
  }
};
