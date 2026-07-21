import { assertEvaluationV4PolicyCoverage, loadEvaluationV4PolicyCoverage } from './policyCoverage';
import { resolveEvaluationV3RagPin, type EvaluationV3RagPin } from '../evaluationV3/context';

export type EvaluationV4RagPin = EvaluationV3RagPin;

export const resolveEvaluationV4RagPin = async (root: string) => {
  const coverage = await loadEvaluationV4PolicyCoverage(root);
  assertEvaluationV4PolicyCoverage(coverage);
  return resolveEvaluationV3RagPin(root);
};
