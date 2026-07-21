import { resolveEvaluationV4RagPin, type EvaluationV4RagPin } from '../evaluationV4/context';

export type EvaluationV6RagPin = EvaluationV4RagPin;

export const resolveEvaluationV6RagPin = (root: string) => resolveEvaluationV4RagPin(root);
