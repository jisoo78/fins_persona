import type {
  EvaluationV6Grade,
  EvaluationV6JudgeAssessment,
} from '../../shared/amyHoodEvaluationV6';
import { assertEvaluationV6ComponentRating } from '../../shared/amyHoodEvaluationV6';

export const EVALUATION_V6_COMPONENT_WEIGHTS = {
  action: 0.20,
  priorityOrder: 0.25,
  boundaries: 0.20,
  reversal: 0.20,
  identitySpecificity: 0.15,
} as const;

export const EVALUATION_V6_SCORING_CONFIG = {
  weights: EVALUATION_V6_COMPONENT_WEIGHTS,
  genericCfoCeiling: 6,
  priorityMismatchCeiling: 7,
  missingBoundaryOrReversalCeiling: 6,
  identityConflictCeiling: 4,
  highScoreIdentityCeiling: 7,
} as const;

export const computeEvaluationV6IdentityScore = (
  assessment: EvaluationV6JudgeAssessment,
): Pick<EvaluationV6Grade, 'score' | 'uncappedScore' | 'ceilingApplied'> => {
  const components = Object.keys(EVALUATION_V6_COMPONENT_WEIGHTS) as Array<
    keyof typeof EVALUATION_V6_COMPONENT_WEIGHTS
  >;
  for (const component of components) {
    assertEvaluationV6ComponentRating(assessment.components[component]);
  }
  const weightedFraction = components.reduce(
    (sum, component) => sum
      + (assessment.components[component] / 4) * EVALUATION_V6_COMPONENT_WEIGHTS[component],
    0,
  );
  const uncappedScore = Math.round(1 + 9 * weightedFraction) as EvaluationV6Grade['uncappedScore'];
  const ceilings: Array<{ name: string; max: number }> = [];
  if (assessment.identityVerdict === 'generic_cfo') {
    ceilings.push({ name: 'generic_cfo_max_6', max: 6 });
  }
  if (assessment.components.action >= 3 && assessment.components.priorityOrder <= 1) {
    ceilings.push({ name: 'priority_mismatch_max_7', max: 7 });
  }
  if (assessment.components.boundaries <= 1 || assessment.components.reversal <= 1) {
    ceilings.push({ name: 'missing_boundary_or_reversal_max_6', max: 6 });
  }
  if (assessment.identityVerdict === 'amy_conflict') {
    ceilings.push({ name: 'identity_conflict_max_4', max: 4 });
  }
  const highScoreAnchors = assessment.components.action >= 3
    && assessment.components.priorityOrder >= 3
    && assessment.components.boundaries >= 3
    && assessment.components.reversal >= 3
    && assessment.components.identitySpecificity >= 3;
  if (!highScoreAnchors) {
    ceilings.push({ name: 'high_score_identity_requirements_max_7', max: 7 });
  }
  const ceiling = Math.min(10, ...ceilings.map(({ max }) => max));
  return {
    uncappedScore,
    score: Math.min(uncappedScore, ceiling) as EvaluationV6Grade['score'],
    ceilingApplied: ceilings.filter(({ max }) => max === ceiling).map(({ name }) => name),
  };
};
