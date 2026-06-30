import React, { useEffect, useMemo, useRef, useState } from 'react';
import mermaid from 'mermaid';
import { ChatMessage, DecisionRecord, InterviewQuestion, Persona, RoleType } from '../types';
import preQuestionData from '../../pre_question.json';
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Clock,
  Database,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  SearchCheck,
  Send,
  UserRound,
  Workflow,
} from 'lucide-react';

type FlowStep = 'profile' | 'interview';
type InterviewPhase = 'pre' | 'deep';

interface UserProfile {
  name: string;
  title: string;
  industry: string;
  companySize: string;
  companyName: string;
  snsId: string;
  financeScope: string;
}

interface PublicDataSnapshot {
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
}

interface SnsDiscoveryResponse {
  ok: boolean;
  warning?: string;
  message?: string;
  publicData?: PublicDataSnapshot;
}

interface FinalInterviewOutput {
  fiveLayerSummary: {
    role: string;
    values: string;
    redLines: string;
    priorities: string;
    communicationFormat: string;
  };
  oneSentenceSystem: string;
  coreInstructions: string[];
  needsConfirmation: string[];
}

interface PreInterviewAnswer {
  category: string;
  question: string;
  answer: string;
}

type PreInterviewContext = Record<string, Record<string, { question: string; answer: string }>>;

interface SavedIntakeIds {
  userId: string;
  userProfileId: string;
  collectionJobId: string;
  interviewSessionId: string | null;
}

interface AgentQuestionsResponse {
  ok: boolean;
  message?: string;
  questions?: InterviewQuestion[];
}

interface AgentFinalOutputResponse {
  ok: boolean;
  message?: string;
  finalOutput?: FinalInterviewOutput;
}

interface PreQuestionOption {
  option_id: number;
  option_text: string;
}

interface PreQuestion {
  pre_question_id: number;
  pre_question: string;
  pre_options: PreQuestionOption[];
}

interface PreInterviewData {
  pre_questions: PreQuestion[];
}

const snsDiscoveryClientTimeoutMs = 65000;
const profileDraftStorageKey = 'decision-profile-draft';
const preInterviewData = preQuestionData as PreInterviewData;

const defaultProfile: UserProfile = {
  name: '',
  title: 'CFO / 재무 리더',
  industry: 'B2B SaaS',
  companySize: '51-200명',
  companyName: '',
  snsId: '',
  financeScope: '자본 배치, 투자, 리스크, 자금 운용',
};

const loadInitialProfile = (): UserProfile => {
  if (typeof window === 'undefined') return defaultProfile;

  try {
    const rawDraft = window.sessionStorage.getItem(profileDraftStorageKey);
    if (!rawDraft) return defaultProfile;

    return {
      ...defaultProfile,
      ...JSON.parse(rawDraft),
    };
  } catch {
    window.sessionStorage.removeItem(profileDraftStorageKey);
    return defaultProfile;
  }
};

const roleOptions: RoleType[] = ['전략', '재무', '인사', '운영', '레드팀', '커스텀', '기술 혁신'];

const defaultAlgorithmTree = `flowchart TD
  A["1. 사용자 프로필 입력"] --> B["2. 공개 SNS 신호 수집"]
  B --> C["3. 재무 의사결정 인터뷰"]
  C --> D{"4. 현금흐름 vs 수익성"}
  D -- 현금흐름 --> E["Cash Cushion / 레버리지 한계 강화"]
  D -- 수익성 --> F["ROI / IRR 기준 강화"]
  E --> G{"5. 레드라인 존재 여부"}
  F --> G
  G -- 명확 --> H["AI 참모 핵심 지침 생성"]
  G -- 불명확 --> I["확인 필요 항목 표시"]
  H --> J["의사 결정 기준 요약"]
  I --> J`;

const financeDemoAnswers = [
  'A. 현금흐름과 런웨이를 먼저 본다.',
  'B. 영업이익보다 현금흐름을 우선한다.',
  'C. 순부채/EBITDA 2.0배를 넘기지 않는다.',
  'B. 중기 IRR 18% 이상을 기준으로 본다.',
  'C. 24개월 이내 회수를 선호한다.',
  'B. 최소 6개월 운영비를 현금으로 보유한다.',
  'C. 성장 투자는 유지하되 고정비부터 줄인다.',
  'A. 환/금리 리스크는 사전 헤지한다.',
  'D. 자사주보다 성장 투자와 현금 안정성을 우선한다.',
  'B. 지분 희석보다 조건 좋은 부채를 먼저 검토한다.',
  'A. 손실이 구조적이면 빠르게 손절한다.',
  'C. M&A는 현금흐름 훼손 가능성이 있으면 중단한다.',
];

const formatTime = () => new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });

const extractCategoryName = (question: string) => question.match(/^\[([^\]]+)\]/)?.[1] ?? '기타';

const stripCategoryLabel = (question: string) => question.replace(/^\[[^\]]+\]\s*/, '');

const createPreInterviewQuestions = (): InterviewQuestion[] =>
  preInterviewData.pre_questions.map((question) => ({
    id: question.pre_question_id,
    type: '객관식',
    category: extractCategoryName(question.pre_question),
    question: stripCategoryLabel(question.pre_question),
    options: question.pre_options.map((option) => `${option.option_id}. ${option.option_text}`),
  }));

const createPreInterviewContext = (answers: PreInterviewAnswer[]): PreInterviewContext =>
  answers.reduce<PreInterviewContext>((context, answer) => {
    const categoryAnswers = context[answer.category] ?? {};
    const nextIndex = Object.keys(categoryAnswers).length + 1;

    return {
      ...context,
      [answer.category]: {
        ...categoryAnswers,
        [`question_${nextIndex}`]: {
          question: answer.question,
          answer: answer.answer,
        },
      },
    };
  }, {});

const createDeepInterviewQuestions = (context: PreInterviewContext): InterviewQuestion[] =>
  Object.entries(context).flatMap(([categoryName, answers], categoryIndex) => {
    const answerEntries = Object.values(answers);
    const first = answerEntries[0];
    const second = answerEntries[1] ?? answerEntries[0];
    const fourth = answerEntries[3] ?? answerEntries[answerEntries.length - 1] ?? first;

    return [
      {
        id: categoryIndex * 2 + 1,
        type: '객관식',
        category: categoryName,
        question: `"${first?.answer ?? '확인 필요'}"와 "${second?.answer ?? '확인 필요'}" 응답을 함께 보면, ${categoryName}에서 가장 중요하게 지키는 판단 기준은 무엇에 가깝습니까?`,
        options: [
          'A. 단기 재무 안정성과 현금흐름 훼손 방지를 최우선으로 둔다.',
          'B. 자본 효율과 수익률이 충분히 검증될 때 실행한다.',
          'C. 장기 성장성과 전략적 필요성이 크면 일정 수준의 불확실성을 감수한다.',
          'D. 경영진이 선택할 수 있도록 위험, 대안, 중단 조건을 명확히 제시한다.',
          'E. 기타 — 직접 입력',
        ],
      },
      {
        id: categoryIndex * 2 + 2,
        type: '객관식',
        category: categoryName,
        question: `"${fourth?.answer ?? '확인 필요'}" 응답까지 고려할 때, 실제 재무 의사결정에서 멈추거나 재검토해야 하는 신호는 무엇입니까?`,
        options: [
          'A. 유동성, 지급 능력, 필수 운영자금이 흔들릴 가능성이 보일 때다.',
          'B. 기대수익보다 손실 상한, 회수 가능성, 자본비용 초과 여부가 불명확할 때다.',
          'C. 전략적 가치는 있지만 조직, 고객, 핵심 사업의 지속성을 훼손할 때다.',
          'D. 책임자, 성과 기준, 중단 권한이 합의되지 않아 실행 통제가 어려울 때다.',
          'E. 기타 — 직접 입력',
        ],
      },
    ];
  });

const buildPublicDataSnapshot = (profile: UserProfile): PublicDataSnapshot => {
  const handle = profile.snsId || '@sample.cfo';
  const cleanHandle = handle.replace(/^@/, '');

  return {
    status: 'collected',
    accounts: [
      { platform: 'LinkedIn', handle, url: `https://linkedin.com/in/${cleanHandle}`, confidence: 0.82 },
      { platform: 'X', handle, url: `https://x.com/${cleanHandle}`, confidence: 0.74 },
      { platform: 'Naver Blog', handle, url: `https://blog.naver.com/${cleanHandle}`, confidence: 0.58 },
    ],
    signals: [
      `${profile.industry || '업종 미입력'} 맥락에서 현금흐름, 성장 투자, 리스크 관리 관련 표현을 우선 수집`,
      `${profile.companySize || '회사 규모 미입력'} 규모에 맞는 자본 배치 기준 확인 필요`,
      '공개 글 기반 신호는 검증 전 추정치로 표시',
    ],
    posts: [
      {
        platform: 'LinkedIn',
        text: '성장 투자도 중요하지만, 현금흐름이 훼손되는 의사결정은 장기적으로 조직을 약하게 만든다.',
        inferredSignal: '현금흐름 방어 성향',
      },
      {
        platform: 'X',
        text: 'M&A는 숫자보다 통합 비용과 리스크 조정 수익률을 먼저 봐야 한다.',
        inferredSignal: 'M&A 레드라인 민감도',
      },
    ],
  };
};

const buildPublicDataFallback = (profile: UserProfile, reason: string): PublicDataSnapshot => {
  const handle = profile.snsId || '@unknown';

  return {
    status: 'collected',
    accounts: [],
    signals: [
      `SNS ID ${handle} 공개 계정 탐색이 제한 시간 안에 완료되지 않았습니다.`,
      `원인: ${reason}`,
      'Sherlock 결과는 확인 필요 상태로 저장하고, 인터뷰는 사용자 입력 정보 기준으로 계속 진행합니다.',
    ],
    posts: [],
  };
};

const createBrainstormerPrompt = (
  profile: UserProfile,
  questionCount: number,
  publicData: PublicDataSnapshot,
  preInterviewContext: PreInterviewContext | null = null,
) => `너는 C-Level 리더의 의사결정 체계를 인터뷰하는 전문 코치다.

[인터뷰 대상자]
- 이름: ${profile.name || '확인 필요'}
- 직책: ${profile.title || '확인 필요'}
- 업종: ${profile.industry || '확인 필요'}
- 회사 규모: ${profile.companySize || '확인 필요'}
- 회사명: ${profile.companyName || '확인 필요'}
- SNS ID: ${profile.snsId || '확인 필요'}
- 재무 범위: ${profile.financeScope || '자본 배치·투자·리스크·자금 운용'}

[공개 데이터 수집 신호]
${publicData.signals.length ? publicData.signals.map((signal) => `- ${signal}`).join('\n') : '- 아직 수집 전'}

[PreInterviewContext]
${preInterviewContext ? JSON.stringify(preInterviewContext, null, 2) : '아직 사전 질문 응답이 완료되지 않았습니다.'}

[진행 방식]
- 현재 단계의 질문 ${questionCount}개를 한 번에 하나씩 진행한다.
- 사전 질문은 제공된 객관식 보기만 사용한다.
- 심층 질문은 사전 질문의 여러 응답 간 관계를 종합해 재무 의사결정 기준을 확인한다.
- 심층 질문 선택지는 기본 4개와 E. 기타 — 직접 입력으로 구성한다.
- 기타 또는 주관식 답변은 한 문장만 받고 다음 질문으로 넘어간다.
- 최종 출력은 의사 결정 기준 요약 + AI 참모 프롬프트 핵심 지침 5~7개다.
- 답변을 임의로 일반화하지 말고 확인 필요 항목은 명시한다.`;

const buildInitialMessages = (
  questions: InterviewQuestion[],
  systemPrompt: string,
  phase: InterviewPhase,
): ChatMessage[] => [
  {
    id: 'm-brainstormer-open',
    sender: 'ai',
    text:
      phase === 'pre'
        ? `프로필과 공개 데이터 신호를 반영해 사전 질문을 시작합니다.\n\n${systemPrompt}`
        : `PreInterviewContext를 반영해 심층 인터뷰를 시작합니다.\n\n${systemPrompt}`,
    timestamp: formatTime(),
  },
  {
    id: 'm-brainstormer-q1',
    sender: 'ai',
    text: questions[0].question,
    timestamp: formatTime(),
    questionType: questions[0].type,
    options: questions[0].options,
  },
];

const createFinalOutput = (profile: UserProfile, answers: string[], publicData: PublicDataSnapshot): FinalInterviewOutput => {
  const joined = answers.join(' ');
  const cashFirst = /현금|런웨이|cash/i.test(joined);
  const riskFirst = /리스크|손실|레드라인|부채|손절/i.test(joined);
  const roiFirst = /roi|irr|수익|이익/i.test(joined);
  const otherAnswers = answers.filter((answer) => answer.includes('E. 기타'));

  return {
    fiveLayerSummary: {
      role: `${profile.title || '재무 리더'}로서 자본·현금흐름·투자·리스크의 균형을 책임지는 의사결정자`,
      values: cashFirst ? '현금흐름 안정성과 회복 가능성을 절대 기준으로 둠' : '확인 필요',
      redLines: riskFirst ? '부채, 구조적 손실, 현금흐름 훼손 가능성이 레드라인으로 나타남' : '확인 필요',
      priorities: roiFirst ? 'ROI/IRR 등 정량 기준과 투자 회수 가능성을 우선 검토' : '확인 필요',
      communicationFormat: '숫자, 레드라인, 다음 액션이 함께 보이는 간결한 보고 형식을 선호하는 것으로 추정',
    },
    oneSentenceSystem: cashFirst
      ? '이 재무 의사결정 체계는 성장 기회를 보되 현금흐름과 회복 가능성을 먼저 잠그는 보수적 실행 시스템이다.'
      : '이 재무 의사결정 체계는 아직 핵심 우선순위 확인이 더 필요한 초기 초안이다.',
    coreInstructions: [
      '모든 재무 제안은 현금흐름 영향과 런웨이 변화를 먼저 제시한다.',
      '투자 안건은 ROI/IRR, 회수 기간, 실패 시 손실 한도를 함께 보고한다.',
      '부채·환율·금리·M&A 리스크는 레드라인 초과 여부를 먼저 판정한다.',
      '성장 투자와 비용 절감이 충돌할 때는 고정비 구조와 회복 가능성을 비교한다.',
      '확인되지 않은 공개 SNS 신호는 사실처럼 단정하지 말고 추정 신호로 분리한다.',
      '기타 답변이나 모순된 답변은 최종 결론 전에 확인 필요로 표시한다.',
      '보고는 결론, 근거 숫자, 리스크, 다음 액션 순서로 짧게 작성한다.',
    ].slice(0, otherAnswers.length > 2 ? 7 : 6),
    needsConfirmation: [
      !profile.name && '사용자 이름',
      !profile.companyName && '회사명',
      !profile.snsId && 'SNS ID',
      otherAnswers.length > 0 && `기타 답변 ${otherAnswers.length}개 세부 의미`,
      publicData.status !== 'collected' && '공개 데이터 수집 결과',
    ].filter(Boolean) as string[],
  };
};

const buildDecisionPrompt = (
  tree: string,
  profile: UserProfile,
  answers: string[],
  finalOutput: FinalInterviewOutput | null,
) => `You are an AI finance advisor for a C-Level leader.

User profile:
${JSON.stringify(profile, null, 2)}

Interview answers:
${answers.map((answer, index) => `${index + 1}. ${answer}`).join('\n') || 'No completed answer yet.'}

Decision criteria summary:
${finalOutput ? JSON.stringify(finalOutput, null, 2) : 'Interview not completed yet.'}

Follow this decision tree:
\`\`\`mermaid
${tree}
\`\`\`

Advisor rules:
- Do not invent missing financial thresholds.
- Mark unknowns as "확인 필요".
- Always produce: conclusion, financial criteria, red line, risk, next action.`;

interface InterviewViewProps {
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  decisions: DecisionRecord[];
  onCreatePersona: (persona: Persona) => void | Promise<void>;
  onAddHistoryRecord: (record: DecisionRecord) => void;
  onGoToPersonas: () => void;
}

export const InterviewView: React.FC<InterviewViewProps> = ({
  messages,
  setMessages,
  decisions,
  onCreatePersona,
  onAddHistoryRecord,
  onGoToPersonas,
}) => {
  const [step, setStep] = useState<FlowStep>('profile');
  const [interviewPhase, setInterviewPhase] = useState<InterviewPhase>('pre');
  const [profile, setProfile] = useState<UserProfile>(() => loadInitialProfile());
  const [activeQuestions, setActiveQuestions] = useState<InterviewQuestion[]>(() => createPreInterviewQuestions());
  const [preInterviewAnswers, setPreInterviewAnswers] = useState<PreInterviewAnswer[]>([]);
  const [preInterviewContext, setPreInterviewContext] = useState<PreInterviewContext | null>(null);
  const [publicData, setPublicData] = useState<PublicDataSnapshot>({ status: 'idle', accounts: [], signals: [], posts: [] });
  const [inputText, setInputText] = useState('');
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [isThinking, setIsThinking] = useState(false);
  const [isCollecting, setIsCollecting] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const [saveError, setSaveError] = useState('');
  const [savedIntakeIds, setSavedIntakeIds] = useState<SavedIntakeIds | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [finalOutput, setFinalOutput] = useState<FinalInterviewOutput | null>(null);
  const [draftName, setDraftName] = useState('재무 의사결정 AI 참모');
  const [draftRole, setDraftRole] = useState<RoleType>('재무');
  const [draftBadge, setDraftBadge] = useState('CFO Decision Advisor');
  const [draftDescription, setDraftDescription] = useState('');
  const [draftDecisionStyle, setDraftDecisionStyle] = useState('');
  const [selectedDecisionId, setSelectedDecisionId] = useState(decisions[0]?.id ?? '');
  const [isDemoRunning, setIsDemoRunning] = useState(false);
  const [algorithmTree, setAlgorithmTree] = useState(defaultAlgorithmTree);
  const [algorithmPreviewError, setAlgorithmPreviewError] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const algorithmPreviewRef = useRef<HTMLDivElement>(null);

  const totalQuestions = activeQuestions.length;
  const userAnswers = messages.filter((msg) => msg.sender === 'user').map((msg) => msg.text);
  const selectedDecision = decisions.find((decision) => decision.id === selectedDecisionId) ?? decisions[0] ?? null;
  const brainstormerSystemPrompt = useMemo(
    () => createBrainstormerPrompt(profile, totalQuestions, publicData, preInterviewContext),
    [profile, totalQuestions, publicData, preInterviewContext],
  );
  const decisionPrompt = buildDecisionPrompt(algorithmTree, profile, userAnswers, finalOutput);
  const progressPercent = step === 'profile' ? 0 : isComplete ? 100 : Math.round(((currentQIndex + 1) / totalQuestions) * 100);
  const estimatedTimeLeft =
    step === 'profile'
      ? '수집 전'
      : isComplete
        ? '완료'
        : `${Math.max(1, totalQuestions - currentQIndex)}분`;

  const updateProfile = (field: keyof UserProfile, value: string) => {
    setProfile((current) => ({ ...current, [field]: value }));
  };

  useEffect(() => {
    window.localStorage.removeItem('decision-interview-draft');
  }, []);

  useEffect(() => {
    window.sessionStorage.setItem(profileDraftStorageKey, JSON.stringify(profile));
  }, [profile]);

  const discoverPublicData = async (): Promise<PublicDataSnapshot> => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), snsDiscoveryClientTimeoutMs);

    try {
      const response = await fetch('/api/sns-discovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          snsId: profile.snsId,
          profile,
        }),
      });

      const result = (await response.json()) as SnsDiscoveryResponse;

      if (!response.ok || !result.ok || !result.publicData) {
        return buildPublicDataFallback(profile, result.message ?? 'SNS 공개 데이터 수집에 실패했습니다.');
      }

      return result.publicData;
    } catch (error) {
      const reason = error instanceof DOMException && error.name === 'AbortError'
        ? 'Sherlock 탐색 시간 초과'
        : error instanceof Error
          ? error.message
          : '알 수 없는 SNS 탐색 오류';

      return buildPublicDataFallback(profile, reason);
    } finally {
      window.clearTimeout(timeoutId);
    }
  };

  const saveProfileIntake = async (
    snapshot: PublicDataSnapshot,
    questions: InterviewQuestion[],
    systemPrompt: string,
  ): Promise<SavedIntakeIds> => {
    setSaveStatus('saving');
    setSaveError('');

    const response = await fetch('/api/profile-intake', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profile,
        publicData: snapshot,
        questionCount: questions.length,
        brainstormerSystemPrompt: systemPrompt,
      }),
    });

    const result = await response.json();

    if (!response.ok || !result.ok) {
      throw new Error(result.message ?? 'DB 저장에 실패했습니다.');
    }

    setSavedIntakeIds(result.ids);
    setSaveStatus('saved');
    return result.ids;
  };

  const generateAgentDeepQuestions = async (context: PreInterviewContext): Promise<InterviewQuestion[]> => {
    try {
      const response = await fetch('/api/agent/deep-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile,
          publicData,
          preInterviewContext: context,
        }),
      });
      const result = (await response.json()) as AgentQuestionsResponse;

      if (!response.ok || !result.ok || !result.questions?.length) {
        throw new Error(result.message ?? '심층 질문 생성에 실패했습니다.');
      }

      return result.questions;
    } catch (error) {
      console.warn('Falling back to local deep question generation', error);
      return createDeepInterviewQuestions(context);
    }
  };

  const generateAgentFinalOutput = async (
    answers: string[],
    snapshot: PublicDataSnapshot,
    context: PreInterviewContext | null = preInterviewContext,
  ): Promise<FinalInterviewOutput> => {
    try {
      const response = await fetch('/api/agent/final-output', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile,
          answers,
          publicData: snapshot,
          preInterviewContext: context,
        }),
      });
      const result = (await response.json()) as AgentFinalOutputResponse;

      if (!response.ok || !result.ok || !result.finalOutput) {
        throw new Error(result.message ?? '최종 요약 생성에 실패했습니다.');
      }

      return result.finalOutput;
    } catch (error) {
      console.warn('Falling back to local final output generation', error);
      return createFinalOutput(profile, answers, snapshot);
    }
  };

  const startDataCollection = async () => {
    setIsCollecting(true);
    setSaveStatus('idle');
    setSaveError('');

    try {
      const snapshot = await discoverPublicData();
      const questions = createPreInterviewQuestions();
      const prompt = createBrainstormerPrompt(profile, questions.length, snapshot);

      await saveProfileIntake(snapshot, questions, prompt);

      setPublicData(snapshot);
      setActiveQuestions(questions);
      setMessages(buildInitialMessages(questions, prompt, 'pre'));
      setCurrentQIndex(0);
      setInterviewPhase('pre');
      setPreInterviewAnswers([]);
      setPreInterviewContext(null);
      setIsComplete(false);
      setFinalOutput(null);
      setStep('interview');
    } catch (error) {
      setSaveStatus('failed');
      setSaveError(error instanceof Error ? error.message : 'DB 저장 중 알 수 없는 오류가 발생했습니다.');
    } finally {
      setIsCollecting(false);
    }
  };

  const resetAll = () => {
    window.localStorage.removeItem('decision-interview-draft');
    window.sessionStorage.removeItem(profileDraftStorageKey);
    setStep('profile');
    setProfile(defaultProfile);
    setActiveQuestions(createPreInterviewQuestions());
    setInterviewPhase('pre');
    setPreInterviewAnswers([]);
    setPreInterviewContext(null);
    setPublicData({ status: 'idle', accounts: [], signals: [], posts: [] });
    setMessages([]);
    setSaveStatus('idle');
    setSaveError('');
    setSavedIntakeIds(null);
    setCurrentQIndex(0);
    setIsThinking(false);
    setIsCollecting(false);
    setIsComplete(false);
    setFinalOutput(null);
    setInputText('');
    setDraftName('재무 의사결정 AI 참모');
    setDraftRole('재무');
    setDraftBadge('CFO Decision Advisor');
    setDraftDescription('');
    setDraftDecisionStyle('');
    setSelectedDecisionId(decisions[0]?.id ?? '');
    setAlgorithmTree(defaultAlgorithmTree);
  };

  const createInterviewHistoryRecord = (
    answers: string[],
    result: FinalInterviewOutput,
    snapshot: PublicDataSnapshot,
    context = preInterviewContext,
  ): DecisionRecord => {
    const today = new Date().toLocaleDateString('ko-KR').replace(/\.\s*/g, '.').replace(/\.$/, '');
    const timeline = answers.map((answer, index) => {
      const question = activeQuestions[index];

      return {
        time: `${String(index + 1).padStart(2, '0')}:00`,
        speaker: profile.name || '사용자',
        role: profile.title || '재무 리더',
        content: `${question?.category ?? '인터뷰'} · ${question?.question ?? '질문'}\n답변: ${answer}`,
      };
    });

    return {
      id: `interview-${Date.now()}`,
      date: today,
      question: `${profile.name || '사용자'} 재무 의사결정 체계 인터뷰`,
      category: '인터뷰 / 재무 의사결정',
      participants: ['브레인스토머', profile.name || '사용자'],
      timeline,
      agreementPoints: result.coreInstructions,
      disagreements: result.needsConfirmation.length ? result.needsConfirmation : ['추가 확인 필요 항목 없음'],
      finalConclusion: result.oneSentenceSystem,
      recommendation: result.coreInstructions.slice(0, 3).join(' / '),
      impactScore: result.needsConfirmation.length > 2 ? 'Medium' : 'High',
      preInterviewContext: context,
      publicData: snapshot,
    };
  };

  const saveInterviewHistoryRecord = async (record: DecisionRecord, userProfileId = savedIntakeIds?.userProfileId) => {
    if (!userProfileId) return;

    try {
      await fetch('/api/history-records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userProfileId,
          record,
        }),
      });
    } catch (error) {
      console.error('Failed to save interview history record', error);
    }
  };

  const completeInterview = async (
    answers: string[],
    snapshot = publicData,
    intakeIds = savedIntakeIds,
    context = preInterviewContext,
  ) => {
    const result = await generateAgentFinalOutput(answers, snapshot, context);
    const historyRecord = createInterviewHistoryRecord(answers, result, snapshot, context);

    setFinalOutput(result);
    setDraftName(`${profile.name || '사용자'}의 재무 의사결정 참모`);
    setDraftRole('재무');
    setDraftBadge('Finance Decision System');
    setDraftDecisionStyle(result.oneSentenceSystem);
    setDraftDescription(
      `프로필, 공개 데이터 신호 ${snapshot.signals.length}개, 재무 인터뷰 답변 ${answers.length}개를 바탕으로 생성한 1차 초안입니다.`,
    );
    onAddHistoryRecord(historyRecord);
    void saveInterviewHistoryRecord(historyRecord, intakeIds?.userProfileId);
    setIsComplete(true);
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isThinking]);

  useEffect(() => {
    mermaid.initialize({ startOnLoad: false, securityLevel: 'loose', theme: 'neutral' });
  }, []);

  useEffect(() => {
    let cancelled = false;

    const renderTree = async () => {
      if (!algorithmPreviewRef.current || !algorithmTree.trim()) return;
      try {
        setAlgorithmPreviewError('');
        const { svg } = await mermaid.render(`finance-tree-${Math.random().toString(36).slice(2)}`, algorithmTree);
        if (!cancelled && algorithmPreviewRef.current) algorithmPreviewRef.current.innerHTML = svg;
      } catch {
        if (!cancelled) {
          setAlgorithmPreviewError('Mermaid 문법을 확인하세요.');
          if (algorithmPreviewRef.current) algorithmPreviewRef.current.innerHTML = '';
        }
      }
    };

    renderTree();
    return () => {
      cancelled = true;
    };
  }, [algorithmTree, isComplete]);

  const handleSendAnswer = (answerText: string) => {
    if (!answerText.trim() || isThinking || isDemoRunning || isComplete || step !== 'interview') return;
    const currentQuestion = activeQuestions[currentQIndex];

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      sender: 'user',
      text: answerText,
      timestamp: formatTime(),
    };
    const nextAnswers = [...userAnswers, answerText];

    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setIsThinking(true);

    window.setTimeout(async () => {
      const nextIndex = currentQIndex + 1;
      if (interviewPhase === 'pre') {
        const nextPreAnswers = [
          ...preInterviewAnswers,
          {
            category: currentQuestion?.category ?? '기타',
            question: currentQuestion?.question ?? '질문',
            answer: answerText,
          },
        ];

        if (nextIndex < totalQuestions) {
          setPreInterviewAnswers(nextPreAnswers);
          setCurrentQIndex(nextIndex);
          const nextQ = activeQuestions[nextIndex];
          setMessages((prev) => [
            ...prev,
            {
              id: `ai-${Date.now()}`,
              sender: 'ai',
              text: `답변을 기록했습니다.\n\n${nextQ.question}`,
              timestamp: formatTime(),
              questionType: nextQ.type,
              options: nextQ.options,
            },
          ]);
          setIsThinking(false);
          return;
        }

        const context = createPreInterviewContext(nextPreAnswers);
        const deepQuestions = await generateAgentDeepQuestions(context);
        const prompt = createBrainstormerPrompt(profile, deepQuestions.length, publicData, context);

        setPreInterviewAnswers(nextPreAnswers);
        setPreInterviewContext(context);
        setInterviewPhase('deep');
        setActiveQuestions(deepQuestions);
        setCurrentQIndex(0);
        setMessages(buildInitialMessages(deepQuestions, prompt, 'deep'));
        setIsThinking(false);
        return;
      }

      if (nextIndex < totalQuestions) {
        setCurrentQIndex(nextIndex);
        const nextQ = activeQuestions[nextIndex];
        setMessages((prev) => [
          ...prev,
          {
            id: `ai-${Date.now()}`,
            sender: 'ai',
            text: `답변을 기록했습니다.\n\n${nextQ.question}`,
            timestamp: formatTime(),
            questionType: nextQ.type,
            options: nextQ.options,
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: `ai-complete-${Date.now()}`,
            sender: 'ai',
            text: '인터뷰가 완료되었습니다. 1차 결과로 의사 결정 기준 요약과 AI 참모 핵심 지침을 생성했습니다.',
            timestamp: formatTime(),
          },
        ]);
        void completeInterview(nextAnswers);
      }
      setIsThinking(false);
    }, 500);
  };

  const handleOptionAnswer = (answerText: string) => {
    if (/^\s*E\.\s*기타/.test(answerText) || answerText.includes('E. 기타')) {
      setInputText('');
      return;
    }

    handleSendAnswer(answerText);
  };

  const runDemoFlow = async () => {
    if (isDemoRunning || isThinking) return;
    const demoProfileContext: UserProfile = {
      ...profile,
      name: profile.name || '사용자',
      title: profile.title || 'CFO / 재무 리더',
      industry: profile.industry || 'B2B SaaS',
      companySize: profile.companySize || '51-200명',
      companyName: profile.companyName || '회사명 미입력',
      snsId: profile.snsId || '@unknown',
      financeScope: profile.financeScope || '자본 배치, 투자, 리스크, 자금 운용',
    };
    const preQuestions = createPreInterviewQuestions();
    const demoPreAnswers: PreInterviewAnswer[] = preQuestions.map((question) => ({
      category: question.category,
      question: question.question,
      answer: question.options?.[0] ?? '1. 확인 필요',
    }));
    const demoContext = createPreInterviewContext(demoPreAnswers);
    const demoQuestions = await generateAgentDeepQuestions(demoContext);
    const answers = demoQuestions.map((question, index) => question.options?.[index % 4] ?? financeDemoAnswers[index] ?? 'A. 확인 후 결정한다.');

    setIsDemoRunning(true);
    setIsCollecting(true);
    setSaveStatus('idle');
    setSaveError('');

    try {
      const demoSnapshot = profile.snsId.trim()
        ? await discoverPublicData()
        : buildPublicDataSnapshot(demoProfileContext);
      const prompt = createBrainstormerPrompt(demoProfileContext, demoQuestions.length, demoSnapshot, demoContext);
      let demoIntakeIds: SavedIntakeIds | null = null;

      try {
        demoIntakeIds = await saveProfileIntake(demoSnapshot, demoQuestions, prompt);
      } catch (error) {
        setSaveStatus('failed');
        setSaveError(error instanceof Error ? error.message : '데모 데이터 DB 저장에 실패했습니다.');
      }

      const transcript = buildInitialMessages(demoQuestions, prompt, 'deep');

      demoQuestions.forEach((question, index) => {
        transcript.push({
          id: `demo-u-${Date.now()}-${index}`,
          sender: 'user',
          text: answers[index],
          timestamp: formatTime(),
        });

        if (index + 1 < demoQuestions.length) {
          const nextQuestion = demoQuestions[index + 1];
          transcript.push({
            id: `demo-ai-${Date.now()}-${index}`,
            sender: 'ai',
            text: `답변을 기록했습니다.\n\n${nextQuestion.question}`,
            timestamp: formatTime(),
            questionType: nextQuestion.type,
            options: nextQuestion.options,
          });
          return;
        }

        transcript.push({
          id: `demo-ai-complete-${Date.now()}`,
          sender: 'ai',
          text: '데모 인터뷰가 완료되었습니다. 의사 결정 기준 요약과 AI 참모 핵심 지침을 생성했습니다.',
          timestamp: formatTime(),
        });
      });

      setPublicData(demoSnapshot);
      setActiveQuestions(demoQuestions);
      setInterviewPhase('deep');
      setPreInterviewAnswers(demoPreAnswers);
      setPreInterviewContext(demoContext);
      setMessages(transcript);
      setCurrentQIndex(demoQuestions.length - 1);
      setStep('interview');
      setIsComplete(false);
      setFinalOutput(null);
      void completeInterview(answers, demoSnapshot, demoIntakeIds, demoContext);
    } catch (error) {
      setSaveStatus('failed');
      setSaveError(error instanceof Error ? error.message : '데모 실행 중 알 수 없는 오류가 발생했습니다.');
    } finally {
      setIsCollecting(false);
      setIsThinking(false);
      setIsDemoRunning(false);
    }
  };

  const handleCreatePersona = async () => {
    const newPersona: Persona = {
      id: `p-${Date.now()}`,
      name: draftName || '재무 의사결정 AI 참모',
      role: draftRole,
      iconName: 'Sparkles',
      badge: draftBadge || 'Finance Advisor',
      description: draftDescription || '재무 의사결정 인터뷰 결과로 생성된 AI 참모 초안입니다.',
      status: 'training',
      createdAt: new Date().toLocaleDateString('ko-KR').replace(/\.\s*/g, '.').slice(0, -1),
      updatedAt: '방금 전',
      decisionStyle: draftDecisionStyle || finalOutput?.oneSentenceSystem || '확인 필요',
      decisionPrompt,
      coreValues: finalOutput
        ? Object.values(finalOutput.fiveLayerSummary)
        : ['재무 의사결정 기준 요약', 'AI 참모 핵심 지침'],
      strengths: finalOutput?.coreInstructions.slice(0, 3) ?? ['재무 기준 요약', '레드라인 표시'],
      weaknesses: finalOutput?.needsConfirmation.length
        ? finalOutput.needsConfirmation
        : ['실제 공개 데이터 크롤러 연동 전 모의 데이터 기반'],
      communicationStyle: finalOutput?.fiveLayerSummary.communicationFormat ?? '결론, 근거, 리스크, 다음 액션 순서로 보고합니다.',
      sampleConversations: [
        {
          question: '이 투자안을 검토할 때 무엇부터 볼까요?',
          answer: '현금흐름 영향, 회수 기간, 레드라인 초과 여부를 먼저 확인합니다.',
        },
      ],
      colorClass: 'text-emerald-600 dark:text-emerald-400',
      bgClass: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800',
    };

    try {
      await onCreatePersona(newPersona);
      onGoToPersonas();
    } catch (error) {
      setSaveStatus('failed');
      setSaveError(error instanceof Error ? error.message : '페르소나 DB 저장에 실패했습니다.');
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-slate-50 dark:bg-slate-950 max-w-7xl mx-auto border-x border-slate-200 dark:border-slate-800 shadow-sm animate-fade-in">
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 p-5 px-8 flex flex-col xl:flex-row xl:items-center justify-between gap-5 sticky top-0 z-10">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800">
              Step {step === 'profile' ? '1. 데이터 수집' : interviewPhase === 'pre' ? '2. 사전 질문' : '3. 심층 인터뷰'}
            </span>
            <span className="text-xs font-semibold text-slate-500">
              {step === 'profile' ? '프로필 입력 전' : `문항 ${Math.min(totalQuestions, currentQIndex + 1)} / ${totalQuestions}`}
            </span>
            {isComplete && <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">완료</span>}
          </div>
          <h2 className="text-base font-extrabold text-slate-900 dark:text-white mt-1">
            C-Level 재무 의사결정 체계 프로토타입
          </h2>
        </div>

        <div className="flex items-center gap-6 min-w-[260px]">
          <div className="flex-1">
            <div className="flex justify-between text-xs font-bold mb-1">
              <span className="text-indigo-600 dark:text-indigo-400">진행률</span>
              <span className="text-slate-700 dark:text-slate-300">{progressPercent}%</span>
            </div>
            <div className="w-full bg-slate-200 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
              <div className="bg-gradient-to-r from-indigo-500 to-emerald-500 h-full rounded-full transition-all duration-500" style={{ width: `${progressPercent}%` }} />
            </div>
          </div>
          <div className="text-right shrink-0">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">남은 시간</span>
            <span className="text-xs font-extrabold text-slate-700 dark:text-slate-200 flex items-center gap-1 justify-end">
              <Clock className="w-3.5 h-3.5 text-amber-500" /> {estimatedTimeLeft}
            </span>
          </div>
          <button type="button" onClick={runDemoFlow} disabled={isDemoRunning || isThinking} className="h-10 inline-flex items-center gap-2 px-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-300 dark:disabled:bg-slate-800 text-white text-xs font-bold">
            <Play className="w-3.5 h-3.5" />
            데모
          </button>
          <button type="button" onClick={resetAll} className="h-10 inline-flex items-center justify-center w-10 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200" aria-label="초기화">
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 px-8 space-y-6">
        {step === 'profile' && (
          <div className="max-w-5xl">
            <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-5">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                  <UserRound className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900 dark:text-white">1단계. 사용자 정보와 공개 데이터 수집</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                    프로필과 Sherlock SNS 탐색 신호를 먼저 수집합니다. 탐색이 오래 걸리면 확인 필요로 저장하고 인터뷰를 계속 진행합니다.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  ['name', '이름', '예: 김도현'],
                  ['title', '직책', '예: CFO / 재무 리더'],
                  ['industry', '업종', '예: B2B SaaS'],
                  ['companySize', '회사 규모', '예: 51-200명'],
                  ['companyName', '회사명', '예: 넥스트스텝 AI Labs'],
                  ['snsId', 'SNS ID', '예: @yourname'],
                ].map(([field, label, placeholder]) => (
                  <label key={field} className="space-y-1.5">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{label}</span>
                    <input
                      type="text"
                      value={profile[field as keyof UserProfile]}
                      onChange={(event) => updateProfile(field as keyof UserProfile, event.target.value)}
                      placeholder={placeholder}
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 px-3 py-2.5 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </label>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-[1fr_160px] gap-4">
                <label className="space-y-1.5">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">재무 의사결정 범위</span>
                  <input
                    type="text"
                    value={profile.financeScope}
                    onChange={(event) => updateProfile('financeScope', event.target.value)}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 px-3 py-2.5 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </label>
                <div className="space-y-1.5">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">인터뷰 문항</span>
                  <div className="w-full rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2.5 text-xs font-black text-emerald-700 dark:text-emerald-300">
                    {activeQuestions.length}개
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={startDataCollection}
                disabled={isCollecting}
                className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-300 text-white text-xs font-bold shadow-lg shadow-indigo-500/20 transition-all"
              >
                {isCollecting || saveStatus === 'saving' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <SearchCheck className="w-4 h-4" />}
                DB 저장 + Sherlock SNS 탐색 후 인터뷰 시작
              </button>

              {saveStatus === 'saved' && savedIntakeIds && (
                <div className="rounded-2xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30 p-3 text-xs text-emerald-700 dark:text-emerald-300">
                  사용자 정보가 DB에 저장되었습니다. profile_id: {savedIntakeIds.userProfileId}
                </div>
              )}

              {saveStatus === 'failed' && (
                <div className="rounded-2xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/30 p-3 text-xs text-rose-700 dark:text-rose-300">
                  DB 저장 실패: {saveError}
                </div>
              )}
            </section>

          </div>
        )}

        {step === 'interview' && (
          <div className="max-w-5xl">
            <div className="space-y-5">
              {messages.map((msg) => {
                const isAi = msg.sender === 'ai';
                return (
                  <div key={msg.id} className={`flex items-start gap-4 ${isAi ? 'justify-start' : 'justify-end'}`}>
                    {isAi && <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-700 text-white flex items-center justify-center shrink-0 shadow-md"><Bot className="w-5 h-5" /></div>}
                    <div className={`max-w-3xl ${isAi ? 'w-full' : ''}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{isAi ? '브레인스토머' : '사용자'}</span>
                        <span className="text-[10px] text-slate-400">{msg.timestamp}</span>
                        {isAi && msg.questionType && <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">{msg.questionType}</span>}
                      </div>
                      <div className={`p-5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap shadow-sm ${isAi ? 'bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-slate-800 dark:text-slate-200' : 'bg-indigo-600 text-white rounded-tr-sm'}`}>
                        {msg.text}
                        {isAi && msg.options && msg.options.length > 0 && !isComplete && (
                          <div className="mt-5 space-y-2.5 border-t border-slate-100 dark:border-slate-800 pt-4">
                            {msg.options.map((opt) => (
                              <button key={opt} disabled={isThinking || isDemoRunning} onClick={() => handleOptionAnswer(opt)} className="w-full text-left p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 hover:border-indigo-400 dark:hover:border-indigo-500 border border-slate-200 dark:border-slate-700/80 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-all flex items-center justify-between group">
                                <span>{opt}</span>
                                <ArrowRight className="w-4 h-4 text-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-2" />
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    {!isAi && <div className="w-9 h-9 rounded-full bg-slate-800 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-sm">U</div>}
                  </div>
                );
              })}
              {isThinking && <div className="flex items-center gap-3 text-xs text-slate-500 p-2 pl-12 animate-pulse"><RefreshCw className="w-4 h-4 animate-spin text-indigo-500" />재무 판단 기준 신호를 분석 중입니다...</div>}
              <div ref={chatEndRef} />
            </div>
          </div>
        )}

        {isComplete && finalOutput && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 text-xs font-bold">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  1차 결과 생성 완료
                </div>
                <h3 className="text-base font-black text-slate-900 dark:text-white mt-2">의사 결정 기준 요약 + AI 참모 핵심 지침</h3>
              </div>
              <button onClick={handleCreatePersona} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg shadow-indigo-500/20 transition-all">
                <Plus className="w-4 h-4" />
                참모 페르소나 생성
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 p-4">
                <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-3">1) 5개 층 요약</h4>
                <textarea readOnly value={JSON.stringify(finalOutput.fiveLayerSummary, null, 2)} rows={11} className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-[11px] font-mono text-slate-700 dark:text-slate-200 resize-none" />
              </div>
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 p-4">
                <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-3">2) 한 문장 정리</h4>
                <div className="rounded-xl border border-indigo-200 dark:border-indigo-900 bg-white dark:bg-slate-900 p-4 text-sm font-semibold text-slate-800 dark:text-slate-100 leading-relaxed">
                  {finalOutput.oneSentenceSystem}
                </div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white mt-5 mb-3">3) 핵심 지침 5~7개</h4>
                <ol className="space-y-2">
                  {finalOutput.coreInstructions.map((instruction, index) => (
                    <li key={instruction} className="flex gap-2 text-xs text-slate-700 dark:text-slate-300">
                      <span className="font-black text-indigo-500">{index + 1}.</span>
                      <span>{instruction}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                  <Workflow className="w-4 h-4 text-indigo-500" />
                  Mermaid 의사결정 트리 편집
                </div>
                <textarea value={algorithmTree} onChange={(e) => setAlgorithmTree(e.target.value)} rows={14} className="w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 text-[11px] font-mono text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none leading-relaxed" />
              </div>
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 p-4 space-y-3 overflow-hidden">
                <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                  <Play className="w-4 h-4 text-emerald-500" />
                  트리 미리보기
                </div>
                <div className="min-h-[320px] rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 overflow-auto">
                  <div ref={algorithmPreviewRef} className="w-full h-full flex items-center justify-center" />
                </div>
                {algorithmPreviewError && <div className="text-[11px] text-rose-600 dark:text-rose-400 font-semibold">{algorithmPreviewError}</div>}
              </div>
            </div>

            <div className="rounded-2xl border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/50 dark:bg-indigo-950/20 p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                <Database className="w-4 h-4 text-indigo-500" />
                AI 참모 프롬프트 미리보기
              </div>
              <textarea readOnly value={decisionPrompt} rows={10} className="w-full rounded-2xl border border-indigo-200 dark:border-indigo-900/60 bg-white dark:bg-slate-950/40 px-4 py-3 text-[11px] font-mono text-slate-800 dark:text-slate-100 resize-none leading-relaxed" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="space-y-1.5">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">참모 이름</span>
                <input type="text" value={draftName} onChange={(e) => setDraftName(e.target.value)} className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 px-3 py-2 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">역할</span>
                <select value={draftRole} onChange={(e) => setDraftRole(e.target.value as RoleType)} className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 px-3 py-2 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  {roleOptions.map((role) => <option key={role} value={role}>{role}</option>)}
                </select>
              </label>
            </div>
          </div>
        )}
      </div>

      {step === 'interview' && (
        <div className="p-4 px-8 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <input type="text" value={inputText} onChange={(e) => setInputText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSendAnswer(inputText)} placeholder={interviewPhase === 'deep' ? 'E. 기타를 선택했다면 한 문장으로 직접 입력' : '사전 질문은 보기 중 하나를 선택해주세요'} disabled={isComplete || interviewPhase === 'pre'} className="flex-1 px-4 py-3 bg-slate-100 dark:bg-slate-800 border border-transparent focus:border-indigo-500 rounded-xl text-xs focus:outline-none text-slate-800 dark:text-slate-100 placeholder:text-slate-400 disabled:opacity-50" />
            <button onClick={() => handleSendAnswer(inputText)} disabled={!inputText.trim() || isThinking || isDemoRunning || isComplete} className="p-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-300 dark:disabled:bg-slate-800 text-white rounded-xl shadow-md transition-all flex items-center justify-center" aria-label="답변 전송">
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
