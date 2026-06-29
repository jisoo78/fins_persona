import React from 'react';
import { UserSettings } from '../types';
import { Crown, Bell, Search, ShieldCheck } from 'lucide-react';

interface TopbarProps {
  settings: UserSettings;
}

export const Topbar: React.FC<TopbarProps> = ({ settings }) => {
  return (
    <header className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-8 flex items-center justify-between sticky top-0 z-20 backdrop-blur-md bg-white/85 dark:bg-slate-900/85">
      {/* Search & Breadcrumb context */}
      <div className="flex items-center gap-4 flex-1 max-w-md">
        <div className="relative w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="의사결정 기록, 페르소나, 시나리오 검색..."
            className="w-full pl-10 pr-4 py-2 bg-slate-100 dark:bg-slate-800/80 border border-transparent focus:border-indigo-500 rounded-xl text-xs focus:outline-none transition-all placeholder:text-slate-400 text-slate-700 dark:text-slate-200"
          />
        </div>
      </div>

      {/* Right Actions & Profile */}
      <div className="flex items-center gap-5">
        {/* Plan Badge */}
        <div className="flex items-center gap-2 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/40 dark:to-orange-950/40 border border-amber-200/80 dark:border-amber-800/80 px-3 py-1.5 rounded-full shadow-sm">
          <Crown className="w-4 h-4 text-amber-600 dark:text-amber-400 fill-amber-500/20" />
          <span className="text-xs font-bold text-amber-900 dark:text-amber-300">
            {settings.plan} Enterprise Plan
          </span>
          <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-medium bg-amber-500 text-white">
            ACTIVE
          </span>
        </div>

        {/* Security / System indicator */}
        <div className="hidden md:flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          <ShieldCheck className="w-4 h-4 text-emerald-500" />
          <span>SOC2 Type II 준수</span>
        </div>

        {/* Notification bell */}
        <button className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors relative">
          <Bell className="w-4 h-4" />
          <span className="w-2 h-2 bg-indigo-500 rounded-full absolute top-2 right-2 ring-2 ring-white dark:ring-slate-900"></span>
        </button>

        <div className="h-6 w-[1px] bg-slate-200 dark:bg-slate-800"></div>

        {/* User Profile */}
        <div className="flex items-center gap-3 cursor-pointer group">
          <div className="w-9 h-9 rounded-full bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 flex items-center justify-center font-bold text-sm shadow-sm ring-2 ring-slate-100 dark:ring-slate-800 group-hover:ring-indigo-500 transition-all">
            {settings.name.slice(0, 1)}
          </div>
          <div className="hidden sm:block text-left leading-tight">
            <span className="text-sm font-bold text-slate-900 dark:text-slate-100 block group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
              {settings.name} 대표
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 block truncate max-w-[140px]">
              {settings.company}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
};
