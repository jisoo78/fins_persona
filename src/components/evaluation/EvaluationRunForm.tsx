import React, { useState } from 'react';
import { Play, WalletCards } from 'lucide-react';

import {
  EVALUATION_MODEL_OPTIONS,
  type EvaluationModelOption,
} from '../../../shared/amyHoodEvaluation';

type Props = {
  disabled?: boolean;
  onStart(input: Pick<EvaluationModelOption, 'provider' | 'model'>): Promise<void>;
};

export const EvaluationRunForm: React.FC<Props> = ({ disabled, onStart }) => {
  const [optionId, setOptionId] = useState(EVALUATION_MODEL_OPTIONS[0].id);
  const selected = EVALUATION_MODEL_OPTIONS.find((option) => option.id === optionId) ??
    EVALUATION_MODEL_OPTIONS[0];
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
            <select value={optionId} onChange={(event) => setOptionId(event.target.value)} className="min-w-64 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950">
              {EVALUATION_MODEL_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
          </label>
          <button type="button" disabled={disabled} onClick={() => void onStart({ provider: selected.provider, model: selected.model })} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            <Play className="h-4 w-4" /> 평가 실행
          </button>
        </div>
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-500 dark:text-slate-400">{selected.note}</p>
      {selected.provider === 'openai' && (
        <div className="mt-4 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
          <WalletCards className="h-4 w-4" /> 유료 API이며 Gemma gate 통과 후 명시적으로만 실행됩니다. 자동 전환은 없습니다.
        </div>
      )}
    </section>
  );
};
