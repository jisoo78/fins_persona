/**
 * Test Plan:
 * 1. Happy Path:
 *    - 승인된 7/5/3 질문·정답 파일을 읽고 동일 버전의 평가 번들을 만든다.
 *
 * 2. Edge Cases:
 *    - 객관식 이유가 설명 문장과 함께 와도 선택 번호와 이유를 보존한다.
 *    - 중단된 실행을 재개하면 완료 문항은 건너뛴다.
 *    - 빈 승인 메모와 한국어 수정 메모를 각각 원형 보존한다.
 *
 * 3. Failure Path:
 *    - 홀드아웃 오염, 질문/정답 ID 불일치, 모델 실패와 원자적 저장 실패는 완료 상태나 부분 덮어쓰기를 만들지 않는다.
 */
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import test from 'node:test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  loadEvaluationBundle,
  saveQuestionReview,
} from '../server/evaluation/questionSet';
import {
  loadSafeEvaluationCorpus,
  retrievePastMemoryEvidence,
} from '../server/evaluation/retriever';
import {
  buildEvaluationPrompt,
  parseEvaluationResponse,
} from '../server/evaluation/prompt';
import type { EvaluationQuestion } from '../shared/amyHoodEvaluation';

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

const mcQuestion: EvaluationQuestion = {
  id: 'H1',
  kpi: 'github_holdout',
  type: 'multiple_choice',
  prompt: '어떤 결정을 내리겠는가?',
  options: ['첫 번째', '두 번째', '세 번째', '네 번째'],
};

test('happy: loads one versioned 7/5/3 evaluation bundle without exposing answers', async () => {
  const bundle = await loadEvaluationBundle(process.cwd());
  assert.equal(bundle.questions.version, '1.0.0');
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
  const chunks = retrievePastMemoryEvidence(corpus, question);
  assert.equal(chunks.length, 1);
  assert.equal(corpus.selectedSourceIds.has(chunks[0].sourceId), true);
  const prompt = buildEvaluationPrompt('PERSONA', question, chunks);
  assert.match(prompt, /"choice"/);
  assert.match(prompt, /1~2문장/);
  assert.match(prompt, /\[RAG EVIDENCE\]/);
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

test('failure: holdout and scenario prompts contain no RAG evidence', async () => {
  const bundle = await loadEvaluationBundle(process.cwd());
  for (const id of ['H1', 'S1']) {
    const question = bundle.questions.questions.find((item) => item.id === id);
    assert.ok(question);
    assert.doesNotMatch(
      buildEvaluationPrompt('PERSONA', question, []),
      /\[RAG EVIDENCE\]/,
    );
  }
});
