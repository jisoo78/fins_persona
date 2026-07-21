import { randomUUID } from 'node:crypto';

import type { AmyHoodRenderedContext, AmyHoodRetrievalResult } from '../../shared/amyHoodRag';
import {
  EVALUATION_V6_ARMS,
  type EvaluationV6Run,
  type EvaluationV6RunAnswer,
} from '../../shared/amyHoodEvaluationV6';
import { parseEvaluationV5CandidateResponse } from '../../shared/amyHoodEvaluationV5';
import { canonicalJson, sha256 } from '../decisionAdvisor/canonicalJson';
import { createBgeM3EmbeddingClient } from '../decisionAdvisor/embeddingClient';
import { createAmyHoodHybridRetriever } from '../decisionAdvisor/hybridRetriever';
import { buildAmyHoodRagContext } from '../decisionAdvisor/ragContext';
import type { ModelClient, ModelResult } from '../personaPipeline/modelClient';
import { readActivePromptVersion } from '../promptVersions/store';
import { loadActiveEvaluationV6Calibration } from './calibration';
import { resolveEvaluationV6RagPin, type EvaluationV6RagPin } from './context';
import { buildEvaluationV6Input } from './prompt';
import { readOrCreateEvaluationV6Retrieval } from './retrievalCache';
import { listEvaluationV6Runs, readEvaluationV6Run, writeEvaluationV6Run } from './runStore';
import { loadEvaluationV6Bundle, type ValidatedEvaluationV6Bundle } from './scenarioSet';

type PromptPin = { versionId: string; hash: string; content: string };
type CalibrationPin = Awaited<ReturnType<typeof loadActiveEvaluationV6Calibration>>;
type RunnerOptions = {
  root: string;
  createModel: () => ModelClient;
  loadBundle?: () => Promise<ValidatedEvaluationV6Bundle>;
  loadCalibration?: () => Promise<CalibrationPin>;
  loadRagPin?: () => Promise<EvaluationV6RagPin>;
  loadPrompt?: () => Promise<PromptPin>;
  createRetriever?: () => Promise<{ retrieve(request: { query: string; indexHash: string }): Promise<AmyHoodRetrievalResult> }>;
  buildContext?: typeof buildAmyHoodRagContext;
  now?: () => string;
};

class CandidateValidationError extends Error {
  constructor(message: string, readonly rawOutput: string) { super(message); }
}

const replaceAnswer = (answers: EvaluationV6RunAnswer[], answer: EvaluationV6RunAnswer) => {
  const index = answers.findIndex(({ scenarioId }) => scenarioId === answer.scenarioId);
  if (index < 0) return [...answers, answer];
  const next = [...answers];
  next[index] = answer;
  return next;
};
const shuffledScenarioIds = (ids: string[], seed: string) => [...ids].sort((left, right) =>
  sha256(`${seed}:${left}`).localeCompare(sha256(`${seed}:${right}`)) || left.localeCompare(right));

const invoke = async (model: ModelClient, input: ReturnType<typeof buildEvaluationV6Input>) => {
  const first = await model.invoke(input);
  try {
    return { result: first, response: parseEvaluationV5CandidateResponse(first.text) };
  } catch (firstError) {
    let second: ModelResult;
    try {
      second = await model.invoke({
        ...input,
        user: `${input.user}\n\nThe previous response failed validation: ${firstError instanceof Error ? firstError.message : 'invalid JSON'}. Return corrected JSON only with the exact required fields.`,
      });
    } catch (error) {
      throw new CandidateValidationError(error instanceof Error ? error.message : 'Evaluation v6 repair failed', first.text);
    }
    const result = {
      ...second,
      elapsedMs: first.elapsedMs + second.elapsedMs,
      inputTokens: (first.inputTokens ?? 0) + (second.inputTokens ?? 0) || undefined,
      outputTokens: (first.outputTokens ?? 0) + (second.outputTokens ?? 0) || undefined,
    };
    try {
      return { result, response: parseEvaluationV5CandidateResponse(second.text) };
    } catch (error) {
      throw new CandidateValidationError(error instanceof Error ? error.message : 'Evaluation v6 validation failed', second.text);
    }
  }
};

export const createEvaluationV6Runner = (options: RunnerOptions) => {
  const active = new Set<string>();
  const loadBundle = options.loadBundle ?? (() => loadEvaluationV6Bundle(options.root));
  const loadCalibration = options.loadCalibration ?? (() => loadActiveEvaluationV6Calibration(options.root));
  const loadRagPin = options.loadRagPin ?? (() => resolveEvaluationV6RagPin(options.root));
  const loadPrompt = options.loadPrompt ?? (async () => {
    const prompt = await readActivePromptVersion(options.root);
    return { versionId: prompt.versionId, hash: prompt.sha256, content: prompt.content };
  });
  const createRetriever = options.createRetriever ?? (() => createAmyHoodHybridRetriever({
    root: options.root, embeddingClient: createBgeM3EmbeddingClient(),
  }));
  const buildContext = options.buildContext ?? buildAmyHoodRagContext;
  const now = options.now ?? (() => new Date().toISOString());

  const createExperiment = async ({ repetitions }: { repetitions: 1 | 5 }) => {
    if (repetitions !== 1 && repetitions !== 5) throw new Error('Evaluation v6 repetitions must be 1 or 5');
    const [bundle, calibration, prompt, ragPin] = await Promise.all([
      loadBundle(), loadCalibration(), loadPrompt(), loadRagPin(),
    ]);
    if (!bundle.manifest || !calibration.passed
      || bundle.manifest.candidateBundleHash !== calibration.candidateBundleHash
      || bundle.manifest.judgeCalibrationBatchHash !== calibration.batchHash) {
      throw new Error('Evaluation v6 Judge calibration is not approved for this bundle');
    }
    const model = options.createModel();
    if (model.provider !== 'local') throw new Error('Evaluation v6 supports the local provider only');
    const experimentGroupId = randomUUID();
    const repetitionValues = repetitions === 1 ? [1] as const : [1, 2, 3, 4, 5] as const;
    const runs: EvaluationV6Run[] = [];
    for (const repetition of repetitionValues) {
      const orderSeed = sha256(`${experimentGroupId}:${repetition}`).slice(0, 16);
      const scenarioOrder = shuffledScenarioIds(bundle.scenarios.map(({ id }) => id), orderSeed);
      for (const arm of EVALUATION_V6_ARMS) {
        const rag = arm !== 'amy_prompt';
        runs.push(await writeEvaluationV6Run(options.root, {
          runId: randomUUID(), version: '6.0.0', stage: 'benchmark', experimentGroupId,
          repetition, orderSeed, scenarioOrder, arm, provider: 'local', model: model.model,
          scenarioSetHash: bundle.manifest.bundleHash,
          promptVersionId: prompt.versionId, promptHash: prompt.hash,
          memoryReleaseId: rag ? ragPin.memoryReleaseId : null,
          memoryReleaseHash: rag ? ragPin.memoryReleaseHash : null,
          memoryIndexHash: rag ? ragPin.memoryIndexHash : null,
          retrievalConfigHash: rag ? ragPin.retrievalConfigHash : null,
          status: 'queued', answers: [], startedAt: now(), completedAt: null,
        }));
      }
    }
    return { experimentGroupId, repetitions, runs };
  };

  const resolveInputs = async (run: EvaluationV6Run) => {
    const [bundle, prompt] = await Promise.all([loadBundle(), loadPrompt()]);
    if (!bundle.manifest || run.version !== '6.0.0' || run.stage !== 'benchmark'
      || run.scenarioSetHash !== bundle.manifest.bundleHash) throw new Error('Evaluation v6 scenario pin is stale');
    if (prompt.hash !== run.promptHash || prompt.versionId !== run.promptVersionId) {
      throw new Error('Evaluation v6 prompt pin is stale');
    }
    const ids = bundle.scenarios.map(({ id }) => id);
    if (run.scenarioOrder.length !== 30 || new Set(run.scenarioOrder).size !== 30
      || run.scenarioOrder.some((id) => !ids.includes(id))) throw new Error('Evaluation v6 scenario order pin is stale');
    let ragPin: EvaluationV6RagPin | null = null;
    if (run.arm !== 'amy_prompt') {
      ragPin = await loadRagPin();
      if (ragPin.memoryReleaseId !== run.memoryReleaseId || ragPin.memoryReleaseHash !== run.memoryReleaseHash
        || ragPin.memoryIndexHash !== run.memoryIndexHash || ragPin.retrievalConfigHash !== run.retrievalConfigHash) {
        throw new Error('Evaluation v6 RAG pin is stale');
      }
    } else if ([run.memoryReleaseId, run.memoryReleaseHash, run.memoryIndexHash, run.retrievalConfigHash]
      .some((value) => value !== null)) throw new Error('Evaluation v6 no-RAG arm contains a memory pin');
    return { bundle, prompt, ragPin };
  };

  const executeInternal = async (runId: string) => {
    let run = await readEvaluationV6Run(options.root, runId);
    if (run.status === 'complete') return run;
    const { bundle, prompt, ragPin } = await resolveInputs(run);
    const model = options.createModel();
    if (model.provider !== run.provider || model.model !== run.model) throw new Error('Evaluation v6 model configuration is stale');
    run = await writeEvaluationV6Run(options.root, { ...run, status: 'running' });
    const retriever = ragPin ? await createRetriever() : null;
    const scenarioById = new Map(bundle.scenarios.map((scenario) => [scenario.id, scenario]));
    const externalMotifs = new Set(bundle.provenance.map(({ externalMotifEventId }) => externalMotifEventId));
    for (const scenarioId of run.scenarioOrder) {
      if (run.answers.some((answer) => answer.scenarioId === scenarioId && answer.status === 'complete')) continue;
      const scenario = scenarioById.get(scenarioId)!;
      try {
        let context: AmyHoodRenderedContext | null = null;
        if (ragPin && retriever) {
          const query = [scenario.title, scenario.situation, scenario.decisionQuestion].join('\n');
          const retrieval = await readOrCreateEvaluationV6Retrieval({ root: options.root, experimentGroupId: run.experimentGroupId, query, indexHash: ragPin.memoryIndexHash, retriever });
          if (retrieval.matches.some(({ id }) => externalMotifs.has(id))) {
            throw new Error('Evaluation v6 holdout leakage: external motif entered persona retrieval');
          }
          context = await buildContext({ root: options.root, retrieval, projection: run.arm === 'amy_policy_rag' ? 'policy' : 'full', systemPrompt: prompt.content, userPrompt: query });
        }
        const { result, response } = await invoke(model, buildEvaluationV6Input(prompt.content, scenario, context, run.arm));
        run = await writeEvaluationV6Run(options.root, { ...run, answers: replaceAnswer(run.answers, {
          scenarioId, status: 'complete', response, elapsedMs: result.elapsedMs,
          inputTokens: result.inputTokens, outputTokens: result.outputTokens,
          ...(context ? { retrieval: context.trace } : {}),
        }) });
      } catch (error) {
        return writeEvaluationV6Run(options.root, { ...run, status: 'incomplete', answers: replaceAnswer(run.answers, {
          scenarioId, status: 'failed', elapsedMs: 0,
          ...(error instanceof CandidateValidationError ? { rawOutput: error.rawOutput } : {}),
          error: error instanceof Error ? error.message : 'unknown Evaluation v6 error',
        }) });
      }
    }
    return writeEvaluationV6Run(options.root, { ...run, status: 'complete', completedAt: now() });
  };

  const executeRun = async (runId: string) => {
    if (active.has(runId)) throw new Error(`Evaluation v6 run is already executing: ${runId}`);
    active.add(runId);
    try { return await executeInternal(runId); } finally { active.delete(runId); }
  };
  const executeExperiment = async (experimentGroupId: string) => {
    const initial = (await listEvaluationV6Runs(options.root)).filter((run) => run.experimentGroupId === experimentGroupId);
    if (![3, 15].includes(initial.length)) throw new Error('Evaluation v6 experiment requires three or fifteen runs');
    const repetitions = new Set(initial.map(({ repetition }) => repetition));
    for (const repetition of repetitions) {
      const runs = initial.filter((run) => run.repetition === repetition);
      if (runs.length !== 3 || EVALUATION_V6_ARMS.some((arm) => !runs.some((run) => run.arm === arm))
        || new Set(runs.map(({ scenarioOrder }) => canonicalJson(scenarioOrder))).size !== 1) {
        throw new Error(`Evaluation v6 repetition is incomplete or inconsistent: ${repetition}`);
      }
    }
    const completed: EvaluationV6Run[] = [];
    for (const run of initial) completed.push(await executeRun(run.runId));
    return completed;
  };
  const resumeRun = async (runId: string) => {
    const run = await readEvaluationV6Run(options.root, runId);
    if (run.status !== 'incomplete') throw new Error(`only incomplete Evaluation v6 runs can resume: ${run.status}`);
    await writeEvaluationV6Run(options.root, { ...run, status: 'queued' });
    return executeRun(runId);
  };
  return { createExperiment, executeExperiment, executeRun, resumeRun };
};
