/**
 * Test Plan:
 * 1. Happy Path:
 *    - 질문·정답·검토 응답을 KPI별 검토 카드와 15문항 요약으로 변환한다.
 *
 * 2. Edge Cases:
 *    - 필터가 없는 경우 15문항을 유지한다.
 *    - 승인 메모가 비어 있어도 승인 상태를 표시한다.
 *    - 한국어 수정 메모를 API 요청에서 보존한다.
 *
 * 3. Failure Path:
 *    - 비정상 HTTP 응답은 서버 메시지를 포함한 오류로 변환하고 성공 상태를 만들지 않는다.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildQuestionCards,
  filterQuestionCards,
  summarizeQuestionReviews,
} from '../src/components/evaluation/evaluationViewModel';
import {
  saveEvaluationQuestionReview,
  type EvaluationQuestionsResponse,
} from '../src/services/evaluationApi';

const questionResponseFixture = (): EvaluationQuestionsResponse => {
  const ids = [
    'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7',
    'H1', 'H2', 'H3', 'H4', 'H5',
    'S1', 'S2', 'S3',
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

test('happy: summarizes the 7/5/3 review queue', () => {
  const cards = buildQuestionCards(questionResponseFixture());
  const summary = summarizeQuestionReviews(cards);
  assert.deepEqual(summary.kpis, {
    past_memory_restoration: 7,
    github_holdout: 5,
    hypothetical_scenario: 3,
  });
  assert.equal(summary.total, 15);
  assert.equal(summary.statuses.approved, 1);
});

test('edge: no filters keeps every question', () => {
  const cards = buildQuestionCards(questionResponseFixture());
  assert.equal(
    filterQuestionCards(cards, { kpi: 'all', status: 'all' }).length,
    15,
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
