import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Loader2, Play } from 'lucide-react';

import type { EvaluationV3Repetitions, EvaluationV3Run } from '../../../shared/amyHoodEvaluationV3';
import {
  createEvaluationV3Experiment,
  fetchEvaluationV3Questions,
  listEvaluationV3Runs,
  resumeEvaluationV3Run,
} from '../../services/evaluationApi';
import { EVALUATION_V3_ARM_LABELS } from './evaluationV3ViewModel';

export const EvaluationV3RunPanel: React.FC = () => {
  const [runs, setRuns] = useState<EvaluationV3Run[]>([]);
  const [repetitions, setRepetitions] = useState<EvaluationV3Repetitions>(1);
  const [readiness, setReadiness] = useState({
    allApproved: false,
    structuredMemoryAvailable: false,
  });
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    const response = await listEvaluationV3Runs();
    setRuns(response.runs);
  }, []);

  useEffect(() => {
    Promise.all([fetchEvaluationV3Questions(), listEvaluationV3Runs()])
      .then(([questions, runResponse]) => {
        setReadiness(questions.readiness);
        setRuns(runResponse.runs);
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : 'v3 실행 정보를 불러오지 못했습니다.'))
      .finally(() => setLoading(false));
  }, []);

  const running = runs.some(({ status }) => status === 'queued' || status === 'running');
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => void refresh(), 2_000);
    return () => window.clearInterval(timer);
  }, [refresh, running]);

  const start = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await createEvaluationV3Experiment(repetitions);
      setRuns((current) => [...result.runs, ...current]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'v3 실험 시작에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const resume = async (runId: string) => {
    try {
      await resumeEvaluationV3Run(runId);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'v3 실행 재개에 실패했습니다.');
    }
  };

  const ready = readiness.allApproved && readiness.structuredMemoryAvailable;
  const latestGroup = runs[0]?.experimentGroupId;
  const visibleRuns = runs.filter(({ experimentGroupId }) => experimentGroupId === latestGroup);

  if (loading) return <div className="p-12 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></div>;
  return (
    <div className="min-h-full bg-slate-50 p-6 dark:bg-slate-950">
      <div className="mx-auto max-w-7xl space-y-5">
        <header><p className="text-sm font-bold text-indigo-600">Evaluation v3 · Four-arm Ablation</p><h1 className="mt-1 text-2xl font-black">Gemma 4 반복 실험</h1><p className="mt-2 text-sm text-slate-500">일반 CFO → Amy Prompt → 정책 RAG → 전체 RAG의 순수 기여도를 비교합니다.</p></header>
        {error && <p role="alert" className="flex items-center gap-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-700"><AlertCircle className="h-4 w-4" />{error}</p>}
        <section className="rounded-xl border bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => setRepetitions(1)} className={`rounded-lg px-4 py-2 text-sm font-bold ${repetitions === 1 ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}`}>1회 빠른 실험 · 120호출</button>
            <button type="button" onClick={() => setRepetitions(5)} className={`rounded-lg px-4 py-2 text-sm font-bold ${repetitions === 5 ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}`}>5회 정식 실험 · 600호출</button>
            <button type="button" disabled={!ready || busy || running} onClick={() => void start()} className="ml-auto inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"><Play className="h-4 w-4" />실험 시작</button>
          </div>
          {!ready && <p className="mt-3 text-xs font-semibold text-amber-700">실행 잠금: 30문항 전체 승인과 정책·성찰·사건 구조화 메모리 릴리스가 모두 필요합니다.</p>}
        </section>
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {visibleRuns.map((run) => <article key={run.runId} className="rounded-xl border bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><p className="text-xs font-bold text-indigo-600">반복 {run.repetition} · {EVALUATION_V3_ARM_LABELS[run.arm]}</p><p className="mt-2 text-lg font-black">{run.scores.total}/30</p><p className="text-xs text-slate-500">{run.status} · {run.answers.length}/30 응답</p>{run.status === 'incomplete' && <button type="button" onClick={() => void resume(run.runId)} className="mt-3 rounded bg-amber-500 px-2 py-1 text-xs font-bold text-white">재개</button>}</article>)}
          {visibleRuns.length === 0 && <p className="text-sm text-slate-500">아직 v3 실행 기록이 없습니다.</p>}
        </section>
      </div>
    </div>
  );
};
