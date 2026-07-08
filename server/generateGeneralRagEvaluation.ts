import 'dotenv/config';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  generateRagEvaluationAnswer,
  generateReferencePersonaFromRagEvidence,
  type ReferencePersonaOutput,
} from './agentService';
import { retrieveArchiveEvidence, type RagChunk } from './ragService';
import { retrieveVectorArchiveEvidence } from './vectorRagService';

interface EvaluationQuestion {
  id: string;
  type?: string;
  kpi?: string;
  question: string;
  expected_focus: string[];
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

const questionsPath = resolve(
  process.cwd(),
  process.env.RAG_EVAL_QUESTIONS_PATH ?? 'evaluation/rag_graphrag_questions.json',
);
const outputPath = resolve(
  process.cwd(),
  process.env.RAG_EVAL_OUTPUT_PATH ?? 'evaluation/general_rag_result.lock.json',
);

const questionsFile = JSON.parse(readFileSync(questionsPath, 'utf8')) as EvaluationQuestionsFile;
const useLlm = process.env.RAG_EVAL_USE_LLM === 'true';
const retrievalMode = process.env.RAG_RETRIEVAL === 'vector' ? 'vector' : 'keyword';

const buildPersonaQuery = (questions: EvaluationQuestion[]) =>
  [
    questionsFile.subject,
    'CFO financial decision making persona',
    ...questions.flatMap((question) => [question.question, ...question.expected_focus]),
  ].join(' ');

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
    'GraphRAG 대비 엔티티 간 장기 관계 추적은 제한적',
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

const buildOfflineAnswer = (question: EvaluationQuestion, chunks: RagChunk[]) => {
  const focus = question.expected_focus.join(', ');
  const topEvidence = chunks[0];
  const sourceHint = topEvidence
    ? `${topEvidence.title}${topEvidence.fiscalYear ? ` FY${topEvidence.fiscalYear} Q${topEvidence.fiscalQuarter}` : ''}`
    : '검색 근거 없음';

  return {
    answer: `일반 RAG 검색 기준으로 보면, 이 질문은 ${focus} 근거를 중심으로 판단해야 합니다. Amy Hood 페르소나는 원문에서 확인되는 수요 신호, capacity 제약, CapEx/마진/현금흐름 영향을 함께 검토하고, 근거가 부족한 정량 기준은 "확인 필요"로 남기는 방식이 적절합니다. 주요 근거 출처는 ${sourceHint}입니다.`,
    evidence: summarizeEvidence(chunks),
    limitations: ['정확한 ROI, IRR, 회수 기간 등 원문에 직접 없는 정량 기준은 확인 필요'],
  };
};

const main = async () => {
  const personaRetrieval = await retrieveEvidence(buildPersonaQuery(questionsFile.questions), 18);
  const persona = useLlm
    ? await generateReferencePersonaFromRagEvidence(questionsFile.subject, personaRetrieval.evidenceText)
    : buildOfflinePersona(questionsFile.subject);

  const answers = [];

  for (const question of questionsFile.questions) {
    const retrieval = await retrieveEvidence(
      [question.question, ...question.expected_focus, questionsFile.subject].join(' '),
      8,
    );
    const generated = useLlm
      ? await generateRagEvaluationAnswer({
          subjectName: questionsFile.subject,
          question: question.question,
          evidenceText: retrieval.evidenceText,
        })
      : buildOfflineAnswer(question, retrieval.selectedChunks);

    answers.push({
      question_id: question.id,
      type: question.type,
      kpi: question.kpi,
      holdout_target: question.holdout_target,
      question: question.question,
      answer: generated.answer,
      evidence: generated.evidence.length
        ? generated.evidence
        : summarizeEvidence(retrieval.selectedChunks),
      limitations: generated.limitations,
      expected_focus: question.expected_focus,
      grading_notes: question.grading_notes,
    });
  }

  const result = {
    method: 'general_rag',
    dataset: questionsFile.dataset,
    subject: questionsFile.subject,
    role: questionsFile.role,
    evaluation_goal: questionsFile.evaluation_goal,
    questions_path: questionsPath,
    generated_at: new Date().toISOString(),
    retrieval: {
      method: retrievalMode === 'vector' ? 'local_bge_m3_vector_retrieval' : 'local_keyword_chunk_retrieval',
      generation_mode: useLlm ? 'local_llm' : 'offline_fixed_baseline',
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
