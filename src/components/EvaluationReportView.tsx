import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';

import type { EvaluationQuestion, EvaluationRun } from '../../shared/amyHoodEvaluation';
import { fetchEvaluationQuestions, listEvaluationRuns, resumeEvaluationRun } from '../services/evaluationApi';
import { ComparisonRunReport } from './evaluation/ComparisonRunReport';
import { ExperimentGroupReport } from './evaluation/ExperimentGroupReport';
import { SingleRunReport } from './evaluation/SingleRunReport';
import { experimentArmLabel } from './evaluation/evaluationViewModel';
import { EvaluationV3ReportPanel } from './evaluationV3/EvaluationV3ReportPanel';
import { EvaluationVersionSelector } from './evaluationV3/EvaluationVersionSelector';
import type { EvaluationVersion } from './evaluationV3/evaluationV3ViewModel';

type ReportMode = 'single' | 'comparison' | 'experiment';

const EvaluationReportViewV2: React.FC = () => {
  const [mode, setMode] = useState<ReportMode>('single');
  const [runs, setRuns] = useState<EvaluationRun[]>([]);
  const [questions, setQuestions] = useState<EvaluationQuestion[]>([]);
  const [selectedRunId, setSelectedRunId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    const [runResponse, questionResponse] = await Promise.all([
      listEvaluationRuns(),
      fetchEvaluationQuestions(),
    ]);
    setRuns(runResponse.runs);
    setQuestions(questionResponse.questions.questions);
    setSelectedRunId((current) => current || runResponse.runs[0]?.runId || '');
  }, []);

  useEffect(() => {
    refresh()
      .catch((caught) => setError(caught instanceof Error ? caught.message : '평가 리포트를 불러오지 못했습니다.'))
      .finally(() => setLoading(false));
  }, [refresh]);

  const resume = async (runId: string) => {
    setError('');
    try {
      await resumeEvaluationRun(runId);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '평가 실행을 재개하지 못했습니다.');
    }
  };

  const selected = runs.find((run) => run.runId === selectedRunId);

  return (
    <div className="p-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <header>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white">평가 리포트</h2>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">실행 결과를 한 건씩 검토하거나 두 실행 및 3조건 실험의 차이를 비교합니다.</p>
        </header>
        {error && <p role="alert" className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300"><AlertCircle className="h-4 w-4" />{error}</p>}
        <div className="flex gap-2">
          {([
            ['single', '단일 실행'],
            ['comparison', '두 실행 비교'],
            ['experiment', '3조건 실험'],
          ] as const).map(([id, label]) => (
            <button key={id} type="button" onClick={() => setMode(id)} className={`rounded-xl px-4 py-2.5 text-xs font-bold ${mode === id ? 'bg-indigo-600 text-white' : 'border border-slate-300 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'}`}>{label}</button>
          ))}
        </div>
        {loading ? (
          <div className="flex items-center gap-2 py-16 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> 리포트를 불러오는 중입니다.</div>
        ) : mode === 'single' ? (
          <div className="space-y-4">
            <select value={selectedRunId} onChange={(event) => setSelectedRunId(event.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm dark:border-slate-700 dark:bg-slate-900">
              <option value="">실행 선택</option>
              {runs.map((run) => <option key={run.runId} value={run.runId}>{experimentArmLabel(run.experimentArm)} · {run.model} · {run.runId} · {run.status}</option>)}
            </select>
            {selected && <SingleRunReport run={selected} questions={questions} onResume={resume} />}
          </div>
        ) : mode === 'comparison' ? (
          <ComparisonRunReport runs={runs} questions={questions} />
        ) : (
          <ExperimentGroupReport runs={runs} />
        )}
      </div>
    </div>
  );
};

export const EvaluationReportView: React.FC = () => {
  const [version, setVersion] = useState<EvaluationVersion>('v3');
  return (
    <div className="min-h-full">
      <EvaluationVersionSelector value={version} onChange={setVersion} />
      {version === 'v3' ? <EvaluationV3ReportPanel /> : <EvaluationReportViewV2 />}
    </div>
  );
};
