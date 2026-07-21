import { canonicalJson } from '../decisionAdvisor/canonicalJson';
import { createBgeM3EmbeddingClient } from '../decisionAdvisor/embeddingClient';
import { createAmyHoodHybridRetriever } from '../decisionAdvisor/hybridRetriever';
import { readJsonFile, writeJsonAtomic } from '../decisionAdvisor/jsonStore';
import { createModelClient } from '../personaPipeline/modelClient';
import { activateEvaluationV6FormalLocalGrades, runEvaluationV6LocalJudge, runEvaluationV6LocalPairJudge } from './localJudge';
import { evaluationV6Paths } from './paths';
import { writeEvaluationV6HtmlReport } from './report';
import { createEvaluationV6Runner } from './runner';
import { listEvaluationV6Runs } from './runStore';

export type EvaluationV6FormalServiceIdentity = {
  candidate: { baseUrl: string; model: string };
  embedding: { baseUrl: string; model: string };
  judge: { baseUrl: string; model: string };
};

export type EvaluationV6FormalCheckpoint = {
  schemaVersion: 1;
  experimentGroupId: string;
  identities: EvaluationV6FormalServiceIdentity;
  stage: 'created' | 'answers_complete' | 'individual_judging' | 'individual_complete' | 'pairs_complete' | 'complete';
  completedRepetitions: Array<1 | 2 | 3 | 4 | 5>;
  htmlPath: string;
  createdAt: string;
  updatedAt: string;
};

export type EvaluationV6FormalWorkflowDeps = {
  preflight(): Promise<EvaluationV6FormalServiceIdentity>;
  loadCheckpoint(experimentGroupId?: string): Promise<EvaluationV6FormalCheckpoint | null>;
  saveCheckpoint(checkpoint: EvaluationV6FormalCheckpoint): Promise<void>;
  createExperiment(): Promise<string>;
  validateExistingGroup(experimentGroupId: string): Promise<void>;
  executeAnswers(experimentGroupId: string): Promise<void>;
  judgeRepetition(experimentGroupId: string, repetition: 1 | 2 | 3 | 4 | 5): Promise<void>;
  activateIndividualGrades(experimentGroupId: string): Promise<void>;
  judgePairs(experimentGroupId: string): Promise<void>;
  writeReport(experimentGroupId: string, htmlPath: string): Promise<string>;
  now(): string;
};

export type EvaluationV6FormalWorkflowOptions = {
  experimentGroupId?: string;
  htmlPath: string;
};

const stageRank: Record<EvaluationV6FormalCheckpoint['stage'], number> = {
  created: 0,
  answers_complete: 1,
  individual_judging: 2,
  individual_complete: 3,
  pairs_complete: 4,
  complete: 5,
};

export const runEvaluationV6FormalWorkflow = async (
  options: EvaluationV6FormalWorkflowOptions,
  deps: EvaluationV6FormalWorkflowDeps,
) => {
  const identities = await deps.preflight();
  let checkpoint = await deps.loadCheckpoint(options.experimentGroupId);
  if (checkpoint && options.experimentGroupId
    && checkpoint.experimentGroupId !== options.experimentGroupId) checkpoint = null;
  if (checkpoint && canonicalJson(checkpoint.identities) !== canonicalJson(identities)) {
    throw new Error('Evaluation v6 formal service identity is stale');
  }
  if (!checkpoint) {
    const experimentGroupId = options.experimentGroupId ?? await deps.createExperiment();
    if (options.experimentGroupId) await deps.validateExistingGroup(experimentGroupId);
    const timestamp = deps.now();
    checkpoint = {
      schemaVersion: 1,
      experimentGroupId,
      identities,
      stage: 'created',
      completedRepetitions: [],
      htmlPath: options.htmlPath,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await deps.saveCheckpoint(checkpoint);
  }

  const save = async (update: Partial<EvaluationV6FormalCheckpoint>) => {
    checkpoint = { ...checkpoint!, ...update, updatedAt: deps.now() };
    await deps.saveCheckpoint(checkpoint);
  };

  if (stageRank[checkpoint.stage] < stageRank.answers_complete) {
    await deps.executeAnswers(checkpoint.experimentGroupId);
    await save({ stage: 'answers_complete' });
  }
  if (stageRank[checkpoint.stage] < stageRank.individual_complete) {
    for (const repetition of [1, 2, 3, 4, 5] as const) {
      if (checkpoint.completedRepetitions.includes(repetition)) continue;
      await deps.judgeRepetition(checkpoint.experimentGroupId, repetition);
      await save({
        stage: 'individual_judging',
        completedRepetitions: [...checkpoint.completedRepetitions, repetition].sort(),
      });
    }
    await deps.activateIndividualGrades(checkpoint.experimentGroupId);
    await save({ stage: 'individual_complete' });
  }
  if (stageRank[checkpoint.stage] < stageRank.pairs_complete) {
    await deps.judgePairs(checkpoint.experimentGroupId);
    await save({ stage: 'pairs_complete' });
  }
  let outputPath = checkpoint.htmlPath;
  if (stageRank[checkpoint.stage] < stageRank.complete) {
    outputPath = await deps.writeReport(checkpoint.experimentGroupId, checkpoint.htmlPath);
    await save({ stage: 'complete', htmlPath: outputPath });
  }
  return { experimentGroupId: checkpoint.experimentGroupId, outputPath, checkpoint };
};

const normalizeBaseUrl = (value: string) => value.replace(/\/+$/, '');

const discoverSingleModel = async (baseUrl: string, fetchImpl: typeof fetch) => {
  const response = await fetchImpl(`${normalizeBaseUrl(baseUrl)}/models`);
  if (!response.ok) throw new Error(`Evaluation v6 model discovery failed: HTTP ${response.status}`);
  const payload = await response.json() as { data?: Array<{ id?: unknown }> };
  const ids = [...new Set((payload.data ?? [])
    .map(({ id }) => typeof id === 'string' ? id.trim() : '')
    .filter(Boolean))];
  if (ids.length !== 1) throw new Error('Evaluation v6 requires exactly one model per local service');
  return ids[0];
};

export const runEvaluationV6Formal = async (options: {
  root: string;
  candidateBaseUrl: string;
  embeddingBaseUrl: string;
  judgeBaseUrl: string;
  htmlPath: string;
  experimentGroupId?: string;
  fetchImpl?: typeof fetch;
}) => {
  const fetchImpl = options.fetchImpl ?? fetch;
  const candidateBaseUrl = normalizeBaseUrl(options.candidateBaseUrl);
  const embeddingBaseUrl = normalizeBaseUrl(options.embeddingBaseUrl);
  const judgeBaseUrl = normalizeBaseUrl(options.judgeBaseUrl);
  const embeddingClient = createBgeM3EmbeddingClient({ baseUrl: embeddingBaseUrl, fetchImpl });
  let candidateModel = '';
  let judgeModel = '';
  const runner = () => {
    if (!candidateModel) throw new Error('Evaluation v6 candidate model preflight is required');
    return createEvaluationV6Runner({
      root: options.root,
      createModel: () => createModelClient('local', {
        maxTokens: 900,
        baseUrl: candidateBaseUrl,
        model: candidateModel,
      }),
      createRetriever: () => createAmyHoodHybridRetriever({ root: options.root, embeddingClient }),
    });
  };
  const checkpointPath = evaluationV6Paths(options.root).formalRunCheckpoint;
  const deps: EvaluationV6FormalWorkflowDeps = {
    preflight: async () => {
      const [candidate, embedding, judge] = await Promise.all([
        discoverSingleModel(candidateBaseUrl, fetchImpl),
        embeddingClient.preflight(),
        discoverSingleModel(judgeBaseUrl, fetchImpl),
      ]);
      candidateModel = candidate;
      judgeModel = judge;
      return {
        candidate: { baseUrl: candidateBaseUrl, model: candidate },
        embedding: { baseUrl: embeddingBaseUrl, model: embedding.model },
        judge: { baseUrl: judgeBaseUrl, model: judge },
      };
    },
    loadCheckpoint: () => readJsonFile<EvaluationV6FormalCheckpoint | null>(checkpointPath, null),
    saveCheckpoint: (checkpoint) => writeJsonAtomic(checkpointPath, checkpoint),
    createExperiment: async () => (await runner().createExperiment({ repetitions: 5 })).experimentGroupId,
    validateExistingGroup: async (experimentGroupId) => {
      const runs = (await listEvaluationV6Runs(options.root))
        .filter((run) => run.experimentGroupId === experimentGroupId);
      if (runs.length !== 15) throw new Error('Evaluation v6 selected formal group must contain fifteen runs');
    },
    executeAnswers: async (experimentGroupId) => {
      const runs = await runner().executeExperiment(experimentGroupId);
      if (runs.length !== 15 || runs.some(({ status, answers }) =>
        status !== 'complete' || answers.length !== 30 || answers.some(({ status: answerStatus }) => answerStatus !== 'complete'))) {
        throw new Error('Evaluation v6 formal answers are incomplete; rerun the same command to resume');
      }
    },
    judgeRepetition: async (experimentGroupId, repetition) => {
      const result = await runEvaluationV6LocalJudge({
        root: options.root,
        experimentGroupId,
        repetition,
        baseUrl: judgeBaseUrl,
        fetchImpl,
      });
      if (result.packetCount !== 90 || result.grades.length !== 90 || result.judgeModel !== judgeModel) {
        throw new Error(`Evaluation v6 repetition ${repetition} Judge result is incomplete`);
      }
    },
    activateIndividualGrades: async (experimentGroupId) => {
      const result = await activateEvaluationV6FormalLocalGrades(options.root, experimentGroupId);
      if (result.grades.length !== 450) throw new Error('Evaluation v6 formal individual grade activation is incomplete');
    },
    judgePairs: async (experimentGroupId) => {
      const result = await runEvaluationV6LocalPairJudge({
        root: options.root,
        experimentGroupId,
        baseUrl: judgeBaseUrl,
        fetchImpl,
      });
      if (result.packetCount !== 225 || result.judgeModel !== judgeModel) {
        throw new Error('Evaluation v6 formal pair Judge result is incomplete');
      }
    },
    writeReport: async (experimentGroupId, htmlPath) =>
      (await writeEvaluationV6HtmlReport(options.root, experimentGroupId, htmlPath)).outputPath,
    now: () => new Date().toISOString(),
  };
  return runEvaluationV6FormalWorkflow({
    experimentGroupId: options.experimentGroupId,
    htmlPath: options.htmlPath,
  }, deps);
};
