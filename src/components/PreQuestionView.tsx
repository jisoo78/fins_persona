import React, { useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, ClipboardList, RotateCcw } from 'lucide-react';
import preQuestionData from '../data/pre_question.json';
import {
  buildPreInterviewAnswer,
  buildPreInterviewContext,
  setAnswerAtIndex,
  validatePreQuestionBank,
} from '../pre-question/preInterview';
import type {
  CommunicationStyleAnswer,
  PreInterviewAnswer,
  PreInterviewContext,
  PreQuestion,
  PreQuestionBank,
} from '../pre-question/types';

interface PreQuestionViewProps {
  completedContext: PreInterviewContext | null;
  onComplete: (context: PreInterviewContext) => void;
  onStartDeepInterview: () => void;
}

const questionBank = preQuestionData as PreQuestionBank;

const communicationOptions = [
  { option_id: 1, option_text: '핵심 결론을 먼저 요약하고 세부 근거를 뒤에 제시한다.' },
  { option_id: 2, option_text: '수치 기준, 임계값, 조건문 중심으로 정리한다.' },
  { option_id: 3, option_text: '기준·낙관·비관 시나리오를 비교해 제시한다.' },
  { option_id: 4, option_text: '리스크, 예외 조건, 중단 기준을 먼저 제시한다.' },
  { option_id: 5, option_text: '실행 체크리스트와 다음 액션 중심으로 정리한다.' },
];

const getQuestionLabel = (question: PreQuestion) => `${question.category} · ${question.stage}`;

export const PreQuestionView: React.FC<PreQuestionViewProps> = ({
  completedContext,
  onComplete,
  onStartDeepInterview,
}) => {
  const validationError = useMemo(() => {
    try {
      validatePreQuestionBank(questionBank);
      return '';
    } catch (error) {
      return error instanceof Error ? error.message : '사전 질문 데이터 검증에 실패했습니다.';
    }
  }, []);

  const questions = questionBank.pre_questions;
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<PreInterviewAnswer[]>([]);
  const [selectedOptionId, setSelectedOptionId] = useState<number>(0);
  const [directAnswer, setDirectAnswer] = useState('');
  const [rationale, setRationale] = useState('');
  const [communicationStyle, setCommunicationStyle] = useState<CommunicationStyleAnswer | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const questionStartedAtRef = useRef(Date.now());

  const currentQuestion = questions[currentIndex];
  const isBridgeStep = currentIndex >= questions.length;
  const progressPercent = completedContext ? 100 : Math.round((Math.min(currentIndex, questions.length) / (questions.length + 1)) * 100);

  const resetInputs = () => {
    setSelectedOptionId(0);
    setDirectAnswer('');
    setRationale('');
    setErrorMessage('');
    questionStartedAtRef.current = Date.now();
  };

  const loadAnswer = (index: number) => {
    const savedAnswer = answers[index];
    if (!savedAnswer) {
      resetInputs();
      return;
    }

    setSelectedOptionId(savedAnswer.selected_option_id);
    setDirectAnswer(savedAnswer.selected_option_id === 5 ? savedAnswer.answer : '');
    setRationale(savedAnswer.rationale);
    setErrorMessage('');
    questionStartedAtRef.current = Date.now();
  };

  const goPrevious = () => {
    if (isBridgeStep) {
      setCurrentIndex(questions.length - 1);
      loadAnswer(questions.length - 1);
      return;
    }

    if (currentIndex === 0) return;
    const nextIndex = currentIndex - 1;
    setCurrentIndex(nextIndex);
    loadAnswer(nextIndex);
  };

  const saveCurrentAnswer = () => {
    if (!currentQuestion) return;

    try {
      const nextAnswer = buildPreInterviewAnswer({
        question: currentQuestion,
        selectedOptionId,
        directAnswer,
        rationale,
        responseTimeMs: Date.now() - questionStartedAtRef.current,
      });
      const nextAnswers = setAnswerAtIndex(answers, currentIndex, nextAnswer);
      setAnswers(nextAnswers);

      if (currentIndex + 1 >= questions.length) {
        setCurrentIndex(questions.length);
        resetInputs();
        return;
      }

      const nextIndex = currentIndex + 1;
      setCurrentIndex(nextIndex);
      const savedNextAnswer = nextAnswers[nextIndex];
      if (savedNextAnswer) {
        setSelectedOptionId(savedNextAnswer.selected_option_id);
        setDirectAnswer(savedNextAnswer.selected_option_id === 5 ? savedNextAnswer.answer : '');
        setRationale(savedNextAnswer.rationale);
        setErrorMessage('');
        questionStartedAtRef.current = Date.now();
      } else {
        resetInputs();
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '사전 질문 응답 저장에 실패했습니다.');
    }
  };

  const completeBridge = () => {
    if (!communicationStyle) {
      setErrorMessage('보고 형식을 선택해주세요.');
      return;
    }

    const context = buildPreInterviewContext(answers, communicationStyle);
    onComplete(context);
    setErrorMessage('');
  };

  const resetAll = () => {
    setCurrentIndex(0);
    setAnswers([]);
    setCommunicationStyle(null);
    resetInputs();
  };

  if (validationError) {
    return (
      <div className="max-w-5xl mx-auto p-8">
        <div className="rounded-2xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/30 p-5 text-sm text-rose-700 dark:text-rose-300">
          사전 질문 데이터 오류: {validationError}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 px-8 space-y-6 animate-fade-in">
      <header className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <ClipboardList className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400">PreInterviewContext v2</p>
              <h2 className="text-lg font-black text-slate-900 dark:text-white">사전 질문</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                40개 사전 질문과 보고 형식 1개를 완료하면 심층 인터뷰 입력값이 생성됩니다.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={resetAll}
            className="h-10 inline-flex items-center gap-2 px-3.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold"
          >
            <RotateCcw className="w-4 h-4" />
            초기화
          </button>
        </div>
        <div className="mt-5">
          <div className="flex justify-between text-xs font-bold mb-1">
            <span className="text-indigo-600 dark:text-indigo-400">진행률</span>
            <span className="text-slate-700 dark:text-slate-300">{progressPercent}%</span>
          </div>
          <div className="w-full bg-slate-200 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
            <div className="bg-gradient-to-r from-indigo-500 to-emerald-500 h-full rounded-full transition-all duration-500" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
      </header>

      {completedContext && (
        <section className="rounded-2xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30 p-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="w-4 h-4" />
                사전 질문 완료
              </div>
              <p className="text-sm text-emerald-800 dark:text-emerald-200 mt-2">
                {Object.keys(completedContext.categories).length}개 카테고리의 응답이 PreInterviewContext로 저장되었습니다.
              </p>
            </div>
            <button
              type="button"
              onClick={onStartDeepInterview}
              className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg shadow-indigo-500/20"
            >
              심층 인터뷰로 이동
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </section>
      )}

      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-5">
        {!isBridgeStep && currentQuestion && (
          <>
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="px-2.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 text-[11px] font-bold">
                  {currentIndex + 1} / {questions.length + 1}
                </span>
                <span className="text-xs font-bold text-slate-500">{getQuestionLabel(currentQuestion)}</span>
                {currentQuestion.question_mode === 'attribute_tradeoff' && (
                  <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">테이블형 선택</span>
                )}
              </div>
              <h3 className="text-base font-black text-slate-900 dark:text-white leading-relaxed">{currentQuestion.pre_question}</h3>
            </div>

            {currentQuestion.question_mode === 'attribute_tradeoff' ? (
              <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
                <table className="w-full min-w-[760px] text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-950/60 text-slate-500 dark:text-slate-400">
                    <tr>
                      <th className="text-left p-3 w-[38%]">선택지</th>
                      {currentQuestion.attributes?.map((attribute) => (
                        <th key={attribute.attribute_id} className="p-3 text-center">{attribute.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {currentQuestion.pre_options.map((option) => {
                      const isSelected = selectedOptionId === option.option_id;
                      return (
                        <tr
                          key={option.option_id}
                          onClick={() => setSelectedOptionId(option.option_id)}
                          className={`cursor-pointer border-t border-slate-200 dark:border-slate-800 transition-colors ${
                            isSelected ? 'bg-indigo-50 dark:bg-indigo-950/40' : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                          }`}
                        >
                          <td className="p-3 font-semibold text-slate-800 dark:text-slate-100">
                            <span className="mr-2">{isSelected ? '●' : '○'}</span>
                            {option.option_text}
                          </td>
                          {currentQuestion.attributes?.map((attribute) => (
                            <td key={attribute.attribute_id} className="p-3 text-center font-bold text-slate-600 dark:text-slate-300">
                              {option.attribute_values?.[attribute.attribute_id] ?? '-'}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {currentQuestion.pre_options.map((option) => (
                  <button
                    key={option.option_id}
                    type="button"
                    onClick={() => setSelectedOptionId(option.option_id)}
                    className={`text-left p-4 rounded-2xl border text-xs font-semibold transition-all ${
                      selectedOptionId === option.option_id
                        ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 text-slate-700 dark:text-slate-200 hover:border-indigo-300'
                    }`}
                  >
                    {option.option_text}
                  </button>
                ))}
              </div>
            )}

            {selectedOptionId === 5 && (
              <label className="block space-y-1.5">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">직접 입력</span>
                <input
                  type="text"
                  value={directAnswer}
                  onChange={(event) => setDirectAnswer(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 px-3 py-2.5 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </label>
            )}

            <label className="block space-y-1.5">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">판단 근거</span>
              <textarea
                value={rationale}
                onChange={(event) => setRationale(event.target.value)}
                rows={3}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 px-3 py-2.5 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                placeholder="이 선택지가 본인의 판단 기준에 맞는 이유를 한 문장 이상 입력하세요."
              />
            </label>
          </>
        )}

        {isBridgeStep && (
          <div className="space-y-4">
            <div>
              <span className="px-2.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 text-[11px] font-bold">
                {questions.length + 1} / {questions.length + 1}
              </span>
              <h3 className="text-base font-black text-slate-900 dark:text-white mt-3">심층 인터뷰 결과를 정리할 때 어떤 형식을 가장 선호합니까?</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {communicationOptions.map((option) => (
                <button
                  key={option.option_id}
                  type="button"
                  onClick={() => {
                    setCommunicationStyle({
                      bridge_question_id: 'communication_style',
                      selected_option_id: option.option_id,
                      answer: option.option_text,
                    });
                    setErrorMessage('');
                  }}
                  className={`text-left p-4 rounded-2xl border text-xs font-semibold transition-all ${
                    communicationStyle?.selected_option_id === option.option_id
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 text-slate-700 dark:text-slate-200 hover:border-indigo-300'
                  }`}
                >
                  {option.option_text}
                </button>
              ))}
            </div>
          </div>
        )}

        {errorMessage && (
          <div className="rounded-2xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/30 p-3 text-xs text-rose-700 dark:text-rose-300">
            {errorMessage}
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={goPrevious}
            disabled={currentIndex === 0}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 text-slate-700 dark:text-slate-200 text-xs font-bold"
          >
            <ArrowLeft className="w-4 h-4" />
            이전
          </button>
          <button
            type="button"
            onClick={isBridgeStep ? completeBridge : saveCurrentAnswer}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg shadow-indigo-500/20"
          >
            {isBridgeStep ? 'PreInterviewContext 생성' : '다음'}
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </section>
    </div>
  );
};
