import {
  EVALUATION_V3_ARMS,
  EVALUATION_V3_REPETITIONS,
  type EvaluationV3Arm,
} from '../../shared/amyHoodDecisionAdvisor';

export const createEvaluationV3ExperimentPlan = (): Array<{
  arm: EvaluationV3Arm;
  repetition: number;
}> =>
  EVALUATION_V3_ARMS.flatMap((arm) =>
    Array.from({ length: EVALUATION_V3_REPETITIONS }, (_, index) => ({
      arm,
      repetition: index + 1,
    })),
  );
