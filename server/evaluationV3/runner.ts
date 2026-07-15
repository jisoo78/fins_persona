import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  EVALUATION_V3_ARMS,
  type EvaluationV3Answer,
  type EvaluationV3Arm,
  type EvaluationV3ExperimentLaunch,
  type EvaluationV3Question,
  type EvaluationV3Repetitions,
  type EvaluationV3Run,
  type EvaluationV3RunAnswer,
  type EvaluationV3RunScores,
} from '../../shared/amyHoodEvaluationV3';
import type { ModelClient, ModelResult } from '../personaPipeline/modelClient';
import { readActivePromptVersion, readPromptVersion } from '../promptVersions/store';
import { createEvaluationV3ExperimentPlan } from './experimentPlan';
import {
  resolveEvaluationV3ArmContext,
  type EvaluationV3ContextPackage,
} from './context';
import { loadEvaluationV3Holdout } from './holdout';
import { buildEvaluationV3Input, parseEvaluationV3Response } from './prompt';
import { loadEvaluationV3Bundle, loadEvaluationV3Reviews } from './questionSet';
import { readEvaluationV3Run, writeEvaluationV3Run } from './runStore';

type RunnerOptions = {
  root: string;
  createModel: () => ModelClient;
};

type PinnedArm = {
  arm: EvaluationV3Arm;
  promptVersionId: string | null;
  promptHash: string;
  systemPrompt: string;
  context: EvaluationV3ContextPackage;
  memoryReleaseHash: string | null;
};

const digest = (content: string) => createHash('sha256').update(content).digest('hex');

const emptyScores = (): EvaluationV3RunScores => ({
  discrimination: 0,
  holdout: 0,
  counterfactual: 0,
  transfer: 0,
  total: 0,
  percent: 0,
});

const replaceAnswer = (
  answers: EvaluationV3RunAnswer[],
  answer: EvaluationV3RunAnswer,
) => {
  const index = answers.findIndex(({ questionId }) => questionId === answer.questionId);
  if (index < 0) return [...answers, answer];
  const next = [...answers];
  next[index] = answer;
  return next;
};

const scoreRun = (
  answers: EvaluationV3RunAnswer[],
  questions: EvaluationV3Question[],
): EvaluationV3RunScores => {
  const categoryById = new Map(questions.map(({ id, category }) => [id, category]));
  const correct = (category: EvaluationV3Question['category']) => answers
    .filter((answer) => categoryById.get(answer.questionId) === category && answer.correct)
    .length;
  const total = answers.filter((answer) => answer.correct).length;
  return {
    discrimination: correct('amy_specific_discrimination'),
    holdout: correct('temporal_holdout'),
    counterfactual: correct('counterfactual_pair'),
    transfer: correct('new_advisory_transfer'),
    total,
    percent: (total / 30) * 100,
  };
};

const reasonChoiceMismatch = (choice: number, reason: string) => {
  const explicit = reason.match(/([1-4])\s*번(?:을|를)?\s*선택/);
  return Boolean(explicit && Number(explicit[1]) !== choice);
};

const runErrorFrom = (error: unknown): NonNullable<EvaluationV3Run['runError']> => {
  const message = error instanceof Error ? error.message : 'unknown Evaluation v3 error';
  const artifactStale = /stale|hash|holdout|forbidden/.test(message);
  return {
    code: artifactStale ? 'artifact_stale' : 'execution_error',
    message,
    retryable: !artifactStale,
  };
};

const invokeQuestion = async (
  model: ModelClient,
  input: ReturnType<typeof buildEvaluationV3Input>,
  question: EvaluationV3Question,
) => {
  const first = await model.invoke(input);
  try {
    return { result: first, parsed: parseEvaluationV3Response(question, first.text) };
  } catch {
    const second = await model.invoke(input);
    const result: ModelResult = {
      ...second,
      elapsedMs: first.elapsedMs + second.elapsedMs,
      inputTokens: (first.inputTokens ?? 0) + (second.inputTokens ?? 0) || undefined,
      outputTokens: (first.outputTokens ?? 0) + (second.outputTokens ?? 0) || undefined,
    };
    return { result, parsed: parseEvaluationV3Response(question, second.text) };
  }
};

const loadFileWithHash = async (path: string) => {
  const content = await readFile(path, 'utf8');
  return { content, sha256: digest(content) };
};

export const createEvaluationV3Runner = (options: RunnerOptions) => {
  const activeRunIds = new Set<string>();
  const transitionRunIds = new Set<string>();
  const loadPinnedArms = async (): Promise<PinnedArm[]> => {
    const [activePrompt, generic, policy, full] = await Promise.all([
      readActivePromptVersion(options.root),
      loadFileWithHash(resolve(
        options.root,
        'agent_prompts/prompts/generic-cfo-control.md',
      )),
      resolveEvaluationV3ArmContext(options.root, 'amy_policy_rag'),
      resolveEvaluationV3ArmContext(options.root, 'amy_full_rag'),
    ]);
    if (policy.context.memoryReleaseId !== full.context.memoryReleaseId
      || policy.memoryReleaseHash !== full.memoryReleaseHash) {
      throw new Error('Evaluation v3 RAG arms must pin the same memory release');
    }
    return [
      {
        arm: 'generic_cfo',
        promptVersionId: null,
        promptHash: generic.sha256,
        systemPrompt: generic.content,
        context: (await resolveEvaluationV3ArmContext(options.root, 'generic_cfo')).context,
        memoryReleaseHash: null,
      },
      {
        arm: 'amy_prompt',
        promptVersionId: activePrompt.versionId,
        promptHash: activePrompt.sha256,
        systemPrompt: activePrompt.content,
        context: (await resolveEvaluationV3ArmContext(options.root, 'amy_prompt')).context,
        memoryReleaseHash: null,
      },
      {
        arm: 'amy_policy_rag',
        promptVersionId: activePrompt.versionId,
        promptHash: activePrompt.sha256,
        systemPrompt: activePrompt.content,
        ...policy,
      },
      {
        arm: 'amy_full_rag',
        promptVersionId: activePrompt.versionId,
        promptHash: activePrompt.sha256,
        systemPrompt: activePrompt.content,
        ...full,
      },
    ];
  };

  const createExperiment = async (
    input: { repetitions: EvaluationV3Repetitions },
  ): Promise<EvaluationV3ExperimentLaunch> => {
    const plan = createEvaluationV3ExperimentPlan(input.repetitions);
    const [bundle, reviews, questionFile, holdoutFile, pinnedArms] = await Promise.all([
      loadEvaluationV3Bundle(options.root),
      loadEvaluationV3Reviews(options.root),
      loadFileWithHash(resolve(options.root, 'evaluation/v3/public/questions.json')),
      loadFileWithHash(resolve(options.root, 'evaluation/v3/sealed/holdout-manifest.json')),
      loadPinnedArms(),
    ]);
    if (reviews.reviews.some(({ status }) => status !== 'approved')) {
      throw new Error('all Evaluation v3 questions must be approved before creating a run');
    }
    await loadEvaluationV3Holdout(options.root);
    const model = options.createModel();
    if (model.provider !== 'local') {
      throw new Error('Evaluation v3 supports the local provider only');
    }
    const answerKey = await loadFileWithHash(
      resolve(options.root, 'evaluation/v3/sealed/answer-key.json'),
    );
    const experimentGroupId = randomUUID();
    const pinnedByArm = new Map(pinnedArms.map((item) => [item.arm, item]));
    const runs: EvaluationV3Run[] = [];
    for (const item of plan) {
      const pinned = pinnedByArm.get(item.arm)!;
      const run: EvaluationV3Run = {
        runId: randomUUID(),
        version: '3.0.0',
        experimentGroupId,
        repetition: item.repetition as 1 | 2 | 3 | 4 | 5,
        arm: item.arm,
        provider: 'local',
        model: model.model,
        questionSetVersion: bundle.questions.version,
        questionSetHash: questionFile.sha256,
        answerKeyHash: answerKey.sha256,
        promptVersionId: pinned.promptVersionId,
        promptHash: pinned.promptHash,
        memoryReleaseId: pinned.context.memoryReleaseId,
        memoryReleaseHash: pinned.memoryReleaseHash,
        holdoutManifestHash: holdoutFile.sha256,
        status: 'queued',
        answers: [],
        scores: emptyScores(),
        startedAt: new Date().toISOString(),
        completedAt: null,
      };
      runs.push(await writeEvaluationV3Run(options.root, run));
    }
    return { experimentGroupId, repetitions: input.repetitions, runs };
  };

  const resolveRunInputs = async (run: EvaluationV3Run) => {
    const [bundle, questionFile, answerKey, holdout] = await Promise.all([
      loadEvaluationV3Bundle(options.root),
      loadFileWithHash(resolve(options.root, 'evaluation/v3/public/questions.json')),
      loadFileWithHash(resolve(options.root, 'evaluation/v3/sealed/answer-key.json')),
      loadFileWithHash(resolve(options.root, 'evaluation/v3/sealed/holdout-manifest.json')),
    ]);
    await loadEvaluationV3Holdout(options.root);
    if (run.questionSetVersion !== bundle.questions.version) {
      throw new Error('Evaluation v3 question-set version is stale');
    }
    if (run.questionSetHash !== questionFile.sha256) {
      throw new Error('Evaluation v3 question set hash is stale');
    }
    if (run.answerKeyHash !== answerKey.sha256) {
      throw new Error('Evaluation v3 answer key hash is stale');
    }
    if (run.holdoutManifestHash !== holdout.sha256) {
      throw new Error('Evaluation v3 holdout manifest hash is stale');
    }
    let systemPrompt: string;
    if (run.arm === 'generic_cfo') {
      const generic = await loadFileWithHash(resolve(
        options.root,
        'agent_prompts/prompts/generic-cfo-control.md',
      ));
      if (generic.sha256 !== run.promptHash) {
        throw new Error('generic CFO prompt hash is stale');
      }
      systemPrompt = generic.content;
    } else {
      if (!run.promptVersionId) throw new Error('Amy prompt version is missing');
      const version = await readPromptVersion(options.root, run.promptVersionId);
      if (version.sha256 !== run.promptHash) {
        throw new Error('Amy prompt hash is stale');
      }
      systemPrompt = version.content;
    }
    const resolved = await resolveEvaluationV3ArmContext(options.root, run.arm);
    if (resolved.context.memoryReleaseId !== run.memoryReleaseId
      || resolved.memoryReleaseHash !== run.memoryReleaseHash) {
      throw new Error('Evaluation v3 memory release is stale');
    }
    return { bundle, systemPrompt, context: resolved.context };
  };

  const executeRunInternal = async (runId: string) => {
    let run = await readEvaluationV3Run(options.root, runId);
    if (run.status === 'complete') return run;
    const { bundle, systemPrompt, context } = await resolveRunInputs(run);
    const model = options.createModel();
    if (model.provider !== run.provider || model.model !== run.model) {
      throw new Error('Evaluation v3 model configuration is stale');
    }
    const keyById = new Map<string, EvaluationV3Answer>(
      bundle.answerKey.answers.map((answer) => [answer.questionId, answer]),
    );
    run = await writeEvaluationV3Run(options.root, {
      ...run,
      status: 'running',
      runError: undefined,
    });
    for (const question of bundle.questions.questions) {
      if (run.answers.some(({ questionId, status }) =>
        questionId === question.id && status === 'complete')) continue;
      try {
        const input = buildEvaluationV3Input(systemPrompt, question, context, run.arm);
        const { result, parsed } = await invokeQuestion(model, input, question);
        const key = keyById.get(question.id);
        if (!key) throw new Error(`missing Evaluation v3 answer: ${question.id}`);
        const answer: EvaluationV3RunAnswer = {
          questionId: question.id,
          status: 'complete',
          choice: parsed.choice,
          reason: parsed.reason,
          correct: parsed.choice === key.correctChoice,
          mismatch: reasonChoiceMismatch(parsed.choice, parsed.reason),
          elapsedMs: result.elapsedMs,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
        };
        run = { ...run, answers: replaceAnswer(run.answers, answer) };
        run.scores = scoreRun(run.answers, bundle.questions.questions);
        run = await writeEvaluationV3Run(options.root, run);
      } catch (error) {
        const failed: EvaluationV3RunAnswer = {
          questionId: question.id,
          status: 'failed',
          elapsedMs: 0,
          error: error instanceof Error ? error.message : 'unknown Evaluation v3 error',
        };
        run = {
          ...run,
          status: 'incomplete',
          answers: replaceAnswer(run.answers, failed),
        };
        run.scores = scoreRun(run.answers, bundle.questions.questions);
        return writeEvaluationV3Run(options.root, run);
      }
    }
    run = {
      ...run,
      status: 'complete',
      completedAt: new Date().toISOString(),
      scores: scoreRun(run.answers, bundle.questions.questions),
    };
    return writeEvaluationV3Run(options.root, run);
  };

  const executeRun = async (runId: string) => {
    if (activeRunIds.has(runId)) {
      throw new Error(`Evaluation v3 run is already executing: ${runId}`);
    }
    activeRunIds.add(runId);
    try {
      try {
        return await executeRunInternal(runId);
      } catch (error) {
        try {
          const current = await readEvaluationV3Run(options.root, runId);
          await writeEvaluationV3Run(options.root, {
            ...current,
            status: 'incomplete',
            runError: runErrorFrom(error),
          });
        } catch {
          // Preserve the original execution error when the run cannot be read or written.
        }
        throw error;
      }
    } finally {
      activeRunIds.delete(runId);
    }
  };

  const queueResume = async (runId: string) => {
    if (activeRunIds.has(runId) || transitionRunIds.has(runId)) {
      throw new Error(`Evaluation v3 run is already executing: ${runId}`);
    }
    transitionRunIds.add(runId);
    try {
      const run = await readEvaluationV3Run(options.root, runId);
      if (run.status !== 'incomplete') {
        throw new Error(`only incomplete Evaluation v3 runs can resume: ${run.status}`);
      }
      return writeEvaluationV3Run(options.root, {
        ...run,
        status: 'queued',
        runError: undefined,
      });
    } finally {
      transitionRunIds.delete(runId);
    }
  };

  const executeExperiment = async (runIds: string[]) => {
    if ((runIds.length !== 4 && runIds.length !== 20)
      || new Set(runIds).size !== runIds.length) {
      throw new Error('Evaluation v3 experiment requires four or twenty unique run IDs');
    }
    const runs = await Promise.all(runIds.map((runId) =>
      readEvaluationV3Run(options.root, runId)));
    const groupIds = new Set(runs.map(({ experimentGroupId }) => experimentGroupId));
    const expected = createEvaluationV3ExperimentPlan(runIds.length === 4 ? 1 : 5);
    if (groupIds.size !== 1 || runs.some((run, index) =>
      run.arm !== expected[index].arm || run.repetition !== expected[index].repetition)) {
      throw new Error('Evaluation v3 runs must form one stable four-arm experiment group');
    }
    const completed: EvaluationV3Run[] = [];
    for (const run of runs) {
      try {
        completed.push(await executeRun(run.runId));
      } catch (error) {
        const current = await readEvaluationV3Run(options.root, run.runId);
        completed.push(await writeEvaluationV3Run(options.root, {
          ...current,
          status: 'incomplete',
          runError: current.runError ?? runErrorFrom(error),
        }));
      }
    }
    return completed;
  };

  const resumeRun = async (runId: string) => {
    await queueResume(runId);
    return executeRun(runId);
  };

  return {
    createExperiment,
    executeExperiment,
    executeRun,
    queueResume,
    resumeRun,
  };
};
