export type TabType = 'dashboard' | 'decision-chat' | 'interview' | 'personas' | 'persona-detail' | 'ai-meeting' | 'history' | 'settings';

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

export interface MeetingOpinion {
  personaId: string;
  personaName: string;
  role: RoleType;
  avatarColor: string;
  stance: '찬성' | '신중' | '반대' | '대안 제시';
  summary: string;
  detailedPoints: string[];
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
}

export interface UserSettings {
  name: string;
  role: string;
  company: string;
  email: string;
  plan: 'Basic' | 'Pro';
  aiModel: string;
  creativityLevel: number;
  riskTolerance: number;
  connectedSNS: {
    linkedin: boolean;
    slack: boolean;
    notion: boolean;
    googleWorkspace: boolean;
  };
  language: string;
  autoSaveHistory: boolean;
}
