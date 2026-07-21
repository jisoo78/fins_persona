import React, { useEffect, useMemo, useState } from 'react';
import { GitCompareArrows, Play } from 'lucide-react';

import {
  EVALUATION_MODEL_OPTIONS,
  type EvaluationModelOption,
} from '../../../shared/amyHoodEvaluation';
import type {
  AmyHoodEventMatchingEvaluationFile,
  AmyHoodEventMatchingRun,
} from '../../../shared/amyHoodEventMatchingEvaluation';
import {
  createEventMatchingRun,
  fetchEventMatchingEvaluation,
  listEventMatchingRuns,
} from '../../services/evaluationApi';

const modelLabel = (model: string) =>
  EVALUATION_MODEL_OPTIONS.find((option) => option.model === model)?.label ?? model;

const formatScore = (run: AmyHoodEventMatchingRun) =>
  run.totalScore == null ? '-' : `${run.totalScore}/${run.maxScore}`;

export const EventMatchingEvaluationPanel: React.FC = () => {
  const [evaluation, setEvaluation] = useState<AmyHoodEventMatchingEvaluationFile | null>(null);
  const [runs, setRuns] = useState<AmyHoodEventMatchingRun[]>([]);
  const [optionId, setOptionId] = useState(EVALUATION_MODEL_OPTIONS[0].id);
  const [busy, setBusy] = useState(false);
  const [activeRunId, setActiveRunId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const selected = EVALUATION_MODEL_OPTIONS.find((option) => option.id === optionId) ??
    EVALUATION_MODEL_OPTIONS[0];

  const refresh = async () => {
    const [evaluationResponse, runsResponse] = await Promise.all([
      fetchEventMatchingEvaluation(),
      listEventMatchingRuns(),
    ]);
    const nextRuns = runsResponse.runs.filter((run) => run.datasetVersion === evaluationResponse.evaluation.version);
    setEvaluation(evaluationResponse.evaluation);
    setRuns(nextRuns);
    return nextRuns;
  };

  useEffect(() => {
    let cancelled = false;
    refresh().catch((caught) => {
      if (!cancelled) setError(caught instanceof Error ? caught.message : 'Event Matching 정보를 불러오지 못했습니다.');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!activeRunId) return;
    let cancelled = false;
    const timer = window.setInterval(() => {
      refresh()
        .then((nextRuns) => {
          if (cancelled) return;
          const activeRun = nextRuns.find((run) => run.runId === activeRunId);
          if (activeRun && activeRun.status !== 'running') {
            setBusy(false);
            setActiveRunId('');
            setMessage('Event Matching 평가가 완료되었습니다.');
            return;
          }
          setMessage('실행 중입니다. 완료되면 목록에 새 결과가 표시됩니다.');
        })
        .catch((caught) => {
          if (!cancelled) setError(caught instanceof Error ? caught.message : 'Event Matching 실행 상태 조회에 실패했습니다.');
        });
    }, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeRunId]);

  const completedCount = useMemo(
    () => runs.filter((run) => run.status === 'complete').length,
    [runs],
  );

  const start = async (option: Pick<EvaluationModelOption, 'provider' | 'model'>) => {
    setBusy(true);
    setError('');
    setMessage('Event Matching 평가를 시작했습니다. 주관식이라 몇 분 걸릴 수 있습니다.');
    try {
      const response = await createEventMatchingRun(option);
      setActiveRunId(response.runId);
      await refresh();
    } catch (caught) {
      setBusy(false);
      setError(caught instanceof Error ? caught.message : 'Event Matching 평가 실행에 실패했습니다.');
    }
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
            <GitCompareArrows className="h-4 w-4" /> Event Matching
          </div>
          <h2 className="text-sm font-semibold text-slate-950 dark:text-white">실제 사건-가상 사건 매칭 성능평가</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            실제 의사결정 사건 DB에서 유사 사건을 찾고, 그 판단 기준을 가상 사건에 전이하는지 주관식으로 평가합니다.
          </p>
          <p className="mt-2 text-xs text-slate-500">
            평가셋 {evaluation?.version ?? '-'} · 실제 사건 {evaluation?.actualEvents.length ?? 0}개 · 문항 {evaluation?.questions.length ?? 0}개 · 완료 {completedCount}회
          </p>
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
          <button type="button" disabled={busy} onClick={() => void start({ provider: selected.provider, model: selected.model })} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            <Play className="h-4 w-4" /> 매칭 평가 실행
          </button>
        </div>
      </div>
      {message && <p className="mt-3 text-xs text-emerald-700 dark:text-emerald-300">{message}</p>}
      {error && <p className="mt-3 text-xs text-red-600 dark:text-red-300">{error}</p>}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-xs">
          <thead className="border-b border-slate-200 text-slate-500 dark:border-slate-800">
            <tr>
              <th className="py-2 pr-3">모델</th>
              <th className="py-2 pr-3">실행 ID</th>
              <th className="py-2 pr-3">상태</th>
              <th className="py-2 pr-3">문항</th>
              <th className="py-2 pr-3">자동 점수</th>
              <th className="py-2 pr-3">완료 시각</th>
            </tr>
          </thead>
          <tbody>
            {runs.slice(0, 8).map((run) => (
              <tr key={run.runId} className="border-b border-slate-100 dark:border-slate-800">
                <td className="py-2 pr-3 font-semibold">{modelLabel(run.model)}</td>
                <td className="py-2 pr-3 font-mono text-slate-500">{run.runId}</td>
                <td className="py-2 pr-3">{run.status}</td>
                <td className="py-2 pr-3">{run.answers.length}/{evaluation?.questions.length ?? run.answers.length}</td>
                <td className="py-2 pr-3">{formatScore(run)}</td>
                <td className="py-2 pr-3 text-slate-500">{run.completedAt?.slice(0, 19).replace('T', ' ') ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};
