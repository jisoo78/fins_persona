import React, { useEffect, useState } from 'react';
import { DecisionRecord } from '../types';
import { 
  History, 
  Clock, 
  ChevronRight, 
  X, 
  ShieldAlert, 
  Sparkles,
  MessageSquare,
  ArrowUpRight,
  Globe2
} from 'lucide-react';

interface HistoryViewProps {
  decisions: DecisionRecord[];
  selectedDecisionId?: string | null;
  onClearSelectedDecision?: () => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  decisions,
  selectedDecisionId,
  onClearSelectedDecision,
}) => {
  const [selectedRecord, setSelectedRecord] = useState<DecisionRecord | null>(null);

  useEffect(() => {
    if (!selectedDecisionId) return;

    const record = decisions.find((decision) => decision.id === selectedDecisionId);
    if (!record) return;

    setSelectedRecord(record);
    onClearSelectedDecision?.();
  }, [decisions, selectedDecisionId, onClearSelectedDecision]);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 animate-fade-in">
      {/* Title Header */}
      <div className="pb-6 border-b border-slate-200 dark:border-slate-800">
        <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-3">
          <History className="w-7 h-7 text-indigo-500" />
          <span>과거 의사결정 아카이브 히스토리</span>
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">
          가상 이사회를 통해 도출했던 모든 아젠다의 논의 근거와 최종 도출 결론 타임라인입니다.
        </p>
      </div>

      {/* Decision Records List */}
      <div className="space-y-4">
        {decisions.map((dec) => (
          <div
            key={dec.id}
            className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-6 shadow-sm hover:shadow-md transition-all hover:border-indigo-400 dark:hover:border-indigo-600 group"
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-2 flex-1">
                <div className="flex items-center gap-2.5">
                  <span className="px-2.5 py-0.5 rounded-lg text-[10px] font-extrabold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">
                    {dec.category}
                  </span>
                  <span className="text-xs font-semibold text-slate-400 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" /> {dec.date}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800 uppercase">
                    {dec.impactScore} IMPACT
                  </span>
                </div>

                <h2 className="text-base font-black text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                  {dec.question}
                </h2>
              </div>

              <div className="flex items-center gap-3 shrink-0 pt-2 md:pt-0">
                <button
                  onClick={() => setSelectedRecord(dec)}
                  className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-indigo-600 dark:bg-slate-100 dark:hover:bg-indigo-500 text-white dark:text-slate-900 dark:hover:text-white text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
                >
                  <span>다시 보기</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Quick Summary Line */}
            <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <p className="text-slate-600 dark:text-slate-300 font-medium truncate max-w-3xl">
                <span className="font-bold text-indigo-600 dark:text-indigo-400 mr-1.5">★ 최종 결론:</span>
                {dec.finalConclusion}
              </p>

              <div className="text-[11px] text-slate-400 shrink-0">
                참여 임원: <span className="text-slate-600 dark:text-slate-300 font-semibold">{dec.participants.join(', ')}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Detail Popup Modal */}
      {selectedRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
            
            <div className="p-6 px-8 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950/40">
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-500 block">
                  의사결정 아카이브 상세 기록 · {selectedRecord.date}
                </span>
                <h3 className="text-lg font-black text-slate-900 dark:text-white mt-1">
                  {selectedRecord.question}
                </h3>
              </div>
              <button
                onClick={() => setSelectedRecord(null)}
                className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-6">
              <div className="p-6 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800">
                <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 block mb-1">가상 이사회 최종 결론</span>
                <p className="text-base font-black text-slate-900 dark:text-white">
                  "{selectedRecord.finalConclusion}"
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-2 pt-2 border-t border-indigo-200/60 dark:border-indigo-800/60">
                  💡 권고안: {selectedRecord.recommendation}
                </p>
              </div>

              {selectedRecord.publicData && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="text-xs font-bold uppercase text-slate-400 tracking-wider flex items-center gap-2">
                      <Globe2 className="w-4 h-4 text-indigo-500" />
                      SNS 공개 데이터 탐색 결과
                    </h4>
                    <span className="text-[11px] font-bold text-slate-400">
                      계정 후보 {selectedRecord.publicData.accounts.length}개
                    </span>
                  </div>

                  {selectedRecord.publicData.accounts.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {selectedRecord.publicData.accounts.map((account, idx) => (
                        <a
                          key={`${account.platform}-${account.url}-${idx}`}
                          href={account.url}
                          target="_blank"
                          rel="noreferrer"
                          className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-600 transition-colors group"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-black text-slate-900 dark:text-white">
                                {account.platform}
                              </p>
                              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-1">
                                {account.handle}
                              </p>
                            </div>
                            <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-500 shrink-0" />
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-3 break-all">
                            {account.url}
                          </p>
                          <div className="mt-3 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-indigo-500"
                              style={{ width: `${Math.round(account.confidence * 100)}%` }}
                            />
                          </div>
                          <p className="text-[10px] font-bold text-slate-400 mt-1">
                            Sherlock confidence {Math.round(account.confidence * 100)}%
                          </p>
                        </a>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                      저장된 SNS 계정 후보가 없습니다.
                    </div>
                  )}

                  {selectedRecord.publicData.signals.length > 0 && (
                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
                      <p className="text-xs font-bold text-slate-900 dark:text-white mb-3">정제된 분석 신호</p>
                      <div className="space-y-2">
                        {selectedRecord.publicData.signals.map((signal, idx) => (
                          <p key={`${signal}-${idx}`} className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                            {signal}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedRecord.publicData.posts.length > 0 && (
                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
                      <p className="text-xs font-bold text-slate-900 dark:text-white mb-3">수집 문서 / 크롤링 예정 항목</p>
                      <div className="space-y-3">
                        {selectedRecord.publicData.posts.map((post, idx) => (
                          <div key={`${post.platform}-${idx}`} className="text-xs">
                            <span className="font-black text-indigo-600 dark:text-indigo-400">{post.platform}</span>
                            <p className="text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">{post.text}</p>
                            <p className="text-[10px] text-slate-400 mt-1">{post.inferredSignal}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-4">
                <h4 className="text-xs font-bold uppercase text-slate-400 tracking-wider">임원진 발언 타임라인 기록</h4>
                {selectedRecord.timeline.map((t, idx) => (
                  <div key={idx} className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 flex items-start gap-3">
                    <span className="px-2 py-0.5 rounded bg-indigo-600 text-white text-[10px] font-bold shrink-0 mt-0.5">
                      {t.role}
                    </span>
                    <div className="text-xs flex-1">
                      <span className="font-bold text-slate-900 dark:text-white mr-2">{t.speaker}</span>
                      <span className="text-slate-400 text-[10px] mr-2">({t.time})</span>
                      <p className="text-slate-700 dark:text-slate-300 mt-1 leading-relaxed">{t.content}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-4 px-8 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 text-right">
              <button
                onClick={() => setSelectedRecord(null)}
                className="px-6 py-2 rounded-xl bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 text-xs font-bold"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
