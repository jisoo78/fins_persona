import React, { useEffect, useMemo, useState } from 'react';

import type {
  EvaluationQuestion,
  EvaluationRun,
  SubjectiveGrade,
} from '../../../shared/amyHoodEvaluation';
import { compareEvaluationRuns } from './evaluationViewModel';
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
  const complete = useMemo(
    () => runs.filter((run) => run.status === 'complete'),
    [runs],
  );
  const [leftId, setLeftId] = useState('');
  const [rightId, setRightId] = useState('');
  const [gradeRunId, setGradeRunId] = useState('');
  const [drafts, setDrafts] = useState<Record<string, GradeDraft>>({});

  useEffect(() => {
    if (!leftId && complete[0]) setLeftId(complete[0].runId);
    if (!rightId && complete[1]) setRightId(complete[1].runId);
    const pending = complete.find((run) => run.gradingStatus === 'pending');
    if (!gradeRunId && pending) setGradeRunId(pending.runId);
  }, [complete, gradeRunId, leftId, rightId]);

  useEffect(() => {
    setDrafts(Object.fromEntries(['S1', 'S2', 'S3'].map((id) => [id, emptyDraft()])));
  }, [gradeRunId]);

  const left = complete.find((run) => run.runId === leftId);
  const right = complete.find((run) => run.runId === rightId);
  const rows = useMemo(() => {
    if (!left || !right || left.runId === right.runId) return [];
    try {
      return compareEvaluationRuns(left, right);
    } catch {
      return [];
    }
  }, [left, right]);
  const questionMap = useMemo(
    () => new Map(questions.map((question) => [question.id, question])),
    [questions],
  );
  const gradeRun = complete.find((run) => run.runId === gradeRunId);

  const submitGrades = async () => {
    if (!gradeRun) return;
    const grades = ['S1', 'S2', 'S3'].map((questionId) => {
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
        <h2 className="text-sm font-semibold">평가 이력 비교</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {[{ value: leftId, set: setLeftId }, { value: rightId, set: setRightId }].map((field, index) => (
            <div key={index} className="space-y-2">
              <select value={field.value} onChange={(event) => field.set(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950">
                <option value="">{index === 0 ? '왼쪽 실행 선택' : '오른쪽 실행 선택'}</option>
                {complete.map((run) => <option key={run.runId} value={run.runId}>{run.model} · {run.runId.slice(0, 8)} · {run.questionSetVersion}</option>)}
              </select>
              <CopyRunIdButton runId={field.value} disabled={!field.value} />
            </div>
          ))}
        </div>
        {rows.length > 0 && (
          <div className="mt-5 space-y-4">
            {rows.map((row) => (
              <div key={row.questionId} className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                <p className="text-xs font-bold text-indigo-500">{row.questionId}</p>
                <p className="mt-1 text-sm font-medium">{questionMap.get(row.questionId)?.prompt}</p>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {[row.left, row.right].map((side) => (
                    <div key={`${row.questionId}-${side.model}`} className="rounded-lg bg-slate-50 p-3 dark:bg-slate-950/60">
                      <p className="text-xs font-bold">{side.model} · {side.provider}</p>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{side.answer.text ?? `${side.answer.choice ?? '-'}번 · ${side.answer.reason ?? ''}`}</p>
                      {side.answer.objectiveScore !== undefined && <p className="mt-2 text-xs text-slate-500">객관식 점수 {side.answer.objectiveScore}</p>}
                      {side.answer.grade && <p className="mt-2 text-xs text-slate-500">주관식 점수 {side.answer.grade.score}/8 · {side.answer.grade.summary}</p>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-sm font-semibold">주관식 외부/Codex 채점</h2>
        <p className="mt-1 text-xs text-slate-500">채점 요청에는 생성 provider와 model을 포함하지 않습니다.</p>
        <select value={gradeRunId} onChange={(event) => setGradeRunId(event.target.value)} className="mt-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950">
          <option value="">채점할 실행 선택</option>
          {complete.filter((run) => run.gradingStatus === 'pending').map((run) => <option key={run.runId} value={run.runId}>{run.runId.slice(0, 8)} · {run.model}</option>)}
        </select>
        {gradeRun && (
          <div className="mt-4 space-y-4">
            {['S1', 'S2', 'S3'].map((questionId) => {
              const draft = drafts[questionId] ?? emptyDraft();
              return (
                <div key={questionId} className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                  <p className="text-xs font-bold text-indigo-500">{questionId}</p>
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
            <button type="button" disabled={(Object.values(drafts) as GradeDraft[]).some((draft) => !draft.summary.trim())} onClick={() => void submitGrades()} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">세 문항 채점 저장</button>
          </div>
        )}
      </section>
    </div>
  );
};
