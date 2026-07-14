import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

import type { EvaluationRun } from '../../../shared/amyHoodEvaluation';
import { summarizeRun } from './evaluationViewModel';

type Props = {
  run: EvaluationRun;
  onResume(runId: string): Promise<void>;
};

export const EvaluationRunSummary: React.FC<Props> = ({ run, onResume }) => {
  const summary = summarizeRun(run);
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-500">현재 실행</p>
          <h2 className="mt-1 text-lg font-bold text-slate-950 dark:text-white">{run.model}</h2>
          <p className="mt-1 font-mono text-xs text-slate-500">{run.runId}</p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">{run.status}</span>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          ['진행', `${summary.completedQuestions}/15`],
          ['과거 복원', `${summary.pastMemory}/7`],
          ['홀드아웃', `${summary.githubHoldout}/5`],
          ['주관식', summary.subjective === null ? '채점 대기' : `${summary.subjective}/24`],
          ['실패', String(summary.failedQuestions)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg bg-slate-50 p-3 dark:bg-slate-950/60">
            <p className="text-xs text-slate-500">{label}</p>
            <p className="mt-1 text-lg font-bold">{value}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 grid gap-1 font-mono text-xs text-slate-500 md:grid-cols-3">
        <span>prompt {run.promptHash.slice(0, 12)}</span>
        <span>rag {run.ragSnapshotId.slice(0, 12)}</span>
        <span>questions {run.questionSetVersion}</span>
      </div>
      {run.status === 'incomplete' && (
        <button type="button" onClick={() => void onResume(run.runId)} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-white">
          <RotateCcw className="h-4 w-4" /> 미완료 문항부터 재개
        </button>
      )}
      {run.status === 'incomplete' && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300"><AlertTriangle className="h-3.5 w-3.5" /> 완료된 답변은 보존되며 실패 문항부터 다시 실행합니다.</p>
      )}
    </section>
  );
};
