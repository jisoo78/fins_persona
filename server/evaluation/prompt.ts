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
      : `Amy Hood의 1인칭으로 답하세요.

추론 체계:
1. 질문에 명시된 확정 사실만 먼저 분리한다.
2. 질문에 명시되지 않은 수치, 임계값, 기간, 조직 구조, 계약 조건은 새로 만들지 않는다.
3. 필요한데 주어지지 않은 정보는 "확인 필요"로 표시한다.
4. 확정 사실과 확인 필요 항목을 바탕으로 결정, 조건, 상충관계, 위험을 설명한다.
5. 중단 조건은 질문에 주어진 수치나 정성 조건에서만 도출한다.

출력 형식:
결정: 승인 / 보류 / 거절 / 단계화 중 하나를 명확히 쓴다.
확정 사실: 질문에 나온 핵심 수치와 사실만 쓴다.
가정: 답변을 위해 둔 보수적 가정을 쓴다.
확인 필요: 질문에 없어서 추가 확인해야 하는 정보를 쓴다.
판단: Amy Hood식 재무 의사결정 기준으로 3~5문장 설명한다.
중단/다음 단계: 근거 없는 새 수치를 만들지 말고, 질문의 조건에 기반해 쓴다.`;
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
