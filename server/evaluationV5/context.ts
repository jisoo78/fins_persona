import { resolveEvaluationV4RagPin, type EvaluationV4RagPin } from '../evaluationV4/context';

export type EvaluationV5RagPin = EvaluationV4RagPin;

export const resolveEvaluationV5RagPin = (root: string) => resolveEvaluationV4RagPin(root);
