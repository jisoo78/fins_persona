import React, { useEffect, useMemo, useState } from 'react';

import type {
  EvaluationQuestion,
  EvaluationRun,
  SubjectiveGrade,
} from '../../../shared/amyHoodEvaluation';
import { CopyRunIdButton } from './CopyRunIdButton';

type GradeDraft = Omit<SubjectiveGrade, 'questionId' | 'score'>;

type Props = {
  runs: EvaluationRun[];
  questions: EvaluationQuestion[];
  onGrade(runId: string, grades: SubjectiveGrade[]): Promise<void>;
};

const answerText = (run: EvaluationRun, questionId: string) => {
  const answer = run.answers.find((item) => item.questionId === questionId);
  if (!answer) return '답변 없음';
  if (answer.text) return answer.text;
  return `${answer.choice ?? '-'}번 · ${answer.reason ?? ''}`;
};

const emptyDraft = (): GradeDraft => ({
  decision: 0,
  reasoning: 0,
  tradeoff: 0,
  personaConsistency: 0,
  summary: '',
});

export const EvaluationRunHistory: React.FC<Props> = ({ runs, questions, onGrade }) => {
  const subjectiveQuestions = useMemo(
    () => questions.filter((question) => question.type === 'subjective'),
    [questions],
  );
  const subjectiveIds = useMemo(
    () => subjectiveQuestions.map((question) => question.id),
    [subjectiveQuestions],
  );
  const complete = useMemo(
    () => runs.filter((run) => run.status === 'complete'),
    [runs],
  );
  const [gradeRunId, setGradeRunId] = useState('');
  const [drafts, setDrafts] = useState<Record<string, GradeDraft>>({});

  useEffect(() => {
    const pending = complete.find((run) => run.gradingStatus === 'pending');
    if (!gradeRunId && pending) setGradeRunId(pending.runId);
  }, [complete, gradeRunId]);

  useEffect(() => {
    setDrafts(Object.fromEntries(subjectiveIds.map((id) => [id, emptyDraft()])));
  }, [gradeRunId, subjectiveIds]);

  const gradeRun = complete.find((run) => run.runId === gradeRunId);

  const submitGrades = async () => {
    if (!gradeRun) return;
    const grades = subjectiveIds.map((questionId) => {
      const draft = drafts[questionId];
      return {
        questionId,
        ...draft,
        score: draft.decision + draft.reasoning + draft.tradeoff + draft.personaConsistency,
      };
    });
    await onGrade(gradeRun.runId, grades);
  };

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-sm font-semibold">최근 평가 실행</h2>
        <p className="mt-1 text-xs text-slate-500">상세 결과와 두 실행 비교는 B Track의 평가 리포트 메뉴에서 확인합니다.</p>
        <div className="mt-3 space-y-2">
          {runs.slice(0, 8).map((run) => (
            <div key={run.runId} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
              <div>
                <p className="text-xs font-bold">{run.model} · {run.status}</p>
                <p className="mt-1 font-mono text-xs text-slate-500">{run.runId}</p>
              </div>
              <CopyRunIdButton runId={run.runId} />
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-sm font-semibold">시나리오 채점</h2>
        <p className="mt-1 text-xs text-slate-500">
          {subjectiveQuestions.length
            ? '채점 요청에는 생성 provider와 model을 포함하지 않습니다.'
            : '현재 질문 세트는 시나리오 문항까지 모두 객관식으로 채점됩니다.'}
        </p>
        {!subjectiveQuestions.length ? null : (
          <>
        <select value={gradeRunId} onChange={(event) => setGradeRunId(event.target.value)} className="mt-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950">
          <option value="">채점할 실행 선택</option>
          {complete.filter((run) => run.gradingStatus === 'pending').map((run) => <option key={run.runId} value={run.runId}>{run.runId.slice(0, 8)} · {run.model}</option>)}
        </select>
        {gradeRun && (
          <div className="mt-4 space-y-4">
            {subjectiveQuestions.map((question) => {
              const questionId = question.id;
              const draft = drafts[questionId] ?? emptyDraft();
              return (
                <div key={questionId} className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                  <p className="text-xs font-bold text-indigo-500">{questionId}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{question.prompt}</p>
                  <p className="mt-2 text-sm leading-6">{answerText(gradeRun, questionId)}</p>
                  <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
                    {(['decision', 'reasoning', 'tradeoff', 'personaConsistency'] as const).map((dimension) => (
                      <label key={dimension} className="grid gap-1 text-xs font-semibold text-slate-500">{dimension}
                        <select value={draft[dimension]} onChange={(event) => setDrafts((current) => ({ ...current, [questionId]: { ...draft, [dimension]: Number(event.target.value) as 0 | 1 | 2 } }))} className="rounded border border-slate-300 bg-white p-2 text-sm dark:border-slate-700 dark:bg-slate-950">
                          {[0, 1, 2].map((score) => <option key={score} value={score}>{score}</option>)}
                        </select>
                      </label>
                    ))}
                  </div>
                  <textarea value={draft.summary} onChange={(event) => setDrafts((current) => ({ ...current, [questionId]: { ...draft, summary: event.target.value } }))} rows={2} placeholder="채점 요약" className="mt-3 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm dark:border-slate-700 dark:bg-slate-950" />
                </div>
              );
            })}
            <button
              type="button"
              disabled={subjectiveIds.some((id) => !drafts[id]?.summary.trim())}
              onClick={() => void submitGrades()}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              주관식 {subjectiveIds.length}문항 채점 저장
            </button>
          </div>
        )}
          </>
        )}
      </section>
    </div>
  );
};
