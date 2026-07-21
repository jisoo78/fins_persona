import 'dotenv/config';

import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  EVALUATION_MODEL_OPTIONS,
  type EvaluationProvider,
} from '../../shared/amyHoodEvaluation';
import type {
  AmyHoodEventMatchingEvaluationFile,
  AmyHoodEventMatchingQuestion,
  AmyHoodEventMatchingRun,
  AmyHoodEventMatchingScore,
} from '../../shared/amyHoodEventMatchingEvaluation';
import { createModelClient } from '../personaPipeline/modelClient';
import { readActivePromptVersion } from '../promptVersions/store';

const root = process.cwd();
const eventMatchingMaxOutputTokens = Number(process.env.EVENT_MATCHING_MAX_OUTPUT_TOKENS ?? 900);

export const readJson = async <T>(path: string) =>
  JSON.parse(await readFile(path, 'utf8')) as T;

const digest = (value: string) =>
  createHash('sha256').update(value).digest('hex').slice(0, 12);

const parseArgs = () => {
  const args = process.argv.slice(2);
  const modelArg = args.find((arg) => arg.startsWith('--model='))?.split('=')[1];
  const option =
    EVALUATION_MODEL_OPTIONS.find((item) => item.id === modelArg) ||
    EVALUATION_MODEL_OPTIONS.find((item) => item.model === modelArg) ||
    EVALUATION_MODEL_OPTIONS[0];
  return option;
};

export const loadEventMatchingEvaluation = (projectRoot = root) =>
  readJson<AmyHoodEventMatchingEvaluationFile>(
    resolve(projectRoot, 'evaluation/amy_hood_event_matching_eval.json'),
  );

export const listEventMatchingRuns = async (projectRoot = root) => {
  const dir = resolve(projectRoot, 'evaluation/event_matching_runs');
  try {
    const { readdir, stat } = await import('node:fs/promises');
    const files = (await readdir(dir)).filter((file) => file.endsWith('.json'));
    const runs = await Promise.all(files.map(async (file) => {
      const path = resolve(dir, file);
      const [run, fileStat] = await Promise.all([
        readJson<AmyHoodEventMatchingRun>(path),
        stat(path),
      ]);
      return { run, mtime: fileStat.mtimeMs };
    }));
    return runs.sort((left, right) => right.mtime - left.mtime).map((item) => item.run);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
};

export const readEventMatchingRun = (runId: string, projectRoot = root) =>
  readJson<AmyHoodEventMatchingRun>(
    resolve(projectRoot, 'evaluation/event_matching_runs', `${runId}.json`),
  );

export const buildEventMatchingPrompt = (
  persona: string,
  evaluation: AmyHoodEventMatchingEvaluationFile,
  question: AmyHoodEventMatchingQuestion,
) => {
  const actualEvents = evaluation.actualEvents
    .map((event) => [
      `사건 ID: ${event.id}`,
      `사건명: ${event.name}`,
      `연도: ${event.year}`,
      `분류: ${event.category}`,
      `상황: ${event.decisionContext}`,
      `판단 신호: ${event.decisionSignals.join(' / ')}`,
      `한계: ${event.knownLimits.join(' / ')}`,
    ].join('\n'))
    .join('\n\n');

  return `[SYSTEM PERSONA]\n${persona}

[ACTUAL DECISION EVENT DATABASE]
${actualEvents}

[VIRTUAL DECISION EVENT]
${question.virtualEvent}

[TASK]
${question.task}

[OUTPUT FORMAT]
아래 형식으로만 한국어로 답하세요.

유사 실제 사건:
- 사건 ID:
- 사건명:
- 유사하다고 본 이유:

판단 기준 전이:
- 실제 사건에서 가져온 기준:
- 가상 사건에 적용한 기준:

결론:
- 승인 / 보류 / 거절 / 단계화 중 하나

확인 필요:
- 추가로 확인해야 할 재무 조건:
- 추가로 확인해야 할 비재무 조건:

주의:
- 실제 사건 데이터베이스에 없는 사건을 만들지 마세요.
- 직접 Amy Hood 발언이 없는 사건이면 그 사실을 명시하세요.
- 사후 결과를 당시 의사결정 근거처럼 사용하지 마세요.
- 질문에 없는 수치, 기간, 계약 조건을 만들지 마세요.`;
};

const includesAny = (text: string, patterns: string[]) =>
  patterns.some((pattern) => text.includes(pattern.toLowerCase()));

export const scoreEventMatchingAnswer = (
  question: AmyHoodEventMatchingQuestion,
  text: string,
): AmyHoodEventMatchingScore => {
  const normalized = text.toLowerCase();
  const notes: string[] = [];
  const matchedIds = question.expectedSimilarEventIds.filter((id) => normalized.includes(id.toLowerCase()));
  const similarEventSelection = matchedIds.length === question.expectedSimilarEventIds.length
    ? 2
    : matchedIds.length > 0
      ? 1
      : 0;
  if (similarEventSelection < 2) notes.push('기대 실제 사건 일부 또는 전체를 놓쳤다.');

  const matchedCriteria = question.expectedDecisionCriteria.filter((criterion) => {
    const parts = criterion
      .toLowerCase()
      .split(/[\s·/과와,]+/)
      .filter((part) => part.length >= 3);
    return parts.some((part) => normalized.includes(part));
  });
  const decisionCriteriaSimilarity = matchedCriteria.length >= Math.ceil(question.expectedDecisionCriteria.length * 0.6)
    ? 2
    : matchedCriteria.length > 0
      ? 1
      : 0;
  if (decisionCriteriaSimilarity < 2) notes.push('기대 판단 기준 전이가 충분하지 않다.');

  const evidenceUse = includesAny(normalized, ['직접 발언', '검증되지', '공식', '사후', '당시', '근거'])
    ? 2
    : includesAny(normalized, ['사건 id', '사건명', '유사'])
      ? 1
      : 0;
  if (evidenceUse < 2) notes.push('근거의 범위나 한계 분리가 약하다.');

  const uncertaintyControl = includesAny(normalized, ['확인 필요', '추가로 확인'])
    ? includesAny(normalized, ['추정', '정확한', '구체적', '가능성', '조건'])
      ? 2
      : 1
    : 0;
  if (uncertaintyControl < 2) notes.push('확인 필요 항목 분리가 약하다.');

  const finalRecommendation = includesAny(normalized, ['단계화', '보류', '거절', '승인'])
    ? includesAny(normalized, ['조건', '확인 필요', '분리', '단계'])
      ? 2
      : 1
    : 0;
  if (finalRecommendation < 2) notes.push('최종 권고나 조건이 충분히 명확하지 않다.');

  const total =
    similarEventSelection +
    decisionCriteriaSimilarity +
    evidenceUse +
    uncertaintyControl +
    finalRecommendation;

  return {
    questionId: question.id,
    similarEventSelection,
    decisionCriteriaSimilarity,
    evidenceUse,
    uncertaintyControl,
    finalRecommendation,
    total,
    notes,
  };
};

const writeRun = async (run: AmyHoodEventMatchingRun, projectRoot = root) => {
  const dir = resolve(projectRoot, 'evaluation/event_matching_runs');
  await mkdir(dir, { recursive: true });
  await writeFile(resolve(dir, `${run.runId}.json`), `${JSON.stringify(run, null, 2)}\n`, 'utf8');
};

export const writeEventMatchingReport = async (
  run: AmyHoodEventMatchingRun,
  evaluation: AmyHoodEventMatchingEvaluationFile,
  projectRoot = root,
) => {
  const optionLabel =
    EVALUATION_MODEL_OPTIONS.find((item) => item.model === run.model)?.label ?? run.model;
  const lines = [
    `# Amy Hood Event Matching Evaluation Report`,
    ``,
    `Date: ${new Date().toISOString().slice(0, 10)}`,
    ``,
    `## 실행 정보`,
    ``,
    `- 실행 ID: ${run.runId}`,
    `- 평가셋: ${evaluation.version}`,
    `- 모델: ${optionLabel}`,
    `- 상태: ${run.status}`,
    `- 문항 수: ${run.answers.length}/${evaluation.questions.length}`,
    `- 자동 채점: ${run.totalScore ?? '-'} / ${run.maxScore}`,
    `- 프롬프트: ${run.promptVersionId} (${run.promptHash})`,
    ``,
    `## 자동 채점 요약`,
    ``,
    `| 문항 | 유사 사건 | 기준 전이 | 근거 사용 | 추측 억제 | 최종 권고 | 합계 | 메모 |`,
    `|---|---:|---:|---:|---:|---:|---:|---|`,
    ...run.answers.map((answer) => {
      if (!answer.score) return `| ${answer.questionId} | - | - | - | - | - | - | ${answer.error ?? '채점 없음'} |`;
      return [
        `| ${answer.questionId}`,
        answer.score.similarEventSelection,
        answer.score.decisionCriteriaSimilarity,
        answer.score.evidenceUse,
        answer.score.uncertaintyControl,
        answer.score.finalRecommendation,
        `${answer.score.total}/10`,
        answer.score.notes.join(' / ') || '양호',
      ].join(' | ') + ' |';
    }),
    ``,
    `## 문항별 응답`,
    ``,
  ];

  for (const answer of run.answers) {
    const question = evaluation.questions.find((item) => item.id === answer.questionId);
    lines.push(`### ${answer.questionId}`);
    lines.push(``);
    if (question) {
      lines.push(`가상 사건: ${question.virtualEvent}`);
      lines.push(``);
      lines.push(`기대 유사 사건: ${question.expectedSimilarEventIds.join(', ')}`);
      lines.push(``);
    }
    if (answer.status === 'failed') {
      lines.push(`실패: ${answer.error ?? 'unknown error'}`);
    } else {
      lines.push(answer.text ?? '');
    }
    lines.push(``);
  }

  lines.push(`## 채점 기준`);
  lines.push(``);
  for (const [key, value] of Object.entries(evaluation.rubric)) {
    lines.push(`- ${key}: ${value}`);
  }
  lines.push(``);

  await writeFile(
    resolve(projectRoot, `docs/event_matching_report_${run.runId.slice(0, 8)}.md`),
    `${lines.join('\n')}\n`,
    'utf8',
  );
};

export const executeEventMatchingEvaluation = async (
  input: {
    provider: EvaluationProvider;
    model?: string;
    runId?: string;
  },
  projectRoot = root,
) => {
  const evaluation = await loadEventMatchingEvaluation(projectRoot);
  const activePrompt = await readActivePromptVersion(projectRoot);
  const selectedOption = EVALUATION_MODEL_OPTIONS.find(
    (option) => option.provider === input.provider && option.model === input.model,
  ) ?? EVALUATION_MODEL_OPTIONS.find((option) => option.provider === input.provider);
  if (!selectedOption) throw new Error('unsupported event matching model');
  const model = createModelClient(input.provider, selectedOption.model, {
    maxTokens: eventMatchingMaxOutputTokens,
  });
  const run: AmyHoodEventMatchingRun = {
    runId: input.runId ?? randomUUID(),
    status: 'running',
    provider: input.provider,
    model: model.model,
    datasetVersion: evaluation.version,
    promptVersionId: activePrompt.versionId,
    promptHash: digest(activePrompt.content),
    startedAt: new Date().toISOString(),
    completedAt: null,
    answers: [],
    totalScore: null,
    maxScore: evaluation.questions.length * 10,
  };
  await writeRun(run, projectRoot);

  for (const question of evaluation.questions) {
    try {
      const prompt = buildEventMatchingPrompt(activePrompt.content, evaluation, question);
      const result = await model.invoke(prompt);
      const score = scoreEventMatchingAnswer(question, result.text);
      run.answers.push({
        questionId: question.id,
        status: 'complete',
        text: result.text,
        expectedSimilarEventIds: question.expectedSimilarEventIds,
        score,
        elapsedMs: result.elapsedMs,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      });
      run.totalScore = run.answers.reduce((sum, answer) => sum + (answer.score?.total ?? 0), 0);
      await writeRun(run, projectRoot);
    } catch (error) {
      run.status = 'incomplete';
      run.answers.push({
        questionId: question.id,
        status: 'failed',
        expectedSimilarEventIds: question.expectedSimilarEventIds,
        elapsedMs: 0,
        error: error instanceof Error ? error.message : 'unknown event matching error',
      });
      run.totalScore = run.answers.reduce((sum, answer) => sum + (answer.score?.total ?? 0), 0);
      await writeRun(run, projectRoot);
      await writeEventMatchingReport(run, evaluation, projectRoot);
      throw error;
    }
  }

  run.status = 'complete';
  run.completedAt = new Date().toISOString();
  run.totalScore = run.answers.reduce((sum, answer) => sum + (answer.score?.total ?? 0), 0);
  await writeRun(run, projectRoot);
  await writeEventMatchingReport(run, evaluation, projectRoot);
  return run;
};

const main = async () => {
  const option = parseArgs();
  const run = await executeEventMatchingEvaluation({
    provider: option.provider,
    model: option.model,
  });
  console.log(JSON.stringify({
    ok: true,
    runId: run.runId,
    model: run.model,
    datasetVersion: run.datasetVersion,
    answers: run.answers.length,
    report: `docs/event_matching_report_${run.runId.slice(0, 8)}.md`,
  }, null, 2));
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
