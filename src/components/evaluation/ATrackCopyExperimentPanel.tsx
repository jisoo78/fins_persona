import React, { useEffect, useMemo, useState } from 'react';
import { BrainCircuit, Copy, Play } from 'lucide-react';

import {
  EVALUATION_MODEL_OPTIONS,
  type EvaluationModelOption,
} from '../../../shared/amyHoodEvaluation';
import type { AmyHoodATrackCopyExperimentRun } from '../../../shared/amyHoodATrackCopyExperiment';
import {
  createATrackCopyExperimentRun,
  listATrackCopyExperimentRuns,
} from '../../services/evaluationApi';

const modelLabel = (model: string) =>
  EVALUATION_MODEL_OPTIONS.find((option) => option.model === model)?.label ?? model;

const copyText = async (text: string) => {
  if (!text) return;
  await navigator.clipboard?.writeText(text);
};

export const ATrackCopyExperimentPanel: React.FC = () => {
  const [runs, setRuns] = useState<AmyHoodATrackCopyExperimentRun[]>([]);
  const [optionId, setOptionId] = useState(EVALUATION_MODEL_OPTIONS[0].id);
  const [repetitions, setRepetitions] = useState(5);
  const [skipEvaluation, setSkipEvaluation] = useState(false);
  const [busy, setBusy] = useState(false);
  const [activeRunId, setActiveRunId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const selected = EVALUATION_MODEL_OPTIONS.find((option) => option.id === optionId) ??
    EVALUATION_MODEL_OPTIONS[0];

  const refresh = async () => {
    const response = await listATrackCopyExperimentRuns();
    setRuns(response.runs);
    return response.runs;
  };

  useEffect(() => {
    let cancelled = false;
    refresh().catch((caught) => {
      if (!cancelled) setError(caught instanceof Error ? caught.message : 'A트랙 복제 실험 기록을 불러오지 못했습니다.');
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
            setMessage('A트랙 복제 실험이 완료되었습니다.');
            return;
          }
          setMessage('실험 실행 중입니다. 사전 질문, 심층 인터뷰, 평가까지 순차 진행됩니다.');
        })
        .catch((caught) => {
          if (!cancelled) setError(caught instanceof Error ? caught.message : 'A트랙 복제 실험 상태 조회에 실패했습니다.');
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
    setMessage('A트랙 복제 실험을 시작했습니다. 로컬 LLM 기준 오래 걸릴 수 있습니다.');
    try {
      const response = await createATrackCopyExperimentRun({
        provider: option.provider,
        model: option.model,
        repetitions,
        skipEvaluation,
      });
      setActiveRunId(response.runId);
      await refresh();
    } catch (caught) {
      setBusy(false);
      setError(caught instanceof Error ? caught.message : 'A트랙 복제 실험 실행에 실패했습니다.');
    }
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-violet-600 dark:text-violet-400">
            <BrainCircuit className="h-4 w-4" /> A Track Copy
          </div>
          <h2 className="text-sm font-semibold text-slate-950 dark:text-white">B트랙 페르소나를 A트랙 흐름으로 재복제</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Amy Hood 공개 데이터 기반 페르소나가 사전 질문과 심층 인터뷰를 답하게 하고, 그 결과로 Copy A 프롬프트를 생성해 다시 평가합니다.
          </p>
          <p className="mt-2 text-xs text-slate-500">
            완료 {completedCount}회 · 사전 질문 40개 · 심층 인터뷰 자동 생성
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
          <label className="grid gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
            반복
            <input type="number" min={1} max={10} value={repetitions} onChange={(event) => setRepetitions(Number(event.target.value))} className="w-24 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" />
          </label>
          <label className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300">
            <input type="checkbox" checked={skipEvaluation} onChange={(event) => setSkipEvaluation(event.target.checked)} />
            평가 생략
          </label>
          <button type="button" disabled={busy} onClick={() => void start({ provider: selected.provider, model: selected.model })} className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            <Play className="h-4 w-4" /> 복제 실험 실행
          </button>
        </div>
      </div>
      {message && <p className="mt-3 text-xs text-violet-700 dark:text-violet-300">{message}</p>}
      {error && <p className="mt-3 text-xs text-red-600 dark:text-red-300">{error}</p>}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[920px] text-left text-xs">
          <thead className="border-b border-slate-200 text-slate-500 dark:border-slate-800">
            <tr>
              <th className="py-2 pr-3">모델</th>
              <th className="py-2 pr-3">실행 ID</th>
              <th className="py-2 pr-3">상태</th>
              <th className="py-2 pr-3">사전/심층</th>
              <th className="py-2 pr-3">Action 점수</th>
              <th className="py-2 pr-3">산출물</th>
              <th className="py-2 pr-3">완료 시각</th>
            </tr>
          </thead>
          <tbody>
            {runs.slice(0, 8).map((run) => (
              <tr key={run.runId} className="border-b border-slate-100 dark:border-slate-800">
                <td className="py-2 pr-3 font-semibold">{modelLabel(run.model)}</td>
                <td className="py-2 pr-3 font-mono text-slate-500">{run.runId}</td>
                <td className="py-2 pr-3">{run.status}</td>
                <td className="py-2 pr-3">{run.preInterviewAnswers.length}/{run.deepAnswers.length}</td>
                <td className="py-2 pr-3">{run.actionAlignmentAverageScore == null ? '-' : `${run.actionAlignmentAverageScore}/10`}</td>
                <td className="py-2 pr-3">
                  <div className="flex flex-wrap gap-2">
                    {[run.copyPromptPath, run.finalOutputPath, run.reportPath].map((path) => (
                      <button key={path} type="button" onClick={() => void copyText(path)} className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800" title={path}>
                        <Copy className="h-3 w-3" /> {path.split('/').pop()}
                      </button>
                    ))}
                  </div>
                </td>
                <td className="py-2 pr-3 text-slate-500">{run.completedAt?.slice(0, 19).replace('T', ' ') ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};
