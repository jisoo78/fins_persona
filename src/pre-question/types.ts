export type PreQuestionStage = 'preference' | 'context_shift' | 'core_value' | 'red_line' | 'priority_order';

export type QuestionMode = 'single_choice' | 'attribute_tradeoff' | string;

export type ResponseSignal = 'strong_preference' | 'considered_preference' | 'slow_response';

export interface PreQuestionAttribute {
  attribute_id: string;
  label: string;
  value_type: string;
}

export interface PreQuestionOption {
  option_id: number;
  option_text: string;
  revealed_preference?: string;
  attribute_values?: Record<string, string>;
}

export interface PreQuestion {
  pre_question_id: number;
  category: string;
  decision_dimension: string;
  stage: PreQuestionStage;
  question_mode?: QuestionMode;
  pre_question: string;
  attributes?: PreQuestionAttribute[];
  pre_options: PreQuestionOption[];
}

export interface PreQuestionBank {
  schema_version?: string;
  target_role?: string;
  pre_questions: PreQuestion[];
}

export interface PreInterviewAnswer {
  source_question_id: number;
  category: string;
  decision_dimension: string;
  stage: PreQuestionStage;
  question: string;
  selected_option_id: number;
  answer: string;
  rationale: string;
  response_time_ms: number;
  response_signal: ResponseSignal;
  question_mode?: 'attribute_tradeoff';
  revealed_preference?: string;
  attribute_values?: Record<string, string>;
}

export interface CommunicationStyleAnswer {
  bridge_question_id: 'communication_style';
  selected_option_id: number;
  answer: string;
}

export interface PreInterviewContextQuestion {
  stage: PreQuestionStage;
  source_question_id: number;
  question: string;
  selected_option_id: number;
  answer: string;
  rationale: string;
  response_time_ms: number;
  response_signal: ResponseSignal;
  question_mode?: 'attribute_tradeoff';
  revealed_preference?: string;
  attribute_values?: Record<string, string>;
}

export interface PreInterviewContext {
  meta: {
    schema_version: 'pre_interview_context.v2';
    target_role: 'CFO';
    completed_at: string;
  };
  communication_style: CommunicationStyleAnswer;
  categories: Record<string, Record<string, PreInterviewContextQuestion>>;
}
