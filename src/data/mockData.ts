import { Persona, InterviewQuestion, ChatMessage, DecisionRecord, UserSettings } from '../types';

export const initialPersonas: Persona[] = [
  {
    id: 'p-1',
    name: '전략의 마에스트로',
    role: '전략',
    iconName: 'Compass',
    badge: '장기 비전',
    description: '시장 장악과 중장기 확장 전략을 최우선으로 고려하는 미래 지향적 페르소나입니다.',
    status: 'active',
    createdAt: '2026.05.12',
    updatedAt: '10분 전',
    decisionStyle: 'First-principles 기반의 비대칭 리스크 과감 투자',
    coreValues: ['시장 리더십 확보', '파괴적 혁신', '스케일업 우선'],
    strengths: ['경쟁사 허점 파악', '신규 사업 기회 창출', '비전 제시'],
    weaknesses: ['단기 캐시플로우 저평가 위험', '초기 실행 비용 과대 산정'],
    communicationStyle: '거시적 흐름을 먼저 제시하고 핵심 KPI 중심으로 간결하게 결론을 도출합니다.',
    sampleConversations: [
      { question: '경쟁사가 가격을 20% 인하했습니다. 어떻게 대응해야 할까요?', answer: '단순 가격 출혈 경쟁에 동참하는 것은 브랜드 가치만 훼손합니다. 오히려 프리미엄 가치를 강화하는 기능 업데이트를 선포하고 타깃 고객층을 상향 이동시켜야 합니다.' },
      { question: '신규 해외 시장 진출 시점은 언제가 적합할까요?', answer: '국내 시장 점유율 35% 달성 시점이 최적입니다. 현재 모멘텀을 유지하며 현지 파트너사 발굴을 선행하세요.' }
    ],
    colorClass: 'text-indigo-600 dark:text-indigo-400',
    bgClass: 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800'
  },
  {
    id: 'p-2',
    name: '냉철한 재무 수호자',
    role: '재무',
    iconName: 'DollarSign',
    badge: '수익성 방어',
    description: '현금 흐름(Cash Flow), 런웨이(Runway), ROI를 기반으로 철저한 정량적 검증을 집행합니다.',
    status: 'active',
    createdAt: '2026.05.14',
    updatedAt: '1시간 전',
    decisionStyle: '보수적 비용 산정 및 고정비 최소화 원칙',
    coreValues: ['손익분기점 조기 달성', '자금 효율성 극대화', '리스크 헤지'],
    strengths: ['불필요한 고정비 매끄러운 삭감', '재무 건전성 유지', '정확한 마진 예측'],
    weaknesses: ['초기 시장 선점을 위한 공격적 투자 지연 가능성'],
    communicationStyle: '숫자와 엑셀 데이터에 기반하여 감정을 배제하고 명확한 손익 분기 시점을 요구합니다.',
    sampleConversations: [
      { question: '마케팅 예산을 2배 증액하고자 합니다. 의견 주시겠습니까?', answer: '현재 CAC(고객 획득 비용) 대비 LTV(고객 생애 가치) 비율이 2.1배입니다. 이 기준이 최소 3.0배 이상으로 개선되기 전까지 마케팅 예산 증액은 반려합니다.' }
    ],
    colorClass: 'text-emerald-600 dark:text-emerald-400',
    bgClass: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800'
  },
  {
    id: 'p-3',
    name: '사람 중심 조직 조율사',
    role: '인사',
    iconName: 'Users',
    badge: '조직 문화',
    description: '팀 피로도, 핵심 인재 리텐션, 전사적 동기부여 등 인적 자본의 지속가능성을 평가합니다.',
    status: 'active',
    createdAt: '2026.05.18',
    updatedAt: '어제',
    decisionStyle: '심리적 안전감 확보와 합의 기반의 점진적 변화 추진',
    coreValues: ['인재 확보 및 파이프라인', '조직 신뢰도', '번아웃 방지'],
    strengths: ['핵심 인재 이탈 사전 감지', '부서 간 갈등 조정', '비전 공감대 형성'],
    weaknesses: ['의사결정 속도 저하 위험', '저성과자 단호한 조치 지연'],
    communicationStyle: '구성원들이 느낄 감정적 변화와 실무진의 수용성을 공감 어린 어조로 대변합니다.',
    sampleConversations: [
      { question: '전사 주 4일 사무실 출근제로 전환하려 합니다.', answer: '갑작스러운 제도 변경은 하이퍼 퍼포머들의 이직 의사를 자극할 수 있습니다. 1개월의 유예 기간과 핵심 실무진 인터뷰를 선행하는 것을 제안합니다.' }
    ],
    colorClass: 'text-amber-600 dark:text-amber-400',
    bgClass: 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800'
  },
  {
    id: 'p-4',
    name: '무결점 운영 엔지니어',
    role: '운영',
    iconName: 'Cpu',
    badge: '실행 최적화',
    description: '공급망, SLA 유지, 기술 스택 복잡도 축소 및 병목 현상 제거에 집중합니다.',
    status: 'active',
    createdAt: '2026.06.01',
    updatedAt: '3일 전',
    decisionStyle: '린(Lean) 프로세스와 자동화를 통한 에러 제로 추구',
    coreValues: ['납기 준수', '프로세스 표준화', '확장 가능한 아키텍처'],
    strengths: ['현장 실무 병목 즉시 해결', '운영 리소스 절감', '탁월한 위기 대처'],
    weaknesses: ['기존 안정적 시스템 구조에 대한 과도한 집착'],
    communicationStyle: '체크리스트와 마일스톤 단계별 일정표를 기반으로 명확한 실무 업무 분장을 제시합니다.',
    sampleConversations: [
      { question: '다음 달 대규모 업데이트 배포 일정을 앞당길 수 있습니까?', answer: 'QA 테스트 주기를 1회 축소해야만 가능합니다. 하지만 이는 치명적인 결함 발생 확률을 15% 높이므로 론칭 일정을 2주 유지하는 것이 타당합니다.' }
    ],
    colorClass: 'text-blue-600 dark:text-blue-400',
    bgClass: 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800'
  },
  {
    id: 'p-5',
    name: '악마의 대변인 레드팀',
    role: '레드팀',
    iconName: 'ShieldAlert',
    badge: '치명적 단점 발굴',
    description: '의사결정의 확증 편향을 깨부수기 위해 최악의 시나리오와 법적/보안 취약점을 가차 없이 찌릅니다.',
    status: 'active',
    createdAt: '2026.06.10',
    updatedAt: '방금 전',
    decisionStyle: '스트레스 테스트 및 최악의 블랙스완 대비 원칙',
    coreValues: ['확증편향 방지', '치명적 결함 원천 봉쇄', '객관적 비판'],
    strengths: ['감정적 낙관론 냉각', '숨겨진 규제 리스크 발굴', '플랜 B 강제 마련'],
    weaknesses: ['비판을 위한 비판으로 회의실 분위기 경직'],
    communicationStyle: '단도직입적이고 냉철한 어조로 프로젝트가 실패할 수밖에 없는 3가지 이유를 먼저 나열합니다.',
    sampleConversations: [
      { question: '이번 M&A 인수 건은 모두가 긍정적으로 평가하고 있습니다.', answer: '모두가 동의할 때가 가장 위험합니다. 피인수 기업의 핵심 개발자 3명이 계약 종료 후 경쟁사로 이직할 시나리오에 대한 락인(Lock-in) 조항이 전무합니다.' }
    ],
    colorClass: 'text-rose-600 dark:text-rose-400',
    bgClass: 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800'
  }
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
    question: '최근 회사 운영에서 가장 뼈아팠거나 결정하기 어려웠던 의사결정은 무엇이었나요? 그때 어떤 기준으로 판단했나요?',
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
  {
    id: 'dec-1',
    date: '2026.06.25',
    question: '북미 시장 타깃 신제품의 초기 론칭 가격을 어떻게 책정해야 할까요?',
    category: '가격 및 시장 전략',
    participants: ['전략의 마에스트로', '냉철한 재무 수호자', '악마의 대변인 레드팀'],
    timeline: [
      { time: '00:02', speaker: '전략의 마에스트로', role: '전략', content: '경쟁사 대비 15% 높은 $99 프리미엄 티어 전략을 제안합니다. 초기 바이럴은 톱 티어 크리에이터 타깃으로 집중해야 합니다.' },
      { time: '00:05', speaker: '냉철한 재무 수호자', role: '재무', content: '$99 책정 시 물류비 인상분을 반영한 초기 원가율이 42%에 달합니다. 최소 $119로 책정하거나 초기 마케팅 페이백 주기를 4개월 이내로 단축해야 합니다.' },
      { time: '00:09', speaker: '악마의 대변인 레드팀', role: '레드팀', content: '경쟁사 B사에서 다음 달 유사 규격의 $79짜리 보급형 모델을 발표한다는 소문이 있습니다. 가격 저항선에 대한 AB 테스트 데이터가 없으면 대규모 재고 리스크가 발생합니다.' },
      { time: '00:14', speaker: '무결점 운영 엔지니어', role: '운영', content: '현 초도 물량 5,000대 기준 배포는 문제없으나, $79 출혈 대응 시 초도 물량 재발주 리드타임이 6주 소요됩니다.' }
    ],
    agreementPoints: [
      '초기 브랜드 포지셔닝은 저가 출혈 경쟁 대신 프리미엄 가치 지향으로 합의',
      '첫 2주간 얼리버드 한정 프로모션을 통해 시장 가격 저항 테스트 선행 필요'
    ],
    disagreements: [
      '정가 $99 (전략팀) vs 정가 $119 (재무팀) 마진 안전폭에 대한 시각차 존재',
      '경쟁사 신제품 발표 일정에 따른 론칭 시점 2주 연기 여부'
    ],
    finalConclusion: '초기 정가는 $109로 절충 책정하되, 첫 1,000명 얼리버드 고객에게는 $89 베네핏과 VIP 온보딩 세션을 제공하여 시장 데이터를 수집한다.',
    recommendation: '재무 건전성과 전략적 선점 효과의 완벽한 밸런스입니다. 얼리버드 1,000명 전환율이 8% 미만일 경우 즉시 B2B 타깃 요금제로 피벗하는 안전 트리거를 발동하세요.',
    impactScore: 'Critical'
  },
  {
    id: 'dec-2',
    date: '2026.06.18',
    question: '개발팀 전원 외주화 vs 내부 인력 추가 채용 중 어느 방안이 타당할까요?',
    category: '조직 및 예산',
    participants: ['냉철한 재무 수호자', '사람 중심 조직 조율사', '무결점 운영 엔지니어'],
    timeline: [
      { time: '00:01', speaker: '냉철한 재무 수호자', role: '재무', content: '외주 전환 시 연간 고정 인건비 약 3.8억 원 절감 효과가 정량적으로 산출됩니다.' },
      { time: '00:04', speaker: '사람 중심 조직 조율사', role: '인사', content: '핵심 도메인 노하우의 외부 유출과 기존 PM들의 업무 부하 가중으로 조직 신뢰도가 급격히 붕괴할 것입니다.' }
    ],
    agreementPoints: ['코어 아키텍처 및 보안 로직은 반드시 내부 직원이 소유해야 함'],
    disagreements: ['단기 캐시플로우 확보 우선 vs 장기 기술 자산화 우선'],
    finalConclusion: '프론트엔드 UI/UX 작업만 한정하여 에이전시 외주를 진행하고, 백엔드 및 AI 로직 인력은 내부 시니어 2명을 신규 채용한다.',
    recommendation: '하이브리드 리소스 할당 모델을 통해 런웨이를 4개월 추가 연장하면서도 핵심 IP를 안전하게 방어했습니다.',
    impactScore: 'High'
  }
];

export const initialSettings: UserSettings = {
  name: '김도현',
  role: 'Chief Executive Officer (CEO)',
  company: '넥스트스텝 AI Labs',
  email: 'dohyun.kim@nextstep.ai',
  plan: 'Pro',
  aiModel: 'Gemini 2.5 Pro Executive Enterprise',
  creativityLevel: 75,
  riskTolerance: 60,
  connectedSNS: {
    linkedin: true,
    slack: true,
    notion: true,
    googleWorkspace: false
  },
  language: '한국어 (Korean)',
  autoSaveHistory: true
};
