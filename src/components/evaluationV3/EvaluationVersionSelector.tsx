import React from 'react';

import type { EvaluationVersion } from './evaluationV3ViewModel';

export const EvaluationVersionSelector: React.FC<{
  value: EvaluationVersion;
  onChange(value: EvaluationVersion): void;
}> = ({ value, onChange }) => (
  <div className="flex justify-end gap-2 border-b border-slate-200 bg-white px-6 py-3 dark:border-slate-800 dark:bg-slate-950">
    {(['v3', 'v2'] as const).map((version) => (
      <button
        key={version}
        type="button"
        onClick={() => onChange(version)}
        className={`rounded-lg px-3 py-2 text-xs font-bold ${value === version
          ? 'bg-indigo-600 text-white'
          : 'border border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-300'}`}
      >
        Evaluation {version.toUpperCase()}
      </button>
    ))}
  </div>
);
