import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Loader2, Save } from 'lucide-react';

import type {
  EvaluationV3Category,
  EvaluationV3Review,
} from '../../../shared/amyHoodEvaluationV3';
import {
  fetchEvaluationV3Questions,
  saveEvaluationV3QuestionReview,
} from '../../services/evaluationApi';
import {
  buildEvaluationV3QuestionCards,
  filterEvaluationV3QuestionCards,
  summarizeEvaluationV3Questions,
  type EvaluationV3QuestionCard,
} from './evaluationV3ViewModel';

type Draft = Pick<EvaluationV3Review, 'status' | 'revisionNote'>;

const categoryLabels: Record<EvaluationV3Category, string> = {
  amy_specific_discrimination: 'Amy 판단 판별',
  temporal_holdout: '역사적 홀드아웃',
  counterfactual_pair: '반사실 쌍',
  new_advisory_transfer: '신규 조언 전이',
};

export const EvaluationV3QuestionReview: React.FC = () => {
  const [cards, setCards] = useState<EvaluationV3QuestionCard[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [category, setCategory] = useState<EvaluationV3Category | 'all'>('all');
  const [status, setStatus] = useState<EvaluationV3Review['status'] | 'all'>('all');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchEvaluationV3Questions()
      .then((response) => {
        const next = buildEvaluationV3QuestionCards(response);
        setCards(next);
        setDrafts(Object.fromEntries(next.map(({ question, review }) => [
          question.id,
          { status: review.status, revisionNote: review.revisionNote },
        ])));
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : 'v3 문항을 불러오지 못했습니다.'))
      .finally(() => setLoading(false));
  }, []);

  const summary = useMemo(() => summarizeEvaluationV3Questions(cards), [cards]);
  const filtered = useMemo(() => filterEvaluationV3QuestionCards(cards, {
    category,
    status,
  }), [cards, category, status]);

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
    setError('');
    try {
      const result = await saveEvaluationV3QuestionReview(questionId, draft);
      const review = result.reviews.reviews.find((item) => item.questionId === questionId);
      if (!review) throw new Error('저장된 v3 검토 기록이 없습니다.');
      setCards((current) => current.map((card) =>
        card.question.id === questionId ? { ...card, review } : card));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'v3 검토 저장에 실패했습니다.');
    } finally {
      setSavingId(null);
    }
  };

  if (loading) return <div className="p-12 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></div>;

  return (
    <div className="min-h-full bg-slate-50 p-6 dark:bg-slate-950">
      <div className="mx-auto max-w-7xl space-y-5">
        <header>
          <p className="text-sm font-bold text-indigo-600">Evaluation v3 · Human Review</p>
          <h1 className="mt-1 text-2xl font-black dark:text-white">고난도 객관식 30문항 검토</h1>
          <p className="mt-2 text-sm text-slate-500">정답과 함께 각 오답이 Amy Hood의 판단 순서를 어떻게 미묘하게 벗어나는지 검토합니다.</p>
        </header>
        {error && <p role="alert" className="flex items-center gap-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-700"><AlertCircle className="h-4 w-4" />{error}</p>}
        <section className="grid grid-cols-2 gap-3 md:grid-cols-6">
          {[
            ['전체', summary.total],
            ['D', summary.categories.D],
            ['H', summary.categories.H],
            ['C', summary.categories.C],
            ['T', summary.categories.T],
            ['승인', summary.statuses.approved],
          ].map(([label, value]) => <div key={label} className="rounded-xl border bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><p className="text-xs text-slate-500">{label}</p><p className="text-xl font-black">{value}</p></div>)}
        </section>
        <section className="flex flex-wrap gap-3 rounded-xl border bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <select value={category} onChange={(event) => setCategory(event.target.value as EvaluationV3Category | 'all')} className="rounded-lg border bg-transparent px-3 py-2 text-sm dark:border-slate-700">
            <option value="all">전체 범주</option>
            {Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <select value={status} onChange={(event) => setStatus(event.target.value as EvaluationV3Review['status'] | 'all')} className="rounded-lg border bg-transparent px-3 py-2 text-sm dark:border-slate-700">
            <option value="all">전체 상태</option>
            <option value="unreviewed">미검토</option>
            <option value="approved">승인</option>
            <option value="revision_required">수정 필요</option>
          </select>
          <span className="self-center text-xs text-slate-500">표시 {filtered.length}개</span>
        </section>
        <section className="space-y-4">
          {filtered.map(({ question, answer, review }) => {
            const draft = drafts[question.id] ?? {
              status: review.status,
              revisionNote: review.revisionNote,
            };
            const invalid = draft.status === 'revision_required' && !draft.revisionNote.trim();
            return (
              <article key={question.id} className="rounded-xl border bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-wrap items-center justify-between gap-2"><span className="rounded bg-indigo-50 px-2 py-1 text-xs font-black text-indigo-700">{question.id}</span><span className="text-xs text-slate-500">{categoryLabels[question.category]} · {review.status}</span></div>
                <p className="mt-4 text-sm font-semibold leading-7">{question.prompt}</p>
                <div className="mt-4 grid gap-2">
                  {question.options.map((option, index) => {
                    const key = String(index + 1) as '1' | '2' | '3' | '4';
                    const correct = answer.correctChoice === index + 1;
                    return <div key={key} className={`rounded-lg border p-3 text-sm ${correct ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/20' : 'border-slate-200 dark:border-slate-800'}`}><p><strong>{key}.</strong> {option}</p><p className="mt-2 text-xs text-slate-500">{correct ? `정답 의도: ${answer.correctIntent}` : `함정 의도: ${answer.trapIntents[key]} · 메커니즘: ${answer.trapMechanisms[key]}`}</p></div>;
                  })}
                </div>
                <div className="mt-4 flex flex-wrap gap-2 border-t pt-4 dark:border-slate-800">
                  <button type="button" onClick={() => updateDraft(question.id, { status: 'approved', revisionNote: '' })} className={`rounded-lg px-3 py-2 text-xs font-bold ${draft.status === 'approved' ? 'bg-emerald-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}`}>승인</button>
                  <button type="button" onClick={() => updateDraft(question.id, { status: 'revision_required' })} className={`rounded-lg px-3 py-2 text-xs font-bold ${draft.status === 'revision_required' ? 'bg-amber-500 text-white' : 'bg-slate-100 dark:bg-slate-800'}`}>수정 필요</button>
                  {draft.status === 'revision_required' && <textarea value={draft.revisionNote} onChange={(event) => updateDraft(question.id, { revisionNote: event.target.value })} placeholder="구체적인 수정 지시" className="min-w-72 flex-1 rounded-lg border p-2 text-sm dark:border-slate-700 dark:bg-slate-950" />}
                  <button type="button" disabled={invalid || savingId === question.id} onClick={() => void save(question.id)} className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-40"><Save className="h-3.5 w-3.5" />저장</button>
                </div>
              </article>
            );
          })}
        </section>
      </div>
    </div>
  );
};
