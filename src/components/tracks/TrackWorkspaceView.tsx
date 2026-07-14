import React from 'react';

type TrackSection<T extends string> = {
  id: T;
  label: string;
};

type TrackWorkspaceViewProps<T extends string> = {
  title: string;
  description: string;
  activeSection: T;
  sections: TrackSection<T>[];
  onSectionChange: (section: T) => void;
  children: React.ReactNode;
};

export const TrackWorkspaceView = <T extends string>({
  title,
  description,
  activeSection,
  sections,
  onSectionChange,
  children,
}: TrackWorkspaceViewProps<T>) => (
  <div className="min-h-full">
    <header className="border-b border-slate-200 bg-white px-8 pt-7 dark:border-slate-800 dark:bg-slate-900/60">
      <h1 className="text-2xl font-black text-slate-900 dark:text-white">{title}</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p>
      <nav className="mt-6 flex flex-wrap gap-2" aria-label={`${title} 메뉴`}>
        {sections.map((section) => (
          <button
            key={section.id}
            type="button"
            onClick={() => onSectionChange(section.id)}
            className={`rounded-t-xl border-b-2 px-4 py-3 text-xs font-bold transition-colors ${
              activeSection === section.id
                ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            {section.label}
          </button>
        ))}
      </nav>
    </header>
    {children}
  </div>
);
