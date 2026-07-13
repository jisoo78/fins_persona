import React from 'react';
import { AlertTriangle, CheckCircle2, FileJson, Scale } from 'lucide-react';
import summaryData from '../../evaluation/amy_hood_eval_full_vs_holdout_summary.json';
import decisionSimilarityData from '../../evaluation/amy_hood_decision_similarity_scored.json';
import hardEvalIncludedData from '../../evaluation/amy_hood_hard_eval_full_2017_2019_included.lock.json';
import hardEvalExcludedData from '../../evaluation/amy_hood_hard_eval_holdout_2017_2019_excluded.lock.json';

type EvaluationSummary = {
  요약: {
    목적: string;
    질문지_파일: string;
    포함_결과_파일: string;
    제외_결과_파일: string;
    포함_2017_2019: {
      문서_수: number;
      청크_수: number;
    };
    제외_2017_2019: {
      문서_수: number;
      청크_수: number;
    };
    문서_차이: number;
    청크_차이: number;
    문항_수: number;
    근거_변경_문항_수: number;
    해석: string;
  };
  비교: {
    문항_id: string;
    평가_기준: string;
    누락_검증_대상?: string;
    포함_상위_근거: string;
    제외_상위_근거: string;
    상위_근거_변경됨: boolean;
  }[];
};

const evaluation = summaryData as EvaluationSummary;

type DecisionSimilarityScore = {
  summary: {
    question_count: number;
    multiple_choice_count: number;
    subjective_count: number;
    total_score: number;
    max_score: number;
    percentage: number;
    by_kpi: {
      kpi: string;
      score: number;
      max_score: number;
      question_count: number;
      percentage: number;
    }[];
  };
  scoring_note: string;
};

const decisionSimilarity = decisionSimilarityData as DecisionSimilarityScore;

type HardEvaluationAnswer = {
  question_id: string;
  kpi?: string;
  question: string;
  answer: string;
};

type HardEvaluationResult = {
  answers: HardEvaluationAnswer[];
};

const hardEvalIncluded = hardEvalIncludedData as HardEvaluationResult;
const hardEvalExcluded = hardEvalExcludedData as HardEvaluationResult;

const answerComparisons = hardEvalIncluded.answers.map((includedAnswer, index) => {
  const excludedAnswer =
    hardEvalExcluded.answers.find((answer) => answer.question_id === includedAnswer.question_id) ??
    hardEvalExcluded.answers[index];

  return {
    number: index + 1,
    questionId: includedAnswer.question_id,
    kpi: includedAnswer.kpi,
    question: includedAnswer.question,
    includedAnswer: includedAnswer.answer,
    excludedAnswer: excludedAnswer?.answer ?? '미포함 답변 없음',
  };
});

export const EvaluationView: React.FC = () => {
  const { 요약, 비교 } = evaluation;

  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-950">
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-indigo-600 dark:text-indigo-400 mb-2">
              <Scale className="w-4 h-4" />
              RAG 평가 비교
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white">
              Amy Hood 데이터 포함/제외 비교
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-400">
              동일한 공통 질문지 15개를 기준으로 2017~2019년 데이터가 포함된 RAG 결과와 제외된 RAG 결과를 비교합니다.
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
            <FileJson className="w-4 h-4" />
            {요약.질문지_파일}
          </div>
        </header>

        <section className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">정답 기반 평가</p>
            <p className="mt-2 text-2xl font-bold text-slate-950 dark:text-white">
              {decisionSimilarity.summary.percentage}%
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {decisionSimilarity.summary.total_score}/{decisionSimilarity.summary.max_score}점
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">문항 구성</p>
            <p className="mt-2 text-2xl font-bold text-slate-950 dark:text-white">
              {decisionSimilarity.summary.question_count}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              객관식 {decisionSimilarity.summary.multiple_choice_count} / 주관식 {decisionSimilarity.summary.subjective_count}
            </p>
          </div>

          {decisionSimilarity.summary.by_kpi.slice(0, 2).map((row) => (
            <div key={row.kpi} className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{row.kpi}</p>
              <p className="mt-2 text-2xl font-bold text-slate-950 dark:text-white">
                {row.percentage}%
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {row.score}/{row.max_score}점 · {row.question_count}문항
              </p>
            </div>
          ))}
        </section>

        <section className="rounded-lg border border-amber-200 bg-amber-50 p-5 dark:border-amber-400/30 dark:bg-amber-400/10">
          <h2 className="text-sm font-semibold text-amber-900 dark:text-amber-200">정답 기반 평가 메모</h2>
          <p className="mt-2 text-sm leading-6 text-amber-800 dark:text-amber-200">
            {decisionSimilarity.scoring_note}
          </p>
        </section>

        <section className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">포함 문서</p>
            <p className="mt-2 text-2xl font-bold text-slate-950 dark:text-white">
              {요약.포함_2017_2019.문서_수.toLocaleString()}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              청크 {요약.포함_2017_2019.청크_수.toLocaleString()}개
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">제외 문서</p>
            <p className="mt-2 text-2xl font-bold text-slate-950 dark:text-white">
              {요약.제외_2017_2019.문서_수.toLocaleString()}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              청크 {요약.제외_2017_2019.청크_수.toLocaleString()}개
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">누락 차이</p>
            <p className="mt-2 text-2xl font-bold text-slate-950 dark:text-white">
              -{요약.문서_차이.toLocaleString()}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              청크 -{요약.청크_차이.toLocaleString()}개
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">변경 문항</p>
            <p className="mt-2 text-2xl font-bold text-slate-950 dark:text-white">
              {요약.근거_변경_문항_수}/{요약.문항_수}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              top evidence 변경
            </p>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <h2 className="text-sm font-semibold text-slate-950 dark:text-white">질문별 근거 비교</h2>
            <p className="mt-1 text-xs text-slate-500">
              `변경`은 2017~2019 제외 후 가장 먼저 검색된 근거 파일이 바뀐 문항입니다.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
              <thead className="bg-slate-50 dark:bg-slate-900/60">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">문항</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">KPI</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">2017~2019 포함</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">2017~2019 제외</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {비교.map((row) => (
                  <tr key={row.문항_id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                    <td className="px-5 py-4 align-top">
                      <div className="font-medium text-slate-900 dark:text-slate-100">{row.문항_id}</div>
                      {row.누락_검증_대상 && (
                        <div className="mt-1 text-xs text-slate-500">{row.누락_검증_대상}</div>
                      )}
                    </td>
                    <td className="px-5 py-4 align-top text-slate-600 dark:text-slate-300">
                      {row.평가_기준}
                    </td>
                    <td className="px-5 py-4 align-top font-mono text-xs text-slate-700 dark:text-slate-300">
                      {row.포함_상위_근거}
                    </td>
                    <td className="px-5 py-4 align-top font-mono text-xs text-slate-700 dark:text-slate-300">
                      {row.제외_상위_근거}
                    </td>
                    <td className="px-5 py-4 align-top">
                      {row.상위_근거_변경됨 ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-400/10 dark:text-amber-300">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          변경
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-300">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          유지
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <h2 className="text-sm font-semibold text-slate-950 dark:text-white">질문별 답변 비교</h2>
            <p className="mt-1 text-xs text-slate-500">
              각 질문에 대해 2017~2019년 데이터 미포함 답변과 포함 답변을 함께 확인합니다.
            </p>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {answerComparisons.map((row) => (
              <article key={row.questionId} className="px-5 py-5">
                <div className="mb-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-slate-900 px-2 py-1 text-xs font-semibold text-white dark:bg-slate-100 dark:text-slate-950">
                      {row.number}번 질문
                    </span>
                    {row.kpi && (
                      <span className="rounded-md bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700 dark:bg-indigo-400/10 dark:text-indigo-300">
                        {row.kpi}
                      </span>
                    )}
                    <span className="font-mono text-xs text-slate-400">{row.questionId}</span>
                  </div>
                  <p className="mt-3 text-sm font-semibold leading-6 text-slate-950 dark:text-white">
                    {row.question}
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-rose-600 dark:text-rose-300">
                      2017~2019 미포함 대답
                    </h3>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700 dark:text-slate-300">
                      {row.excludedAnswer}
                    </p>
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-300">
                      2017~2019 포함 대답
                    </h3>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700 dark:text-slate-300">
                      {row.includedAnswer}
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-sm font-semibold text-slate-950 dark:text-white">해석</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">
            {요약.해석}
          </p>
        </section>
      </div>
    </div>
  );
};
