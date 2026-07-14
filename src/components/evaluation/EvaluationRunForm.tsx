import React, { useState } from 'react';
import { Play, WalletCards } from 'lucide-react';

import type { EvaluationProvider } from '../../../shared/amyHoodEvaluation';

type Props = {
  disabled?: boolean;
  onStart(provider: EvaluationProvider): Promise<void>;
  onStartExperiment(): Promise<void>;
};

export const EvaluationRunForm: React.FC<Props> = ({ disabled, onStart, onStartExperiment }) => {
  const [provider, setProvider] = useState<EvaluationProvider>('local');
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-950 dark:text-white">새 평가 실행</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">문항을 하나씩 순차 호출하며, 모든 문항이 승인된 질문 세트만 실행할 수 있습니다.</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
            Provider / Model
            <select value={provider} onChange={(event) => setProvider(event.target.value as EvaluationProvider)} className="min-w-52 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950">
              <option value="local">Gemma 4 (local)</option>
              <option value="openai">GPT-5-mini (OpenAI)</option>
            </select>
          </label>
          <button type="button" disabled={disabled} onClick={() => void onStart(provider)} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            <Play className="h-4 w-4" /> 평가 실행
          </button>
          <button type="button" disabled={disabled} onClick={() => void onStartExperiment()} className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            <Play className="h-4 w-4" /> 3조건 실험 실행 · Gemma 4
          </button>
        </div>
      </div>
      {provider === 'openai' && (
        <div className="mt-4 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
          <WalletCards className="h-4 w-4" /> 유료 API이며 Gemma gate 통과 후 명시적으로만 실행됩니다. 자동 전환은 없습니다.
        </div>
      )}
    </section>
  );
};
