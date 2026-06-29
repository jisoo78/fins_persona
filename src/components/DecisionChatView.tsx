import React, { useEffect, useRef, useState } from 'react';
import { Persona, ChatMessage } from '../types';
import { Bot, Paperclip, Plus, Send, Sparkles, Upload } from 'lucide-react';

interface DecisionChatViewProps {
  personas: Persona[];
}

const buildStarterMessage = (persona: Persona): ChatMessage => ({
  id: `starter-${persona.id}`,
  sender: 'ai',
  text: `대표님, 저는 ${persona.name}입니다.\n${persona.decisionStyle} 관점에서 지금의 의사결정을 함께 검토하겠습니다.`,
  timestamp: '오후 2:00',
});

const buildReply = (persona: Persona, input: string): ChatMessage => ({
  id: `reply-${Date.now()}`,
  sender: 'ai',
  text: `${persona.name} 관점에서 보면 "${input}" 요청은 우선순위, 리스크, 실행 가능성 순으로 해석해야 합니다. 현재는 ${persona.coreValues[0]}를 먼저 확인하겠습니다.`,
  timestamp: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
});

export const DecisionChatView: React.FC<DecisionChatViewProps> = ({ personas }) => {
  const [activePersonaId, setActivePersonaId] = useState(personas[0]?.id ?? '');
  const [draft, setDraft] = useState('');
  const [attachments, setAttachments] = useState([] as File[]);
  const [messagesByPersona, setMessagesByPersona] = useState<Record<string, ChatMessage[]>>(() =>
    personas.reduce((acc, persona) => {
      acc[persona.id] = [buildStarterMessage(persona)];
      return acc;
    }, {} as Record<string, ChatMessage[]>)
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const activePersona = personas.find((persona) => persona.id === activePersonaId) ?? personas[0] ?? null;
  const activeMessages = activePersona ? messagesByPersona[activePersona.id] ?? [buildStarterMessage(activePersona)] : [];

  useEffect(() => {
    if (!personas.length) {
      setActivePersonaId('');
      return;
    }

    setActivePersonaId((current) => {
      if (current && personas.some((persona) => persona.id === current)) return current;
      return personas[0].id;
    });

    setMessagesByPersona((current) => {
      const next = { ...current };
      personas.forEach((persona) => {
        if (!next[persona.id]) {
          next[persona.id] = [buildStarterMessage(persona)];
        }
      });
      return next;
    });
  }, [personas]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeMessages, activePersonaId]);

  const handleSend = () => {
    if (!activePersona || !draft.trim()) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: draft,
      timestamp: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
    };

    const replyMessage = buildReply(activePersona, draft);

    setMessagesByPersona((current) => ({
      ...current,
      [activePersona.id]: [...(current[activePersona.id] ?? [buildStarterMessage(activePersona)]), userMessage, replyMessage],
    }));
    setDraft('');
    setAttachments([]);
  };

  const handleFiles = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    setAttachments(files);
  };

  if (!personas.length) {
    return (
      <div className="p-8 max-w-7xl mx-auto">
        <div className="min-h-[70vh] flex items-center justify-center rounded-3xl border border-dashed border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900/60">
          <div className="text-center space-y-3 max-w-md">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 flex items-center justify-center text-indigo-500">
              <Sparkles className="w-7 h-7" />
            </div>
            <h2 className="text-lg font-black text-slate-900 dark:text-white">선택할 페르소나가 없습니다.</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              먼저 페르소나를 생성한 뒤 이 화면에서 대화할 수 있습니다.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto animate-fade-in">
      <div className="flex flex-col gap-2 pb-5 border-b border-slate-200 dark:border-slate-800">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-100 dark:border-indigo-900 text-indigo-600 dark:text-indigo-400 text-xs font-semibold w-fit">
          <Bot className="w-3.5 h-3.5" />
          <span>의사결정 대화</span>
        </div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white">페르소나를 선택하고 오른쪽에서 대화하세요</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          왼쪽에서 모델을 고르듯 페르소나를 선택하고, 아래 입력창의 `+` 버튼으로 파일을 첨부할 수 있는 시각 쉘입니다.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] gap-6 mt-6">
        <aside className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-black text-slate-900 dark:text-white">페르소나 선택</h2>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Model Picker</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
              Claude의 Sonnet / Haiku / Opus처럼, 여기서 대화할 페르소나를 선택합니다.
            </p>
          </div>

          <div className="p-3 space-y-2">
            {personas.map((persona) => {
              const selected = persona.id === activePersonaId;

              return (
                <button
                  key={persona.id}
                  onClick={() => setActivePersonaId(persona.id)}
                  className={`w-full text-left p-4 rounded-2xl border transition-all ${
                    selected
                      ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-800 shadow-sm'
                      : 'bg-slate-50/80 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-11 h-11 rounded-2xl flex items-center justify-center font-black border ${persona.bgClass} ${persona.colorClass}`}>
                      {persona.role.slice(0, 2)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-extrabold text-slate-900 dark:text-white truncate">{persona.name}</span>
                        {selected && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-600 text-white shrink-0">
                            선택됨
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] font-semibold text-indigo-500 mt-0.5">
                        {persona.role} · {persona.badge}
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2 line-clamp-2 leading-relaxed">
                        {persona.description}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col min-h-[72vh]">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 bg-slate-50/70 dark:bg-slate-950/40">
            <div className="flex items-center gap-3 min-w-0">
              <div className={`w-11 h-11 rounded-2xl flex items-center justify-center font-black border ${activePersona?.bgClass ?? 'bg-slate-100'} ${activePersona?.colorClass ?? 'text-slate-600'}`}>
                {activePersona?.role.slice(0, 2)}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-sm font-black text-slate-900 dark:text-white">{activePersona?.name}</h2>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400">
                    대화 중
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  {activePersona?.decisionStyle}
                </p>
              </div>
            </div>

            <div className="hidden md:flex items-center gap-2 text-[11px] font-semibold text-slate-500">
              <Paperclip className="w-4 h-4" />
              <span>첨부 파일 {attachments.length ? `${attachments.length}개 준비됨` : '없음'}</span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-slate-50/60 dark:bg-slate-950/30">
            {activeMessages.map((message) => (
              <div key={message.id} className={`flex items-end gap-3 ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                {message.sender === 'ai' && (
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${activePersona?.bgClass ?? 'bg-slate-100'} ${activePersona?.colorClass ?? 'text-slate-600'}`}>
                    <Bot className="w-4 h-4" />
                  </div>
                )}

                <div
                  className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap shadow-sm ${
                    message.sender === 'user'
                      ? 'bg-indigo-600 text-white rounded-br-md'
                      : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 rounded-bl-md'
                  }`}
                >
                  {message.text}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          <div className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {attachments.map((file) => (
                  <span
                    key={`${file.name}-${file.size}`}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[11px] font-semibold text-slate-700 dark:text-slate-200"
                  >
                    <Upload className="w-3.5 h-3.5 text-indigo-500" />
                    <span className="truncate max-w-[180px]">{file.name}</span>
                  </span>
                ))}
              </div>
            )}

            <div className="flex items-end gap-3">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleFiles}
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-11 h-11 shrink-0 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-200 flex items-center justify-center transition-colors"
                title="파일 첨부"
              >
                <Plus className="w-4 h-4" />
              </button>

              <div className="flex-1">
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      handleSend();
                    }
                  }}
                  rows={2}
                  placeholder={activePersona ? `${activePersona.name}에게 질문을 입력하세요...` : '페르소나를 선택하세요.'}
                  className="w-full resize-none rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 px-4 py-3 text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <button
                type="button"
                onClick={handleSend}
                disabled={!draft.trim() || !activePersona}
                className="w-11 h-11 shrink-0 rounded-2xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-300 dark:disabled:bg-slate-800 text-white flex items-center justify-center transition-colors"
                title="전송"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
