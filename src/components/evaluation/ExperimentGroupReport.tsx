import React from 'react';

import type { EvaluationRun } from '../../../shared/amyHoodEvaluation';
import { CopyRunIdButton } from './CopyRunIdButton';
import {
  buildExperimentGroups,
  experimentArmLabel,
} from './evaluationViewModel';

type Props = {
  runs: EvaluationRun[];
};

const score = (value: number | null, total: number) =>
  value === null ? '채점 대기' : `${value}/${total}`;

const lift = (value: number | null) =>
  value === null ? '계산 대기' : `${value >= 0 ? '+' : ''}${value}점`;

export const ExperimentGroupReport: React.FC<Props> = ({ runs }) => {
  const groups = buildExperimentGroups(runs);
  if (!groups.length) return null;

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <section
          key={group.experimentGroupId}
          className="rounded-2xl border border-indigo-200 bg-white p-5 dark:border-indigo-900 dark:bg-slate-900"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-indigo-500">3조건 실험</p>
              <p className="mt-1 font-mono text-xs text-slate-500">{group.experimentGroupId}</p>
            </div>
            <div className="flex gap-2 text-xs font-bold">
              <span className="rounded-lg bg-indigo-50 px-3 py-2 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">RAG lift {lift(group.ragLift)}</span>
              <span className="rounded-lg bg-violet-50 px-3 py-2 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">Persona lift {lift(group.personaLift)}</span>
            </div>
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            {group.runs.map(({ arm, run }) => (
              <article key={arm} className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-black text-slate-900 dark:text-white">{experimentArmLabel(arm)}</p>
                    <p className="mt-1 text-xs text-slate-500">{run.model} · {run.status}</p>
                  </div>
                  <CopyRunIdButton runId={run.runId} />
                </div>
                <p className="mt-3 break-all font-mono text-[11px] text-slate-500">{run.runId}</p>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-950/60"><p className="text-[10px] text-slate-500">과거 복원</p><p className="mt-1 text-sm font-bold">{score(run.scores.pastMemory, 7)}</p></div>
                  <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-950/60"><p className="text-[10px] text-slate-500">홀드아웃</p><p className="mt-1 text-sm font-bold">{score(run.scores.githubHoldout, 5)}</p></div>
                  <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-950/60"><p className="text-[10px] text-slate-500">주관식</p><p className="mt-1 text-sm font-bold">{score(run.scores.subjective, 24)}</p></div>
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
};
