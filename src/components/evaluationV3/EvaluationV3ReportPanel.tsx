import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';

import type { EvaluationV3ExperimentReport, EvaluationV3Run } from '../../../shared/amyHoodEvaluationV3';
import { fetchEvaluationV3Report, listEvaluationV3Runs } from '../../services/evaluationApi';
import { buildEvaluationV3ReportView } from './evaluationV3ViewModel';

export const EvaluationV3ReportPanel: React.FC = () => {
  const [runs, setRuns] = useState<EvaluationV3Run[]>([]);
  const [groupId, setGroupId] = useState('');
  const [report, setReport] = useState<EvaluationV3ExperimentReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    listEvaluationV3Runs()
      .then(({ runs: next }) => {
        setRuns(next);
        setGroupId(next[0]?.experimentGroupId ?? '');
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : 'v3 리포트를 불러오지 못했습니다.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!groupId) {
      setReport(null);
      return;
    }
    fetchEvaluationV3Report(groupId)
      .then(({ report: next }) => setReport(next))
      .catch((caught) => setError(caught instanceof Error ? caught.message : 'v3 집계에 실패했습니다.'));
  }, [groupId]);

  const groups = useMemo(() => [...new Set(runs.map(({ experimentGroupId }) => experimentGroupId))], [runs]);
  const groupRuns = runs.filter(({ experimentGroupId }) => experimentGroupId === groupId);
  const view = report ? buildEvaluationV3ReportView(report, groupRuns) : null;

  if (loading) return <div className="p-12 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></div>;
  return (
    <div className="min-h-full bg-slate-50 p-6 dark:bg-slate-950">
      <div className="mx-auto max-w-7xl space-y-5">
        <header><p className="text-sm font-bold text-indigo-600">Evaluation v3 · Diagnostics</p><h1 className="mt-1 text-2xl font-black">4조건 정량 리포트</h1></header>
        {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        <select value={groupId} onChange={(event) => setGroupId(event.target.value)} className="w-full rounded-xl border bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-900"><option value="">실험 그룹 선택</option>{groups.map((id) => <option key={id} value={id}>{id}</option>)}</select>
        {view?.benchmarkRejected && <p className="flex items-center gap-2 rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm font-bold text-rose-700"><AlertTriangle className="h-4 w-4" />일반 CFO가 80%를 초과하여 문항 세트의 변별력이 부족합니다.</p>}
        {view?.warnings.map((warning) => <p key={warning} className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">{warning}</p>)}
        {view && <>
          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{view.armCards.map((card) => <article key={card.arm} className="rounded-xl border bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><p className="text-xs font-bold text-indigo-600">{card.label}</p><p className="mt-2 text-2xl font-black">{card.percent ? `${card.percent.mean.toFixed(1)}%` : '—'}</p><p className="text-xs text-slate-500">완료 {card.completedRuns}/{card.totalRuns} · 일치도 {card.overallChoiceAgreement === null ? '—' : `${(card.overallChoiceAgreement * 100).toFixed(0)}%`}</p></article>)}</section>
          <section className="rounded-xl border bg-white p-5 dark:border-slate-800 dark:bg-slate-900"><h2 className="font-black">리프트</h2>{view.repetitions.map((item) => <div key={item.repetition} className="mt-3 grid gap-2 text-sm md:grid-cols-4">{Object.entries(item.lifts).map(([key, value]) => <div key={key} className="rounded-lg bg-slate-50 p-3 dark:bg-slate-950"><p className="text-xs text-slate-500">{view.liftLabels[key as keyof typeof view.liftLabels]}</p><p className="font-black">{value === null ? '비교 불가' : `${value > 0 ? '+' : ''}${value.toFixed(1)}%p`}</p></div>)}</div>)}</section>
          <section className="grid gap-3 md:grid-cols-5">{[['불일치', view.diagnostics.mismatchCount], ['입력 토큰', view.diagnostics.inputTokens], ['출력 토큰', view.diagnostics.outputTokens], ['지연(ms)', view.diagnostics.elapsedMs], ['실패 문항', view.diagnostics.failedQuestions]].map(([label, value]) => <div key={label} className="rounded-xl border bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><p className="text-xs text-slate-500">{label}</p><p className="text-xl font-black">{value}</p></div>)}</section>
        </>}
        {!view && <p className="text-sm text-slate-500">표시할 v3 실험 리포트가 없습니다.</p>}
      </div>
    </div>
  );
};
