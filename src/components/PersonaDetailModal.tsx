import React, { useEffect, useRef, useState } from 'react';
import { ChatMessage, Persona } from '../types';
import { 
  X, 
  Brain, 
  ShieldCheck, 
  AlertTriangle, 
  Bot,
  MessageSquare,
  RefreshCw,
  Send,
} from 'lucide-react';

interface PersonaDetailModalProps {
  persona: Persona | null;
  onClose: () => void;
}

interface PersonaChatResponse {
  ok: boolean;
  reply?: string;
  message?: string;
  chatSessionId?: string | null;
}

const formatTime = () => new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });

const buildStarterMessage = (persona: Persona): ChatMessage => ({
  id: `persona-modal-starter-${persona.id}`,
  sender: 'ai',
  text: `반갑습니다. 저는 ${persona.name}입니다.\n${persona.decisionStyle || '정의된 판단 기준'}을 기준으로 의사결정을 함께 검토하겠습니다.`,
  timestamp: formatTime(),
});

export const PersonaDetailModal: React.FC<PersonaDetailModalProps> = ({ persona, onClose }) => {
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [chatSessionId, setChatSessionId] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!persona) return;
    setChatMessages([buildStarterMessage(persona)]);
    setChatInput('');
    setIsSending(false);
    setChatSessionId(null);
  }, [persona]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, isSending]);

  if (!persona) return null;

  const isComposingKorean = (event: React.KeyboardEvent<HTMLInputElement>) =>
    event.nativeEvent.isComposing || event.keyCode === 229;

  const buildFallbackReply = (input: string) =>
    `${persona.name} 관점에서 보면 "${input}" 요청은 먼저 ${persona.coreValues[0] || persona.decisionStyle || '확인 필요'} 기준으로 검토해야 합니다.\n\n결론: 바로 확정하기보다 판단 기준을 먼저 좁히는 편이 좋습니다.\n리스크: 필요한 수치, 손실 한도, 중단 조건이 아직 확인되지 않았습니다.\n다음 액션: 기대효과와 실패 시 손실을 한 문장씩 정리해 주세요.`;

  const requestPersonaReply = async (input: string, recentMessages: ChatMessage[]) => {
    const response = await fetch('/api/agent/persona-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        persona,
        message: input,
        chatSessionId,
        recentMessages: recentMessages.slice(-8).map((message) => ({
          sender: message.sender,
          text: message.text,
        })),
      }),
    });
    const result = (await response.json()) as PersonaChatResponse;

    if (!response.ok || !result.ok || !result.reply) {
      throw new Error(result.message ?? '페르소나 응답 생성에 실패했습니다.');
    }

    if (result.chatSessionId) setChatSessionId(result.chatSessionId);
    return result.reply;
  };

  const handleSend = async () => {
    if (!chatInput.trim() || isSending) return;
    const input = chatInput.trim();
    const userMessage: ChatMessage = {
      id: `persona-modal-user-${Date.now()}`,
      sender: 'user',
      text: input,
      timestamp: formatTime(),
    };
    const nextMessages = [...chatMessages, userMessage];

    setChatMessages(nextMessages);
    setChatInput('');
    setIsSending(true);

    try {
      const reply = await requestPersonaReply(input, nextMessages);
      setChatMessages((current) => [
        ...current,
        {
          id: `persona-modal-ai-${Date.now()}`,
          sender: 'ai',
          text: reply,
          timestamp: formatTime(),
        },
      ]);
    } catch (error) {
      setChatMessages((current) => [
        ...current,
        {
          id: `persona-modal-ai-fallback-${Date.now()}`,
          sender: 'ai',
          text: `${buildFallbackReply(input)}\n\n확인 필요: ${error instanceof Error ? error.message : 'API 응답 오류'}`,
          timestamp: formatTime(),
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-6xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl relative">
        
        {/* Header */}
        <div className="p-6 px-8 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950/40">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-lg border ${persona.bgClass} ${persona.colorClass} shadow-sm`}>
              {persona.role.slice(0, 2)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-extrabold px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-400">
                  {persona.role} 전문 알고리즘
                </span>
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-bold uppercase">가동 가능</span>
              </div>
              <h2 className="text-2xl font-black text-slate-900 dark:text-white mt-1">
                {persona.name}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="overflow-y-auto p-8 space-y-8 border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-800">
            <div className="space-y-8 animate-fade-in">
              {/* Summary Description */}
              <div className="bg-slate-50 dark:bg-slate-800/50 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">알고리즘 요약 설명</h3>
                <p className="text-sm text-slate-800 dark:text-slate-200 font-medium leading-relaxed">
                  {persona.description}
                </p>
              </div>

              {/* Decision Style */}
              <div className="border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/40 dark:bg-indigo-950/20 p-6 rounded-2xl">
                <div className="flex items-center gap-2 mb-2">
                  <Brain className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <h3 className="text-sm font-black text-indigo-900 dark:text-indigo-300">핵심 의사결정 스타일</h3>
                </div>
                <p className="text-base font-bold text-slate-900 dark:text-white">
                  "{persona.decisionStyle}"
                </p>
              </div>

              {/* Core Values */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">판단 기준 핵심 가치</h3>
                <div className="flex flex-wrap gap-2">
                  {persona.coreValues.map((val, idx) => (
                    <span key={idx} className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold text-xs text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700">
                      🎯 {val}
                    </span>
                  ))}
                </div>
              </div>

              {/* Strengths vs Weaknesses Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-emerald-50/40 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/50 p-5 rounded-2xl space-y-3">
                  <h3 className="text-xs font-extrabold text-emerald-800 dark:text-emerald-400 flex items-center gap-1.5 uppercase">
                    <ShieldCheck className="w-4 h-4" /> 주요 강점 및 방어력
                  </h3>
                  <ul className="space-y-2">
                    {persona.strengths.map((str, idx) => (
                      <li key={idx} className="text-xs text-slate-700 dark:text-slate-300 flex items-start gap-2">
                        <span className="text-emerald-500 font-bold">✓</span>
                        <span>{str}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="bg-rose-50/40 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/50 p-5 rounded-2xl space-y-3">
                  <h3 className="text-xs font-extrabold text-rose-800 dark:text-rose-400 flex items-center gap-1.5 uppercase">
                    <AlertTriangle className="w-4 h-4" /> 경계해야 할 사각지대 (약점)
                  </h3>
                  <ul className="space-y-2">
                    {persona.weaknesses.map((wk, idx) => (
                      <li key={idx} className="text-xs text-slate-700 dark:text-slate-300 flex items-start gap-2">
                        <span className="text-rose-500 font-bold">!</span>
                        <span>{wk}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="bg-slate-50 dark:bg-slate-800/50 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">응답 스타일</h3>
                <p className="text-sm text-slate-800 dark:text-slate-200 font-medium leading-relaxed">
                  {persona.communicationStyle || '결론, 판단 기준, 리스크, 다음 액션 순서로 응답합니다.'}
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col min-h-[520px] bg-slate-50/70 dark:bg-slate-950/30">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70">
              <div className="flex items-center gap-2 text-sm font-black text-slate-900 dark:text-white">
                <MessageSquare className="w-4 h-4 text-indigo-500" />
                <span>페르소나 대화</span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                이 페르소나의 프롬프트와 판단 기준을 API에 전달해 응답을 생성합니다.
              </p>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {chatMessages.map((message) => (
                <div key={message.id} className={`flex items-end gap-3 ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {message.sender === 'ai' && (
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${persona.bgClass} ${persona.colorClass}`}>
                      <Bot className="w-4 h-4" />
                    </div>
                  )}
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap shadow-sm ${
                      message.sender === 'user'
                        ? 'bg-indigo-600 text-white rounded-br-md'
                        : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 rounded-bl-md'
                    }`}
                  >
                    {message.text}
                  </div>
                </div>
              ))}
              {isSending && (
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-500" />
                  페르소나 기준으로 응답을 생성 중입니다...
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                onKeyDown={(event) => {
                  if (isComposingKorean(event)) return;
                  if (event.key === 'Enter') void handleSend();
                }}
                placeholder={`${persona.name}에게 질문을 입력하세요...`}
                className="flex-1 px-4 py-3 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 dark:text-slate-100"
              />
              <button
                type="button"
                onClick={() => void handleSend()}
                disabled={!chatInput.trim() || isSending}
                className="p-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-300 dark:disabled:bg-slate-800 text-white rounded-xl transition-colors"
                aria-label="페르소나 대화 전송"
              >
                {isSending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="p-4 px-8 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 flex justify-between items-center text-xs">
          <span className="text-slate-500">생성일: {persona.createdAt} · 최종 업데이트: {persona.updatedAt}</span>
          <span className="font-semibold text-slate-500 dark:text-slate-400">API key가 없으면 서버 fallback 응답을 사용합니다.</span>
        </div>
      </div>
    </div>
  );
};
