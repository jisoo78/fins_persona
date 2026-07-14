import 'dotenv/config';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatOpenAI } from '@langchain/openai';
import { PromptTemplate } from '@langchain/core/prompts';
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
  selected_option_id?: string | null;
  answer: string;
  reason?: string;
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

interface JudgeScore {
  score: number;
  max_score: number;
  predicted_option_id?: string | null;
  matched_terms?: string[];
  missing_terms?: string[];
  judge_mode: string;
  judge_comment: string;
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
const judgeUseLlm = process.env.AMY_HOOD_JUDGE_USE_LLM === 'true';

const getJudgeModel = () => {
  if (process.env.LLM_PROVIDER === 'local') {
    return new ChatOpenAI({
      apiKey: process.env.LOCAL_LLM_API_KEY || 'local',
      model: process.env.LOCAL_LLM_MODEL || 'local-model',
      temperature: Number(process.env.AMY_HOOD_JUDGE_TEMPERATURE ?? 0),
      configuration: {
        baseURL: process.env.LOCAL_LLM_BASE_URL || 'http://127.0.0.1:8080/v1',
      },
    });
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) return null;

  return new ChatGoogleGenerativeAI({
    apiKey,
    model: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
    temperature: Number(process.env.AMY_HOOD_JUDGE_TEMPERATURE ?? 0),
  });
};

const contentToText = (content: unknown) => {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object' && 'text' in item) return String((item as { text?: unknown }).text ?? '');
        return '';
      })
      .join('');
  }
  return String(content ?? '');
};

const extractJson = <T>(text: string): T => {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced ?? text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  const jsonText = start >= 0 && end >= start ? candidate.slice(start, end + 1) : candidate;
  return JSON.parse(jsonText) as T;
};

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

const clampScore = (score: number, maxScore: number) => Math.max(0, Math.min(maxScore, Math.round(score * 10) / 10));

const normalizeJudgeScore = (question: AnswerKeyQuestion, result: Partial<JudgeScore>): JudgeScore => {
  const maxScore = question.question_type === 'multiple_choice' ? 1 : question.answer_key.max_score ?? 5;
  return {
    score: clampScore(Number(result.score ?? 0), maxScore),
    max_score: maxScore,
    predicted_option_id: result.predicted_option_id ?? null,
    matched_terms: result.matched_terms ?? [],
    missing_terms: result.missing_terms ?? [],
    judge_mode: result.judge_mode || 'llm_as_judge',
    judge_comment: result.judge_comment || 'LLM-as-Judge가 채점했다.',
  };
};

const judgeWithLlm = async (question: AnswerKeyQuestion, candidateAnswer: string): Promise<JudgeScore | null> => {
  if (!judgeUseLlm) return null;

  const model = getJudgeModel();
  if (!model) return null;

  const maxScore = question.question_type === 'multiple_choice' ? 1 : question.answer_key.max_score ?? 5;
  const prompt = PromptTemplate.fromTemplate(`너는 CFO 페르소나 평가자다.

목표:
candidate_answer가 Amy Hood의 재무 의사결정 기준과 얼마나 유사한지 채점한다.

채점 규칙:
- 객관식은 정답 option 일치 여부로 0점 또는 1점을 준다.
- 주관식은 reference_answer와 must_include를 기준으로 0점부터 {maxScore}점까지 평가한다.
- 원문 근거 없는 숫자 확정, 과장, 확인 필요 항목 누락은 감점한다.
- candidate_answer가 정답 문장과 같은 단어를 일부 포함하더라도 판단 논리가 부족하면 낮게 채점한다.
- 반드시 JSON만 반환한다.

질문:
{question}

질문 유형:
{questionType}

객관식 보기:
{options}

정답 기준:
{answerKey}

후보 답변:
{candidateAnswer}

JSON 형식:
{{
  "score": 0,
  "max_score": {maxScore},
  "predicted_option_id": "A | B | C | D | null",
  "matched_terms": ["충족한 핵심 기준"],
  "missing_terms": ["누락된 핵심 기준"],
  "judge_mode": "llm_as_judge",
  "judge_comment": "채점 이유를 한국어 한 문장으로 작성"
}}`);

  const chain = prompt.pipe(model);
  const response = await chain.invoke({
    question: question.question,
    questionType: question.question_type,
    options: JSON.stringify(question.options ?? [], null, 2),
    answerKey: JSON.stringify(question.answer_key, null, 2),
    candidateAnswer,
    maxScore,
  });

  return normalizeJudgeScore(question, extractJson<Partial<JudgeScore>>(contentToText(response.content)));
};

const scoreQuestion = async (question: AnswerKeyQuestion, candidateAnswer: string, selectedOptionId?: string | null) => {
  const normalizedSelectedOptionId = selectedOptionId && selectedOptionId !== 'null' ? selectedOptionId : null;

  try {
    const llmScore = await judgeWithLlm(question, candidateAnswer);
    if (llmScore) {
      const predictedOptionId =
        question.question_type === 'multiple_choice'
          ? normalizedSelectedOptionId ?? llmScore.predicted_option_id ?? null
          : llmScore.predicted_option_id ?? null;
      const correctOptionId = question.answer_key.correct_option_id ?? null;
      const score =
        question.question_type === 'multiple_choice' && predictedOptionId && correctOptionId
          ? predictedOptionId === correctOptionId
            ? 1
            : 0
          : llmScore.score;

      return {
        question_id: question.question_id,
        question_type: question.question_type,
        kpi: question.kpi,
        question: question.question,
        candidate_answer: candidateAnswer || '답변 없음',
        correct_option_id: question.answer_key.correct_option_id,
        reference_answer: question.answer_key.reference_answer,
        ...llmScore,
        score,
        predicted_option_id: predictedOptionId,
      };
    }
  } catch (error) {
    console.warn(`LLM-as-Judge fallback for ${question.question_id}`, error);
  }

  if (question.question_type === 'multiple_choice') {
    const predictedOptionId = normalizedSelectedOptionId ?? inferMultipleChoiceOption(question, candidateAnswer);
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
      matched_terms: [],
      missing_terms: [],
      judge_mode: judgeUseLlm ? 'llm_as_judge_failed_fallback' : 'exact_option_match_with_heuristic_inference',
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
};

const escapeCsv = (value: unknown) => {
  const text = Array.isArray(value) ? value.join(' / ') : String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
};

const main = async () => {
  const answerKey = JSON.parse(readFileSync(answerKeyPath, 'utf8')) as AnswerKeyFile;
  const ragResult = JSON.parse(readFileSync(ragAnswerPath, 'utf8')) as RagAnswerFile;
  const answerMap = new Map(ragResult.answers.map((answer) => [answer.question_id, answer]));

  const scored = [];
  for (const question of answerKey.questions) {
    const answer = answerMap.get(question.question_id);
    const candidateAnswer = answer?.answer ?? '';
    scored.push(await scoreQuestion(question, candidateAnswer, answer?.selected_option_id));
  }

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
    judge: {
      mode: judgeUseLlm ? 'llm_as_judge' : 'fallback',
      provider: judgeUseLlm ? process.env.LLM_PROVIDER || 'gemini' : 'none',
      model:
        judgeUseLlm && process.env.LLM_PROVIDER === 'local'
          ? process.env.LOCAL_LLM_MODEL || 'local-model'
          : judgeUseLlm
            ? process.env.GEMINI_MODEL || 'gemini-1.5-flash'
            : 'none',
    },
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
      judgeUseLlm
        ? 'LLM-as-Judge가 같은 answer_key와 judge prompt를 기준으로 채점했다. 개별 실패 문항은 fallback judge_mode로 표시된다.'
        : '현재 파일은 로컬에서 빠르게 확인하기 위한 rubric keyword fallback 채점이다. 최종 비교에서는 AMY_HOOD_JUDGE_USE_LLM=true로 LLM-as-Judge 채점을 실행하면 된다.',
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

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
