import React, { useMemo, useState } from 'react';

import type { EvaluationQuestion, EvaluationRun } from '../../../shared/amyHoodEvaluation';
import { EVALUATION_KPI_MAX_SCORES } from '../../../shared/amyHoodEvaluation';
import { CopyRunIdButton } from './CopyRunIdButton';
import { buildComparisonReport } from './evaluationReportViewModel';

type Props = {
  runs: EvaluationRun[];
  questions: EvaluationQuestion[];
};

const answerText = (answer: EvaluationRun['answers'][number]) => answer.status === 'failed'
  ? `실패: ${answer.error ?? '원인 미상'}`
  : answer.text ?? `${answer.choice ?? '-'}번 · ${answer.reason ?? '선택 이유 없음'}`;

export const ComparisonRunReport: React.FC<Props> = ({ runs, questions }) => {
  const comparable = useMemo(
    () => runs.filter((run) => run.status === 'complete' && run.answers.length === EVALUATION_KPI_MAX_SCORES.totalQuestions),
    [runs],
  );
  const [leftId, setLeftId] = useState(() => comparable[0]?.runId ?? '');
  const [rightId, setRightId] = useState(() => comparable[1]?.runId ?? '');
  const left = comparable.find((run) => run.runId === leftId);
  const right = comparable.find((run) => run.runId === rightId);

  let report = null;
  let error = '';
  if (left && right) {
    try {
      report = buildComparisonReport(left, right, questions);
    } catch (caught) {
      error = caught instanceof Error ? caught.message : '두 실행을 비교할 수 없습니다.';
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="grid gap-4 md:grid-cols-2">
          {[
            { label: '왼쪽 실행', value: leftId, setValue: setLeftId },
            { label: '오른쪽 실행', value: rightId, setValue: setRightId },
          ].map((side) => (
            <div key={side.label}>
              <label className="text-xs font-bold text-slate-500">{side.label}
                <select value={side.value} onChange={(event) => side.setValue(event.target.value)} className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-950">
                  <option value="">실행 선택</option>
                  {comparable.map((run) => <option key={run.runId} value={run.runId}>{run.model} · {run.runId.slice(0, 8)} · {run.questionSetVersion}</option>)}
                </select>
              </label>
              <div className="mt-2"><CopyRunIdButton runId={side.value} disabled={!side.value} /></div>
            </div>
          ))}
        </div>
        {error && <p role="alert" className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">{error}</p>}
      </section>

      {report && (
        <>
          <section className="grid gap-3 sm:grid-cols-3">
            {[
              ['과거 복원', report.scoreDeltas.pastMemory, EVALUATION_KPI_MAX_SCORES.pastMemory],
              ['M&A 판단', report.scoreDeltas.githubHoldout, EVALUATION_KPI_MAX_SCORES.githubHoldout],
              ['가상 시나리오', report.scoreDeltas.subjective, EVALUATION_KPI_MAX_SCORES.subjective],
            ].map(([label, delta, max]) => (
              <div key={String(label)} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <p className="text-xs text-slate-500">{label} · 오른쪽-왼쪽</p>
                <p className="mt-1 text-xl font-black">{delta === null ? '채점 대기' : `${Number(delta) > 0 ? '+' : ''}${delta}`} <span className="text-xs font-medium text-slate-400">/ {max}</span></p>
              </div>
            ))}
          </section>
          <section className="space-y-3">
            {report.rows.map((row) => (
              <article key={row.question.id} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <p className="text-xs font-black text-indigo-500">{row.question.id}</p>
                <p className="mt-2 text-sm font-semibold leading-6">{row.question.prompt}</p>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {[
                    { model: report.left.model, answer: row.left },
                    { model: report.right.model, answer: row.right },
                  ].map((side, index) => (
                    <div key={`${row.question.id}-${index}`} className="rounded-lg bg-slate-50 p-3 dark:bg-slate-950/60">
                      <p className="text-xs font-bold">{side.model}</p>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{answerText(side.answer)}</p>
                      {side.answer.grade && <p className="mt-2 text-xs text-slate-500">결론 {side.answer.grade.decision}/2 · 근거 {side.answer.grade.reasoning}/2 · 상충관계 {side.answer.grade.tradeoff}/2 · 일관성 {side.answer.grade.personaConsistency}/2</p>}
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </section>
        </>
      )}
    </div>
  );
};
