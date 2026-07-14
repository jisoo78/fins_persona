import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type {
  EvaluationAnswerKeyFile,
  EvaluationBundle,
  EvaluationExperimentArm,
  EvaluationExperimentLaunch,
  EvaluationProvider,
  EvaluationQuestion,
  EvaluationRun,
  EvaluationRunAnswer,
  SubjectiveGrade,
} from '../../shared/amyHoodEvaluation';
import type {
  ModelClient,
  ModelInput,
  ModelResult,
} from '../personaPipeline/modelClient';
import { checkGemmaGate, personaPromptPath } from '../personaPipeline/promptBuilder';
import {
  readActivePromptVersion,
  readPromptVersion,
} from '../promptVersions/store';
import { buildEvaluationInput, parseEvaluationResponse } from './prompt';
import { loadEvaluationBundle, loadQuestionReview } from './questionSet';
import {
  loadSafeEvaluationCorpus,
  retrieveEvaluationEvidence,
  type EvaluationCorpus,
} from './retriever';
import { readRun, writeRun } from './runStore';

type RunnerOptions = {
  root: string;
  createModel: (provider: EvaluationProvider) => ModelClient;
};

const scoreRun = (
  run: EvaluationRun,
  questions: EvaluationQuestion[],
) => {
  const kpiById = new Map(questions.map((question) => [question.id, question.kpi]));
  return {
    pastMemory: run.answers
      .filter((answer) => kpiById.get(answer.questionId) === 'past_memory_restoration')
      .reduce((sum, answer) => sum + (answer.objectiveScore ?? 0), 0),
    githubHoldout: run.answers
      .filter((answer) => kpiById.get(answer.questionId) === 'github_holdout')
      .reduce((sum, answer) => sum + (answer.objectiveScore ?? 0), 0),
    subjective:
      run.answers.filter((answer) => kpiById.get(answer.questionId) === 'hypothetical_scenario')
        .every((answer) => answer.grade)
        ? run.answers.reduce((sum, answer) => sum + (answer.grade?.score ?? 0), 0)
        : null,
  };
};

const replaceAnswer = (
  answers: EvaluationRunAnswer[],
  next: EvaluationRunAnswer,
) => [...answers.filter((answer) => answer.questionId !== next.questionId), next];

const invokeQuestion = async (
  model: ModelClient,
  prompt: ModelInput,
  question: EvaluationQuestion,
) => {
  const first = await model.invoke(prompt);
  try {
    return { result: first, parsed: parseEvaluationResponse(question, first.text) };
  } catch (error) {
    if (question.type !== 'multiple_choice') throw error;
    const second = await model.invoke(prompt);
    return {
      result: {
        ...second,
        elapsedMs: first.elapsedMs + second.elapsedMs,
        inputTokens: (first.inputTokens ?? 0) + (second.inputTokens ?? 0) || undefined,
        outputTokens: (first.outputTokens ?? 0) + (second.outputTokens ?? 0) || undefined,
      } satisfies ModelResult,
      parsed: parseEvaluationResponse(question, second.text),
    };
  }
};

const assertGrade = (grade: SubjectiveGrade) => {
  const allowed = new Set([
    'questionId',
    'decision',
    'reasoning',
    'tradeoff',
    'personaConsistency',
    'score',
    'summary',
  ]);
  for (const key of Object.keys(grade)) {
    if (!allowed.has(key)) throw new Error(`unknown subjective grade field: ${key}`);
  }
  const dimensions = [
    grade.decision,
    grade.reasoning,
    grade.tradeoff,
    grade.personaConsistency,
  ];
  if (dimensions.some((value) => !Number.isInteger(value) || value < 0 || value > 2)) {
    throw new Error(`subjective grade dimensions must be integers from 0 to 2: ${grade.questionId}`);
  }
  if (grade.score !== dimensions.reduce((sum, value) => sum + value, 0)) {
    throw new Error(`grade total does not match dimensions: ${grade.questionId}`);
  }
  if (!grade.summary.trim()) throw new Error(`subjective grade summary is required: ${grade.questionId}`);
};

const readRunSystemPrompt = async (root: string, run: EvaluationRun) => {
  if (run.experimentArm === 'generic_cfo_no_rag') {
    const content = await readFile(
      resolve(root, 'agent_prompts/prompts/generic-cfo-control.md'),
      'utf8',
    );
    const sha256 = createHash('sha256').update(content).digest('hex');
    if (sha256 !== run.promptHash) throw new Error('generic CFO prompt hash is stale');
    return content;
  }
  if (!run.promptVersionId) {
    return readFile(personaPromptPath(root, run.provider), 'utf8');
  }
  const version = await readPromptVersion(root, run.promptVersionId);
  if (version.sha256 !== run.promptHash) {
    throw new Error('run prompt version hash is stale');
  }
  return version.content;
};

type EvaluationRunContext = {
  bundle: EvaluationBundle;
  corpus: EvaluationCorpus;
  model: ModelClient;
  activePrompt: Awaited<ReturnType<typeof readActivePromptVersion>>;
  genericPrompt: { content: string; sha256: string };
};

type PersistRunInput = {
  provider: EvaluationProvider;
  experimentArm?: EvaluationExperimentArm;
  experimentGroupId?: string;
};

const experimentArms: EvaluationExperimentArm[] = [
  'persona_rag',
  'persona_no_rag',
  'generic_cfo_no_rag',
];

export const createEvaluationRunner = (options: RunnerOptions) => {
  const prepareRunContext = async (
    provider: EvaluationProvider,
  ): Promise<EvaluationRunContext> => {
    const [bundle, review, corpus, activePrompt, genericContent] = await Promise.all([
      loadEvaluationBundle(options.root),
      loadQuestionReview(options.root),
      loadSafeEvaluationCorpus(options.root),
      readActivePromptVersion(options.root),
      readFile(resolve(options.root, 'agent_prompts/prompts/generic-cfo-control.md'), 'utf8'),
    ]);
    if (review.reviews.some((item) => item.status !== 'approved')) {
      throw new Error('all evaluation questions must be approved before creating a run');
    }
    const model = options.createModel(provider);
    if (model.provider !== provider) {
      throw new Error('model provider does not match evaluation provider');
    }
    return {
      bundle,
      corpus,
      model,
      activePrompt,
      genericPrompt: {
        content: genericContent,
        sha256: createHash('sha256').update(genericContent).digest('hex'),
      },
    };
  };

  const persistQueuedRun = async (
    context: EvaluationRunContext,
    input: PersistRunInput,
  ) => {
    const arm = input.experimentArm ?? 'persona_rag';
    const generic = arm === 'generic_cfo_no_rag';
    const run: EvaluationRun = {
      runId: randomUUID(),
      status: 'queued',
      gradingStatus: 'pending',
      provider: input.provider,
      model: context.model.model,
      ...(generic ? {} : { promptVersionId: context.activePrompt.versionId }),
      promptHash: generic ? context.genericPrompt.sha256 : context.activePrompt.sha256,
      ragSnapshotId: context.corpus.snapshotId,
      questionSetVersion: context.bundle.questions.version,
      ...(input.experimentArm ? { experimentArm: input.experimentArm } : {}),
      ...(input.experimentGroupId ? { experimentGroupId: input.experimentGroupId } : {}),
      answers: [],
      scores: { pastMemory: 0, githubHoldout: 0, subjective: null },
      startedAt: new Date().toISOString(),
      completedAt: null,
    };
    return writeRun(options.root, run);
  };

  const createEvaluationRun = async (input: { provider: EvaluationProvider }) => {
    if (input.provider === 'openai') {
      const gate = await checkGemmaGate(options.root);
      if (!gate.passed) throw new Error(`Gemma gate failed: ${gate.failures.join('; ')}`);
    }
    const context = await prepareRunContext(input.provider);
    return persistQueuedRun(context, input);
  };

  const createEvaluationExperiment = async (
    input: { provider: EvaluationProvider },
  ): Promise<EvaluationExperimentLaunch> => {
    if (input.provider !== 'local') {
      throw new Error('three-arm experiments require the local provider');
    }
    const experimentGroupId = randomUUID();
    const context = await prepareRunContext('local');
    const runs: EvaluationRun[] = [];
    for (const experimentArm of experimentArms) {
      runs.push(await persistQueuedRun(context, {
        provider: 'local',
        experimentArm,
        experimentGroupId,
      }));
    }
    return { experimentGroupId, runs };
  };

  const executeEvaluationRun = async (runId: string) => {
    let run = await readRun(options.root, runId);
    if (run.status === 'complete') return run;
    const [bundle, corpus, systemPrompt] = await Promise.all([
      loadEvaluationBundle(options.root),
      loadSafeEvaluationCorpus(options.root),
      readRunSystemPrompt(options.root, run),
    ]);
    if (run.questionSetVersion !== bundle.questions.version) {
      throw new Error('run question-set version is stale');
    }
    if (run.ragSnapshotId !== corpus.snapshotId) {
      throw new Error('run RAG snapshot is stale');
    }
    const model = options.createModel(run.provider);
    if (model.model !== run.model || model.provider !== run.provider) {
      throw new Error('run model configuration is stale');
    }
    run = await writeRun(options.root, { ...run, status: 'running' });

    for (const question of bundle.questions.questions) {
      if (run.answers.some(
        (answer) => answer.questionId === question.id && answer.status === 'complete',
      )) {
        continue;
      }
      try {
        const arm = run.experimentArm ?? 'persona_rag';
        const chunks = retrieveEvaluationEvidence(corpus, question, arm);
        const prompt = buildEvaluationInput(systemPrompt, question, chunks, arm);
        const { result, parsed } = await invokeQuestion(model, prompt, question);
        const key = bundle.answerKey.answers.find(
          (answer) => answer.questionId === question.id,
        );
        if (!key) throw new Error(`missing answer key for ${question.id}`);
        const answer: EvaluationRunAnswer =
          'choice' in parsed
            ? {
                questionId: question.id,
                status: 'complete',
                choice: parsed.choice,
                reason: parsed.reason,
                correct: parsed.choice === key.correctChoice,
                objectiveScore: parsed.choice === key.correctChoice ? 1 : 0,
                elapsedMs: result.elapsedMs,
                inputTokens: result.inputTokens,
                outputTokens: result.outputTokens,
              }
            : {
                questionId: question.id,
                status: 'complete',
                text: parsed.text,
                elapsedMs: result.elapsedMs,
                inputTokens: result.inputTokens,
                outputTokens: result.outputTokens,
              };
        run = { ...run, answers: replaceAnswer(run.answers, answer) };
        run.scores = scoreRun(run, bundle.questions.questions);
        run = await writeRun(options.root, run);
      } catch (error) {
        const failed: EvaluationRunAnswer = {
          questionId: question.id,
          status: 'failed',
          elapsedMs: 0,
          error: error instanceof Error ? error.message : 'unknown evaluation error',
        };
        run = {
          ...run,
          status: 'incomplete',
          answers: replaceAnswer(run.answers, failed),
        };
        run.scores = scoreRun(run, bundle.questions.questions);
        return writeRun(options.root, run);
      }
    }

    run = {
      ...run,
      status: 'complete',
      completedAt: new Date().toISOString(),
    };
    run.scores = scoreRun(run, bundle.questions.questions);
    return writeRun(options.root, run);
  };

  const executeEvaluationExperiment = async (runIds: string[]) => {
    if (runIds.length !== experimentArms.length || new Set(runIds).size !== runIds.length) {
      throw new Error('experiment requires three unique run IDs');
    }
    const runs = await Promise.all(runIds.map((runId) => readRun(options.root, runId)));
    const groupIds = new Set(runs.map((run) => run.experimentGroupId));
    const armSet = new Set(runs.map((run) => run.experimentArm));
    if (
      groupIds.size !== 1 ||
      !runs[0].experimentGroupId ||
      armSet.size !== experimentArms.length ||
      experimentArms.some((arm) => !armSet.has(arm))
    ) {
      throw new Error('experiment runs must contain one complete three-arm group');
    }
    const runByArm = new Map(runs.map((run) => [run.experimentArm, run]));
    const completed: EvaluationRun[] = [];
    for (const arm of experimentArms) {
      const run = runByArm.get(arm)!;
      try {
        completed.push(await executeEvaluationRun(run.runId));
      } catch {
        const current = await readRun(options.root, run.runId);
        completed.push(await writeRun(options.root, { ...current, status: 'incomplete' }));
      }
    }
    return completed;
  };

  const resumeEvaluationRun = async (runId: string) => {
    const run = await readRun(options.root, runId);
    if (run.status !== 'incomplete') {
      throw new Error(`only incomplete evaluation runs can resume: ${run.status}`);
    }
    await writeRun(options.root, { ...run, status: 'queued' });
    return executeEvaluationRun(runId);
  };

  const applySubjectiveGrades = async (
    runId: string,
    grades: SubjectiveGrade[],
  ) => {
    const [run, bundle] = await Promise.all([
      readRun(options.root, runId),
      loadEvaluationBundle(options.root),
    ]);
    if (run.status !== 'complete') throw new Error('only complete runs can be graded');
    const subjectiveIds = bundle.questions.questions
      .filter((question) => question.kpi === 'hypothetical_scenario')
      .map((question) => question.id);
    if (
      grades.length !== subjectiveIds.length ||
      new Set(grades.map((grade) => grade.questionId)).size !== grades.length ||
      grades.some((grade) => !subjectiveIds.includes(grade.questionId))
    ) {
      throw new Error('subjective grades must match S1-S3 exactly');
    }
    grades.forEach(assertGrade);
    const gradeById = new Map(grades.map((grade) => [grade.questionId, grade]));
    const next: EvaluationRun = {
      ...run,
      gradingStatus: 'complete',
      answers: run.answers.map((answer) => ({
        ...answer,
        grade: gradeById.get(answer.questionId) ?? answer.grade,
      })),
    };
    next.scores = scoreRun(next, bundle.questions.questions);
    return writeRun(options.root, next);
  };

  return {
    createEvaluationRun,
    createEvaluationExperiment,
    executeEvaluationRun,
    executeEvaluationExperiment,
    resumeEvaluationRun,
    applySubjectiveGrades,
  };
};
