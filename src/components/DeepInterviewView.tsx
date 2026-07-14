import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bot, CheckCircle2, ClipboardList, MessageSquareText, RefreshCw, Send } from 'lucide-react';
import { ChatMessage, InterviewQuestion } from '../types';

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
  personaPromptMarkdown?: string;
}

interface LatestContextPayload {
  id: string;
  interviewSessionId: string;
  userProfileId: string;
  profile: UserProfile;
  publicData: PublicDataSnapshot;
  preInterviewContext: unknown;
  updatedAt: string;
}

interface LatestContextResponse {
  ok: boolean;
  message?: string;
  context: LatestContextPayload | null;
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

interface DeepInterviewViewProps {
  onBackToPreInterview: () => void;
}

const formatTime = () =>
  new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });

const isComposingKorean = (event: React.KeyboardEvent<HTMLInputElement>) =>
  event.nativeEvent.isComposing || event.keyCode === 229;

const buildRecord = (
  latestContext: LatestContextPayload,
  questions: InterviewQuestion[],
  answers: string[],
  finalOutput: FinalInterviewOutput,
) => ({
  id: `deep-interview-${Date.now()}`,
  date: new Date().toLocaleDateString('ko-KR').replace(/\.\s*/g, '.').replace(/\.$/, ''),
  question: `${latestContext.profile.name || '사용자'} 심층 재무 의사결정 인터뷰`,
  category: '심층 인터뷰 / 재무 의사결정',
  participants: ['심층 인터뷰어', latestContext.profile.name || '사용자'],
  timeline: answers.map((answer, index) => ({
    time: `${String(index + 1).padStart(2, '0')}:00`,
    speaker: latestContext.profile.name || '사용자',
    role: latestContext.profile.title || 'CFO / 재무 리더',
    content: `${questions[index]?.category ?? '심층 인터뷰'} · ${questions[index]?.question ?? '질문'}\n답변: ${answer}`,
  })),
  agreementPoints: finalOutput.coreInstructions,
  disagreements: finalOutput.needsConfirmation.length ? finalOutput.needsConfirmation : ['추가 확인 필요 항목 없음'],
  finalConclusion: finalOutput.oneSentenceSystem,
  recommendation: finalOutput.coreInstructions.slice(0, 3).join(' / '),
  impactScore: finalOutput.needsConfirmation.length > 2 ? 'Medium' : 'High',
  preInterviewContext: latestContext.preInterviewContext,
  publicData: latestContext.publicData,
});

export const DeepInterviewView: React.FC<DeepInterviewViewProps> = ({ onBackToPreInterview }) => {
  const [latestContext, setLatestContext] = useState<LatestContextPayload | null>(null);
  const [questions, setQuestions] = useState<InterviewQuestion[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [finalOutput, setFinalOutput] = useState<FinalInterviewOutput | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [error, setError] = useState('');
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const progressPercent = useMemo(() => {
    if (!questions.length) return 0;
    return Math.round((answers.length / questions.length) * 100);
  }, [answers.length, questions.length]);

  const loadLatestContext = async () => {
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/pre-interview-contexts/latest');
      const result = (await response.json()) as LatestContextResponse;

      if (!response.ok || !result.ok) {
        throw new Error(result.message ?? '사전 질문 결과 조회에 실패했습니다.');
      }

      setLatestContext(result.context);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '사전 질문 결과 조회 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadLatestContext();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isThinking]);

  const generateQuestions = async () => {
    if (!latestContext) return;
    setIsGenerating(true);
    setError('');
    setFinalOutput(null);
    setAnswers([]);
    setCurrentIndex(0);

    try {
      const response = await fetch('/api/agent/deep-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile: latestContext.profile,
          publicData: latestContext.publicData,
          preInterviewContext: latestContext.preInterviewContext,
        }),
      });
      const result = (await response.json()) as AgentQuestionsResponse;

      if (!response.ok || !result.ok || !result.questions?.length) {
        throw new Error(result.message ?? '심층 질문 생성에 실패했습니다.');
      }

      setQuestions(result.questions);
      setMessages([
        {
          id: `ai-${Date.now()}`,
          sender: 'ai',
          text: result.questions[0].question,
          timestamp: formatTime(),
          questionType: result.questions[0].type,
          options: result.questions[0].options,
        },
      ]);
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : '심층 질문 생성 중 오류가 발생했습니다.');
    } finally {
      setIsGenerating(false);
    }
  };

  const completeInterview = async (nextAnswers: string[]) => {
    if (!latestContext) return;

    try {
      const response = await fetch('/api/agent/final-output', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile: latestContext.profile,
          answers: nextAnswers,
          publicData: latestContext.publicData,
          preInterviewContext: latestContext.preInterviewContext,
        }),
      });
      const result = (await response.json()) as AgentFinalOutputResponse;

      if (!response.ok || !result.ok || !result.finalOutput) {
        throw new Error(result.message ?? '최종 요약 생성에 실패했습니다.');
      }

      setFinalOutput(result.finalOutput);
      setMessages((prev) => [
        ...prev,
        {
          id: `ai-complete-${Date.now()}`,
          sender: 'ai',
          text: '심층 인터뷰가 완료되었습니다. 의사결정 기준 요약과 핵심 지침을 생성했습니다.',
          timestamp: formatTime(),
        },
      ]);

      await fetch('/api/history-records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userProfileId: latestContext.userProfileId,
          interviewSessionId: latestContext.interviewSessionId,
          finalOutput: result.finalOutput,
          deepInterviewAnswers: nextAnswers,
          record: buildRecord(latestContext, questions, nextAnswers, result.finalOutput),
        }),
      });
    } catch (completeError) {
      setError(completeError instanceof Error ? completeError.message : '최종 요약 생성 중 오류가 발생했습니다.');
    }
  };

  const handleAnswer = (answerText: string) => {
    const trimmed = answerText.trim();
    if (!trimmed || isThinking || finalOutput || !questions.length) return;

    const nextAnswers = [...answers, trimmed];
    const nextIndex = currentIndex + 1;
    setAnswers(nextAnswers);
    setInputText('');
    setIsThinking(true);
    setMessages((prev) => [
      ...prev,
      {
        id: `user-${Date.now()}`,
        sender: 'user',
        text: trimmed,
        timestamp: formatTime(),
      },
    ]);

    window.setTimeout(() => {
      if (nextIndex < questions.length) {
        const nextQuestion = questions[nextIndex];
        setCurrentIndex(nextIndex);
        setMessages((prev) => [
          ...prev,
          {
            id: `ai-${Date.now()}`,
            sender: 'ai',
            text: nextQuestion.question,
            timestamp: formatTime(),
            questionType: nextQuestion.type,
            options: nextQuestion.options,
          },
        ]);
        setIsThinking(false);
        return;
      }

      void completeInterview(nextAnswers).finally(() => setIsThinking(false));
    }, 350);
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-100 dark:border-emerald-900 text-emerald-600 dark:text-emerald-400 text-xs font-semibold mb-3">
            <Bot className="w-3.5 h-3.5" />
            <span>CFO 심층 인터뷰</span>
          </div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white">
            사전 질문 결과 기반 심층 인터뷰
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
            사전 질문 결과를 심층 인터뷰어 프롬프트에 주입해 후속 질문을 생성합니다.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onBackToPreInterview}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200"
          >
            <ClipboardList className="w-4 h-4" />
            사전 질문으로 이동
          </button>
          <button
            type="button"
            onClick={loadLatestContext}
            disabled={isLoading}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 disabled:opacity-60"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            최신 사전 질문 결과 불러오기
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/30 p-4 text-xs text-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}

      {!isLoading && !latestContext && (
        <section className="bg-white dark:bg-slate-900/60 rounded-3xl border border-dashed border-slate-300 dark:border-slate-800 p-10 text-center space-y-4">
          <MessageSquareText className="w-10 h-10 text-slate-400 mx-auto" />
          <h2 className="text-lg font-black text-slate-900 dark:text-white">저장된 사전 질문 결과가 없습니다.</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            먼저 사전 질문을 완료하면 심층 인터뷰에서 최신 사전 질문 결과를 불러올 수 있습니다.
          </p>
          <button
            type="button"
            onClick={onBackToPreInterview}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold"
          >
            사전 질문 시작
          </button>
        </section>
      )}

      {latestContext && (
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-sm space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-black text-slate-900 dark:text-white">
                {latestContext.profile.name || '사용자'} · {latestContext.profile.title || 'CFO / 재무 리더'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {latestContext.profile.companyName || '회사명 미입력'} / {latestContext.profile.industry || '업종 미입력'} / 공개 신호 {latestContext.publicData.signals.length}개
              </p>
            </div>
            <button
              type="button"
              onClick={generateQuestions}
              disabled={isGenerating || isThinking}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-300 dark:disabled:bg-slate-800 text-white text-xs font-bold"
            >
              {isGenerating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />}
              심층 질문 생성
            </button>
          </div>

          {questions.length > 0 && (
            <div>
              <div className="flex justify-between text-xs font-bold mb-1">
                <span className="text-indigo-600 dark:text-indigo-400">진행률</span>
                <span className="text-slate-700 dark:text-slate-300">{answers.length} / {questions.length}</span>
              </div>
              <div className="w-full bg-slate-200 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                <div className="bg-gradient-to-r from-indigo-500 to-emerald-500 h-full rounded-full transition-all duration-500" style={{ width: `${progressPercent}%` }} />
              </div>
            </div>
          )}
        </section>
      )}

      {messages.length > 0 && (
        <section className="bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 space-y-5">
          {messages.map((message) => {
            const isAi = message.sender === 'ai';
            return (
              <div key={message.id} className={`flex items-start gap-4 ${isAi ? 'justify-start' : 'justify-end'}`}>
                {isAi && <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-700 text-white flex items-center justify-center shrink-0 shadow-md"><Bot className="w-5 h-5" /></div>}
                <div className={`max-w-3xl ${isAi ? 'w-full' : ''}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{isAi ? '심층 인터뷰어' : '사용자'}</span>
                    <span className="text-[10px] text-slate-400">{message.timestamp}</span>
                  </div>
                  <div className={`p-5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap shadow-sm ${isAi ? 'bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-slate-800 dark:text-slate-200' : 'bg-indigo-600 text-white rounded-tr-sm'}`}>
                    {message.text}
                    {isAi && message.options && !finalOutput && (
                      <div className="mt-5 space-y-2.5 border-t border-slate-100 dark:border-slate-800 pt-4">
                        {message.options.map((option) => (
                          <button
                            key={option}
                            disabled={isThinking}
                            onClick={() => handleAnswer(option)}
                            className="w-full text-left p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 hover:border-indigo-400 dark:hover:border-indigo-500 border border-slate-200 dark:border-slate-700/80 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-all"
                          >
                            {option}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {isThinking && <div className="flex items-center gap-3 text-xs text-slate-500 p-2 pl-12 animate-pulse"><RefreshCw className="w-4 h-4 animate-spin text-indigo-500" />응답을 반영하는 중입니다...</div>}
          <div ref={chatEndRef} />
        </section>
      )}

      {questions.length > 0 && !finalOutput && (
        <div className="sticky bottom-0 bg-slate-100/95 dark:bg-slate-950/95 border border-slate-200 dark:border-slate-800 rounded-2xl p-3 flex items-center gap-3 shadow-lg">
          <input
            type="text"
            value={inputText}
            onChange={(event) => setInputText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !isComposingKorean(event)) handleAnswer(inputText);
            }}
            placeholder="E. 기타 또는 보충 답변을 입력하세요"
            className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            type="button"
            onClick={() => handleAnswer(inputText)}
            disabled={!inputText.trim() || isThinking}
            className="h-11 w-11 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-300 dark:disabled:bg-slate-800 text-white flex items-center justify-center"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      )}

      {finalOutput && (
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-5">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 text-xs font-bold">
            <CheckCircle2 className="w-3.5 h-3.5" />
            심층 인터뷰 완료
          </div>
          <h2 className="text-base font-black text-slate-900 dark:text-white">의사 결정 기준 요약 + 핵심 지침</h2>
          <div className="rounded-xl border border-indigo-200 dark:border-indigo-900 bg-slate-50 dark:bg-slate-950/40 p-4 text-sm font-semibold text-slate-800 dark:text-slate-100 leading-relaxed">
            {finalOutput.oneSentenceSystem}
          </div>
          <ol className="space-y-2">
            {finalOutput.coreInstructions.map((instruction, index) => (
              <li key={instruction} className="flex gap-2 text-xs text-slate-700 dark:text-slate-300">
                <span className="font-black text-indigo-500">{index + 1}.</span>
                <span>{instruction}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
};
