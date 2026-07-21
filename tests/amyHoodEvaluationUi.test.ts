/**
 * Test Plan:
 * 1. Happy Path:
 *    - 질문·정답·검토 응답을 KPI별 검토 카드와 60문항 요약으로 변환한다.
 *
 * 2. Edge Cases:
 *    - 필터가 없는 경우 60문항을 유지한다.
 *    - 승인 메모가 비어 있어도 승인 상태를 표시한다.
 *    - 한국어 수정 메모를 API 요청에서 보존한다.
 *    - 미완료 실행은 생성된 점수를 유지하되 비교 가능 상태가 되지 않는다.
 *
 * 3. Failure Path:
 *    - 비정상 HTTP 응답은 서버 메시지를 포함한 오류로 변환하고 성공 상태를 만들지 않는다.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildQuestionCards,
  compareEvaluationRuns,
  filterQuestionCards,
  summarizeRun,
  summarizeQuestionReviews,
} from '../src/components/evaluation/evaluationViewModel';
import {
  fetchEvaluationQuestions,
  saveEvaluationQuestionReview,
  submitSubjectiveGrades,
  type EvaluationQuestionsResponse,
} from '../src/services/evaluationApi';
import { buildPromptVersionOptions } from '../src/services/promptVersionApi';
import type {
  EvaluationRun,
  SubjectiveGrade,
} from '../shared/amyHoodEvaluation';

const questionResponseFixture = (): EvaluationQuestionsResponse => {
  const ids = [
    ...Array.from({ length: 20 }, (_, index) => `P${index + 1}`),
    ...Array.from({ length: 20 }, (_, index) => `H${index + 1}`),
    ...Array.from({ length: 20 }, (_, index) => `S${index + 1}`),
  ];
  return {
    ok: true,
    questions: {
      dataset: 'amy_hood_blind_evaluation',
      version: '1.0.0',
      subject: 'Amy Hood',
      questions: ids.map((id) => ({
        id,
        kpi: id.startsWith('P')
          ? 'past_memory_restoration'
          : id.startsWith('H')
            ? 'github_holdout'
            : 'hypothetical_scenario',
        type: id.startsWith('S') ? 'subjective' : 'multiple_choice',
        prompt: `${id} 질문`,
        ...(id.startsWith('S')
          ? {}
          : { options: ['1', '2', '3', '4'] as [string, string, string, string] }),
      })),
    },
    answerKey: {
      dataset: 'amy_hood_blind_evaluation_answer_key',
      version: '1.0.0',
      answers: ids.map((questionId) => ({
        questionId,
        ...(questionId.startsWith('S')
          ? {
              rubric: {
                decision: '결론',
                reasoning: '근거',
                tradeoff: '상충관계',
                personaConsistency: '일관성',
              },
            }
          : {
              correctChoice: 1 as const,
              correctIntent: '정답 의도',
              trapIntents: {
                '1': '정답: 정답 의도',
                '2': '함정 2',
                '3': '함정 3',
                '4': '함정 4',
              },
            }),
        evidenceRefs: [],
      })),
    },
    reviews: {
      questionSetVersion: '1.0.0',
      reviews: ids.map((questionId, index) => ({
        questionId,
        status: index === 0 ? 'approved' : 'unreviewed',
        revisionNote: '',
        reviewedAt: index === 0 ? '2026-07-14T00:00:00.000Z' : null,
      })),
    },
  };
};

const runFixture = (
  model: string,
  status: EvaluationRun['status'] = 'complete',
): EvaluationRun => {
  const ids = [
    ...Array.from({ length: 20 }, (_, index) => `P${index + 1}`),
    ...Array.from({ length: 20 }, (_, index) => `H${index + 1}`),
    ...Array.from({ length: 20 }, (_, index) => `S${index + 1}`),
  ];
  return {
    runId: `${model}-run`,
    status,
    gradingStatus: 'pending',
    provider: model === 'gpt-5-mini' ? 'openai' : 'local',
    model,
    promptHash: 'prompt-hash',
    ragSnapshotId: 'rag-hash',
    questionSetVersion: '1.0.0',
    answers: ids.slice(0, status === 'incomplete' ? 3 : 60).map((questionId) => ({
      questionId,
      status: 'complete',
      ...(questionId.startsWith('S')
        ? { text: `${questionId} 주관식 답변` }
        : { choice: 1 as const, reason: '선택 이유', correct: true, objectiveScore: 1 as const }),
      elapsedMs: 1,
    })),
    scores: {
      pastMemory: status === 'incomplete' ? 3 : 20,
      githubHoldout: status === 'incomplete' ? 0 : 20,
      subjective: null,
    },
    startedAt: '2026-07-14T00:00:00.000Z',
    completedAt: status === 'complete' ? '2026-07-14T00:01:00.000Z' : null,
  };
};

const gradeFixture = (): SubjectiveGrade => ({
  questionId: 'S1',
  decision: 2,
  reasoning: 2,
  tradeoff: 1,
  personaConsistency: 1,
  score: 6,
  summary: '결정은 명확하고 중단 기준을 보완할 수 있다.',
});

test('happy: prompt versions keep active marker and newest-first ordering', () => {
  const options = buildPromptVersionOptions({
    activeVersionId: 'v1',
    versions: [
      { versionId: 'v1', createdAt: '2026-07-14T00:00:00.000Z', sha256: 'a', basedOnVersionId: null },
      { versionId: 'v2', createdAt: '2026-07-14T01:00:00.000Z', sha256: 'b', basedOnVersionId: 'v1' },
    ],
  });
  assert.deepEqual(options.map((item) => [item.versionId, item.active]), [['v2', false], ['v1', true]]);
});

test('happy: summarizes the 20/20/20 review queue', () => {
  const cards = buildQuestionCards(questionResponseFixture());
  const summary = summarizeQuestionReviews(cards);
  assert.deepEqual(summary.kpis, {
    past_memory_restoration: 20,
    github_holdout: 20,
    hypothetical_scenario: 20,
  });
  assert.equal(summary.total, 60);
  assert.equal(summary.statuses.approved, 1);
});

test('edge: no filters keeps every question', () => {
  const cards = buildQuestionCards(questionResponseFixture());
  assert.equal(
    filterQuestionCards(cards, { kpi: 'all', status: 'all' }).length,
    60,
  );
});

test('edge: approved review with an empty note remains approved', () => {
  const cards = buildQuestionCards(questionResponseFixture());
  assert.equal(cards[0].review.status, 'approved');
  assert.equal(cards[0].review.revisionNote, '');
});

test('edge: review API preserves a Korean revision instruction', async () => {
  const note = '선택지의 재무적 함정을 더 구체적으로 수정해줘.';
  let requestBody = '';
  const fetchImpl: typeof fetch = async (_input, init) => {
    requestBody = String(init?.body ?? '');
    return new Response(
      JSON.stringify({ ok: true, reviews: questionResponseFixture().reviews }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };
  await saveEvaluationQuestionReview(
    'H1',
    { status: 'revision_required', revisionNote: note },
    fetchImpl,
  );
  assert.equal(JSON.parse(requestBody).revisionNote, note);
});

test('failure: review API propagates a safe server error', async () => {
  const fetchImpl: typeof fetch = async () =>
    new Response(JSON.stringify({ message: 'revision note is required' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  await assert.rejects(
    saveEvaluationQuestionReview(
      'H1',
      { status: 'revision_required', revisionNote: '' },
      fetchImpl,
    ),
    /revision note is required/,
  );
});

test('failure: empty proxy response reports API availability instead of JSON syntax', async () => {
  const fetchImpl: typeof fetch = async () => new Response('', { status: 500 });
  await assert.rejects(
    fetchEvaluationQuestions(fetchImpl),
    /API request failed with 500 and an empty response/,
  );
});

test('edge: non-JSON gateway response keeps status and response text', async () => {
  const fetchImpl: typeof fetch = async () =>
    new Response('Bad Gateway', {
      status: 502,
      headers: { 'content-type': 'text/plain' },
    });
  await assert.rejects(fetchEvaluationQuestions(fetchImpl), /502.*Bad Gateway/);
});

test('failure: network rejection becomes an API connection error', async () => {
  const fetchImpl: typeof fetch = async () => {
    throw new Error('connection refused');
  };
  await assert.rejects(
    fetchEvaluationQuestions(fetchImpl),
    /API request failed: connection refused/,
  );
});

test('happy: compares two complete runs and keeps model metadata visible to the user', () => {
  const rows = compareEvaluationRuns(
    runFixture('gemma-4'),
    runFixture('gpt-5-mini'),
  );
  assert.equal(rows.length, 60);
  assert.equal(rows[0].left.model, 'gemma-4');
  assert.equal(rows[0].right.model, 'gpt-5-mini');
});

test('edge: incomplete run keeps generated scores but is not comparison-ready', () => {
  const run = runFixture('gemma-4', 'incomplete');
  const summary = summarizeRun(run);
  assert.equal(summary.comparisonReady, false);
  assert.equal(summary.completedQuestions, 3);
  assert.equal(summary.pastMemory, 3);
});

test('failure: mismatched subjective total is rejected before fetch', async () => {
  let called = false;
  const fetchImpl: typeof fetch = async () => {
    called = true;
    throw new Error('fetch must not be called');
  };
  const invalid = { ...gradeFixture(), score: 8 };
  await assert.rejects(
    submitSubjectiveGrades('run-1', [invalid], fetchImpl),
    /grade total does not match dimensions/,
  );
  assert.equal(called, false);
});
