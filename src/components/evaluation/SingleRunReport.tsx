import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

import type { EvaluationQuestion, EvaluationRun } from '../../../shared/amyHoodEvaluation';
import { CopyRunIdButton } from './CopyRunIdButton';
import { buildSingleRunReport } from './evaluationReportViewModel';

type Props = {
  run: EvaluationRun;
  questions: EvaluationQuestion[];
  onResume?: (runId: string) => Promise<void>;
};

const answerText = (answer: EvaluationRun['answers'][number] | null) => {
  if (!answer) return '답변 없음';
  if (answer.status === 'failed') return `실패: ${answer.error ?? '원인 미상'}`;
  return answer.text ?? `${answer.choice ?? '-'}번 · ${answer.reason ?? '선택 이유 없음'}`;
};

export const SingleRunReport: React.FC<Props> = ({ run, questions, onResume }) => {
  const report = buildSingleRunReport(run, questions);
  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-indigo-500">{report.experimentLabel ? `${report.experimentLabel} · ` : ''}{report.provider} · {report.model}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <p className="font-mono text-xs text-slate-500">{report.runId}</p>
              <CopyRunIdButton runId={report.runId} />
            </div>
            <p className="mt-2 text-xs text-slate-500">{report.promptLabel} · 질문지 {report.questionSetVersion}</p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold dark:bg-slate-800">{report.status} · {report.gradingStatus}</span>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {[
            ['과거 복원', `${report.scores.pastMemory}/7`],
            ['GitHub 홀드아웃', `${report.scores.githubHoldout}/5`],
            ['가상 시나리오', report.scores.subjective === null ? '채점 대기' : `${report.scores.subjective}/24`],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl bg-slate-50 p-4 dark:bg-slate-950/60">
              <p className="text-xs text-slate-500">{label}</p>
              <p className="mt-1 text-xl font-black">{value}</p>
            </div>
          ))}
        </div>
        {report.status === 'incomplete' && onResume && (
          <button type="button" onClick={() => void onResume(report.runId)} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-amber-500 px-3 py-2 text-xs font-bold text-white">
            <RotateCcw className="h-4 w-4" /> 미완료 문항 재개
          </button>
        )}
      </section>

      <section className="space-y-3">
        {report.rows.map(({ question, answer }) => (
          <article key={question.id} className={`rounded-xl border bg-white p-4 dark:bg-slate-900 ${answer?.status === 'failed' ? 'border-rose-300 dark:border-rose-900' : 'border-slate-200 dark:border-slate-800'}`}>
            <p className="text-xs font-black text-indigo-500">{question.id} · {question.type === 'subjective' ? '주관식' : '객관식'}</p>
            <p className="mt-2 text-sm font-semibold leading-6">{question.prompt}</p>
            <p className="mt-3 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm leading-6 dark:bg-slate-950/60">{answerText(answer)}</p>
            {answer?.objectiveScore !== undefined && <p className="mt-2 text-xs text-slate-500">객관식 점수 {answer.objectiveScore}/1</p>}
            {answer?.grade && <p className="mt-2 text-xs text-slate-500">주관식 {answer.grade.score}/8 · {answer.grade.summary}</p>}
            {!answer && <p className="mt-2 flex items-center gap-1 text-xs text-amber-600"><AlertTriangle className="h-3.5 w-3.5" /> 아직 생성되지 않은 답변입니다.</p>}
          </article>
        ))}
      </section>
    </div>
  );
};
