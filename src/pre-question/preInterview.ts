import type {
  CommunicationStyleAnswer,
  PreInterviewAnswer,
  PreInterviewContext,
  PreQuestion,
  PreQuestionBank,
  PreQuestionStage,
  ResponseSignal,
} from './types';

const requiredStages: PreQuestionStage[] = ['preference', 'context_shift', 'core_value', 'red_line', 'priority_order'];

export const getResponseSignal = (responseTimeMs: number): ResponseSignal => {
  if (responseTimeMs < 3000) return 'strong_preference';
  if (responseTimeMs <= 10000) return 'considered_preference';
  return 'slow_response';
};

function assertNonEmpty(value: unknown, message: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(message);
  }
}

export const validatePreQuestionBank = (bank: PreQuestionBank): void => {
  if (!Array.isArray(bank.pre_questions) || bank.pre_questions.length === 0) {
    throw new Error('pre_questions가 비어 있습니다.');
  }

  const seenIds = new Set<number>();
  const stagesByCategory = new Map<string, Set<PreQuestionStage>>();

  bank.pre_questions.forEach((question) => {
    if (seenIds.has(question.pre_question_id)) {
      throw new Error(`pre_question_id 중복: ${question.pre_question_id}`);
    }
    seenIds.add(question.pre_question_id);

    assertNonEmpty(question.category, 'category가 비어 있습니다.');
    assertNonEmpty(question.decision_dimension, 'decision_dimension이 비어 있습니다.');
    assertNonEmpty(question.stage, 'stage가 비어 있습니다.');
    assertNonEmpty(question.pre_question, 'pre_question이 비어 있습니다.');

    if (!requiredStages.includes(question.stage)) {
      throw new Error(`허용되지 않는 stage: ${question.stage}`);
    }

    if (!Array.isArray(question.pre_options) || question.pre_options.length < 5) {
      throw new Error(`${question.pre_question_id}번 문항의 pre_options가 부족합니다.`);
    }

    const directOption = question.pre_options.find((option) => option.option_id === 5);
    if (!directOption || directOption.option_text !== 'E. 기타 (직접입력)') {
      throw new Error(`${question.pre_question_id}번 문항에 E. 기타 (직접입력) 선택지가 없습니다.`);
    }

    const categoryStages = stagesByCategory.get(question.category) ?? new Set<PreQuestionStage>();
    categoryStages.add(question.stage);
    stagesByCategory.set(question.category, categoryStages);

    if (question.question_mode === 'attribute_tradeoff') {
      if (!Array.isArray(question.attributes) || question.attributes.length === 0) {
        throw new Error(`${question.pre_question_id}번 attribute_tradeoff 문항에 attributes가 없습니다.`);
      }

      question.pre_options
        .filter((option) => option.option_id >= 1 && option.option_id <= 4)
        .forEach((option) => {
          if (!option.attribute_values) {
            throw new Error(`${question.pre_question_id}번 ${option.option_id}번 선택지에 attribute_values가 없습니다.`);
          }

          question.attributes?.forEach((attribute) => {
            if (!option.attribute_values?.[attribute.attribute_id]) {
              throw new Error(`${question.pre_question_id}번 ${option.option_id}번 선택지에 ${attribute.attribute_id} attribute_values가 없습니다.`);
            }
          });
        });
    }
  });

  stagesByCategory.forEach((stages, category) => {
    requiredStages.forEach((stage) => {
      if (!stages.has(stage)) {
        throw new Error(`${category} 카테고리에 ${stage} stage가 없습니다.`);
      }
    });
  });
};

export const buildPreInterviewAnswer = ({
  question,
  selectedOptionId,
  directAnswer = '',
  responseTimeMs,
}: {
  question: PreQuestion;
  selectedOptionId: number;
  directAnswer?: string;
  responseTimeMs: number;
}): PreInterviewAnswer => {
  if (!selectedOptionId) {
    throw new Error('선택지를 선택해주세요.');
  }

  const selectedOption = question.pre_options.find((option) => option.option_id === selectedOptionId);
  if (!selectedOption) {
    throw new Error('선택한 보기를 찾을 수 없습니다.');
  }

  const isDirectInput = selectedOptionId === 5;
  if (isDirectInput) {
    assertNonEmpty(directAnswer, '직접 입력값을 입력해주세요.');
  }

  const answer: PreInterviewAnswer = {
    source_question_id: question.pre_question_id,
    category: question.category,
    decision_dimension: question.decision_dimension,
    stage: question.stage,
    question: question.pre_question,
    selected_option_id: selectedOptionId,
    answer: isDirectInput ? directAnswer.trim() : selectedOption.option_text,
    response_time_ms: responseTimeMs,
    response_signal: getResponseSignal(responseTimeMs),
  };

  if (question.question_mode === 'attribute_tradeoff') {
    answer.question_mode = 'attribute_tradeoff';
    answer.revealed_preference = selectedOption.revealed_preference;
    if (selectedOption.attribute_values) {
      answer.attribute_values = selectedOption.attribute_values;
    }
  }

  return answer;
};

export const setAnswerAtIndex = (
  answers: PreInterviewAnswer[],
  index: number,
  nextAnswer: PreInterviewAnswer,
): PreInterviewAnswer[] => {
  const nextAnswers = [...answers];
  nextAnswers[index] = nextAnswer;
  return nextAnswers;
};

export const buildPreInterviewContext = (
  answers: PreInterviewAnswer[],
  communicationStyle: CommunicationStyleAnswer,
  completedAt = new Date().toISOString(),
): PreInterviewContext => {
  const categories = answers.reduce<PreInterviewContext['categories']>((context, answer) => {
    const existingCategory = context[answer.category] ?? {};
    const nextIndex = Object.keys(existingCategory).length + 1;
    const contextQuestion: PreInterviewContext['categories'][string][string] = {
      stage: answer.stage,
      source_question_id: answer.source_question_id,
      question: answer.question,
      selected_option_id: answer.selected_option_id,
      answer: answer.answer,
      response_time_ms: answer.response_time_ms,
      response_signal: answer.response_signal,
    };

    if (answer.question_mode === 'attribute_tradeoff') {
      contextQuestion.question_mode = 'attribute_tradeoff';
      contextQuestion.revealed_preference = answer.revealed_preference;
      if (answer.attribute_values) {
        contextQuestion.attribute_values = answer.attribute_values;
      }
    }

    return {
      ...context,
      [answer.category]: {
        ...existingCategory,
        [`question_${nextIndex}`]: contextQuestion,
      },
    };
  }, {});

  return {
    meta: {
      schema_version: 'pre_interview_context.v2',
      target_role: 'CFO',
      completed_at: completedAt,
    },
    communication_style: communicationStyle,
    categories,
  };
};
