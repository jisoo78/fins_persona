import type { AmyHoodRenderedContext } from '../../shared/amyHoodRag';
import type { EvaluationV6Arm, EvaluationV6Scenario } from '../../shared/amyHoodEvaluationV6';

export const buildEvaluationV6Input = (
  systemPrompt: string,
  scenario: EvaluationV6Scenario,
  context: AmyHoodRenderedContext | null,
  arm: EvaluationV6Arm,
) => {
  const rag = arm !== 'amy_prompt';
  if (!rag && context) throw new Error('Evaluation v6 no-RAG arm must not receive context');
  if (rag && !context) throw new Error('Evaluation v6 RAG arm requires dynamic context');
  const expectedProjection = arm === 'amy_policy_rag' ? 'policy' : 'full';
  if (context && context.projection !== expectedProjection) {
    throw new Error('Evaluation v6 RAG projection does not match arm');
  }
  return {
    system: systemPrompt,
    user: [
      context?.text,
      `Scenario title: ${scenario.title}`,
      `Situation: ${scenario.situation}`,
      `Decision question: ${scenario.decisionQuestion}`,
      [
        'Return one JSON object only with exactly these public fields:',
        '{"action":"...","priorities":["...","...","..."],"guardrails":["..."],"reversalSignals":["..."],"rationale":"..."}',
        'Do not cite memory IDs or infer the historical executive, company, product, date, or source event.',
      ].join('\n'),
    ].filter(Boolean).join('\n\n'),
  };
};
