import type {
  EvaluationV3Arm,
  EvaluationV3Question,
} from '../../shared/amyHoodEvaluationV3';
import type { EvaluationV3ContextPackage } from './context';

export type EvaluationV3ModelInput = {
  system: string;
  user: string;
};

export type ParsedEvaluationV3Response = {
  choice: 1 | 2 | 3 | 4;
  reason: string;
};

const publicQuestionFields = new Set([
  'id',
  'category',
  'type',
  'domain',
  'pairId',
  'pairVariant',
  'requiredSplit',
  'prompt',
  'options',
]);

const assertPublicQuestion = (question: EvaluationV3Question) => {
  const unknown = Object.keys(question).find((field) => !publicQuestionFields.has(field));
  if (unknown) throw new Error(`unknown public question field: ${unknown}`);
  if (!question.id || !question.prompt || question.type !== 'multiple_choice'
    || !Array.isArray(question.options) || question.options.length !== 4) {
    throw new Error('invalid public Evaluation v3 question');
  }
};

const contextIsEmpty = (context: EvaluationV3ContextPackage) =>
  context.memoryReleaseId === null
  && context.policy.length === 0
  && context.reflections.length === 0
  && context.events.length === 0
  && context.counterexamples.length === 0;

const assertArmContext = (
  arm: EvaluationV3Arm,
  context: EvaluationV3ContextPackage,
) => {
  if (arm === 'generic_cfo' || arm === 'amy_prompt') {
    if (!contextIsEmpty(context)) throw new Error(`${arm} context must be empty`);
    return;
  }
  if (!context.memoryReleaseId || context.policy.length === 0) {
    throw new Error(`${arm} requires an active policy memory release`);
  }
  if (arm === 'amy_policy_rag') {
    if (context.reflections.length || context.events.length || context.counterexamples.length) {
      throw new Error('amy_policy_rag permits policy context only');
    }
    return;
  }
  if (context.reflections.length === 0 || context.events.length === 0) {
    throw new Error('amy_full_rag requires policy, reflection, and event context');
  }
};

const contextBlock = (context: EvaluationV3ContextPackage) => {
  if (contextIsEmpty(context)) return '구조화 메모리: 없음';
  return [
    `메모리 릴리스: ${context.memoryReleaseId}`,
    `판단 정책:\n${context.policy.map((item) => `- ${item}`).join('\n')}`,
    context.reflections.length
      ? `성찰:\n${context.reflections.map((item) => `- ${item}`).join('\n')}`
      : '',
    context.events.length
      ? `사건:\n${context.events.map((item) => `- ${item}`).join('\n')}`
      : '',
    context.counterexamples.length
      ? `반례:\n${context.counterexamples.map((item) => `- ${item}`).join('\n')}`
      : '',
  ].filter(Boolean).join('\n\n');
};

export const buildEvaluationV3Input = (
  systemPrompt: string,
  question: EvaluationV3Question,
  context: EvaluationV3ContextPackage,
  arm: EvaluationV3Arm,
): EvaluationV3ModelInput => {
  assertPublicQuestion(question);
  assertArmContext(arm, context);
  const options = question.options
    .map((option, index) => `${index + 1}. ${option}`)
    .join('\n');
  return {
    system: systemPrompt,
    user: [
      contextBlock(context),
      `질문: ${question.prompt}`,
      `선택지:\n${options}`,
      '가장 적절한 선택지 하나를 고르고 판단 기준과 우선순위를 설명하세요.',
      'JSON만 출력하세요: {"choice":1,"reason":"선택한 판단 기준과 우선순위를 1~2문장으로 설명"}',
    ].join('\n\n'),
  };
};

const unwrapJson = (text: string) => {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1] : trimmed;
};

export const parseEvaluationV3Response = (
  question: EvaluationV3Question,
  text: string,
): ParsedEvaluationV3Response => {
  assertPublicQuestion(question);
  let parsed: unknown;
  try {
    parsed = JSON.parse(unwrapJson(text));
  } catch {
    throw new Error('Evaluation v3 response must be valid JSON');
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Evaluation v3 response must be a JSON object');
  }
  const choice = (parsed as { choice?: unknown }).choice;
  const reason = (parsed as { reason?: unknown }).reason;
  if (!Number.isInteger(choice) || Number(choice) < 1 || Number(choice) > 4) {
    throw new Error('choice must be an integer from 1 to 4');
  }
  if (typeof reason !== 'string' || reason.trim().length === 0) {
    throw new Error('reason is required');
  }
  return {
    choice: choice as 1 | 2 | 3 | 4,
    reason,
  };
};
