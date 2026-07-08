import React, { useState } from 'react';
import { Persona } from '../types';
import { 
  Users, 
  Plus, 
  Edit3, 
  Trash2, 
  ExternalLink, 
  BrainCircuit,
  Sparkles,
  FileText,
  RefreshCw
} from 'lucide-react';

interface PersonasViewProps {
  personas: Persona[];
  onOpenDetail: (persona: Persona) => void;
  onOpenNewModal: () => void;
  onDeletePersona: (id: string) => void;
  onCreateAmyHoodPersona: () => Promise<Persona>;
}

export const PersonasView: React.FC<PersonasViewProps> = ({
  personas,
  onOpenDetail,
  onOpenNewModal,
  onDeletePersona,
  onCreateAmyHoodPersona,
}) => {
  const [isCreatingReference, setIsCreatingReference] = useState(false);
  const [referenceError, setReferenceError] = useState('');

  const handleCreateReferencePersona = async () => {
    if (isCreatingReference) return;

    setIsCreatingReference(true);
    setReferenceError('');

    try {
      await onCreateAmyHoodPersona();
    } catch (error) {
      setReferenceError(error instanceof Error ? error.message : 'Amy Hood 페르소나 생성 중 오류가 발생했습니다.');
    } finally {
      setIsCreatingReference(false);
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 animate-fade-in">
      {/* Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-3">
            <Users className="w-7 h-7 text-indigo-500" />
            <span>AI 경영진 페르소나 보관함</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">
            대표님의 경영 철학과 가중치로 정교하게 튜닝된 가상 이사회 임원진 목록입니다.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleCreateReferencePersona}
            disabled={isCreatingReference}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-300 dark:disabled:bg-slate-800 text-white text-xs font-bold shadow-md shadow-emerald-500/20 transition-all shrink-0"
          >
            {isCreatingReference ? <RefreshCw className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            <span>{isCreatingReference ? 'RAG 분석 중' : 'Amy Hood RAG로 생성'}</span>
          </button>

          <button
            onClick={onOpenNewModal}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-500/20 transition-all shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>새 페르소나 생성</span>
          </button>
        </div>
      </div>

      {referenceError && (
        <div className="rounded-2xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/30 p-3 text-xs font-semibold text-rose-700 dark:text-rose-300">
          {referenceError}
        </div>
      )}

      {/* Empty State Check */}
      {personas.length === 0 ? (
        <div className="py-24 text-center bg-white dark:bg-slate-900/60 rounded-3xl border border-dashed border-slate-300 dark:border-slate-800 p-8 flex flex-col items-center justify-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-indigo-950 flex items-center justify-center text-indigo-500 shadow-inner">
            <BrainCircuit className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200">
            아직 생성된 페르소나가 없습니다.
          </h3>
          <p className="text-xs text-slate-500 max-w-sm leading-relaxed">
            인터뷰 세션을 완료하시거나 직접 파라미터를 입력하여 대표님만의 첫 번째 임원을 탄생시켜보세요.
          </p>
          <button
            onClick={handleCreateReferencePersona}
            disabled={isCreatingReference}
            className="mt-2 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg transition-all"
          >
            {isCreatingReference ? 'RAG 분석 중' : 'Amy Hood RAG로 첫 페르소나 생성'}
          </button>
        </div>
      ) : (
        /* Persona Cards Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {personas.map((p) => (
            <div
              key={p.id}
              className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-6 flex flex-col justify-between shadow-sm hover:shadow-xl hover:border-indigo-400 dark:hover:border-indigo-600 transition-all duration-200 group relative overflow-hidden"
            >
              {/* Top bar */}
              <div>
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-11 h-11 rounded-2xl flex items-center justify-center font-black text-base border ${p.bgClass} ${p.colorClass} shadow-sm group-hover:scale-105 transition-transform`}>
                      {p.role.slice(0, 2)}
                    </div>
                    <div>
                      <span className="text-sm font-extrabold text-slate-900 dark:text-white block">
                        {p.name}
                      </span>
                      <span className="text-[11px] font-semibold text-indigo-500 block">
                        {p.role} · {p.badge}
                      </span>
                    </div>
                  </div>

                  {/* Active Status Badge */}
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span>활성 상태</span>
                  </div>
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed line-clamp-3 mb-6 bg-slate-50 dark:bg-slate-800/40 p-3.5 rounded-2xl font-normal">
                  {p.description}
                </p>
              </div>

              {/* Bottom Metadata & Action Buttons */}
              <div className="space-y-4 pt-2 border-t border-slate-100 dark:border-slate-800/80">
                <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
                  <span>생성일: {p.createdAt}</span>
                  <span>최근 반영: {p.updatedAt}</span>
                </div>

                <div className="grid grid-cols-4 gap-2 pt-1">
                  <button
                    onClick={() => onOpenDetail(p)}
                    title="페르소나 수정"
                    className="col-span-1 p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors flex items-center justify-center"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => onDeletePersona(p.id)}
                    title="삭제"
                    className="col-span-1 p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950 hover:text-rose-600 transition-colors flex items-center justify-center"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => onOpenDetail(p)}
                    className="col-span-2 py-2.5 px-3 rounded-xl bg-slate-900 hover:bg-indigo-600 dark:bg-slate-100 dark:hover:bg-indigo-500 text-white dark:text-slate-900 dark:hover:text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    <span>열기 및 대화</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Pro Accent Line */}
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 to-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>
            </div>
          ))}

          {/* New Persona Placeholder Card */}
          <button
            onClick={onOpenNewModal}
            className="bg-slate-50/50 dark:bg-slate-900/30 rounded-3xl border-2 border-dashed border-slate-300 dark:border-slate-800 hover:border-indigo-500 hover:bg-indigo-50/20 p-6 flex flex-col items-center justify-center min-h-[280px] text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all group"
          >
            <div className="w-12 h-12 rounded-2xl bg-white dark:bg-slate-800 shadow-sm flex items-center justify-center group-hover:scale-110 transition-transform mb-3 border border-slate-200 dark:border-slate-700">
              <Plus className="w-6 h-6 text-indigo-500" />
            </div>
            <span className="text-sm font-extrabold block">새 페르소나 생성</span>
            <span className="text-xs mt-1 text-slate-400 text-center max-w-[200px] font-normal">
              특정 부서장이나 해외 지사장의 파라미터를 추가 매핑합니다.
            </span>
          </button>
        </div>
      )}
    </div>
  );
};
