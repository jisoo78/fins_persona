export type TabType =
  | 'dashboard'
  | 'a-track'
  | 'b-track'
  | 'settings';

export type ATrackSection = 'pre-interview' | 'deep-interview' | 'personas';

export type BTrackSection = 'main-prompt' | 'question-review' | 'evaluation-run' | 'reports';

export type RoleType = '전략' | '재무' | '인사' | '운영' | '레드팀' | '커스텀' | '기술 혁신';

export interface Persona {
  id: string;
  name: string;
  role: RoleType;
  iconName: string;
  badge: string;
  description: string;
  status: 'active' | 'inactive' | 'training';
  createdAt: string;
  updatedAt: string;
  decisionStyle: string;
  coreValues: string[];
  strengths: string[];
  weaknesses: string[];
  communicationStyle: string;
  sampleConversations: {
    question: string;
    answer: string;
  }[];
  decisionPrompt?: string;
  colorClass: string;
  bgClass: string;
}

export type QuestionType = '객관식' | '주관식' | 'Trade-off 선택' | '시나리오 질문';

export interface InterviewQuestion {
  id: number;
  type: QuestionType;
  category: string;
  question: string;
  subtitle?: string;
  options?: string[];
}

export interface ChatMessage {
  id: string;
  sender: 'ai' | 'user';
  text: string;
  timestamp: string;
  questionType?: QuestionType;
  options?: string[];
  selectedOption?: string;
}

export interface DecisionRecord {
  id: string;
  date: string;
  question: string;
  category: string;
  participants: string[]; // Persona names
  timeline: {
    time: string;
    speaker: string;
    role: string;
    content: string;
  }[];
  agreementPoints: string[];
  disagreements: string[];
  finalConclusion: string;
  recommendation: string;
  impactScore: 'High' | 'Medium' | 'Critical';
  preInterviewAnswers?: {
    pre_question_id: number;
    pre_question: string;
    option_id: number;
    option_text: string;
    custom_text?: string;
  }[];
  preInterviewContext?: unknown;
  publicData?: {
    status: 'idle' | 'collected';
    accounts: {
      platform: string;
      handle: string;
      url: string;
      confidence: number;
    }[];
    signals: string[];
    posts: {
      platform: string;
      text: string;
      inferredSignal: string;
    }[];
  };
}

export interface UserSettings {
  name: string;
  role: string;
  company: string;
  email: string;
}
