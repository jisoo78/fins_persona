import React, { useState } from 'react';
import { Persona } from '../types';
import { 
  X, 
  Brain, 
  ShieldCheck, 
  AlertTriangle, 
  MessageSquare, 
  Send,
  Bot
} from 'lucide-react';

interface PersonaDetailModalProps {
  persona: Persona | null;
  onClose: () => void;
}

export const PersonaDetailModal: React.FC<PersonaDetailModalProps> = ({ persona, onClose }) => {
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'chat'>('overview');
  const [chatInput, setChatInput] = useState('');
  const [simulatedChat, setSimulatedChat] = useState<{ sender: 'user' | 'ai'; text: string }[]>([]);

  if (!persona) return null;

  const handleSendSimulated = () => {
    if (!chatInput.trim()) return;
    const q = chatInput;
    setSimulatedChat(prev => [...prev, { sender: 'user', text: q }]);
    setChatInput('');

    setTimeout(() => {
      setSimulatedChat(prev => [
        ...prev,
        {
          sender: 'ai',
          text: `[${persona.name}의 관점 분석]: 대표님의 "${q}" 제안에 대해 제 도메인 원칙(${persona.decisionStyle})을 기준으로 엄격하게 평가해드리겠습니다. 핵심 리스크 관리를 선행하시길 강력히 권고합니다.`
        }
      ]);
    }, 800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl relative">
        
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
            <div className="flex bg-slate-200 dark:bg-slate-800 p-1 rounded-xl">
              <button
                onClick={() => setActiveSubTab('overview')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  activeSubTab === 'overview'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                페르소나 프로필
              </button>
              <button
                onClick={() => setActiveSubTab('chat')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  activeSubTab === 'chat'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" /> 이 페르소나와 대화
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-8 space-y-8">
          {activeSubTab === 'overview' ? (
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

              {/* Communication Style & Sample Conversation */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">시뮬레이션 대화 샘플</h3>
                
                {persona.sampleConversations.map((conv, idx) => (
                  <div key={idx} className="bg-slate-50 dark:bg-slate-800/60 p-5 rounded-2xl space-y-3 border border-slate-200 dark:border-slate-800">
                    <div className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
                      Q. {conv.question}
                    </div>
                    <div className="text-xs text-slate-700 dark:text-slate-300 pl-3 border-l-2 border-indigo-500 leading-relaxed font-normal">
                      "{conv.answer}"
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* Chat Interface Inside Modal */
            <div className="flex flex-col h-[520px] bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-fade-in">
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
                    <Bot className="w-4 h-4" />
                  </div>
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl text-xs max-w-lg leading-relaxed shadow-sm">
                    반갑습니다 대표님. 저는 대표님의 딥다이브 인터뷰 가중치를 바탕으로 설계된 <strong>[{persona.name}]</strong>입니다. 경영상의 고민을 말씀해주시면 제 도메인 가치관을 바탕으로 답변 드리겠습니다.
                  </div>
                </div>

                {simulatedChat.map((c, i) => (
                  <div key={i} className={`flex items-start gap-3 ${c.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {c.sender === 'ai' && (
                      <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
                        <Bot className="w-4 h-4" />
                      </div>
                    )}
                    <div className={`p-4 rounded-2xl text-xs max-w-lg leading-relaxed shadow-sm ${
                      c.sender === 'user'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200'
                    }`}>
                      {c.text}
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendSimulated()}
                  placeholder={`${persona.name}에게 단독 의견 물어보기...`}
                  className="flex-1 px-3.5 py-2.5 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <button
                  onClick={handleSendSimulated}
                  className="p-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-500 transition-colors"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="p-4 px-8 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 flex justify-between items-center text-xs">
          <span className="text-slate-500">생성일: {persona.createdAt} · 최종 업데이트: {persona.updatedAt}</span>
          <button
            onClick={() => setActiveSubTab('chat')}
            className="px-5 py-2 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-500 transition-colors shadow-sm"
          >
            이 페르소나와 대화하기
          </button>
        </div>
      </div>
    </div>
  );
};
