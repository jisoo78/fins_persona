import { Persona, InterviewQuestion, ChatMessage, DecisionRecord, UserSettings } from '../types';

export const initialPersonas: Persona[] = [
];

export const interviewQuestions: InterviewQuestion[] = [
  {
    id: 1,
    type: 'Trade-off 선택',
    category: '경영 핵심 가치',
    question: '성장과 수익성 중 하나를 선택해야 한다면, 현재 조직의 단계에서 어느 쪽에 가중치를 두시겠습니까?',
    subtitle: '두 가치는 항상 긴장 관계에 있습니다. 대표님의 철학을 기반으로 골라주세요.',
    options: [
      '시장 점유율 확대를 위한 과감한 적자 감수 성장 (Aggressive Scale)',
      '안정적 현금흐름과 마진 중심의 탄탄한 내실 경영 (Sustainable Profit)',
      '시장 상황에 따라 분기별로 엄격히 스위칭하는 동적 균형 원칙'
    ]
  },
  {
    id: 2,
    type: '주관식',
    category: '위기 대응 패턴',
    question: '최근 회사 운영에서 가장 뼈아팠거나 결정하기 어려웠던 의사결정은 무엇이었나요? 그때의 판단 근거를 적어주세요.',
    subtitle: 'AI가 대표님의 고유한 위기 극복 패턴과 후회 포인트를 학습합니다.'
  },
  {
    id: 3,
    type: '시나리오 질문',
    category: '인사 및 리스크 관리',
    question: '실적이 팀 내 1위인 핵심 개발자가 잦은 지각과 동료 비하 발언으로 팀 분위기를 해치고 있습니다. 어떻게 처리하시겠습니까?',
    options: [
      '성과가 우선이다. 별도 인센티브나 독립 공간을 주어 갈등을 차단한다.',
      '즉시 경고하고 개선되지 않으면 성과와 무관하게 해고 프로세스를 밟는다.',
      '중재 미팅을 열고 리더십 코칭을 통해 행동 교정을 선행한다.'
    ]
  },
  {
    id: 4,
    type: '객관식',
    category: '정보 수집 및 스피드',
    question: '중요한 의사결정을 내릴 때 데이터가 70% 정도만 확보된 상태입니다. 대표님의 스탠스는?',
    options: [
      '70%면 충분하다. 직관을 더해 즉시 실행하고 빠르게 피드백 루프를 돌린다.',
      '90% 이상의 정량 데이터가 모일 때까지 리서치 팀에 추가 조사 기간을 부여한다.',
      '핵심 임원 2~3명과 긴급 투표를 거쳐 과반 동의 시 즉시 추진한다.'
    ]
  }
];

export const initialChatMessages: ChatMessage[] = [
  {
    id: 'm-1',
    sender: 'ai',
    text: '안녕하세요 대표님! AI 임원진 페르소나 설계 딥 다이브 인터뷰어입니다.\n지금부터 대표님의 사고방식과 경영 철학을 정밀하게 구조화하겠습니다. 준비되셨으면 첫 번째 질문에 답해주세요.',
    timestamp: '오후 2:00'
  },
  {
    id: 'm-2',
    sender: 'ai',
    text: interviewQuestions[0].question,
    timestamp: '오후 2:01',
    questionType: interviewQuestions[0].type,
    options: interviewQuestions[0].options
  }
];

export const initialDecisions: DecisionRecord[] = [
];

export const initialSettings: UserSettings = {
  name: '김도현',
  role: 'Chief Executive Officer (CEO)',
  company: '넥스트스텝 AI Labs',
  email: 'dohyun.kim@nextstep.ai',
};
