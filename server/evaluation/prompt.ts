import type { EvaluationQuestion } from '../../shared/amyHoodEvaluation';
import type { SourceChunk } from '../personaPipeline/types';

export type ParsedEvaluationResponse =
  | { choice: 1 | 2 | 3 | 4; reason: string }
  | { text: string };

export const buildEvaluationPrompt = (
  persona: string,
  question: EvaluationQuestion,
  chunks: SourceChunk[],
) => {
  if (question.kpi === 'past_memory_restoration' && chunks.length !== 1) {
    throw new Error(`${question.id} requires exactly one RAG evidence chunk`);
  }
  const evidence =
    question.kpi === 'past_memory_restoration'
      ? `\n\n[RAG EVIDENCE]\n${chunks[0].text}`
      : '';
  const task =
    question.type === 'multiple_choice'
      ? `${question.options!
          .map((option, index) => `${index + 1}. ${option}`)
          .join('\n')}\n\nJSON만 출력하세요: {"choice":1,"reason":"1~2문장 이유"}`
      : 'Amy Hood의 1인칭으로 5~8문장 안에서 결정, 조건, 상충관계와 위험을 직접 설명하세요.';
  return `[SYSTEM PERSONA]\n${persona}${evidence}\n\n[QUESTION]\n${question.prompt}\n\n${task}`;
};

const stripFence = (text: string) =>
  text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

export const parseEvaluationResponse = (
  question: EvaluationQuestion,
  response: string,
): ParsedEvaluationResponse => {
  const normalized = stripFence(response);
  if (!normalized) throw new Error('model returned an empty evaluation response');
  if (question.type === 'subjective') return { text: normalized };

  const jsonText = normalized.match(/\{[\s\S]*\}/)?.[0];
  if (!jsonText) throw new Error('multiple-choice response must contain JSON');
  let payload: { choice?: unknown; reason?: unknown };
  try {
    payload = JSON.parse(jsonText) as { choice?: unknown; reason?: unknown };
  } catch {
    throw new Error('multiple-choice response contains invalid JSON');
  }
  if (!Number.isInteger(payload.choice) || ![1, 2, 3, 4].includes(payload.choice as number)) {
    throw new Error('multiple-choice response choice must be an integer from 1 to 4');
  }
  if (typeof payload.reason !== 'string' || !payload.reason.trim()) {
    throw new Error('multiple-choice response reason is required');
  }
  return {
    choice: payload.choice as 1 | 2 | 3 | 4,
    reason: payload.reason.trim(),
  };
};
