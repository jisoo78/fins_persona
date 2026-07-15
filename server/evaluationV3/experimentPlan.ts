import {
  EVALUATION_V3_ARMS,
  type EvaluationV3Arm,
  type EvaluationV3Repetitions,
} from '../../shared/amyHoodDecisionAdvisor';

export const createEvaluationV3ExperimentPlan = (
  repetitions: EvaluationV3Repetitions,
): Array<{
  arm: EvaluationV3Arm;
  repetition: number;
}> => {
  if (repetitions !== 1 && repetitions !== 5) {
    throw new Error('evaluation v3 repetitions must be 1 or 5');
  }
  return Array.from({ length: repetitions }, (_, index) => index + 1)
    .flatMap((repetition) => EVALUATION_V3_ARMS.map((arm) => ({ arm, repetition })));
};
