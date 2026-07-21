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
  AmyHoodActionAlignmentEvaluationFile,
  AmyHoodActionAlignmentJudgeScore,
  AmyHoodActionAlignmentRun,
  AmyHoodActionAlignmentScenario,
} from '../../shared/amyHoodActionAlignmentEvaluation';
import { createModelClient, type ModelClient } from '../personaPipeline/modelClient';
import { readActivePromptVersion } from '../promptVersions/store';

const root = process.cwd();
const actionAlignmentMaxOutputTokens = Number(process.env.ACTION_ALIGNMENT_MAX_OUTPUT_TOKENS ?? 700);
const actionAlignmentJudgeMaxOutputTokens = Number(process.env.ACTION_ALIGNMENT_JUDGE_MAX_OUTPUT_TOKENS ?? 500);

const readJson = async <T>(path: string) =>
  JSON.parse(await readFile(path, 'utf8')) as T;

const digest = (value: string) =>
  createHash('sha256').update(value).digest('hex').slice(0, 12);

const parseArgs = () => {
  const args = process.argv.slice(2);
  const modelArg = args.find((arg) => arg.startsWith('--model='))?.split('=')[1];
  const judgeModelArg = args.find((arg) => arg.startsWith('--judge-model='))?.split('=')[1];
  const repetitionsArg = args.find((arg) => arg.startsWith('--repetitions='))?.split('=')[1];
  const option =
    EVALUATION_MODEL_OPTIONS.find((item) => item.id === modelArg) ||
    EVALUATION_MODEL_OPTIONS.find((item) => item.model === modelArg) ||
    EVALUATION_MODEL_OPTIONS[0];
  const judgeOption =
    EVALUATION_MODEL_OPTIONS.find((item) => item.id === judgeModelArg) ||
    EVALUATION_MODEL_OPTIONS.find((item) => item.model === judgeModelArg) ||
    option;
  const repetitions = repetitionsArg ? Number(repetitionsArg) : undefined;
  return { option, judgeOption, repetitions };
};

export const loadActionAlignmentEvaluation = (projectRoot = root) =>
  readJson<AmyHoodActionAlignmentEvaluationFile>(
    resolve(projectRoot, process.env.ACTION_ALIGNMENT_EVAL_PATH || 'evaluation/amy_hood_action_alignment_eval.json'),
  );

const writeRun = async (run: AmyHoodActionAlignmentRun, projectRoot = root) => {
  const dir = resolve(projectRoot, 'evaluation/action_alignment_runs');
  await mkdir(dir, { recursive: true });
  await writeFile(resolve(dir, `${run.runId}.json`), `${JSON.stringify(run, null, 2)}\n`, 'utf8');
};

const stripFence = (text: string) =>
  text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

const parseJudgeJson = (
  scenario: AmyHoodActionAlignmentScenario,
  repetition: number,
  text: string,
): AmyHoodActionAlignmentJudgeScore => {
  const normalized = stripFence(text);
  const jsonText = normalized.match(/\{[\s\S]*\}/)?.[0] ?? normalized;
  const parsed = JSON.parse(jsonText) as {
    evidence_sentence?: unknown;
    score?: unknown;
    alignment_label?: unknown;
    notes?: unknown;
  };
  const rawScore = Number(parsed.score);
  const score = Math.max(1, Math.min(10, Math.round(Number.isFinite(rawScore) ? rawScore : 5)));
  const labels = ['contradictory', 'weak', 'neutral', 'aligned', 'strongly_aligned'];
  const alignmentLabel = labels.includes(String(parsed.alignment_label))
    ? parsed.alignment_label as AmyHoodActionAlignmentJudgeScore['alignmentLabel']
    : score >= 9
      ? 'strongly_aligned'
      : score >= 7
        ? 'aligned'
        : score >= 5
          ? 'neutral'
          : score >= 3
            ? 'weak'
            : 'contradictory';

  return {
    scenarioId: scenario.id,
    repetition,
    evidenceSentence: typeof parsed.evidence_sentence === 'string'
      ? parsed.evidence_sentence
      : 'Judge 근거 문장 파싱 실패',
    score,
    alignmentLabel,
    notes: Array.isArray(parsed.notes)
      ? parsed.notes.map((item) => String(item))
      : [],
  };
};

const fallbackJudge = (
  scenario: AmyHoodActionAlignmentScenario,
  repetition: number,
  responseText: string,
): AmyHoodActionAlignmentJudgeScore => {
  const normalized = responseText.toLowerCase();
  const matchedPositive = scenario.expectedActionPattern.filter((pattern) => {
    const parts = pattern.toLowerCase().split(/[\s·/,]+/).filter((part) => part.length >= 3);
    return parts.some((part) => normalized.includes(part));
  }).length;
  const matchedNegative = scenario.misalignmentSignals.filter((signal) => {
    const parts = signal.toLowerCase().split(/[\s·/,]+/).filter((part) => part.length >= 3);
    return parts.some((part) => normalized.includes(part));
  }).length;
  const score = Math.max(1, Math.min(10, 5 + matchedPositive - matchedNegative));

  return {
    scenarioId: scenario.id,
    repetition,
    evidenceSentence: 'LLM Judge 파싱 실패로 키워드 기반 fallback 채점을 적용했다.',
    score,
    alignmentLabel: score >= 9 ? 'strongly_aligned' : score >= 7 ? 'aligned' : score >= 5 ? 'neutral' : score >= 3 ? 'weak' : 'contradictory',
    notes: ['fallback_judge'],
  };
};

export const buildActionAlignmentAnswerPrompt = (
  persona: string,
  evaluation: AmyHoodActionAlignmentEvaluationFile,
  scenario: AmyHoodActionAlignmentScenario,
) => `[SYSTEM PERSONA]
${persona}

[ACTION ALIGNMENT SCENARIO]
${scenario.scenario}

[TASK]
${scenario.prompt}

[CONSTRAINTS]
- ${evaluation.responseLimitChars}자 이내로 답하세요.
- 승인 / 보류 / 거절 / 단계화 중 하나의 행동을 명확히 포함하세요.
- 질문에 없는 수치, 계약 조건, 내부 사정은 만들지 말고 "확인 필요"로 표시하세요.
- 실제 출처 인용 표시는 하지 마세요.`;

export const buildActionAlignmentJudgePrompt = (
  evaluation: AmyHoodActionAlignmentEvaluationFile,
  scenario: AmyHoodActionAlignmentScenario,
  responseText: string,
) => `너는 Amy Hood CFO 페르소나의 Action Alignment를 채점하는 평가자다.

목표:
페르소나 답변이 실제 Amy Hood/Microsoft 의사결정 기준과 행동적으로 얼마나 일치하는지 판단한다.

점수 기준:
- 1점: 실제 기준과 명확히 모순된다.
- 5점: 중립이거나 판단 근거가 부족하다.
- 10점: 실제 기준과 매우 일치한다.

[가상 시나리오]
${scenario.scenario}

[매핑된 실제 사건]
${scenario.mappedActualEventIds.join(', ')}

[정답 행동 패턴]
${scenario.expectedActionPattern.map((item) => `- ${item}`).join('\n')}

[감점 신호]
${scenario.misalignmentSignals.map((item) => `- ${item}`).join('\n')}

[기준 답변]
${scenario.referenceAnswer}

[페르소나 답변]
${responseText}

채점 규칙:
- 먼저 "이 행동이 정체성과 얼마나 일치/불일치하는지" 한 문장 근거를 만든다.
- 그 근거를 바탕으로 ${evaluation.scale.min}~${evaluation.scale.max}점 중 정수 점수를 준다.
- 문체가 아니라 행동 기준, 리스크 처리, 확인 필요 처리, 실제 사건과의 정합성을 본다.
- 출력은 JSON만 반환한다.

JSON 형식:
{
  "evidence_sentence": "한 문장 근거",
  "score": 1,
  "alignment_label": "contradictory | weak | neutral | aligned | strongly_aligned",
  "notes": ["짧은 메모"]
}`;

const calculateRunScores = (run: AmyHoodActionAlignmentRun) => {
  const scores = run.answers
    .map((answer) => answer.judge?.score)
    .filter((score): score is number => typeof score === 'number');
  run.averageScore = scores.length
    ? Number((scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(2))
    : null;
  run.minScore = scores.length ? Math.min(...scores) : null;
  run.maxScore = scores.length ? Math.max(...scores) : null;
};

export const writeActionAlignmentReport = async (
  run: AmyHoodActionAlignmentRun,
  evaluation: AmyHoodActionAlignmentEvaluationFile,
  projectRoot = root,
) => {
  const optionLabel =
    EVALUATION_MODEL_OPTIONS.find((item) => item.model === run.model)?.label ?? run.model;
  const judgeOptionLabel =
    EVALUATION_MODEL_OPTIONS.find((item) => item.model === run.judgeModel)?.label ?? run.judgeModel;
  const scenarioAverages = evaluation.scenarios.map((scenario) => {
    const scores = run.answers
      .filter((answer) => answer.scenarioId === scenario.id)
      .map((answer) => answer.judge?.score)
      .filter((score): score is number => typeof score === 'number');
    const average = scores.length
      ? Number((scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(2))
      : null;
    return { scenario, average, scores };
  });
  const lines = [
    `# Amy Hood Action Alignment Evaluation Report`,
    ``,
    `Date: ${new Date().toISOString().slice(0, 10)}`,
    ``,
    `## 실행 정보`,
    ``,
    `- 실행 ID: ${run.runId}`,
    `- 평가셋: ${evaluation.version}`,
    `- 응답 모델: ${optionLabel}`,
    `- Judge 모델: ${judgeOptionLabel}`,
    `- 상태: ${run.status}`,
    `- 시나리오 수: ${evaluation.scenarios.length}`,
    `- 반복 수: ${run.repetitions}`,
    `- 총 응답 수: ${run.answers.length}/${evaluation.scenarios.length * run.repetitions}`,
    `- 평균 Action Alignment Score: ${run.averageScore ?? '-'}/10`,
    `- 최저/최고: ${run.minScore ?? '-'} / ${run.maxScore ?? '-'}`,
    `- 프롬프트: ${run.promptVersionId} (${run.promptHash})`,
    ``,
    `## 시나리오별 평균`,
    ``,
    `| 문항 | 매핑 사건 | 평균 | 회차 점수 |`,
    `|---|---|---:|---|`,
    ...scenarioAverages.map(({ scenario, average, scores }) =>
      `| ${scenario.id} | ${scenario.mappedActualEventIds.join(', ')} | ${average ?? '-'} | ${scores.join(', ') || '-'} |`,
    ),
    ``,
    `## 문항별 상세`,
    ``,
  ];

  for (const scenario of evaluation.scenarios) {
    lines.push(`### ${scenario.id}`);
    lines.push(``);
    lines.push(`시나리오: ${scenario.scenario}`);
    lines.push(``);
    lines.push(`기준 답변: ${scenario.referenceAnswer}`);
    lines.push(``);
    for (const answer of run.answers.filter((item) => item.scenarioId === scenario.id)) {
      lines.push(`#### ${answer.repetition}회차`);
      lines.push(``);
      lines.push(`점수: ${answer.judge?.score ?? '-'} / 10`);
      lines.push(`근거: ${answer.judge?.evidenceSentence ?? answer.error ?? '-'}`);
      lines.push(``);
      lines.push(answer.responseText ?? '');
      lines.push(``);
    }
  }

  await writeFile(
    resolve(projectRoot, `docs/action_alignment_report_${run.runId.slice(0, 8)}.md`),
    `${lines.join('\n')}\n`,
    'utf8',
  );
};

export const executeActionAlignmentEvaluation = async (
  input: {
    provider: EvaluationProvider;
    model?: string;
    judgeProvider?: EvaluationProvider;
    judgeModel?: string;
    repetitions?: number;
    runId?: string;
    personaPromptContent?: string;
    promptVersionId?: string;
  },
  projectRoot = root,
) => {
  const evaluation = await loadActionAlignmentEvaluation(projectRoot);
  const activePrompt = input.personaPromptContent
    ? {
        versionId: input.promptVersionId ?? 'external-persona-prompt',
        content: input.personaPromptContent,
      }
    : await readActivePromptVersion(projectRoot);
  const selectedOption = EVALUATION_MODEL_OPTIONS.find(
    (option) => option.provider === input.provider && option.model === input.model,
  ) ?? EVALUATION_MODEL_OPTIONS.find((option) => option.provider === input.provider);
  if (!selectedOption) throw new Error('unsupported action alignment model');
  const judgeProvider = input.judgeProvider ?? input.provider;
  const judgeOption = EVALUATION_MODEL_OPTIONS.find(
    (option) => option.provider === judgeProvider && option.model === input.judgeModel,
  ) ?? EVALUATION_MODEL_OPTIONS.find((option) => option.provider === judgeProvider);
  if (!judgeOption) throw new Error('unsupported action alignment judge model');
  const model = createModelClient(input.provider, selectedOption.model, {
    maxTokens: actionAlignmentMaxOutputTokens,
  });
  const judge = createModelClient(judgeProvider, judgeOption.model, {
    maxTokens: actionAlignmentJudgeMaxOutputTokens,
  });
  const repetitions = input.repetitions ?? evaluation.repetitions;
  const run: AmyHoodActionAlignmentRun = {
    runId: input.runId ?? randomUUID(),
    status: 'running',
    provider: input.provider,
    model: model.model,
    judgeProvider,
    judgeModel: judge.model,
    datasetVersion: evaluation.version,
    promptVersionId: activePrompt.versionId,
    promptHash: digest(activePrompt.content),
    repetitions,
    startedAt: new Date().toISOString(),
    completedAt: null,
    answers: [],
    averageScore: null,
    minScore: null,
    maxScore: null,
  };
  await writeRun(run, projectRoot);

  for (const scenario of evaluation.scenarios) {
    for (let repetition = 1; repetition <= repetitions; repetition += 1) {
      try {
        const answerPrompt = buildActionAlignmentAnswerPrompt(activePrompt.content, evaluation, scenario);
        const answerResult = await model.invoke(answerPrompt);
        const responseText = answerResult.text.slice(0, evaluation.responseLimitChars);
        const judgePrompt = buildActionAlignmentJudgePrompt(evaluation, scenario, responseText);
        const judgeResult = await judge.invoke(judgePrompt);
        let judgeScore: AmyHoodActionAlignmentJudgeScore;
        try {
          judgeScore = parseJudgeJson(scenario, repetition, judgeResult.text);
        } catch {
          judgeScore = fallbackJudge(scenario, repetition, responseText);
        }
        run.answers.push({
          scenarioId: scenario.id,
          repetition,
          status: 'complete',
          responseText,
          judge: judgeScore,
          elapsedMs: answerResult.elapsedMs,
          judgeElapsedMs: judgeResult.elapsedMs,
          inputTokens: answerResult.inputTokens,
          outputTokens: answerResult.outputTokens,
        });
        calculateRunScores(run);
        await writeRun(run, projectRoot);
      } catch (error) {
        run.status = 'incomplete';
        run.answers.push({
          scenarioId: scenario.id,
          repetition,
          status: 'failed',
          elapsedMs: 0,
          error: error instanceof Error ? error.message : 'unknown action alignment error',
        });
        calculateRunScores(run);
        await writeRun(run, projectRoot);
        await writeActionAlignmentReport(run, evaluation, projectRoot);
        throw error;
      }
    }
  }

  run.status = 'complete';
  run.completedAt = new Date().toISOString();
  calculateRunScores(run);
  await writeRun(run, projectRoot);
  await writeActionAlignmentReport(run, evaluation, projectRoot);
  return run;
};

const main = async () => {
  const { option, judgeOption, repetitions } = parseArgs();
  const run = await executeActionAlignmentEvaluation({
    provider: option.provider,
    model: option.model,
    judgeProvider: judgeOption.provider,
    judgeModel: judgeOption.model,
    repetitions,
  });
  console.log(JSON.stringify({
    ok: true,
    runId: run.runId,
    model: run.model,
    judgeModel: run.judgeModel,
    datasetVersion: run.datasetVersion,
    answers: run.answers.length,
    averageScore: run.averageScore,
    report: `docs/action_alignment_report_${run.runId.slice(0, 8)}.md`,
  }, null, 2));
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
