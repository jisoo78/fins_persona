import { randomUUID } from 'node:crypto';

import type { AmyHoodRenderedContext, AmyHoodRetrievalResult } from '../../shared/amyHoodRag';
import {
  EVALUATION_V5_ARMS,
  parseEvaluationV5CandidateResponse,
  type EvaluationV5ExperimentLaunch,
  type EvaluationV5Run,
  type EvaluationV5RunAnswer,
} from '../../shared/amyHoodEvaluationV5';
import { canonicalJson, sha256 } from '../decisionAdvisor/canonicalJson';
import { createBgeM3EmbeddingClient } from '../decisionAdvisor/embeddingClient';
import { createAmyHoodHybridRetriever } from '../decisionAdvisor/hybridRetriever';
import { buildAmyHoodRagContext } from '../decisionAdvisor/ragContext';
import type { ModelClient, ModelResult } from '../personaPipeline/modelClient';
import { readActivePromptVersion } from '../promptVersions/store';
import {
  assertEvaluationV4PolicyCoverage,
  loadEvaluationV4PolicyCoverage,
} from '../evaluationV4/policyCoverage';
import { resolveEvaluationV5RagPin, type EvaluationV5RagPin } from './context';
import { buildEvaluationV5Input } from './prompt';
import { readOrCreateEvaluationV5Retrieval } from './retrievalCache';
import { readEvaluationV5Run, writeEvaluationV5Run } from './runStore';
import { loadEvaluationV5Bundle, type ValidatedEvaluationV5Bundle } from './scenarioSet';

type PromptPin = { versionId: string; hash: string; content: string };
type RunnerOptions = {
  root: string;
  createModel: () => ModelClient;
  loadBundle?: () => Promise<ValidatedEvaluationV5Bundle>;
  loadPolicyCoverage?: typeof loadEvaluationV4PolicyCoverage;
  loadRagPin?: () => Promise<EvaluationV5RagPin>;
  loadPrompt?: () => Promise<PromptPin>;
  createRetriever?: () => Promise<{
    retrieve(request: { query: string; indexHash: string }): Promise<AmyHoodRetrievalResult>;
  }>;
  buildContext?: typeof buildAmyHoodRagContext;
  now?: () => string;
};

class CandidateValidationError extends Error {
  constructor(message: string, readonly rawOutput: string) {
    super(message);
  }
}

const replaceAnswer = (answers: EvaluationV5RunAnswer[], answer: EvaluationV5RunAnswer) => {
  const index = answers.findIndex(({ scenarioId }) => scenarioId === answer.scenarioId);
  if (index < 0) return [...answers, answer];
  const next = [...answers];
  next[index] = answer;
  return next;
};

const defaultPromptLoader = async (root: string): Promise<PromptPin> => {
  const prompt = await readActivePromptVersion(root);
  return { versionId: prompt.versionId, hash: prompt.sha256, content: prompt.content };
};

const shuffledScenarioIds = (ids: string[], seed: string) => [...ids].sort((left, right) =>
  sha256(`${seed}:${left}`).localeCompare(sha256(`${seed}:${right}`)) || left.localeCompare(right));

const invoke = async (model: ModelClient, input: ReturnType<typeof buildEvaluationV5Input>) => {
  const first = await model.invoke(input);
  try {
    return { result: first, response: parseEvaluationV5CandidateResponse(first.text) };
  } catch (firstError) {
    const repairInput = {
      ...input,
      user: [
        input.user,
        'Your previous response failed validation.',
        `Validation error: ${firstError instanceof Error ? firstError.message : 'invalid JSON response'}`,
        'Return corrected JSON only. Use exactly 3 priorities, at least 1 guardrail, at least 1 reversal signal, and no additional fields.',
      ].join('\n\n'),
    };
    let second: ModelResult;
    try {
      second = await model.invoke(repairInput);
    } catch (error) {
      throw new CandidateValidationError(
        error instanceof Error ? error.message : 'Evaluation v5 repair failed',
        first.text,
      );
    }
    const result: ModelResult = {
      ...second,
      elapsedMs: first.elapsedMs + second.elapsedMs,
      inputTokens: (first.inputTokens ?? 0) + (second.inputTokens ?? 0) || undefined,
      outputTokens: (first.outputTokens ?? 0) + (second.outputTokens ?? 0) || undefined,
    };
    try {
      return { result, response: parseEvaluationV5CandidateResponse(second.text) };
    } catch (error) {
      throw new CandidateValidationError(
        error instanceof Error ? error.message : 'Evaluation v5 response validation failed',
        second.text,
      );
    }
  }
};

export const createEvaluationV5Runner = (options: RunnerOptions) => {
  const active = new Set<string>();
  const loadBundle = options.loadBundle ?? (() => loadEvaluationV5Bundle(options.root));
  const loadCoverage = options.loadPolicyCoverage ?? loadEvaluationV4PolicyCoverage;
  const loadPin = options.loadRagPin ?? (() => resolveEvaluationV5RagPin(options.root));
  const loadPrompt = options.loadPrompt ?? (() => defaultPromptLoader(options.root));
  const createRetriever = options.createRetriever ?? (() => createAmyHoodHybridRetriever({
    root: options.root,
    embeddingClient: createBgeM3EmbeddingClient(),
  }));
  const buildContext = options.buildContext ?? buildAmyHoodRagContext;
  const now = options.now ?? (() => new Date().toISOString());

  const createExperiment = async (): Promise<EvaluationV5ExperimentLaunch> => {
    const [bundle, coverage, prompt, ragPin] = await Promise.all([
      loadBundle(),
      loadCoverage(options.root),
      loadPrompt(),
      loadPin(),
    ]);
    assertEvaluationV4PolicyCoverage(coverage);
    const model = options.createModel();
    if (model.provider !== 'local') throw new Error('Evaluation v5 supports the local provider only');
    const experimentGroupId = randomUUID();
    const scenarioSetHash = bundle.manifest?.bundleHash ?? sha256(canonicalJson(bundle.scenarioFile));
    const runs: EvaluationV5Run[] = [];
    for (const repetition of [1, 2, 3, 4, 5] as const) {
      const orderSeed = sha256(`${experimentGroupId}:${repetition}`).slice(0, 16);
      const scenarioOrder = shuffledScenarioIds(bundle.scenarios.map(({ id }) => id), orderSeed);
      for (const arm of EVALUATION_V5_ARMS) {
        const rag = arm === 'amy_policy_rag' || arm === 'amy_full_rag';
        const run: EvaluationV5Run = {
          runId: randomUUID(),
          version: '5.0.0',
          stage: 'benchmark',
          scenarioSetVersion: '5.0.0',
          experimentGroupId,
          repetition,
          orderSeed,
          scenarioOrder,
          arm,
          provider: 'local',
          model: model.model,
          scenarioSetHash,
          promptVersionId: prompt.versionId,
          promptHash: prompt.hash,
          memoryReleaseId: rag ? ragPin.memoryReleaseId : null,
          memoryReleaseHash: rag ? ragPin.memoryReleaseHash : null,
          memoryIndexHash: rag ? ragPin.memoryIndexHash : null,
          retrievalConfigHash: rag ? ragPin.retrievalConfigHash : null,
          status: 'queued',
          answers: [],
          startedAt: now(),
          completedAt: null,
        };
        runs.push(await writeEvaluationV5Run(options.root, run));
      }
    }
    return { experimentGroupId, repetitions: 5, runs };
  };

  const resolveInputs = async (run: EvaluationV5Run) => {
    const [bundle, prompt] = await Promise.all([loadBundle(), loadPrompt()]);
    const scenarioSetHash = bundle.manifest?.bundleHash ?? sha256(canonicalJson(bundle.scenarioFile));
    if (run.version !== '5.0.0' || run.stage !== 'benchmark'
      || run.scenarioSetVersion !== '5.0.0' || run.scenarioSetHash !== scenarioSetHash) {
      throw new Error('Evaluation v5 scenario pin is stale');
    }
    if (prompt.hash !== run.promptHash || prompt.versionId !== run.promptVersionId) {
      throw new Error('Evaluation v5 prompt pin is stale');
    }
    const scenarioIds = bundle.scenarios.map(({ id }) => id);
    if (run.scenarioOrder.length !== 30 || new Set(run.scenarioOrder).size !== 30
      || run.scenarioOrder.some((id) => !scenarioIds.includes(id))) {
      throw new Error('Evaluation v5 scenario order pin is stale');
    }
    let ragPin: EvaluationV5RagPin | null = null;
    if (run.arm === 'amy_policy_rag' || run.arm === 'amy_full_rag') {
      ragPin = await loadPin();
      if (ragPin.memoryReleaseId !== run.memoryReleaseId
        || ragPin.memoryReleaseHash !== run.memoryReleaseHash
        || ragPin.memoryIndexHash !== run.memoryIndexHash
        || ragPin.retrievalConfigHash !== run.retrievalConfigHash) {
        throw new Error('Evaluation v5 RAG pin is stale');
      }
    } else if ([run.memoryReleaseId, run.memoryReleaseHash, run.memoryIndexHash, run.retrievalConfigHash]
      .some((value) => value !== null)) {
      throw new Error('Evaluation v5 no-RAG arm contains a memory pin');
    }
    return { bundle, prompt, ragPin };
  };

  const executeInternal = async (runId: string) => {
    let run = await readEvaluationV5Run(options.root, runId);
    if (run.status === 'complete') return run;
    const { bundle, prompt, ragPin } = await resolveInputs(run);
    const model = options.createModel();
    if (model.provider !== run.provider || model.model !== run.model) {
      throw new Error('Evaluation v5 model configuration is stale');
    }
    run = await writeEvaluationV5Run(options.root, { ...run, status: 'running', runError: undefined });
    const retriever = ragPin ? await createRetriever() : null;
    const scenarioById = new Map(bundle.scenarios.map((scenario) => [scenario.id, scenario]));
    for (const scenarioId of run.scenarioOrder) {
      const scenario = scenarioById.get(scenarioId)!;
      if (run.answers.some((answer) => answer.scenarioId === scenario.id && answer.status === 'complete')) continue;
      try {
        let context: AmyHoodRenderedContext | null = null;
        if (ragPin && retriever) {
          const query = [scenario.title, scenario.situation, scenario.decisionQuestion].join('\n');
          const retrieval = await readOrCreateEvaluationV5Retrieval({
            root: options.root,
            experimentGroupId: run.experimentGroupId,
            query,
            indexHash: ragPin.memoryIndexHash,
            retriever,
          });
          context = await buildContext({
            root: options.root,
            retrieval,
            projection: run.arm === 'amy_policy_rag' ? 'policy' : 'full',
            systemPrompt: prompt.content,
            userPrompt: `${scenario.title}\n${scenario.situation}\n${scenario.decisionQuestion}`,
          });
        }
        const { result, response } = await invoke(
          model,
          buildEvaluationV5Input(prompt.content, scenario, context, run.arm),
        );
        run = await writeEvaluationV5Run(options.root, {
          ...run,
          answers: replaceAnswer(run.answers, {
            scenarioId: scenario.id,
            status: 'complete',
            response,
            elapsedMs: result.elapsedMs,
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            ...(context ? { retrieval: context.trace } : {}),
          }),
        });
      } catch (error) {
        return writeEvaluationV5Run(options.root, {
          ...run,
          status: 'incomplete',
          answers: replaceAnswer(run.answers, {
            scenarioId: scenario.id,
            status: 'failed',
            elapsedMs: 0,
            ...(error instanceof CandidateValidationError ? { rawOutput: error.rawOutput } : {}),
            error: error instanceof Error ? error.message : 'unknown Evaluation v5 error',
          }),
        });
      }
    }
    return writeEvaluationV5Run(options.root, {
      ...run,
      status: 'complete',
      completedAt: now(),
    });
  };

  const executeRun = async (runId: string) => {
    if (active.has(runId)) throw new Error(`Evaluation v5 run is already executing: ${runId}`);
    active.add(runId);
    try {
      return await executeInternal(runId);
    } catch (error) {
      const run = await readEvaluationV5Run(options.root, runId);
      const message = error instanceof Error ? error.message : 'unknown Evaluation v5 error';
      await writeEvaluationV5Run(options.root, {
        ...run,
        status: 'incomplete',
        runError: {
          code: /stale|hash|pin/.test(message) ? 'artifact_stale' : 'execution_error',
          message,
          retryable: !/stale|hash|pin/.test(message),
        },
      });
      throw error;
    } finally {
      active.delete(runId);
    }
  };

  const executeExperiment = async (runIds: string[]) => {
    if (runIds.length !== 15 || new Set(runIds).size !== 15) {
      throw new Error('Evaluation v5 benchmark requires fifteen unique run IDs');
    }
    const initial = await Promise.all(runIds.map((id) => readEvaluationV5Run(options.root, id)));
    if (new Set(initial.map(({ experimentGroupId }) => experimentGroupId)).size !== 1) {
      throw new Error('Evaluation v5 runs do not form one experiment group');
    }
    for (const repetition of [1, 2, 3, 4, 5] as const) {
      const runs = initial.filter((run) => run.repetition === repetition);
      if (runs.length !== 3 || EVALUATION_V5_ARMS.some((arm) => !runs.some((run) => run.arm === arm))
        || new Set(runs.map(({ orderSeed }) => orderSeed)).size !== 1
        || new Set(runs.map(({ scenarioOrder }) => canonicalJson(scenarioOrder))).size !== 1) {
        throw new Error(`Evaluation v5 repetition is incomplete or inconsistent: ${repetition}`);
      }
    }
    const completed: EvaluationV5Run[] = [];
    for (const run of initial) {
      completed.push(await executeRun(run.runId).catch(() => readEvaluationV5Run(options.root, run.runId)));
    }
    return completed;
  };

  const resumeRun = async (runId: string) => {
    const run = await readEvaluationV5Run(options.root, runId);
    if (run.status !== 'incomplete') throw new Error(`only incomplete Evaluation v5 runs can resume: ${run.status}`);
    await writeEvaluationV5Run(options.root, { ...run, status: 'queued', runError: undefined });
    return executeRun(runId);
  };

  return { createExperiment, executeExperiment, executeRun, resumeRun };
};
