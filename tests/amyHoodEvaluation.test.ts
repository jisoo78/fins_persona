/**
 * Test Plan:
 * 1. Happy Path:
 *    - 승인된 7/5/3 질문과 활성 Main Prompt 버전을 고정한 평가 실행을 완료한다.
 *
 * 2. Edge Cases:
 *    - legacy 실행은 experiment 필드 없이도 활성 프롬프트를 읽는다.
 *    - RAG 없는 두 실험군은 모든 KPI에서 빈 증거를 유지한다.
 *    - 선택지 응답의 fenced JSON과 한국어 이유를 보존한다.
 *
 * 3. Failure Path:
 *    - 홀드아웃 오염, 질문/정답 ID 불일치, 모델 실패와 원자적 저장 실패는 완료 상태나 부분 덮어쓰기를 만들지 않는다.
 */
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import test from 'node:test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';

import {
  loadEvaluationBundle,
  saveQuestionReview,
} from '../server/evaluation/questionSet';
import {
  loadSafeEvaluationCorpus,
  retrieveEvaluationEvidence,
} from '../server/evaluation/retriever';
import {
  buildEvaluationInput,
  parseEvaluationResponse,
} from '../server/evaluation/prompt';
import { createEvaluationRunner } from '../server/evaluation/runner';
import { createEvaluationRouter } from '../server/evaluation/routes';
import { readRun, writeRun } from '../server/evaluation/runStore';
import {
  activatePromptVersion,
  createPromptVersion,
  readActivePromptVersion,
} from '../server/promptVersions/store';
import type {
  EvaluationQuestion,
  SubjectiveGrade,
} from '../shared/amyHoodEvaluation';
import type {
  ModelInput,
  ModelClient,
  ModelResult,
} from '../server/personaPipeline/modelClient';

type FixtureOptions = {
  omitAnswerId?: string;
  manifestSourceId?: string;
};

const createEvaluationFixture = async (options: FixtureOptions = {}) => {
  const root = await mkdtemp(join(tmpdir(), 'amy-evaluation-'));
  const evaluationDir = join(root, 'evaluation');
  await mkdir(evaluationDir, { recursive: true });

  const questions = await readFile(
    join(process.cwd(), 'evaluation/amy_hood_eval_questions.json'),
    'utf8',
  );
  const answerKey = JSON.parse(
    await readFile(
      join(process.cwd(), 'evaluation/amy_hood_eval_answer_key.json'),
      'utf8',
    ),
  ) as { answers: { questionId: string }[] };
  const reviews = await readFile(
    join(process.cwd(), 'evaluation/amy_hood_eval_question_reviews.json'),
    'utf8',
  );

  if (options.omitAnswerId) {
    answerKey.answers = answerKey.answers.filter(
      (answer) => answer.questionId !== options.omitAnswerId,
    );
  }

  await writeFile(join(evaluationDir, 'amy_hood_eval_questions.json'), questions);
  await writeFile(
    join(evaluationDir, 'amy_hood_eval_answer_key.json'),
    JSON.stringify(answerKey),
  );
  await writeFile(
    join(evaluationDir, 'amy_hood_eval_question_reviews.json'),
    reviews,
  );
  if (options.manifestSourceId) {
    const dataDir = join(root, 'data/b-track/amy-hood/chunks');
    await mkdir(dataDir, { recursive: true });
    await writeFile(
      join(root, 'data/b-track/amy-hood/source-inventory.json'),
      JSON.stringify([
        {
          source_id: options.manifestSourceId,
          status: options.manifestSourceId === 'earnings_fy2018_q4' ? 'holdout' : 'selected',
        },
      ]),
    );
    await writeFile(
      join(dataDir, 'manifest.json'),
      JSON.stringify([
        {
          chunkId: `${options.manifestSourceId}:0:test`,
          sourceId: options.manifestSourceId,
          index: 0,
          blockIds: ['b1'],
          text: 'GitHub holdout source text',
          tokenCount: 4,
          sha256: 'test-hash',
        },
      ]),
    );
  }
  return root;
};

const createRunnerFixture = async (approved = true) => {
  const root = await createEvaluationFixture();
  const dataDir = join(root, 'data/b-track/amy-hood');
  await mkdir(join(dataDir, 'chunks'), { recursive: true });
  await Promise.all([
    writeFile(
      join(dataDir, 'source-inventory.json'),
      await readFile(
        join(process.cwd(), 'data/b-track/amy-hood/source-inventory.json'),
        'utf8',
      ),
    ),
    writeFile(
      join(dataDir, 'chunks/manifest.json'),
      await readFile(
        join(process.cwd(), 'data/b-track/amy-hood/chunks/manifest.json'),
        'utf8',
      ),
    ),
    writeFile(
      join(dataDir, 'AMY_HOOD_PERSONA.gemma4.md'),
      await readFile(
        join(process.cwd(), 'data/b-track/amy-hood/AMY_HOOD_PERSONA.gemma4.md'),
        'utf8',
      ),
    ),
  ]);
  const reviewPath = join(root, 'evaluation/amy_hood_eval_question_reviews.json');
  const reviews = JSON.parse(await readFile(reviewPath, 'utf8')) as {
    reviews: { status: string; reviewedAt: string | null }[];
  };
  reviews.reviews = reviews.reviews.map((review, index) => ({
    ...review,
    status: approved || index > 0 ? 'approved' : 'unreviewed',
    reviewedAt: approved || index > 0 ? '2026-07-14T00:00:00.000Z' : null,
  }));
  await writeFile(reviewPath, JSON.stringify(reviews));
  return root;
};

const fakeModel = (
  handler: (input: ModelInput) => Promise<ModelResult>,
): ModelClient => ({
  provider: 'local',
  model: 'gemma4-test',
  cacheKey: 'gemma4-test-v1',
  invoke: handler,
});

const inputText = (input: ModelInput) =>
  typeof input === 'string' ? input : `${input.system}\n${input.user}`;

const validModelResult = (input: ModelInput): ModelResult => ({
  text: inputText(input).includes('"choice"')
    ? '{"choice":1,"reason":"재무 규율과 장기 가치를 함께 봅니다."}'
    : '저는 투자를 단계화하겠습니다. 확인된 수요를 우선하겠습니다. 마진과 위험도 함께 관리하겠습니다. 조건을 분명히 두겠습니다. 지표를 분기마다 검토하겠습니다.',
  elapsedMs: 1,
});

const validGrades = (): SubjectiveGrade[] =>
  ['S1', 'S2', 'S3'].map((questionId) => ({
    questionId,
    decision: 2,
    reasoning: 2,
    tradeoff: 1,
    personaConsistency: 1,
    score: 6,
    summary: '결정과 근거는 명확하지만 중단 기준을 더 구체화할 수 있다.',
  }));

const mcQuestion: EvaluationQuestion = {
  id: 'H1',
  kpi: 'github_holdout',
  type: 'multiple_choice',
  prompt: '어떤 결정을 내리겠는가?',
  options: ['첫 번째', '두 번째', '세 번째', '네 번째'],
};

test('happy: loads one versioned 7/5/3 evaluation bundle without exposing answers', async () => {
  const bundle = await loadEvaluationBundle(process.cwd());
  assert.equal(bundle.questions.version, '2.0.0');
  assert.equal(
    bundle.questions.questions.filter(
      (question) => question.kpi === 'past_memory_restoration',
    ).length,
    7,
  );
  assert.equal(
    bundle.questions.questions.filter(
      (question) => question.kpi === 'github_holdout',
    ).length,
    5,
  );
  assert.equal(
    bundle.questions.questions.filter(
      (question) => question.kpi === 'hypothetical_scenario',
    ).length,
    3,
  );
  assert.equal(
    bundle.questions.questions.some((question) => 'correctChoice' in question),
    false,
  );
  assert.deepEqual(
    bundle.questions.questions.map((question) => question.id),
    bundle.answerKey.answers.map((answer) => answer.questionId),
  );
});

test('edge: approved review accepts an empty note', async () => {
  const root = await createEvaluationFixture();
  const saved = await saveQuestionReview(root, 'P1', {
    status: 'approved',
    revisionNote: '',
  });
  assert.equal(
    saved.reviews.find((item) => item.questionId === 'P1')?.revisionNote,
    '',
  );
});

test('edge: revision-required review preserves a Korean instruction', async () => {
  const root = await createEvaluationFixture();
  const note = '2번 선택지를 더 현실적인 단기 매출 방어 논리로 수정해줘.';
  const saved = await saveQuestionReview(root, 'H1', {
    status: 'revision_required',
    revisionNote: note,
  });
  assert.equal(
    saved.reviews.find((item) => item.questionId === 'H1')?.revisionNote,
    note,
  );
});

test('failure: question and answer IDs must match exactly', async () => {
  const root = await createEvaluationFixture({ omitAnswerId: 'H5' });
  await assert.rejects(
    loadEvaluationBundle(root),
    /question and answer IDs must match/,
  );
});

test('happy: past-memory prompt gets one selected chunk and MC instructions', async () => {
  const corpus = await loadSafeEvaluationCorpus(process.cwd());
  const bundle = await loadEvaluationBundle(process.cwd());
  const question = bundle.questions.questions.find((item) => item.id === 'P7');
  assert.ok(question);
  const chunks = retrieveEvaluationEvidence(corpus, question, 'persona_rag');
  assert.equal(chunks.length, 1);
  assert.equal(corpus.selectedSourceIds.has(chunks[0].sourceId), true);
  const input = buildEvaluationInput('PERSONA', question, chunks, 'persona_rag');
  assert.equal(input.system, 'PERSONA');
  assert.match(input.user, /"choice"/);
  assert.match(input.user, /1~2문장/);
  assert.match(input.user, /\[RAG EVIDENCE\]/);
  assert.match(input.user, new RegExp(`source_id: ${chunks[0].sourceId}`));
  assert.match(input.user, new RegExp(`chunk_id: ${chunks[0].chunkId}`));
  assert.match(input.user, /block_ids:/);
  assert.doesNotMatch(input.system, /RAG EVIDENCE/);
});

test('edge: fenced JSON with an explanation preserves choice and reason', () => {
  const parsed = parseEvaluationResponse(
    mcQuestion,
    '```json\n{"choice":3,"reason":"장기 가치와 희석 한도를 함께 봅니다."}\n```',
  );
  assert.deepEqual(parsed, {
    choice: 3,
    reason: '장기 가치와 희석 한도를 함께 봅니다.',
  });
});

test('failure: holdout source in the manifest rejects before prompt construction', async () => {
  const root = await createEvaluationFixture({
    manifestSourceId: 'earnings_fy2018_q4',
  });
  await assert.rejects(
    loadSafeEvaluationCorpus(root),
    /holdout source.*earnings_fy2018_q4/,
  );
});

test('edge: no-RAG arms keep every KPI free of evidence', async () => {
  const corpus = await loadSafeEvaluationCorpus(process.cwd());
  const bundle = await loadEvaluationBundle(process.cwd());
  for (const arm of ['persona_no_rag', 'generic_cfo_no_rag'] as const) {
    for (const id of ['P1', 'H1', 'S1']) {
      const question = bundle.questions.questions.find((item) => item.id === id);
      assert.ok(question);
      const chunks = retrieveEvaluationEvidence(corpus, question, arm);
      assert.deepEqual(chunks, []);
      assert.doesNotMatch(
        buildEvaluationInput('SYSTEM', question, chunks, arm).user,
        /\[RAG EVIDENCE\]/,
      );
    }
  }
});

test('failure: no-RAG arms reject accidental evidence injection', async () => {
  const corpus = await loadSafeEvaluationCorpus(process.cwd());
  const bundle = await loadEvaluationBundle(process.cwd());
  for (const id of ['P1', 'H1', 'S1']) {
    const question = bundle.questions.questions.find((item) => item.id === id);
    assert.ok(question);
    assert.throws(
      () => buildEvaluationInput('SYSTEM', question, [corpus.chunks[0]], 'persona_no_rag'),
      /must not receive RAG evidence/,
    );
  }
});

test('happy: sequential run calls the model once for each question in order', async () => {
  const root = await createRunnerFixture();
  const prompts: ModelInput[] = [];
  const runner = createEvaluationRunner({
    root,
    createModel: () =>
      fakeModel(async (prompt) => {
        prompts.push(prompt);
        return validModelResult(prompt);
      }),
  });

  const queued = await runner.createEvaluationRun({ provider: 'local' });
  const completed = await runner.executeEvaluationRun(queued.runId);

  assert.equal(completed.status, 'complete');
  assert.equal(completed.answers.length, 15);
  assert.equal(prompts.length, 15);
  assert.deepEqual(
    completed.answers.map((answer) => answer.questionId),
    ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'H1', 'H2', 'H3', 'H4', 'H5', 'S1', 'S2', 'S3'],
  );
});

test('happy: evaluation pins the active prompt version and executes immutable content', async () => {
  const root = await createRunnerFixture();
  const first = await readActivePromptVersion(root);
  const prompts: ModelInput[] = [];
  const runner = createEvaluationRunner({
    root,
    createModel: () => fakeModel(async (prompt) => {
      prompts.push(prompt);
      return validModelResult(prompt);
    }),
  });
  const queued = await runner.createEvaluationRun({ provider: 'local' });
  const second = await createPromptVersion(root, {
    content: `${first.content}\nNew inactive version`,
    basedOnVersionId: first.versionId,
  });
  await activatePromptVersion(root, second.versionId);

  const completed = await runner.executeEvaluationRun(queued.runId);

  assert.equal(completed.promptVersionId, first.versionId);
  assert.equal(
    prompts.every((prompt) => !inputText(prompt).includes('New inactive version')),
    true,
  );
});

test('edge: legacy run without promptVersionId remains readable', async () => {
  const root = await createRunnerFixture();
  const runner = createEvaluationRunner({
    root,
    createModel: () => fakeModel(async (prompt) => validModelResult(prompt)),
  });
  const queued = await runner.createEvaluationRun({ provider: 'local' });
  const legacy = { ...queued };
  delete legacy.promptVersionId;
  await writeRun(root, legacy);
  assert.equal((await readRun(root, legacy.runId)).promptVersionId, undefined);
});

test('failure: malformed MC response is retried exactly once', async () => {
  const root = await createRunnerFixture();
  let calls = 0;
  const runner = createEvaluationRunner({
    root,
    createModel: () =>
      fakeModel(async (prompt) => {
        calls += 1;
        if (calls === 1) return { text: '첫 번째가 좋습니다.', elapsedMs: 1 };
        return validModelResult(prompt);
      }),
  });
  const queued = await runner.createEvaluationRun({ provider: 'local' });
  const completed = await runner.executeEvaluationRun(queued.runId);
  assert.equal(completed.status, 'complete');
  assert.equal(calls, 16);
});

test('edge: resume preserves complete answers and starts at the failed question', async () => {
  const root = await createRunnerFixture();
  const prompts: ModelInput[] = [];
  let failed = false;
  const runner = createEvaluationRunner({
    root,
    createModel: () =>
      fakeModel(async (prompt) => {
        prompts.push(prompt);
        if (!failed && prompts.length === 2) {
          failed = true;
          throw new Error('local model unavailable');
        }
        return validModelResult(prompt);
      }),
  });
  const queued = await runner.createEvaluationRun({ provider: 'local' });
  const incomplete = await runner.executeEvaluationRun(queued.runId);
  assert.equal(incomplete.status, 'incomplete');
  assert.equal(incomplete.answers[0].questionId, 'P1');
  assert.equal(incomplete.answers[0].status, 'complete');
  const completed = await runner.resumeEvaluationRun(queued.runId);
  assert.equal(completed.status, 'complete');
  assert.equal(
    prompts.filter((prompt) => inputText(prompt).includes('Office 영구 라이선스')).length,
    1,
  );
});

test('failure: unapproved question set cannot create a run', async () => {
  const root = await createRunnerFixture(false);
  const runner = createEvaluationRunner({
    root,
    createModel: () => fakeModel(async (prompt) => validModelResult(prompt)),
  });
  await assert.rejects(
    runner.createEvaluationRun({ provider: 'local' }),
    /all evaluation questions must be approved/,
  );
});

test('failure: external grades require exact totals and blind keys', async () => {
  const root = await createRunnerFixture();
  const runner = createEvaluationRunner({
    root,
    createModel: () => fakeModel(async (prompt) => validModelResult(prompt)),
  });
  const queued = await runner.createEvaluationRun({ provider: 'local' });
  await runner.executeEvaluationRun(queued.runId);
  const mismatched = validGrades();
  mismatched[0] = { ...mismatched[0], score: 8 };
  await assert.rejects(
    runner.applySubjectiveGrades(queued.runId, mismatched),
    /grade total does not match dimensions/,
  );
  const leaked = validGrades() as Array<SubjectiveGrade & { provider?: string }>;
  leaked[0].provider = 'gemma-4';
  await assert.rejects(
    runner.applySubjectiveGrades(queued.runId, leaked),
    /unknown subjective grade field: provider/,
  );
  const graded = await runner.applySubjectiveGrades(queued.runId, validGrades());
  assert.equal(graded.gradingStatus, 'complete');
  assert.equal(graded.scores.subjective, 18);
});

test('happy: router exposes question review and all run operations', async () => {
  const root = await createRunnerFixture();
  const bundle = await loadEvaluationBundle(root);
  const reviews = JSON.parse(
    await readFile(join(root, 'evaluation/amy_hood_eval_question_reviews.json'), 'utf8'),
  );
  const run = {
    runId: 'run-1',
    status: 'queued' as const,
    gradingStatus: 'pending' as const,
    provider: 'local' as const,
    model: 'gemma4-test',
    promptHash: 'prompt-hash',
    ragSnapshotId: 'rag-hash',
    questionSetVersion: '1.0.0',
    answers: [],
    scores: { pastMemory: 0, githubHoldout: 0, subjective: null },
    startedAt: '2026-07-14T00:00:00.000Z',
    completedAt: null,
  };
  let executionStarted = false;
  const router = createEvaluationRouter({
    loadBundle: async () => bundle,
    loadReviews: async () => reviews,
    saveReview: async () => reviews,
    listRuns: async () => [run],
    readRun: async () => run,
    runner: {
      createEvaluationRun: async () => run,
      executeEvaluationRun: async () => {
        executionStarted = true;
        return run;
      },
      resumeEvaluationRun: async () => run,
      applySubjectiveGrades: async () => run,
    },
  });
  const app = express();
  app.use(express.json());
  app.use('/api/evaluation', router);
  const server = app.listen(0);
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}/api/evaluation`;
  try {
    const questionsResponse = await fetch(`${baseUrl}/questions`);
    assert.equal(questionsResponse.status, 200);
    assert.equal(
      ((await questionsResponse.json()) as { questions: { questions: unknown[] } })
        .questions.questions.length,
      15,
    );
    assert.equal(
      (await fetch(`${baseUrl}/questions/P1/review`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'approved', revisionNote: '' }),
      })).status,
      200,
    );
    assert.equal((await fetch(`${baseUrl}/runs`)).status, 200);
    assert.equal((await fetch(`${baseUrl}/runs/run-1`)).status, 200);
    assert.equal(
      (await fetch(`${baseUrl}/runs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider: 'local' }),
      })).status,
      202,
    );
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(executionStarted, true);
    assert.equal(
      (await fetch(`${baseUrl}/runs/run-1/resume`, { method: 'POST' })).status,
      202,
    );
    assert.equal(
      (await fetch(`${baseUrl}/runs/run-1/subjective-grades`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ grades: validGrades() }),
      })).status,
      200,
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test('failure: supported evaluation code contains no GraphRAG contract or static summary dependency', async () => {
  const forbidden = [
    'server/generateGeneralRagEvaluation.ts',
    'evaluation/amy_hood_decision_eval_questions_10.json',
    'evaluation/amy_hood_decision_eval_questions_15.json',
    'evaluation/amy_hood_eval_full_2017_2019_included.lock.json',
    'evaluation/amy_hood_eval_full_vs_holdout_summary.json',
    'evaluation/amy_hood_eval_holdout_2017_2019_excluded.lock.json',
    'evaluation/general_rag_result.lock.json',
    'evaluation/keyword_rag_result.lock.json',
    'evaluation/rag_graphrag_output_contract.json',
    'evaluation/rag_graphrag_questions.json',
    'evaluation/rag_graphrag_scorecard.csv',
    'evaluation/vector_rag_bge_m3_result.lock.json',
    'evaluation/vector_rag_bge_m3_train_holdout_2017_2019.lock.json',
    'evaluation/amy-hood-persona-eval.local.json',
  ];

  assert.deepEqual(
    forbidden.filter((path) => existsSync(join(process.cwd(), path))),
    [],
  );
  assert.doesNotMatch(
    await readFile(join(process.cwd(), 'src/components/EvaluationView.tsx'), 'utf8'),
    /GraphRAG|full_vs_holdout_summary/,
  );
});
