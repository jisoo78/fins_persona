import 'dotenv/config';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

type QuestionType = 'multiple_choice' | 'subjective' | string;

interface AnswerKeyQuestion {
  question_id: string;
  question_type: QuestionType;
  kpi: string;
  question: string;
  options?: {
    option_id: string;
    option_text: string;
  }[];
  answer_key: {
    correct_option_id?: string;
    rationale?: string;
    reference_answer?: string;
    must_include?: string[];
    max_score?: number;
  };
}

interface AnswerKeyFile {
  dataset: string;
  subject: string;
  role: string;
  evaluation_goal: string;
  questions: AnswerKeyQuestion[];
}

interface RagAnswer {
  question_id: string;
  type?: string;
  kpi?: string;
  question: string;
  answer: string;
}

interface RagAnswerFile {
  method: string;
  dataset: string;
  subject: string;
  retrieval?: {
    method?: string;
    generation_mode?: string;
  };
  answers: RagAnswer[];
}

const answerKeyPath = resolve(
  process.cwd(),
  process.env.AMY_HOOD_ANSWER_KEY_PATH ?? 'evaluation/amy_hood_decision_similarity_answer_key_15.json',
);
const ragAnswerPath = resolve(
  process.cwd(),
  process.env.AMY_HOOD_RAG_ANSWER_PATH ?? 'evaluation/amy_hood_decision_similarity_general_rag_answers.lock.json',
);
const outputPath = resolve(
  process.cwd(),
  process.env.AMY_HOOD_SCORE_OUTPUT_PATH ?? 'evaluation/amy_hood_decision_similarity_scored.json',
);
const csvOutputPath = resolve(
  process.cwd(),
  process.env.AMY_HOOD_SCORE_CSV_PATH ?? 'evaluation/amy_hood_decision_similarity_scorecard.csv',
);

const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').trim();

const containsAny = (answer: string, terms: string[]) => {
  const normalizedAnswer = normalize(answer);
  return terms.some((term) => normalizedAnswer.includes(normalize(term)));
};

const inferMultipleChoiceOption = (question: AnswerKeyQuestion, answer: string) => {
  if (!question.options?.length) return null;

  const explicit = answer.match(/(?:정답|선택|option|옵션)?\s*[:：]?\s*([A-D])(?:\.|\s|$)/i)?.[1]?.toUpperCase();
  if (explicit && question.options.some((option) => option.option_id === explicit)) return explicit;

  const optionScores = question.options.map((option) => {
    const terms = option.option_text
      .split(/[,\s./·]+/)
      .map((term) => term.replace(/[^\p{L}\p{N}]/gu, ''))
      .filter((term) => term.length >= 2);

    return {
      option_id: option.option_id,
      score: terms.filter((term) => normalize(answer).includes(normalize(term))).length,
    };
  });

  const sorted = optionScores.sort((a, b) => b.score - a.score);
  return sorted[0]?.score ? sorted[0].option_id : null;
};

const scoreSubjective = (question: AnswerKeyQuestion, answer: string) => {
  const mustInclude = question.answer_key.must_include ?? [];
  const maxScore = question.answer_key.max_score ?? 5;
  const matched = mustInclude.filter((term) => containsAny(answer, [term]));
  const coverage = mustInclude.length ? matched.length / mustInclude.length : 0;
  const score = Math.round(coverage * maxScore * 10) / 10;

  return {
    score,
    max_score: maxScore,
    matched_terms: matched,
    missing_terms: mustInclude.filter((term) => !matched.includes(term)),
    judge_mode: 'rubric_keyword_fallback',
    judge_comment:
      coverage >= 0.8
        ? '핵심 기준 대부분을 포함했다.'
        : coverage >= 0.5
          ? '일부 핵심 기준은 포함했지만 누락 요소가 있다.'
          : 'Amy Hood식 판단 기준을 충분히 복원하지 못했다.',
  };
};

const escapeCsv = (value: unknown) => {
  const text = Array.isArray(value) ? value.join(' / ') : String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
};

const main = () => {
  const answerKey = JSON.parse(readFileSync(answerKeyPath, 'utf8')) as AnswerKeyFile;
  const ragResult = JSON.parse(readFileSync(ragAnswerPath, 'utf8')) as RagAnswerFile;
  const answerMap = new Map(ragResult.answers.map((answer) => [answer.question_id, answer]));

  const scored = answerKey.questions.map((question) => {
    const answer = answerMap.get(question.question_id);
    const candidateAnswer = answer?.answer ?? '';

    if (question.question_type === 'multiple_choice') {
      const predictedOptionId = inferMultipleChoiceOption(question, candidateAnswer);
      const correctOptionId = question.answer_key.correct_option_id ?? null;
      const isCorrect = Boolean(predictedOptionId && correctOptionId && predictedOptionId === correctOptionId);

      return {
        question_id: question.question_id,
        question_type: question.question_type,
        kpi: question.kpi,
        question: question.question,
        candidate_answer: candidateAnswer || '답변 없음',
        predicted_option_id: predictedOptionId,
        correct_option_id: correctOptionId,
        score: isCorrect ? 1 : 0,
        max_score: 1,
        judge_mode: 'exact_option_match_with_heuristic_inference',
        judge_comment: predictedOptionId
          ? isCorrect
            ? '정답 option과 일치한다.'
            : '추론된 option이 정답과 다르다.'
          : '답변에서 명확한 option을 추론하지 못했다.',
      };
    }

    return {
      question_id: question.question_id,
      question_type: question.question_type,
      kpi: question.kpi,
      question: question.question,
      candidate_answer: candidateAnswer || '답변 없음',
      reference_answer: question.answer_key.reference_answer,
      ...scoreSubjective(question, candidateAnswer),
    };
  });

  const totalScore = scored.reduce((sum, row) => sum + row.score, 0);
  const maxScore = scored.reduce((sum, row) => sum + row.max_score, 0);
  const byKpi = Object.values(
    scored.reduce<Record<string, { kpi: string; score: number; max_score: number; question_count: number }>>(
      (acc, row) => {
        acc[row.kpi] ??= { kpi: row.kpi, score: 0, max_score: 0, question_count: 0 };
        acc[row.kpi].score += row.score;
        acc[row.kpi].max_score += row.max_score;
        acc[row.kpi].question_count += 1;
        return acc;
      },
      {},
    ),
  ).map((row) => ({
    ...row,
    percentage: row.max_score ? Math.round((row.score / row.max_score) * 1000) / 10 : 0,
  }));

  const result = {
    evaluation_name: 'Amy Hood decision similarity evaluation',
    subject: answerKey.subject,
    dataset: answerKey.dataset,
    answer_key_path: answerKeyPath,
    rag_answer_path: ragAnswerPath,
    method: ragResult.method,
    retrieval: ragResult.retrieval,
    generated_at: new Date().toISOString(),
    summary: {
      question_count: scored.length,
      multiple_choice_count: scored.filter((row) => row.question_type === 'multiple_choice').length,
      subjective_count: scored.filter((row) => row.question_type !== 'multiple_choice').length,
      total_score: Math.round(totalScore * 10) / 10,
      max_score: maxScore,
      percentage: maxScore ? Math.round((totalScore / maxScore) * 1000) / 10 : 0,
      by_kpi: byKpi,
    },
    scoring_note:
      '현재 파일은 로컬에서 빠르게 확인하기 위한 rubric keyword fallback 채점이다. 최종 비교에서는 같은 answer_key와 judge prompt로 일반 RAG와 GraphRAG 답변을 LLM-as-Judge 채점하면 된다.',
    results: scored,
  };

  writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);

  const csvRows = [
    ['question_id', 'question_type', 'kpi', 'score', 'max_score', 'predicted_option_id', 'correct_option_id', 'judge_comment', 'missing_terms'],
    ...scored.map((row) => [
      row.question_id,
      row.question_type,
      row.kpi,
      row.score,
      row.max_score,
      'predicted_option_id' in row ? row.predicted_option_id : '',
      'correct_option_id' in row ? row.correct_option_id : '',
      row.judge_comment,
      'missing_terms' in row ? row.missing_terms : '',
    ]),
  ];

  writeFileSync(csvOutputPath, `${csvRows.map((row) => row.map(escapeCsv).join(',')).join('\n')}\n`);
  console.log(`Wrote ${outputPath}`);
  console.log(`Wrote ${csvOutputPath}`);
};

main();
