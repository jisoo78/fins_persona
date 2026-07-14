import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Scale } from 'lucide-react';

import type {
  EvaluationProvider,
  EvaluationQuestion,
  EvaluationRun,
  SubjectiveGrade,
} from '../../shared/amyHoodEvaluation';
import {
  createEvaluationRun,
  fetchEvaluationQuestions,
  getEvaluationRun,
  listEvaluationRuns,
  resumeEvaluationRun,
  submitSubjectiveGrades,
} from '../services/evaluationApi';
import { EvaluationRunForm } from './evaluation/EvaluationRunForm';
import { EvaluationRunHistory } from './evaluation/EvaluationRunHistory';
import { EvaluationRunSummary } from './evaluation/EvaluationRunSummary';

export const EvaluationView: React.FC = () => {
  const [runs, setRuns] = useState<EvaluationRun[]>([]);
  const [questions, setQuestions] = useState<EvaluationQuestion[]>([]);
  const [active, setActive] = useState<EvaluationRun | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshRuns = useCallback(async () => {
    const response = await listEvaluationRuns();
    setRuns(response.runs);
    return response.runs;
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([refreshRuns(), fetchEvaluationQuestions()])
      .then(([nextRuns, questionResponse]) => {
        if (cancelled) return;
        setQuestions(questionResponse.questions.questions);
        setActive(nextRuns[0] ?? null);
      })
      .catch((caught) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : '평가 정보를 불러오지 못했습니다.');
      });
    return () => {
      cancelled = true;
    };
  }, [refreshRuns]);

  useEffect(() => {
    if (!active || !['queued', 'running'].includes(active.status)) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const response = await getEvaluationRun(active.runId);
        if (cancelled) return;
        setActive(response.run);
        if (!['queued', 'running'].includes(response.run.status)) {
          await refreshRuns();
        }
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : '실행 상태 조회에 실패했습니다.');
      }
    };
    const timer = window.setInterval(() => void poll(), 2000);
    void poll();
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [active?.runId, active?.status, refreshRuns]);

  const start = async (provider: EvaluationProvider) => {
    setBusy(true);
    setError(null);
    try {
      const response = await createEvaluationRun(provider);
      setActive(response.run);
      setRuns((current) => [response.run, ...current]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '평가 실행을 시작하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const resume = async (runId: string) => {
    setError(null);
    try {
      const response = await resumeEvaluationRun(runId);
      setActive(response.run);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '평가 재개에 실패했습니다.');
    }
  };

  const grade = async (runId: string, grades: SubjectiveGrade[]) => {
    setError(null);
    try {
      const response = await submitSubjectiveGrades(runId, grades);
      setActive((current) => current?.runId === runId ? response.run : current);
      await refreshRuns();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '주관식 채점 저장에 실패했습니다.');
    }
  };

  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-950">
      <div className="mx-auto max-w-7xl space-y-6 px-6 py-8">
        <header>
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-indigo-600 dark:text-indigo-400"><Scale className="h-4 w-4" /> 평가 실행</div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white">Amy Hood 블라인드 평가 실행과 채점</h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">과거 복원 7점, GitHub 홀드아웃 5점, 가상 시나리오 24점의 실행 기록을 만들고 주관식을 채점합니다. 상세 비교는 평가 리포트에서 확인합니다.</p>
        </header>
        {error && <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"><AlertCircle className="h-4 w-4" />{error}</div>}
        <EvaluationRunForm disabled={busy || Boolean(active && ['queued', 'running'].includes(active.status))} onStart={start} />
        {active && <EvaluationRunSummary run={active} onResume={resume} />}
        <EvaluationRunHistory runs={runs} questions={questions} onGrade={grade} />
      </div>
    </div>
  );
};
