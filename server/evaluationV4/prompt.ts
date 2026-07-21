import type { AmyHoodRenderedContext } from '../../shared/amyHoodRag';
import type {
  EvaluationV4Arm,
  EvaluationV4Scenario,
} from '../../shared/amyHoodEvaluationV4';

export const buildEvaluationV4Input = (
  systemPrompt: string,
  scenario: EvaluationV4Scenario,
  context: AmyHoodRenderedContext | null,
  arm: EvaluationV4Arm,
) => {
  const rag = arm === 'amy_policy_rag' || arm === 'amy_full_rag';
  if (!rag && context) throw new Error('Evaluation v4 no-RAG arm must not receive context');
  if (rag && !context) throw new Error('Evaluation v4 RAG arm requires dynamic context');
  const expectedProjection = arm === 'amy_policy_rag' ? 'policy' : 'full';
  if (context && context.projection !== expectedProjection) {
    throw new Error('Evaluation v4 RAG projection does not match arm');
  }
  const publicScenario = [
    `Scenario ID: ${scenario.id}`,
    `Title: ${scenario.title}`,
    `Situation: ${scenario.situation}`,
    `Decision question: ${scenario.decisionQuestion}`,
  ].join('\n');
  return {
    system: systemPrompt,
    user: [
      context?.text,
      publicScenario,
      [
        'Return one JSON object only with exactly these public fields:',
        '{"action":"...","priorities":["...","...","..."],"guardrails":["..."],"reversalSignals":["..."],"rationale":"..."}',
        'Answer as the requested CFO advisor. Do not cite hidden memory IDs or infer the historical source event.',
      ].join('\n'),
    ].filter(Boolean).join('\n\n'),
  };
};
