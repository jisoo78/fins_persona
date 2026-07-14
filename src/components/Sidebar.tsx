import React from 'react';
import { TabType } from '../types';
import { 
  LayoutDashboard, 
  Settings,
  BrainCircuit,
  ChevronRight,
  Scale,
  Workflow,
} from 'lucide-react';

interface SidebarProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab }) => {
  const navItems: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: '대시보드', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'a-track', label: 'A Track', icon: <Workflow className="w-4 h-4" /> },
    { id: 'b-track', label: 'B Track', icon: <Scale className="w-4 h-4" /> },
    { id: 'settings', label: '설정', icon: <Settings className="w-4 h-4" /> },
  ];

  return (
    <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col justify-between border-r border-slate-800 shrink-0 h-screen sticky top-0">
      <div>
        {/* Logo Section */}
        <div className="h-16 flex items-center px-6 gap-3 border-b border-slate-800/80 bg-slate-950/40">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20 ring-1 ring-white/20">
            <BrainCircuit className="w-5 h-5" />
          </div>
          <div>
            <span className="font-bold text-lg tracking-tight text-white block leading-none">Decision</span>
            <span className="text-[10px] uppercase tracking-widest text-indigo-400 font-semibold block mt-1">Executive AI OS</span>
          </div>
        </div>

        {/* Navigation Section */}
        <div className="px-3 py-6">
          <div className="text-[11px] font-semibold tracking-wider uppercase text-slate-500 px-3 mb-2">
            메뉴 네비게이션
          </div>
          <nav className="space-y-1">
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 group ${
                    isActive
                      ? 'bg-indigo-600/15 text-indigo-400 font-semibold border border-indigo-500/30 shadow-sm'
                      : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className={`transition-colors ${isActive ? 'text-indigo-400' : 'text-slate-400 group-hover:text-slate-200'}`}>
                      {item.icon}
                    </span>
                    <span>{item.label}</span>
                  </div>
                  {isActive && <ChevronRight className="w-3.5 h-3.5 text-indigo-400" />}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Bottom Status Card */}
      <div className="p-4 m-3 rounded-2xl bg-gradient-to-b from-slate-800/60 to-slate-900/90 border border-slate-700/60 text-xs">
        <div className="flex items-center gap-2 mb-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span className="font-semibold text-slate-200">AI 사고 엔진 연동됨</span>
        </div>
        <p className="text-slate-400 text-[11px] leading-relaxed">
          실시간 경영진 맞춤 추론 중. 인터뷰와 페르소나 생성 준비 완료.
        </p>
      </div>
    </aside>
  );
};
