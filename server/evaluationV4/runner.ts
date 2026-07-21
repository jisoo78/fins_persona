import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { AmyHoodRenderedContext, AmyHoodRetrievalResult } from '../../shared/amyHoodRag';
import {
  EVALUATION_V4_ARMS,
  parseEvaluationV4CandidateResponse,
  type EvaluationV4Arm,
  type EvaluationV4ExperimentLaunch,
  type EvaluationV4Run,
  type EvaluationV4RunAnswer,
  type EvaluationV4Stage,
} from '../../shared/amyHoodEvaluationV4';
import { canonicalJson, sha256 } from '../decisionAdvisor/canonicalJson';
import { createBgeM3EmbeddingClient } from '../decisionAdvisor/embeddingClient';
import { createAmyHoodHybridRetriever } from '../decisionAdvisor/hybridRetriever';
import { buildAmyHoodRagContext } from '../decisionAdvisor/ragContext';
import type { ModelClient, ModelResult } from '../personaPipeline/modelClient';
import { readActivePromptVersion, readPromptVersion } from '../promptVersions/store';
import { resolveEvaluationV4RagPin, type EvaluationV4RagPin } from './context';
import { assertEvaluationV4PolicyCoverage, loadEvaluationV4PolicyCoverage } from './policyCoverage';
import { buildEvaluationV4Input } from './prompt';
import { readOrCreateEvaluationV4Retrieval } from './retrievalCache';
import { readEvaluationV4Run, writeEvaluationV4Run } from './runStore';
import { loadEvaluationV4Bundle, type ValidatedEvaluationV4Bundle } from './scenarioSet';

type PromptPin = { versionId: string | null; hash: string; content: string };
type RunnerOptions = {
  root: string;
  createModel: () => ModelClient;
  loadBundle?: (stage: EvaluationV4Stage) => Promise<ValidatedEvaluationV4Bundle>;
  loadPolicyCoverage?: typeof loadEvaluationV4PolicyCoverage;
  loadRagPin?: () => Promise<EvaluationV4RagPin>;
  loadPromptArms?: () => Promise<{ generic: PromptPin; amy: PromptPin }>;
  createRetriever?: () => Promise<{ retrieve(request: { query: string; indexHash: string }): Promise<AmyHoodRetrievalResult> }>;
  buildContext?: typeof buildAmyHoodRagContext;
  now?: () => string;
};

const replaceAnswer = (answers: EvaluationV4RunAnswer[], answer: EvaluationV4RunAnswer) => {
  const index = answers.findIndex(({ scenarioId }) => scenarioId === answer.scenarioId);
  if (index < 0) return [...answers, answer];
  const next = [...answers];
  next[index] = answer;
  return next;
};

const defaultPromptLoader = async (root: string) => {
  const [generic, amy] = await Promise.all([
    readFile(path.join(root, 'agent_prompts/prompts/generic-cfo-control.md'), 'utf8'),
    readActivePromptVersion(root),
  ]);
  return {
    generic: { versionId: null, hash: sha256(generic), content: generic },
    amy: { versionId: amy.versionId, hash: amy.sha256, content: amy.content },
  };
};

const invoke = async (model: ModelClient, input: ReturnType<typeof buildEvaluationV4Input>) => {
  const first = await model.invoke(input);
  try {
    return { result: first, response: parseEvaluationV4CandidateResponse(first.text) };
  } catch {
    const second = await model.invoke(input);
    const result: ModelResult = {
      ...second,
      elapsedMs: first.elapsedMs + second.elapsedMs,
      inputTokens: (first.inputTokens ?? 0) + (second.inputTokens ?? 0) || undefined,
      outputTokens: (first.outputTokens ?? 0) + (second.outputTokens ?? 0) || undefined,
    };
    return { result, response: parseEvaluationV4CandidateResponse(second.text) };
  }
};

export const createEvaluationV4Runner = (options: RunnerOptions) => {
  const active = new Set<string>();
  const loadBundle = options.loadBundle ?? ((stage) => loadEvaluationV4Bundle(options.root, stage));
  const loadCoverage = options.loadPolicyCoverage ?? loadEvaluationV4PolicyCoverage;
  const loadPin = options.loadRagPin ?? (() => resolveEvaluationV4RagPin(options.root));
  const loadPrompts = options.loadPromptArms ?? (() => defaultPromptLoader(options.root));
  const createRetriever = options.createRetriever ?? (() => createAmyHoodHybridRetriever({
    root: options.root, embeddingClient: createBgeM3EmbeddingClient(),
  }));
  const buildContext = options.buildContext ?? buildAmyHoodRagContext;
  const now = options.now ?? (() => new Date().toISOString());

  const createExperiment = async ({ stage }: { stage: EvaluationV4Stage }): Promise<EvaluationV4ExperimentLaunch> => {
    const [bundle, coverage, prompts, ragPin] = await Promise.all([
      loadBundle(stage), loadCoverage(options.root), loadPrompts(), loadPin(),
    ]);
    assertEvaluationV4PolicyCoverage(coverage);
    const model = options.createModel();
    if (model.provider !== 'local') throw new Error('Evaluation v4 supports the local provider only');
    const experimentGroupId = randomUUID();
    const scenarioSetHash = bundle.manifest?.bundleHash ?? sha256(canonicalJson(bundle.scenarioFile));
    const runs: EvaluationV4Run[] = [];
    for (const arm of EVALUATION_V4_ARMS) {
      const rag = arm === 'amy_policy_rag' || arm === 'amy_full_rag';
      const prompt = arm === 'generic_cfo' ? prompts.generic : prompts.amy;
      const run: EvaluationV4Run = {
        runId: randomUUID(), version: '4.0.0', stage, scenarioSetVersion: '4.0.0',
        experimentGroupId, repetition: 1, orderSeed: sha256(`${experimentGroupId}:${arm}`).slice(0, 16),
        arm, provider: 'local', model: model.model, scenarioSetHash,
        promptVersionId: prompt.versionId, promptHash: prompt.hash,
        memoryReleaseId: rag ? ragPin.memoryReleaseId : null,
        memoryReleaseHash: rag ? ragPin.memoryReleaseHash : null,
        memoryIndexHash: rag ? ragPin.memoryIndexHash : null,
        retrievalConfigHash: rag ? ragPin.retrievalConfigHash : null,
        status: 'queued', answers: [], startedAt: now(), completedAt: null,
      };
      runs.push(await writeEvaluationV4Run(options.root, run));
    }
    return { experimentGroupId, repetitions: 1, runs };
  };

  const resolveInputs = async (run: EvaluationV4Run) => {
    const [bundle, prompts] = await Promise.all([loadBundle(run.stage), loadPrompts()]);
    const scenarioSetHash = bundle.manifest?.bundleHash ?? sha256(canonicalJson(bundle.scenarioFile));
    if (run.scenarioSetVersion !== '4.0.0' || run.scenarioSetHash !== scenarioSetHash) {
      throw new Error('Evaluation v4 scenario pin is stale');
    }
    const prompt = run.arm === 'generic_cfo' ? prompts.generic : prompts.amy;
    if (prompt.hash !== run.promptHash || prompt.versionId !== run.promptVersionId) {
      throw new Error('Evaluation v4 prompt pin is stale');
    }
    let ragPin: EvaluationV4RagPin | null = null;
    if (run.arm === 'amy_policy_rag' || run.arm === 'amy_full_rag') {
      ragPin = await loadPin();
      if (ragPin.memoryReleaseId !== run.memoryReleaseId
        || ragPin.memoryReleaseHash !== run.memoryReleaseHash
        || ragPin.memoryIndexHash !== run.memoryIndexHash
        || ragPin.retrievalConfigHash !== run.retrievalConfigHash) {
        throw new Error('Evaluation v4 RAG pin is stale');
      }
    } else if ([run.memoryReleaseId, run.memoryReleaseHash, run.memoryIndexHash, run.retrievalConfigHash]
      .some((value) => value !== null)) {
      throw new Error('Evaluation v4 no-RAG arm contains a memory pin');
    }
    return { bundle, prompt, ragPin };
  };

  const executeInternal = async (runId: string) => {
    let run = await readEvaluationV4Run(options.root, runId);
    if (run.status === 'complete') return run;
    const { bundle, prompt, ragPin } = await resolveInputs(run);
    const model = options.createModel();
    if (model.provider !== run.provider || model.model !== run.model) {
      throw new Error('Evaluation v4 model configuration is stale');
    }
    run = await writeEvaluationV4Run(options.root, { ...run, status: 'running', runError: undefined });
    const retriever = ragPin ? await createRetriever() : null;
    for (const scenario of bundle.scenarios) {
      if (run.answers.some(({ scenarioId, status }) => scenarioId === scenario.id && status === 'complete')) continue;
      try {
        let context: AmyHoodRenderedContext | null = null;
        if (ragPin && retriever) {
          const query = [scenario.title, scenario.situation, scenario.decisionQuestion].join('\n');
          const retrieval = await readOrCreateEvaluationV4Retrieval({
            root: options.root, experimentGroupId: run.experimentGroupId,
            query, indexHash: ragPin.memoryIndexHash, retriever,
          });
          context = await buildContext({
            root: options.root, retrieval,
            projection: run.arm === 'amy_policy_rag' ? 'policy' : 'full',
            systemPrompt: prompt.content,
            userPrompt: `${scenario.title}\n${scenario.situation}\n${scenario.decisionQuestion}`,
          });
        }
        const { result, response } = await invoke(model, buildEvaluationV4Input(prompt.content, scenario, context, run.arm));
        run = await writeEvaluationV4Run(options.root, {
          ...run,
          answers: replaceAnswer(run.answers, {
            scenarioId: scenario.id, status: 'complete', response,
            elapsedMs: result.elapsedMs, inputTokens: result.inputTokens, outputTokens: result.outputTokens,
            ...(context ? { retrieval: context.trace } : {}),
          }),
        });
      } catch (error) {
        return writeEvaluationV4Run(options.root, {
          ...run, status: 'incomplete',
          answers: replaceAnswer(run.answers, {
            scenarioId: scenario.id, status: 'failed', elapsedMs: 0,
            error: error instanceof Error ? error.message : 'unknown Evaluation v4 error',
          }),
        });
      }
    }
    return writeEvaluationV4Run(options.root, { ...run, status: 'complete', completedAt: now() });
  };

  const executeRun = async (runId: string) => {
    if (active.has(runId)) throw new Error(`Evaluation v4 run is already executing: ${runId}`);
    active.add(runId);
    try {
      return await executeInternal(runId);
    } catch (error) {
      const run = await readEvaluationV4Run(options.root, runId);
      await writeEvaluationV4Run(options.root, {
        ...run, status: 'incomplete',
        runError: {
          code: /stale|hash|pin/.test(error instanceof Error ? error.message : '') ? 'artifact_stale' : 'execution_error',
          message: error instanceof Error ? error.message : 'unknown Evaluation v4 error',
          retryable: !/stale|hash|pin/.test(error instanceof Error ? error.message : ''),
        },
      });
      throw error;
    } finally {
      active.delete(runId);
    }
  };

  const executeExperiment = async (runIds: string[]) => {
    if (runIds.length !== 4 || new Set(runIds).size !== 4) {
      throw new Error('Evaluation v4 calibration requires four unique run IDs');
    }
    const initial = await Promise.all(runIds.map((id) => readEvaluationV4Run(options.root, id)));
    if (new Set(initial.map(({ experimentGroupId }) => experimentGroupId)).size !== 1
      || initial.some((run, index) => run.arm !== EVALUATION_V4_ARMS[index])) {
      throw new Error('Evaluation v4 runs do not form one ordered experiment');
    }
    const completed: EvaluationV4Run[] = [];
    for (const run of initial) completed.push(await executeRun(run.runId).catch(() => readEvaluationV4Run(options.root, run.runId)));
    return completed;
  };

  const resumeRun = async (runId: string) => {
    const run = await readEvaluationV4Run(options.root, runId);
    if (run.status !== 'incomplete') throw new Error(`only incomplete Evaluation v4 runs can resume: ${run.status}`);
    await writeEvaluationV4Run(options.root, { ...run, status: 'queued', runError: undefined });
    return executeRun(runId);
  };

  return { createExperiment, executeExperiment, executeRun, resumeRun };
};
