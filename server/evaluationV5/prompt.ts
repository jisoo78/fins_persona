import type { AmyHoodRenderedContext } from '../../shared/amyHoodRag';
import type { EvaluationV5Arm, EvaluationV5Scenario } from '../../shared/amyHoodEvaluationV5';

export const buildEvaluationV5Input = (
  systemPrompt: string,
  scenario: EvaluationV5Scenario,
  context: AmyHoodRenderedContext | null,
  arm: EvaluationV5Arm,
) => {
  const rag = arm === 'amy_policy_rag' || arm === 'amy_full_rag';
  if (!rag && context) throw new Error('Evaluation v5 no-RAG arm must not receive context');
  if (rag && !context) throw new Error('Evaluation v5 RAG arm requires dynamic context');
  const expectedProjection = arm === 'amy_policy_rag' ? 'policy' : 'full';
  if (context && context.projection !== expectedProjection) {
    throw new Error('Evaluation v5 RAG projection does not match arm');
  }
  const publicScenario = [
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
        'Answer as the requested CFO advisor. Do not cite memory IDs or infer the historical company, executive, product, date, or source event.',
      ].join('\n'),
    ].filter(Boolean).join('\n\n'),
  };
};
