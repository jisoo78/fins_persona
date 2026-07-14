import type {
  EvaluationExperimentArm,
  EvaluationQuestion,
} from '../../shared/amyHoodEvaluation';
import type { SourceChunk } from '../personaPipeline/types';

export type ParsedEvaluationResponse =
  | { choice: 1 | 2 | 3 | 4; reason: string }
  | { text: string };

const evidenceText = (chunk: SourceChunk) => [
  '[RAG EVIDENCE]',
  `source_id: ${chunk.sourceId}`,
  `chunk_id: ${chunk.chunkId}`,
  `chunk_index: ${chunk.index}`,
  `block_ids: ${JSON.stringify(chunk.blockIds)}`,
  '',
  chunk.text,
].join('\n');

export const buildEvaluationInput = (
  systemPrompt: string,
  question: EvaluationQuestion,
  chunks: SourceChunk[],
  arm: EvaluationExperimentArm,
): { system: string; user: string } => {
  const expectsEvidence =
    arm === 'persona_rag' && question.kpi === 'past_memory_restoration';
  if (expectsEvidence && chunks.length !== 1) {
    throw new Error(`${question.id} requires exactly one RAG evidence chunk`);
  }
  if (!expectsEvidence && chunks.length !== 0) {
    throw new Error(`${arm} must not receive RAG evidence for ${question.id}`);
  }
  const task =
    question.type === 'multiple_choice'
      ? `${question.options!
          .map((option, index) => `${index + 1}. ${option}`)
          .join('\n')}\n\nJSON만 출력하세요: {"choice":1,"reason":"1~2문장 이유"}`
      : 'CFO 자문가의 1인칭으로 5~8문장 안에서 결정, 조건, 상충관계와 위험을 직접 설명하세요.';
  return {
    system: systemPrompt,
    user: [
      expectsEvidence ? evidenceText(chunks[0]) : '',
      '[QUESTION]',
      question.prompt,
      '',
      task,
    ]
      .filter(Boolean)
      .join('\n\n'),
  };
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
