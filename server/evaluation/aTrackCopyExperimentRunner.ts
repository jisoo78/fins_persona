import 'dotenv/config';

import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import preQuestionData from '../../pre_question.json';
import {
  EVALUATION_MODEL_OPTIONS,
  type EvaluationProvider,
} from '../../shared/amyHoodEvaluation';
import {
  generateDeepInterviewQuestions,
  generateFinalOutput,
  type AgentPublicData,
  type AgentQuestion,
} from '../agentService';
import { createModelClient, type ModelClient } from '../personaPipeline/modelClient';
import { readActivePromptVersion } from '../promptVersions/store';
import { executeActionAlignmentEvaluation } from './actionAlignmentRunner';
import type { AmyHoodATrackCopyExperimentRun } from '../../shared/amyHoodATrackCopyExperiment';

const root = process.cwd();
const copyMaxOutputTokens = Number(process.env.A_TRACK_COPY_MAX_OUTPUT_TOKENS ?? 500);

type PreQuestionOption = {
  option_id: number;
  option_text: string;
};

type PreQuestion = {
  pre_question_id: number;
  category: string;
  decision_dimension: string;
  stage: string;
  pre_question: string;
  pre_options: PreQuestionOption[];
};

type PreInterviewAnswer = {
  source_question_id: number;
  category: string;
  stage: string;
  question: string;
  selected_option_id: number;
  answer: string;
  rationale: string;
  response_time_ms: number;
  response_signal: string;
};

type PreInterviewContextV2 = {
  meta: Record<string, unknown>;
  communication_style: Record<string, unknown>;
  categories: Record<string, Record<string, {
    stage: string;
    source_question_id: number;
    question: string;
    selected_option_id: number;
    answer: string;
    rationale: string;
    response_time_ms: number;
    response_signal: string;
  }>>;
};

type CopyExperimentRun = AmyHoodATrackCopyExperimentRun;

const digest = (value: string) =>
  createHash('sha256').update(value).digest('hex').slice(0, 12);

const stripFence = (text: string) =>
  text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

const parseArgs = () => {
  const args = process.argv.slice(2);
  const modelArg = args.find((arg) => arg.startsWith('--model='))?.split('=')[1];
  const repetitionsArg = args.find((arg) => arg.startsWith('--repetitions='))?.split('=')[1];
  const skipEvaluation = args.includes('--skip-evaluation');
  const option =
    EVALUATION_MODEL_OPTIONS.find((item) => item.id === modelArg) ||
    EVALUATION_MODEL_OPTIONS.find((item) => item.model === modelArg) ||
    EVALUATION_MODEL_OPTIONS[0];
  const repetitions = repetitionsArg ? Number(repetitionsArg) : 5;
  return { option, repetitions, skipEvaluation };
};

const parseJsonObject = <T>(text: string) => {
  const normalized = stripFence(text);
  const jsonText = normalized.match(/\{[\s\S]*\}/)?.[0] ?? normalized;
  return JSON.parse(jsonText) as T;
};

const createPublicData = (): AgentPublicData => ({
  status: 'collected',
  accounts: [],
  signals: [
    'B트랙 Amy Hood Main Prompt 기반 복제 실험',
    '공개 발언 기반 장기 성장 투자, 수요 기반 CapEx, 운영 효율 원칙 사용',
  ],
  posts: [],
});

const createProfile = () => ({
  name: 'Amy Hood Copy A ver.',
  title: 'CFO / 재무 리더',
  industry: 'Enterprise Software / Cloud / AI',
  companySize: 'Microsoft scale',
  companyName: 'Microsoft',
  snsId: '',
  financeScope: 'capital allocation, cloud/AI investment, M&A, margin, cash flow, risk',
});

const optionLabel = (option: PreQuestionOption) =>
  `${option.option_id}. ${option.option_text}`;

const chooseFallbackOption = (question: PreQuestion) => {
  const text = `${question.category} ${question.stage} ${question.pre_question}`.toLowerCase();
  const options = question.pre_options;
  const findOption = (patterns: RegExp[]) =>
    options.find((option) => patterns.some((pattern) => pattern.test(option.option_text.toLowerCase())));

  return (
    findOption([/장기|성장|전략|시장|선점|기업가치|기회/]) ||
    findOption([/현금|재무 안정|유동성|runway|운영자금/]) ||
    findOption([/수익|자본 효율|회수|자본비용|roi|irr/]) ||
    findOption([/중단|손실|리스크|책임|성과 기준/]) ||
    options[0]
  );
};

const answerPreQuestion = async (
  model: ModelClient,
  personaPrompt: string,
  question: PreQuestion,
): Promise<PreInterviewAnswer> => {
  const started = Date.now();
  const prompt = `[SYSTEM PERSONA]
${personaPrompt}

[A TRACK PRE-INTERVIEW QUESTION]
${question.pre_question}

[OPTIONS]
${question.pre_options.map(optionLabel).join('\n')}

[TASK]
Amy Hood의 공개 의사결정 기준에 가장 가까운 선택지를 하나 고르세요.
출력은 JSON만 반환하세요.

JSON 형식:
{
  "selected_option_id": 1,
  "rationale": "한 문장 이유"
}`;

  try {
    const result = await model.invoke(prompt);
    const parsed = parseJsonObject<{ selected_option_id?: unknown; rationale?: unknown }>(result.text);
    const selectedId = Number(parsed.selected_option_id);
    const selected = question.pre_options.find((option) => option.option_id === selectedId) ??
      chooseFallbackOption(question);
    return {
      source_question_id: question.pre_question_id,
      category: question.category,
      stage: question.stage,
      question: question.pre_question,
      selected_option_id: selected.option_id,
      answer: selected.option_text,
      rationale: typeof parsed.rationale === 'string' ? parsed.rationale : 'Amy Hood Main Prompt 기준으로 선택했다.',
      response_time_ms: Date.now() - started,
      response_signal: 'model_generated',
    };
  } catch {
    const selected = chooseFallbackOption(question);
    return {
      source_question_id: question.pre_question_id,
      category: question.category,
      stage: question.stage,
      question: question.pre_question,
      selected_option_id: selected.option_id,
      answer: selected.option_text,
      rationale: '모델 응답 파싱 실패로 fallback 선택을 적용했다.',
      response_time_ms: Date.now() - started,
      response_signal: 'fallback_generated',
    };
  }
};

const createPreInterviewContext = (answers: PreInterviewAnswer[]): PreInterviewContextV2 => {
  const categories = answers.reduce<PreInterviewContextV2['categories']>((context, answer) => {
    const categoryAnswers = context[answer.category] ?? {};
    const nextIndex = Object.keys(categoryAnswers).length + 1;
    return {
      ...context,
      [answer.category]: {
        ...categoryAnswers,
        [`question_${nextIndex}`]: {
          stage: answer.stage,
          source_question_id: answer.source_question_id,
          question: answer.question,
          selected_option_id: answer.selected_option_id,
          answer: answer.answer,
          rationale: answer.rationale,
          response_time_ms: answer.response_time_ms,
          response_signal: answer.response_signal,
        },
      },
    };
  }, {});

  return {
    meta: {
      schema_version: 'pre_interview_context.v2',
      target_role: 'CFO',
      subject: 'Amy Hood Copy A ver.',
      completed_at: new Date().toISOString(),
    },
    communication_style: {
      bridge_question_id: 'communication_style',
      selected_option_id: 1,
      answer: '핵심 결론을 먼저 요약하고 세부 근거를 뒤에 제시한다.',
    },
    categories,
  };
};

const answerDeepQuestion = async (
  model: ModelClient,
  personaPrompt: string,
  question: AgentQuestion,
) => {
  const prompt = `[SYSTEM PERSONA]
${personaPrompt}

[A TRACK DEEP INTERVIEW QUESTION]
${question.question}

[OPTIONS]
${question.options.join('\n')}

[TASK]
Amy Hood 관점에서 가장 가까운 선택지를 고르고 한 문장 이유를 작성하세요.
JSON만 반환하세요.

JSON 형식:
{
  "answer": "A. ...",
  "rationale": "한 문장 이유"
}`;
  try {
    const result = await model.invoke(prompt);
    const parsed = parseJsonObject<{ answer?: unknown; rationale?: unknown }>(result.text);
    const answer = typeof parsed.answer === 'string' && parsed.answer.trim()
      ? parsed.answer.trim()
      : question.options[0];
    const rationale = typeof parsed.rationale === 'string' ? parsed.rationale : '';
    return rationale ? `${answer}\n이유: ${rationale}` : answer;
  } catch {
    return `${question.options[0]}\n이유: 모델 응답 파싱 실패로 첫 번째 선택지를 사용했다.`;
  }
};

const writeMarkdownReport = async (run: CopyExperimentRun, projectRoot = root) => {
  const lines = [
    `# Amy Hood Copy A Track Experiment Report`,
    ``,
    `Date: ${new Date().toISOString().slice(0, 10)}`,
    ``,
    `## 실행 정보`,
    ``,
    `- 실행 ID: ${run.runId}`,
    `- 모델: ${run.model}`,
    `- 원본 B트랙 프롬프트: ${run.sourcePromptVersionId} (${run.sourcePromptHash})`,
    `- 사전 질문 응답: ${run.preInterviewAnswers.length}`,
    `- 심층 질문 응답: ${run.deepAnswers.length}`,
    `- Copy A 프롬프트: ${run.copyPromptPath}`,
    `- 최종 출력 JSON: ${run.finalOutputPath}`,
    `- Action Alignment 실행 ID: ${run.actionAlignmentRunId ?? '-'}`,
    `- Action Alignment 평균: ${run.actionAlignmentAverageScore ?? '-'}/10`,
    ``,
    `## 사전 질문 응답 요약`,
    ``,
    `| ID | 카테고리 | 선택 | 이유 |`,
    `|---:|---|---|---|`,
    ...run.preInterviewAnswers.map((answer) =>
      `| ${answer.source_question_id} | ${answer.category} | ${answer.selected_option_id}. ${answer.answer.replace(/\|/g, '/')} | ${answer.rationale.replace(/\|/g, '/')} |`,
    ),
    ``,
    `## 심층 인터뷰 응답`,
    ``,
    ...run.deepQuestions.flatMap((question, index) => [
      `### D${index + 1}. ${question.category}`,
      ``,
      question.question,
      ``,
      run.deepAnswers[index] ?? '',
      ``,
    ]),
  ];
  await writeFile(resolve(projectRoot, run.reportPath), `${lines.join('\n')}\n`, 'utf8');
};

const runDir = (projectRoot = root) => resolve(projectRoot, 'evaluation/a_track_copy_runs');

const writeCopyRun = async (run: CopyExperimentRun, projectRoot = root) => {
  const artifactDir = resolve(runDir(projectRoot), run.runId);
  await mkdir(artifactDir, { recursive: true });
  await writeFile(resolve(artifactDir, 'run.json'), `${JSON.stringify(run, null, 2)}\n`, 'utf8');
};

export const readATrackCopyExperimentRun = async (runId: string, projectRoot = root) =>
  JSON.parse(await readFile(resolve(runDir(projectRoot), runId, 'run.json'), 'utf8')) as CopyExperimentRun;

export const listATrackCopyExperimentRuns = async (projectRoot = root) => {
  try {
    const entries = await readdir(runDir(projectRoot), { withFileTypes: true });
    const runs = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => readATrackCopyExperimentRun(entry.name, projectRoot).catch(() => null)),
    );
    return runs
      .filter((run): run is CopyExperimentRun => Boolean(run))
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return [];
    throw error;
  }
};

export const executeATrackCopyExperiment = async (
  input: {
    provider: EvaluationProvider;
    model?: string;
    repetitions?: number;
    skipEvaluation?: boolean;
    runId?: string;
  },
  projectRoot = root,
) => {
  const selectedOption = EVALUATION_MODEL_OPTIONS.find(
    (option) => option.provider === input.provider && option.model === input.model,
  ) ?? EVALUATION_MODEL_OPTIONS.find((option) => option.provider === input.provider);
  if (!selectedOption) throw new Error('unsupported A Track copy model');

  const model = createModelClient(input.provider, selectedOption.model, {
    maxTokens: copyMaxOutputTokens,
  });
  const activePrompt = await readActivePromptVersion(projectRoot);
  const runId = input.runId ?? randomUUID();
  const artifactDir = resolve(projectRoot, 'evaluation/a_track_copy_runs', runId);
  await mkdir(artifactDir, { recursive: true });
  const startedAt = new Date().toISOString();
  const initialRun: CopyExperimentRun = {
    runId,
    status: 'running',
    model: selectedOption.model,
    sourcePromptVersionId: activePrompt.versionId,
    sourcePromptHash: digest(activePrompt.content),
    startedAt,
    completedAt: null,
    preInterviewAnswers: [],
    deepQuestions: [],
    deepAnswers: [],
    copyPromptPath: `evaluation/a_track_copy_runs/${runId}/amy_hood_copy_a_prompt.md`,
    finalOutputPath: `evaluation/a_track_copy_runs/${runId}/final_output.json`,
    actionAlignmentRunId: null,
    actionAlignmentAverageScore: null,
    reportPath: `docs/a_track_copy_experiment_${runId.slice(0, 8)}.md`,
  };
  await writeCopyRun(initialRun, projectRoot);

  const profile = createProfile();
  const publicData = createPublicData();
  const questions = (preQuestionData as { pre_questions: PreQuestion[] }).pre_questions;
  const preInterviewAnswers: PreInterviewAnswer[] = [];
  for (const question of questions) {
    preInterviewAnswers.push(await answerPreQuestion(model, activePrompt.content, question));
  }
  const preInterviewContext = createPreInterviewContext(preInterviewAnswers);
  const deepQuestions = await generateDeepInterviewQuestions(profile, publicData, preInterviewContext);
  const deepAnswers: string[] = [];
  for (const question of deepQuestions) {
    deepAnswers.push(await answerDeepQuestion(model, activePrompt.content, question));
  }
  const finalOutput = await generateFinalOutput(profile, deepAnswers, publicData, preInterviewContext);
  const copyPrompt = finalOutput.personaPromptMarkdown?.trim()
    ? finalOutput.personaPromptMarkdown
    : `# Amy Hood Copy A ver. Persona Prompt

## Role
You are Amy Hood Copy A ver., reconstructed through A Track pre-interview and deep-interview responses.

## Identity
${finalOutput.oneSentenceSystem}

## Decision Principles
${finalOutput.coreInstructions.map((instruction) => `- ${instruction}`).join('\n')}

## Communication Style
Answer with conclusion, evidence, risks, and next action.`;

  const preContextPath = resolve(artifactDir, 'pre_interview_context.json');
  const finalOutputPath = resolve(artifactDir, 'final_output.json');
  const copyPromptPath = resolve(artifactDir, 'amy_hood_copy_a_prompt.md');
  await writeFile(preContextPath, `${JSON.stringify(preInterviewContext, null, 2)}\n`, 'utf8');
  await writeFile(finalOutputPath, `${JSON.stringify(finalOutput, null, 2)}\n`, 'utf8');
  await writeFile(copyPromptPath, `${copyPrompt}\n`, 'utf8');

  let actionAlignmentRunId: string | null = null;
  let actionAlignmentAverageScore: number | null = null;
  if (!input.skipEvaluation) {
    const actionRun = await executeActionAlignmentEvaluation({
      provider: input.provider,
      model: selectedOption.model,
      judgeProvider: input.provider,
      judgeModel: selectedOption.model,
      repetitions: input.repetitions ?? 5,
      personaPromptContent: copyPrompt,
      promptVersionId: `amy-hood-copy-a-${runId.slice(0, 8)}`,
    }, projectRoot);
    actionAlignmentRunId = actionRun.runId;
    actionAlignmentAverageScore = actionRun.averageScore;
  }

  const run: CopyExperimentRun = {
    runId,
    status: 'complete',
    model: model.model,
    sourcePromptVersionId: activePrompt.versionId,
    sourcePromptHash: digest(activePrompt.content),
    startedAt,
    completedAt: new Date().toISOString(),
    preInterviewAnswers,
    deepQuestions,
    deepAnswers,
    copyPromptPath: `evaluation/a_track_copy_runs/${runId}/amy_hood_copy_a_prompt.md`,
    finalOutputPath: `evaluation/a_track_copy_runs/${runId}/final_output.json`,
    actionAlignmentRunId,
    actionAlignmentAverageScore,
    reportPath: `docs/a_track_copy_experiment_${runId.slice(0, 8)}.md`,
  };
  await writeCopyRun(run, projectRoot);
  await writeMarkdownReport(run, projectRoot);
  return run;
};

const main = async () => {
  const { option, repetitions, skipEvaluation } = parseArgs();
  const run = await executeATrackCopyExperiment({
    provider: option.provider,
    model: option.model,
    repetitions,
    skipEvaluation,
  });
  console.log(JSON.stringify({
    ok: true,
    runId: run.runId,
    model: run.model,
    preInterviewAnswers: run.preInterviewAnswers.length,
    deepAnswers: run.deepAnswers.length,
    copyPrompt: run.copyPromptPath,
    finalOutput: run.finalOutputPath,
    actionAlignmentRunId: run.actionAlignmentRunId,
    actionAlignmentAverageScore: run.actionAlignmentAverageScore,
    report: run.reportPath,
  }, null, 2));
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
