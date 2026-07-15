import type { DatasetSplit } from '../../shared/amyHoodDecisionAdvisor';
export {
  assertNoEvaluationV3Holdout,
  filterEvaluationV3TrainingReferences,
  loadEvaluationV3Holdout,
} from '../evaluationV3/holdout';
export type {
  EvaluationV3ArtifactReference,
  EvaluationV3HoldoutManifest,
  EvaluationV3LeakageScope,
} from '../evaluationV3/holdout';

export type LeakageScope = 'policy_build' | 'memory_release' | 'runtime_index' | 'evaluation';

export const assertAllowedSplits = (
  scope: LeakageScope,
  artifacts: Array<{ id: string; split: DatasetSplit }>,
) => {
  if (scope === 'evaluation') return;

  const leaked = artifacts.find((artifact) => artifact.split === 'holdout');
  if (leaked) throw new Error(`holdout artifact ${leaked.id} is forbidden in ${scope}`);
};
