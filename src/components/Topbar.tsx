import React from 'react';
import { Search } from 'lucide-react';

export const Topbar: React.FC = () => {
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
    </header>
  );
};
