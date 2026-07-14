import type { EvaluationV3Score } from '../../shared/amyHoodDecisionAdvisor';

const ceilings = {
  decisionSelection: 40,
  criteriaPriority: 20,
  conditionSensitivity: 15,
  evidenceFaithfulness: 15,
  actionability: 10,
} as const;

export const assertEvaluationV3Score = (score: EvaluationV3Score): void => {
  for (const [key, ceiling] of Object.entries(ceilings) as Array<[keyof typeof ceilings, number]>) {
    const value = score[key];
    if (!Number.isFinite(value) || value < 0 || value > ceiling) {
      throw new Error(`${key} must be between 0 and ${ceiling}`);
    }
  }
  const total = Object.keys(ceilings)
    .map((key) => score[key as keyof typeof ceilings])
    .reduce((sum, value) => sum + value, 0);
  if (score.total !== total) throw new Error(`evaluation v3 total must equal ${total}`);
};
