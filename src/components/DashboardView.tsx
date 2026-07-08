import React from 'react';
import { TabType, Persona } from '../types';
import { 
  Users, 
  MessageSquareText, 
  ClipboardList,
  Plus, 
  TrendingUp,
  Brain
} from 'lucide-react';

interface DashboardViewProps {
  personas: Persona[];
  setActiveTab: (tab: TabType) => void;
  onOpenNewPersonaModal: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  personas,
  setActiveTab,
  onOpenNewPersonaModal,
}) => {
  const stats = [
    { label: '생성된 페르소나 수', value: `${personas.length}개`, sub: '페르소나 목록으로 이동', icon: <Users className="w-5 h-5 text-indigo-500" />, targetTab: 'personas' as TabType },
    { label: '사전 질문', value: '40문항', sub: '사전 질문 화면으로 이동', icon: <ClipboardList className="w-5 h-5 text-emerald-500" />, targetTab: 'pre-interview' as TabType },
    { label: '심층 인터뷰', value: '대기', sub: '심층 인터뷰 화면으로 이동', icon: <MessageSquareText className="w-5 h-5 text-blue-500" />, targetTab: 'interview' as TabType },
  ];

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-10 animate-fade-in">
      {/* Welcome Banner */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-100 dark:border-indigo-900 text-indigo-600 dark:text-indigo-400 text-xs font-semibold mb-3">
            <Brain className="w-3.5 h-3.5" />
            <span>경영진 전용 사고 매핑 활성화</span>
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            안녕하세요.
          </h1>
          <p className="text-lg text-slate-600 dark:text-slate-400 mt-2 font-medium">
            오늘도 더 나은 의사결정을 시작해보세요.
          </p>
        </div>

        {/* Quick Action Buttons */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setActiveTab('pre-interview')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold border border-slate-200 dark:border-slate-700 shadow-sm transition-all hover:scale-[1.02]"
          >
            <ClipboardList className="w-4 h-4 text-emerald-500" />
            <span>사전 질문 시작</span>
          </button>
          
          <button
            onClick={onOpenNewPersonaModal}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold border border-slate-200 dark:border-slate-700 shadow-sm transition-all hover:scale-[1.02]"
          >
            <Plus className="w-4 h-4 text-indigo-500" />
            <span>페르소나 생성</span>
          </button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {stats.map((stat, idx) => (
          <button
            type="button"
            key={idx}
            onClick={() => setActiveTab(stat.targetTab)}
            aria-label={`${stat.label} 화면으로 이동`}
            className="text-left bg-white dark:bg-slate-900/60 p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-slate-950 transition-all relative overflow-hidden group"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{stat.label}</span>
              <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800 group-hover:scale-110 transition-transform">
                {stat.icon}
              </div>
            </div>
            <div className="mt-4">
              <span className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">{stat.value}</span>
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 font-medium">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-500 inline" />
              <span>{stat.sub}</span>
            </div>
          </button>
        ))}
      </div>

      <div className="pt-2">
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-emerald-500" />
              <span>페르소나</span>
            </h2>
            <button
              onClick={() => setActiveTab('personas')}
              className="text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            >
              관리
            </button>
          </div>

          <div className="bg-white dark:bg-slate-900/60 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-3">
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              DB에 저장된 페르소나만 표시됩니다.
            </p>

            {personas.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                아직 생성된 페르소나가 없습니다.
              </div>
            ) : personas.slice(0, 5).map((p) => (
              <div
                key={p.id}
                onClick={() => setActiveTab('personas')}
                className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-white dark:bg-slate-700 shadow-sm flex items-center justify-center font-bold text-xs text-indigo-600 dark:text-indigo-400 border border-slate-200 dark:border-slate-600">
                    {p.role.slice(0, 2)}
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-900 dark:text-white block">{p.name}</span>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400">{p.badge}</span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
                  <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase">Active</span>
                </div>
              </div>
            ))}

            <button
              onClick={onOpenNewPersonaModal}
              className="w-full mt-3 py-2.5 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 hover:border-indigo-500 hover:text-indigo-600 dark:hover:text-indigo-400 text-xs font-bold text-slate-500 transition-all flex items-center justify-center gap-1.5"
            >
              <Plus className="w-4 h-4" /> 커스텀 페르소나 추가
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
