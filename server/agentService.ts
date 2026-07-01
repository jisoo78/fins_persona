import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { PromptTemplate } from '@langchain/core/prompts';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface AgentQuestion {
  id: number;
  type: '객관식';
  category: string;
  question: string;
  options: string[];
}

type ContextQuestion = {
  question: string;
  answer: string;
  stage?: string;
  rationale?: string;
  response_time_ms?: number;
  response_signal?: string;
  selected_option_id?: number;
  source_question_id?: number;
};

interface PreInterviewContextV2 {
  meta?: Record<string, unknown>;
  communication_style?: Record<string, unknown>;
  categories: Record<string, Record<string, ContextQuestion>>;
}

export type PreInterviewContext = Record<string, Record<string, ContextQuestion>> | PreInterviewContextV2;

export interface AgentProfile {
  name?: string;
  title?: string;
  industry?: string;
  companySize?: string;
  companyName?: string;
  snsId?: string;
  financeScope?: string;
}

export interface AgentPublicData {
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

export interface AgentFinalOutput {
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
  personaPromptMarkdown?: string;
}

export interface AdvisorPromptInput {
  name: string;
  role: string;
  badge?: string;
  description?: string;
  decisionStyle?: string;
  coreValues?: string[];
  strengths?: string[];
  weaknesses?: string[];
  communicationStyle?: string;
  decisionPrompt?: string;
}

export interface PersonaChatInput extends AdvisorPromptInput {
  userMessage: string;
  recentMessages?: {
    sender: 'ai' | 'user';
    text: string;
  }[];
}

const getModel = () => {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) return null;

  return new ChatGoogleGenerativeAI({
    apiKey,
    model: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
    temperature: 0.2,
  });
};

const readPromptFile = (path: string) => {
  try {
    return readFileSync(resolve(process.cwd(), path), 'utf8');
  } catch (error) {
    console.warn(`Failed to read prompt file: ${path}`, error);
    return '';
  }
};

const deepInterviewPrompt = readPromptFile('agent_prompts/prompts/deep-interview-prompt.md');
const cfoDecisionSkill = readPromptFile('agent_prompts/skills/cfo-decision/SKILL.md');
const cfoDomainThresholds = readPromptFile('agent_prompts/skills/cfo-decision/references/cfo-domain-thresholds.md');
const personaPromptRendererSkill = readPromptFile('agent_prompts/skills/persona-prompt-renderer/SKILL.md');
const personaPromptTemplate = readPromptFile('agent_prompts/skills/persona-prompt-renderer/references/persona-prompt-template.md');

const isContextV2 = (context: PreInterviewContext): context is PreInterviewContextV2 =>
  'categories' in context && typeof context.categories === 'object' && context.categories !== null;

const getContextCategories = (context: PreInterviewContext): Record<string, Record<string, ContextQuestion>> => {
  if (isContextV2(context)) return context.categories;
  return context as Record<string, Record<string, ContextQuestion>>;
};

const contentToText = (content: unknown) => {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object' && 'text' in item) return String((item as { text?: unknown }).text ?? '');
        return '';
      })
      .join('');
  }
  return String(content ?? '');
};

const extractJson = <T>(text: string): T => {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced ?? text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  const jsonText = start >= 0 && end >= start ? candidate.slice(start, end + 1) : candidate;
  return JSON.parse(jsonText) as T;
};

const safeInvokeJson = async <T>(template: string, values: Record<string, unknown>) => {
  const model = getModel();
  if (!model) return null;

  const prompt = PromptTemplate.fromTemplate(template);
  const chain = prompt.pipe(model);
  const result = await chain.invoke(
    Object.fromEntries(Object.entries(values).map(([key, value]) => [key, typeof value === 'string' ? value : JSON.stringify(value, null, 2)])),
  );

  return extractJson<T>(contentToText(result.content));
};

export const fallbackDeepInterviewQuestions = (context: PreInterviewContext): AgentQuestion[] =>
  Object.entries(getContextCategories(context)).flatMap(([categoryName, answers], categoryIndex) => {
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

export const generateDeepInterviewQuestions = async (
  profile: AgentProfile,
  publicData: AgentPublicData,
  preInterviewContext: PreInterviewContext,
) => {
  try {
    const result = await safeInvokeJson<{ questions: AgentQuestion[] }>(
      `너는 C-Level 재무 의사결정 인터뷰어다.

아래 공통 시스템 프롬프트와 CFO Decision Skill을 반드시 따른다.

[Deep Interview Prompt]
{deepInterviewPrompt}

[CFO Decision Skill]
{cfoDecisionSkill}

[CFO Domain Thresholds]
{cfoDomainThresholds}

사용자 정보:
{profile}

공개 데이터 신호:
{publicData}

PreInterviewContext:
{preInterviewContext}

규칙:
- 각 카테고리마다 identity 또는 cross_dimension 축의 심층 질문 2개를 만든다.
- 사전 질문의 개별 답변을 반복하지 말고 여러 답변, rationale, response_signal 간 관계를 종합한다.
- 모든 질문은 객관식이다.
- 선택지는 A-D 4개와 마지막 "E. 기타 — 직접 입력"이다.
- slow_response는 참고 메타데이터로만 사용하고 별도 질문 축으로 만들지 않는다.
- 출력은 반드시 JSON만 반환한다.

JSON 형식:
{{
  "questions": [
    {{
      "id": 1,
      "type": "객관식",
      "category": "카테고리명",
      "question": "질문",
      "options": ["A. ...", "B. ...", "C. ...", "D. ...", "E. 기타 — 직접 입력"]
    }}
  ]
}}`,
      { deepInterviewPrompt, cfoDecisionSkill, cfoDomainThresholds, profile, publicData, preInterviewContext },
    );

    if (result?.questions?.length) return result.questions;
  } catch (error) {
    console.warn('LangChain deep interview generation fallback', error);
  }

  return fallbackDeepInterviewQuestions(preInterviewContext);
};

export const fallbackFinalOutput = (
  profile: AgentProfile,
  answers: string[],
  publicData: AgentPublicData,
): AgentFinalOutput => {
  const joined = answers.join(' ');
  const cashFirst = /현금|런웨이|cash/i.test(joined);
  const riskFirst = /리스크|손실|레드라인|부채|손절/i.test(joined);
  const roiFirst = /roi|irr|수익|이익/i.test(joined);
  const otherAnswers = answers.filter((answer) => answer.includes('E. 기타'));

  const oneSentenceSystem = cashFirst
    ? '이 재무 의사결정 체계는 성장 기회를 보되 현금흐름과 회복 가능성을 먼저 잠그는 보수적 실행 시스템이다.'
    : '이 재무 의사결정 체계는 아직 핵심 우선순위 확인이 더 필요한 초기 초안이다.';
  const coreInstructions = [
    '모든 재무 제안은 현금흐름 영향과 런웨이 변화를 먼저 제시한다.',
    '투자 안건은 ROI/IRR, 회수 기간, 실패 시 손실 한도를 함께 보고한다.',
    '부채·환율·금리·M&A 리스크는 레드라인 초과 여부를 먼저 판정한다.',
    '성장 투자와 비용 절감이 충돌할 때는 고정비 구조와 회복 가능성을 비교한다.',
    '확인되지 않은 공개 SNS 신호는 사실처럼 단정하지 말고 추정 신호로 분리한다.',
    '기타 답변이나 모순된 답변은 최종 결론 전에 확인 필요로 표시한다.',
    '보고는 결론, 근거 숫자, 리스크, 다음 액션 순서로 짧게 작성한다.',
  ].slice(0, otherAnswers.length > 2 ? 7 : 6);

  return {
    fiveLayerSummary: {
      role: `${profile.title || '재무 리더'}로서 자본·현금흐름·투자·리스크의 균형을 책임지는 의사결정자`,
      values: cashFirst ? '현금흐름 안정성과 회복 가능성을 절대 기준으로 둠' : '확인 필요',
      redLines: riskFirst ? '부채, 구조적 손실, 현금흐름 훼손 가능성이 레드라인으로 나타남' : '확인 필요',
      priorities: roiFirst ? 'ROI/IRR 등 정량 기준과 투자 회수 가능성을 우선 검토' : '확인 필요',
      communicationFormat: '숫자, 레드라인, 다음 액션이 함께 보이는 간결한 보고 형식을 선호하는 것으로 추정',
    },
    oneSentenceSystem,
    coreInstructions,
    needsConfirmation: [
      !profile.name && '사용자 이름',
      !profile.companyName && '회사명',
      !publicData.accounts.length && 'SNS 공개 계정 검증',
      !cashFirst && '현금흐름 우선 여부',
      !riskFirst && '레드라인 기준',
    ].filter(Boolean) as string[],
    personaPromptMarkdown: `# CFO Decision Persona Prompt

## 1. Role

You are a decision-making persona cloned from the user's CFO decision criteria.

## 2. Identity

- ${oneSentenceSystem}

## 3. Decision Principles

| Situation | Rule | Exception | Evidence |
| --- | --- | --- | --- |
| 재무 의사결정 검토 | ${coreInstructions[0]} | 확인되지 않은 기준은 "확인 필요"로 표시한다. | PreInterviewContext v2 및 심층 인터뷰 답변 |

## 4. Cross-Dimension Rules

${coreInstructions.slice(1, 4).map((instruction) => `- ${instruction}`).join('\n')}

## 5. Red Lines

- ${riskFirst ? '부채, 구조적 손실, 현금흐름 훼손 가능성이 보이면 실행을 보류한다.' : '레드라인은 확인 필요로 표시한다.'}

## 6. Communication Style

- 결론, 근거 숫자, 리스크, 다음 액션 순서로 답한다.

## 7. Evidence

- PreInterviewContext v2와 DeepInterviewResult에서 도출
- 공개 SNS 신호는 검증 전 추정 신호로 분리`,
  };
};

export const generateFinalOutput = async (
  profile: AgentProfile,
  answers: string[],
  publicData: AgentPublicData,
  preInterviewContext: PreInterviewContext | null,
) => {
  try {
    const result = await safeInvokeJson<AgentFinalOutput>(
      `너는 C-Level 재무 의사결정 체계를 요약하는 전문 분석 AI다.

아래 Persona Prompt Renderer Skill과 Markdown 템플릿을 참고해, JSON 요약뿐 아니라 에이전트에 주입 가능한 Markdown 프롬프트 내용도 생성한다.

[Persona Prompt Renderer Skill]
{personaPromptRendererSkill}

[Persona Prompt Template]
{personaPromptTemplate}

사용자 정보:
{profile}

공개 데이터:
{publicData}

PreInterviewContext:
{preInterviewContext}

심층 인터뷰 답변:
{answers}

주의:
- 답변을 임의로 일반화하거나 추측으로 보강하지 마라.
- 추가 데이터가 필요한 항목은 "확인 필요"로 표시한다.
- 출력은 반드시 JSON만 반환한다.

JSON 형식:
{{
  "fiveLayerSummary": {{
    "role": "역할 요약",
    "values": "가치 기준",
    "redLines": "금지선",
    "priorities": "우선순위",
    "communicationFormat": "보고/소통 형식"
  }},
  "oneSentenceSystem": "의사결정 체계 한 문장",
  "coreInstructions": ["AI 참모 프롬프트 핵심 지침 5~7개"],
  "needsConfirmation": ["확인 필요 항목"],
  "personaPromptMarkdown": "# CFO Decision Persona Prompt\\n\\n..."
}}`,
      { personaPromptRendererSkill, personaPromptTemplate, profile, publicData, preInterviewContext: preInterviewContext ?? {}, answers },
    );

    if (result?.oneSentenceSystem && result?.coreInstructions?.length) return result;
  } catch (error) {
    console.warn('LangChain final output fallback', error);
  }

  return fallbackFinalOutput(profile, answers, publicData);
};

export const generateAdvisorPrompt = async (persona: AdvisorPromptInput) => {
  const fallback = `You are ${persona.name}, an AI advisor persona.

Role: ${persona.role}
Badge: ${persona.badge || '신규 참모'}
Decision style: ${persona.decisionStyle || '확인 필요'}
Description: ${persona.description || '확인 필요'}
Core values: ${(persona.coreValues ?? []).join(', ') || '확인 필요'}

Always respond with:
1. conclusion
2. decision criteria
3. red line
4. risk
5. next action`;

  try {
    const result = await safeInvokeJson<{ advisorPrompt: string }>(
      `다음 페르소나를 외부 LLM에 주입할 수 있는 AI 참모 시스템 프롬프트로 변환해라.
출력은 반드시 JSON만 반환한다.

페르소나:
{persona}

JSON 형식:
{{
  "advisorPrompt": "시스템 프롬프트"
}}`,
      { persona },
    );

    return result?.advisorPrompt || fallback;
  } catch (error) {
    console.warn('LangChain advisor prompt fallback', error);
    return fallback;
  }
};

const fallbackPersonaChatReply = (input: PersonaChatInput) => {
  const primaryValue = input.coreValues?.[0] || input.decisionStyle || '확인 필요';
  const redLine = input.weaknesses?.[0] || '확인되지 않은 기준은 확정하지 않는다';

  return `${input.name} 관점에서 보면, 이 안건은 먼저 "${primaryValue}" 기준으로 검토해야 합니다.

1. 결론: 지금 바로 확정하기보다 핵심 판단 기준을 먼저 좁히는 것이 좋습니다.
2. 판단 기준: ${input.decisionStyle || '의사결정 스타일 확인 필요'}
3. 레드라인: ${redLine}
4. 리스크: 입력 정보만으로는 비용, 일정, 손실 한도, 책임 범위가 충분히 확인되지 않았습니다.
5. 다음 액션: "${input.userMessage}"에 대해 기대효과, 실패 시 손실, 중단 조건을 한 문장씩 정리해 주세요.`;
};

export const generatePersonaChatReply = async (input: PersonaChatInput) => {
  try {
    const result = await safeInvokeJson<{ reply: string }>(
      `너는 사용자가 생성한 AI 의사결정 페르소나다.

아래 페르소나 프롬프트가 있으면 최우선으로 따른다. 없으면 페르소나 속성을 기준으로 답한다.

[Persona Markdown/System Prompt]
{decisionPrompt}

[Persona Profile]
{persona}

[Recent Conversation]
{recentMessages}

[User Message]
{userMessage}

답변 규칙:
- 반드시 한국어로 답한다.
- 페르소나의 의사결정 기준, 강점, 약점, 커뮤니케이션 스타일을 반영한다.
- 모르는 내용은 "확인 필요"라고 표시한다.
- 답변은 결론, 판단 기준, 레드라인/리스크, 다음 액션 순서로 간결하게 작성한다.
- 출력은 반드시 JSON만 반환한다.

JSON 형식:
{{
  "reply": "답변"
}}`,
      {
        decisionPrompt: input.decisionPrompt || '',
        persona: {
          name: input.name,
          role: input.role,
          badge: input.badge,
          description: input.description,
          decisionStyle: input.decisionStyle,
          coreValues: input.coreValues,
          strengths: input.strengths,
          weaknesses: input.weaknesses,
          communicationStyle: input.communicationStyle,
        },
        recentMessages: input.recentMessages ?? [],
        userMessage: input.userMessage,
      },
    );

    if (result?.reply?.trim()) return result.reply;
  } catch (error) {
    console.warn('LangChain persona chat fallback', error);
  }

  return fallbackPersonaChatReply(input);
};
