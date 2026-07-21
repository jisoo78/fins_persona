import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ClipboardCheck,
  Loader2,
  Save,
} from 'lucide-react';

import type {
  EvaluationKpi,
  QuestionReview,
} from '../../shared/amyHoodEvaluation';
import {
  fetchEvaluationQuestions,
  saveEvaluationQuestionReview,
} from '../services/evaluationApi';
import {
  buildQuestionCards,
  filterQuestionCards,
  summarizeQuestionReviews,
  type EvaluationQuestionCard,
} from './evaluation/evaluationViewModel';

type Draft = Pick<QuestionReview, 'status' | 'revisionNote'>;

const kpiLabels: Record<EvaluationKpi, string> = {
  past_memory_restoration: '과거 복원',
  github_holdout: 'GitHub 홀드아웃',
  hypothetical_scenario: '가상 시나리오',
};

const statusLabels: Record<QuestionReview['status'], string> = {
  unreviewed: '미검토',
  approved: '승인',
  revision_required: '수정 필요',
};

export const EvaluationQuestionReviewView: React.FC = () => {
  const [cards, setCards] = useState<EvaluationQuestionCard[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [kpi, setKpi] = useState<EvaluationKpi | 'all'>('all');
  const [status, setStatus] = useState<QuestionReview['status'] | 'all'>('all');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchEvaluationQuestions()
      .then((response) => {
        if (cancelled) return;
        const nextCards = buildQuestionCards(response);
        setCards(nextCards);
        setDrafts(
          Object.fromEntries(
            nextCards.map((card) => [
              card.question.id,
              {
                status: card.review.status,
                revisionNote: card.review.revisionNote,
              },
            ]),
          ),
        );
      })
      .catch((caught) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : '문항을 불러오지 못했습니다.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const summary = useMemo(() => summarizeQuestionReviews(cards), [cards]);
  const filtered = useMemo(
    () => filterQuestionCards(cards, { kpi, status }),
    [cards, kpi, status],
  );

  const updateDraft = (questionId: string, patch: Partial<Draft>) => {
    setDrafts((current) => ({
      ...current,
      [questionId]: { ...current[questionId], ...patch },
    }));
  };

  const save = async (questionId: string) => {
    const draft = drafts[questionId];
    if (!draft) return;
    setSavingId(questionId);
    setError(null);
    try {
      const response = await saveEvaluationQuestionReview(questionId, draft);
      const nextReview = response.reviews.reviews.find(
        (item) => item.questionId === questionId,
      );
      if (!nextReview) throw new Error('저장된 검토 결과를 찾지 못했습니다.');
      setCards((current) =>
        current.map((card) =>
          card.question.id === questionId
            ? { ...card, review: nextReview }
            : card,
        ),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '검토 결과 저장에 실패했습니다.');
    } finally {
      setSavingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-full items-center justify-center bg-slate-50 dark:bg-slate-950">
        <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-950">
      <div className="mx-auto max-w-7xl space-y-6 px-6 py-8">
        <header>
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-indigo-600 dark:text-indigo-400">
            <ClipboardCheck className="h-4 w-4" />
            평가 문항 검토
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white">
            Amy Hood 블라인드 평가 질문 60개
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">
            원문은 직접 편집하지 않습니다. 승인 또는 수정 필요 상태와 Codex에 전달할 수정 지시만 저장합니다.
          </p>
        </header>

        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {[
            ['전체', summary.total],
            ['과거 복원', summary.kpis.past_memory_restoration],
            ['홀드아웃', summary.kpis.github_holdout],
            ['가상 시나리오', summary.kpis.hypothetical_scenario],
            ['승인', summary.statuses.approved],
            ['수정/미검토', summary.statuses.revision_required + summary.statuses.unreviewed],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <p className="text-xs font-semibold text-slate-500">{label}</p>
              <p className="mt-1 text-2xl font-bold text-slate-950 dark:text-white">{value}</p>
            </div>
          ))}
        </section>

        <section className="flex flex-wrap gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <select value={kpi} onChange={(event) => setKpi(event.target.value as EvaluationKpi | 'all')} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950">
            <option value="all">전체 KPI</option>
            {Object.entries(kpiLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <select value={status} onChange={(event) => setStatus(event.target.value as QuestionReview['status'] | 'all')} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950">
            <option value="all">전체 검토 상태</option>
            {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <span className="self-center text-xs text-slate-500">표시 {filtered.length}개</span>
        </section>

        <section className="space-y-5">
          {filtered.map((card) => {
            const draft = drafts[card.question.id] ?? {
              status: card.review.status,
              revisionNote: card.review.revisionNote,
            };
            const invalid = draft.status === 'revision_required' && !draft.revisionNote.trim();
            return (
              <article key={card.question.id} className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-indigo-50 px-2 py-1 text-xs font-bold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">{card.question.id}</span>
                    <span className="text-xs font-semibold text-slate-500">{kpiLabels[card.question.kpi]}</span>
                  </div>
                  <span className="text-xs text-slate-500">저장 상태: {statusLabels[card.review.status]}</span>
                </div>
                <p className="mt-4 text-sm font-medium leading-7 text-slate-900 dark:text-slate-100">{card.question.prompt}</p>

                {card.question.options ? (
                  <div className="mt-4 grid gap-2">
                    {card.question.options.map((option, index) => (
                      <div key={option} className={`rounded-lg border p-3 text-sm leading-6 ${card.answer.correctChoice === index + 1 ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30' : 'border-slate-200 dark:border-slate-800'}`}>
                        <span className="mr-2 font-bold">{index + 1}.</span>{option}
                        <p className="mt-1 text-xs text-slate-500">{card.answer.trapIntents?.[String(index + 1) as '1' | '2' | '3' | '4']}</p>
                      </div>
                    ))}
                    <p className="mt-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300">정답 {card.answer.correctChoice}번 · {card.answer.correctIntent}</p>
                  </div>
                ) : (
                  <div className="mt-4 grid gap-2 md:grid-cols-2">
                    {Object.entries(card.answer.rubric ?? {}).map(([name, description]) => (
                      <div key={name} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                        <p className="text-xs font-bold uppercase text-slate-500">{name}</p>
                        <p className="mt-1 text-sm">{description}</p>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-5 border-t border-slate-100 pt-4 dark:border-slate-800">
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => updateDraft(card.question.id, { status: 'approved', revisionNote: '' })} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold ${draft.status === 'approved' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'}`}>
                      <CheckCircle2 className="h-4 w-4" /> 승인
                    </button>
                    <button type="button" onClick={() => updateDraft(card.question.id, { status: 'revision_required' })} className={`rounded-lg px-3 py-2 text-sm font-semibold ${draft.status === 'revision_required' ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'}`}>
                      수정 필요
                    </button>
                  </div>
                  {draft.status === 'revision_required' && (
                    <textarea value={draft.revisionNote} onChange={(event) => updateDraft(card.question.id, { revisionNote: event.target.value })} rows={3} placeholder="Codex가 반영할 구체적인 수정 지시를 입력하세요." className="mt-3 w-full rounded-lg border border-slate-300 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-950" />
                  )}
                  <button type="button" disabled={invalid || savingId === card.question.id} onClick={() => void save(card.question.id)} className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
                    {savingId === card.question.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    검토 저장
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      </div>
    </div>
  );
};
