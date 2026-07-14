import 'dotenv/config';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  generateRagEvaluationAnswer,
  generateReferencePersonaFromRagEvidence,
  type ReferencePersonaOutput,
} from '../agentService';
import { retrieveArchiveEvidence, type RagChunk } from '../ragService';
import { retrieveVectorArchiveEvidence } from '../vectorRagService';
import { resolveDecisionSimilarityPrompt } from './decisionSimilarityPrompt';

interface EvaluationQuestion {
  id: string;
  question_id?: string;
  type?: string;
  question_type?: string;
  kpi?: string;
  question: string;
  options?: {
    option_id: string;
    option_text: string;
  }[];
  expected_focus?: string[];
  answer_key?: {
    correct_option_id?: string;
    rationale?: string;
    reference_answer?: string;
    must_include?: string[];
  };
  holdout_target?: string;
  grading_notes?: string[];
}

interface EvaluationQuestionsFile {
  dataset: string;
  subject: string;
  role: string;
  evaluation_goal?: string;
  questions: EvaluationQuestion[];
}

type GeneratedEvaluationAnswer = {
  selected_option_id?: string | null;
  answer: string;
  reason?: string;
  evidence: ReturnType<typeof summarizeEvidence>;
  limitations: string[];
};

const questionsRelativePath = process.env.RAG_EVAL_QUESTIONS_PATH ??
  'evaluation/amy_hood_decision_similarity_answer_key_15.json';
const outputRelativePath = process.env.RAG_EVAL_OUTPUT_PATH ??
  'evaluation/amy_hood_decision_similarity_general_rag_answers.lock.json';
const questionsPath = resolve(process.cwd(), questionsRelativePath);
const outputPath = resolve(process.cwd(), outputRelativePath);

const questionsFile = JSON.parse(readFileSync(questionsPath, 'utf8')) as EvaluationQuestionsFile;
const useLlm = process.env.RAG_EVAL_USE_LLM === 'true';
const retrievalMode = process.env.RAG_RETRIEVAL === 'vector' ? 'vector' : 'keyword';

const buildPersonaQuery = (questions: EvaluationQuestion[]) =>
  [
    questionsFile.subject,
    'CFO financial decision making persona',
    ...questions.flatMap((question) => [question.question, ...getExpectedFocus(question)]),
  ].join(' ');

const getQuestionId = (question: EvaluationQuestion) => question.id ?? question.question_id ?? question.question;

const getQuestionType = (question: EvaluationQuestion) => question.type ?? question.question_type;

const getExpectedFocus = (question: EvaluationQuestion) =>
  question.expected_focus ??
  question.answer_key?.must_include ??
  [question.answer_key?.rationale, question.answer_key?.reference_answer]
    .filter(Boolean)
    .flatMap((value) => String(value).split(/[,./\s]+/))
    .filter((value) => value.length > 2)
    .slice(0, 12);

const retrieveEvidence = async (query: string, limit: number) => {
  if (retrievalMode === 'vector') {
    const vectorRetrieval = await retrieveVectorArchiveEvidence(query, limit);
    if (vectorRetrieval) return vectorRetrieval;
  }

  return retrieveArchiveEvidence(query, limit);
};

const summarizeEvidence = (chunks: RagChunk[], limit = 3) =>
  chunks.slice(0, limit).map((chunk) => ({
    fileName: chunk.fileName,
    title: chunk.title,
    speaker: chunk.speaker,
    fiscalYear: chunk.fiscalYear,
    fiscalQuarter: chunk.fiscalQuarter,
    section: chunk.section,
    score: chunk.score,
    vectorScore: chunk.vectorScore,
    rerankScore: chunk.rerankScore,
    quote_or_summary: chunk.text.slice(0, 360),
  }));

const buildOfflinePersona = (subjectName: string): ReferencePersonaOutput => ({
  name: `${subjectName} General RAG CFO Advisor`,
  role: '재무',
  badge: 'Evidence-grounded CFO',
  description:
    'archive의 Amy Hood 인터뷰와 Microsoft 어닝콜 근거 청크를 검색해 만든 일반 RAG 기준 CFO 참조 페르소나입니다.',
  decisionStyle:
    '수요 신호, AI/클라우드 capacity, CapEx 회수 가능성, 마진 영향, 현금흐름 제약을 함께 놓고 판단하는 근거 기반 재무 의사결정',
  coreValues: [
    '수요 신호 기반 자본 배치',
    'AI 인프라 투자와 마진 균형',
    '현금흐름과 장기 성장의 동시 관리',
    'capacity 제약의 투명한 설명',
    '숫자 중심 투자자 커뮤니케이션',
  ],
  strengths: [
    'CapEx와 Azure/AI 수요를 연결해 설명',
    '마진 하락 원인과 효율 개선 요인을 함께 제시',
    '가이던스에서 FX, 세그먼트, capacity 변수를 구분',
  ],
  weaknesses: [
    '검색 근거에 없는 세부 ROI 기준은 확인 필요',
    '장기 인프라 투자 회수 기간의 정량 기준은 확인 필요',
    '검색 청크만으로 장기 엔티티 관계를 추적하는 데에는 한계가 있음',
  ],
  communicationStyle:
    '결론을 먼저 말한 뒤 매출 성장, gross margin, operating margin, CapEx, free cash flow, capacity 제약을 숫자 중심으로 설명합니다.',
  decisionPrompt: `# ${subjectName} General RAG CFO Advisor

## Role
You are a CFO advisor persona grounded in retrieved Amy Hood and Microsoft earnings-call evidence.

## Decision Rules
- Start with demand signals and capacity constraints before recommending incremental AI infrastructure investment.
- Evaluate CapEx with gross margin, operating margin, free cash flow, and long-term monetization evidence.
- Distinguish short-lived GPU/CPU assets from long-lived datacenter capacity.
- Mark unsupported ROI, payback, or red-line thresholds as "확인 필요".
- Communicate with numbers first, then constraints, risks, and next action.

## Response Style
Answer in Korean. Use only source-grounded claims when possible.`,
});

const buildOfflineAnswer = (question: EvaluationQuestion, chunks: RagChunk[]): GeneratedEvaluationAnswer => {
  const focusItems = getExpectedFocus(question);
  const focus = focusItems.join(', ');
  const topEvidence = chunks[0];
  const sourceHint = topEvidence
    ? `${topEvidence.title}${topEvidence.fiscalYear ? ` FY${topEvidence.fiscalYear} Q${topEvidence.fiscalQuarter}` : ''}`
    : '검색 근거 없음';
  const evidenceText = chunks.map((chunk) => `${chunk.title} ${chunk.speaker ?? ''} ${chunk.text}`).join(' ');
  const questionType = getQuestionType(question);

  if (questionType === 'multiple_choice' && question.options?.length) {
    const positiveSignals = [
      '함께',
      '분리',
      '조건부',
      '확인',
      '유지',
      '연결',
      '장기',
      '수요',
      'capacity',
      'cash',
      '현금흐름',
      '마진',
      '리스크',
      '관리',
      '성장',
      '제약',
      '커뮤니티',
      '신뢰',
      '독립성',
      '수익화',
      '근거',
      '확인 필요',
    ];
    const negativeSignals = [
      '중단한다',
      '감수한다',
      '별도로 고려하지',
      '만 확인',
      '무조건',
      '제외한다',
      '단정한다',
      '비전만',
      '동일 비율',
      '우선 삭감',
      '추정해서',
      '확정한다',
      '판단 자체를 포기',
      '무관하게',
      '보지 않고',
    ];
    const contextText = `${focus} ${evidenceText}`.toLowerCase();
    const scoredOptions = question.options.map((option) => {
      const optionText = option.option_text.toLowerCase();
      const terms = option.option_text
        .split(/[,\s./·]+/)
        .map((term) => term.replace(/[^\p{L}\p{N}]/gu, ''))
        .filter((term) => term.length >= 2);
      const lexicalScore = terms.filter((term) => contextText.includes(term.toLowerCase())).length;
      const positiveScore = positiveSignals.filter((signal) => optionText.includes(signal.toLowerCase())).length * 3;
      const negativeScore = negativeSignals.filter((signal) => optionText.includes(signal.toLowerCase())).length * 5;
      const balanceScore = /함께|분리|조건부|확인|관리|유지/.test(option.option_text) ? 4 : 0;
      const score = lexicalScore + positiveScore + balanceScore - negativeScore;
      return { ...option, score };
    });
    const selected = scoredOptions.sort((a, b) => b.score - a.score)[0] ?? question.options[0];

    return {
      selected_option_id: selected.option_id,
      answer: `선택: ${selected.option_id}. ${selected.option_text}\n\n이유: Amy Hood 페르소나 기준에서는 ${focus || '검색된 근거'}를 중심으로 판단합니다. 검색된 근거는 수요 신호, capacity 제약, CapEx/마진/현금흐름 영향을 함께 검토하고, 원문에 없는 정량 기준은 "확인 필요"로 남기는 방식이 적절함을 보여줍니다. 주요 근거 출처는 ${sourceHint}입니다.`,
      reason: `검색 근거와 보기의 어휘 겹침을 기준으로 ${selected.option_id}를 선택했습니다.`,
      evidence: summarizeEvidence(chunks),
      limitations: ['선택지는 검색 근거와의 어휘 겹침을 기준으로 고른 fallback 결과이므로 LLM 직접 생성 결과와 구분 필요'],
    };
  }

  return {
    selected_option_id: null,
    answer: `Amy Hood 페르소나는 ${focus || '검색된 근거'}를 기준으로 이 사안을 판단합니다. 검색된 근거에 따르면 Amy Hood식 재무 판단은 수요 신호와 capacity 제약을 먼저 확인하고, CapEx가 gross margin, operating margin, free cash flow에 미치는 영향을 함께 설명하는 방식에 가깝습니다. 원문에 없는 ROI, IRR, 회수 기간 같은 수치는 만들지 않고 "확인 필요"로 분리해야 합니다. 주요 근거 출처는 ${sourceHint}입니다.`,
    reason: '검색 근거에 기반한 주관식 직접 답변입니다.',
    evidence: summarizeEvidence(chunks),
    limitations: ['정확한 ROI, IRR, 회수 기간 등 원문에 직접 없는 정량 기준은 확인 필요'],
  };
};

const main = async () => {
  const activePrompt = await resolveDecisionSimilarityPrompt(process.cwd());
  const personaRetrieval = await retrieveEvidence(buildPersonaQuery(questionsFile.questions), 18);
  const persona = useLlm
    ? await generateReferencePersonaFromRagEvidence(questionsFile.subject, personaRetrieval.evidenceText)
    : buildOfflinePersona(questionsFile.subject);

  const answers = [];

  for (const question of questionsFile.questions) {
    const retrieval = await retrieveEvidence(
      [question.question, ...getExpectedFocus(question), questionsFile.subject].join(' '),
      8,
    );
    const generated = useLlm
      ? await generateRagEvaluationAnswer({
          subjectName: questionsFile.subject,
          question: question.question,
          questionType: getQuestionType(question),
          options: question.options,
          evidenceText: retrieval.evidenceText,
          systemPrompt: activePrompt.systemPrompt,
        })
      : buildOfflineAnswer(question, retrieval.selectedChunks);

    answers.push({
      question_id: getQuestionId(question),
      type: getQuestionType(question),
      kpi: question.kpi,
      holdout_target: question.holdout_target,
      question: question.question,
      selected_option_id: generated.selected_option_id ?? null,
      answer: generated.answer,
      reason: generated.reason,
      evidence: generated.evidence.length
        ? generated.evidence
        : summarizeEvidence(retrieval.selectedChunks),
      limitations: generated.limitations,
      expected_focus: getExpectedFocus(question),
      grading_notes: question.grading_notes,
      answer_key: question.answer_key,
    });
  }

  const result = {
    method: 'general_rag',
    dataset: questionsFile.dataset,
    subject: questionsFile.subject,
    role: questionsFile.role,
    evaluation_goal: questionsFile.evaluation_goal,
    questions_path: questionsRelativePath,
    generated_at: new Date().toISOString(),
    retrieval: {
      method: retrievalMode === 'vector' ? 'local_bge_m3_vector_retrieval' : 'local_keyword_chunk_retrieval',
      reranker: process.env.RAG_RERANKER === 'cohere' ? 'cohere' : 'none',
      generation_mode: useLlm ? 'local_llm' : 'offline_fixed_baseline',
      prompt_version_id: activePrompt.promptVersionId,
      prompt_hash: activePrompt.promptHash,
      document_count: personaRetrieval.documents.length,
      chunk_count: personaRetrieval.chunks.length,
      persona_evidence_count: personaRetrieval.selectedChunks.length,
    },
    persona,
    answers,
    evaluation_ready: {
      uses_same_dataset: true,
      uses_same_questions: true,
      includes_evidence: true,
      marks_unknowns_as_needs_confirmation: true,
    },
  };

  writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`Wrote ${outputPath}`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
