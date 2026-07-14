# Amy Hood Decision Advisor Phase 3 Event Dataset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert reviewed public sources into exactly 20 auditable decision events, split them 12/4/4, and freeze the 30-question evaluation v3 bundle before policy induction begins.

**Architecture:** Extraction is two-stage: evidence spans first, decision events second. The LLM may propose structure, but deterministic validators and explicit human approval control persistence. Decision-time evidence and post-outcome evidence use separate types and files, and holdout artifacts are sealed from every later build path.

**Tech Stack:** TypeScript 5.8, Gemma 4 OpenAI-compatible local endpoint, JSON Schema-style validation, JSONL, SHA-256, `tsx --test`.

## Global Constraints

- Every approved event has at least one direct Amy Hood statement and one contextual source.
- Prefer two distinct source types per event; missing diversity requires a review note.
- Record considered options, constraints, chosen action, rejected benefit, confidence, and evidence IDs.
- Never use later success or failure as decision-time evidence.
- Freeze exactly 20 events: 12 train, 4 development, 4 holdout.
- Freeze the 30-question v3 questions, sealed answer key, and review file before Phase 4.
- Never return sealed answers or holdout event bodies through a client API.
- Follow the AGENTS.md Test Plan format.

---

### Task 1: Define evidence-span and decision-event contracts

**Files:**
- Modify: `shared/amyHoodDecisionAdvisor.ts`
- Create: `tests/amyHoodAdvisorEventDataset.test.ts`

**Interfaces:**
- Produces: `EvidenceSpan`, `DecisionOption`, `DecisionEvent`, and `PostOutcomeRecord`.

- [ ] **Step 1: Create the test file with its plan and a failing contract test**

```ts
/**
 * Test Plan:
 * 1. Happy Path:
 *    - reviewed evidence becomes a complete decision event and a valid 12/4/4 dataset.
 *
 * 2. Edge Cases:
 *    - an event with exactly two options remains valid.
 *    - a source-diversity exception remains review_required until a reviewer explains it.
 *    - a policy reversal event keeps both the earlier and later decision-time conditions.
 *
 * 3. Failure Path:
 *    - missing direct Amy evidence, outcome leakage, malformed model JSON, or split leakage prevents approval and persistence.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import type { DecisionEvent, EvidenceSpan } from '../shared/amyHoodDecisionAdvisor';

test('happy: evidence and event contracts preserve source-level traceability', () => {
  const span: EvidenceSpan = {
    id: 'evs-001', sourceId: 'src-001', eventCandidateId: 'cand-001',
    evidenceType: 'direct_amy_statement', quote: 'Decision-time statement.',
    startChar: 10, endChar: 34, publishedAt: '2016-01-01', speaker: 'Amy Hood',
    outcomeKnowledge: false, status: 'approved', reviewer: 'reviewer@example.com',
  };
  const event = { id: 'evt-001', evidenceSpanIds: [span.id] } as DecisionEvent;
  assert.equal(event.evidenceSpanIds[0], 'evs-001');
});
```

- [ ] **Step 2: Run and confirm the missing shared types**

```bash
npx tsx --test tests/amyHoodAdvisorEventDataset.test.ts
```

- [ ] **Step 3: Add exact shared contracts**

```ts
export type EvidenceType =
  | 'direct_amy_statement'
  | 'decision_context'
  | 'constraint'
  | 'considered_option'
  | 'post_outcome';

export type EvidenceSpan = {
  id: string;
  sourceId: string;
  eventCandidateId: string;
  evidenceType: EvidenceType;
  quote: string;
  startChar: number;
  endChar: number;
  publishedAt: string;
  speaker: string | null;
  outcomeKnowledge: boolean;
  status: 'review_required' | 'approved' | 'rejected';
  reviewer: string | null;
};

export type DecisionOption = {
  id: string;
  description: string;
  expectedBenefit: string;
  principalRisk: string;
  selected: boolean;
};

export type DecisionEvent = {
  id: string;
  title: string;
  domain: DecisionDomain;
  decisionDate: string;
  decisionQuestion: string;
  situation: string;
  objectives: string[];
  conditions: string[];
  constraints: string[];
  options: DecisionOption[];
  chosenAction: string;
  rejectedBenefit: string;
  reversalSignals: string[];
  observations: string[];
  inferences: string[];
  evidenceSpanIds: string[];
  amyDirectEvidenceIds: string[];
  contextEvidenceIds: string[];
  counterEvidenceIds: string[];
  postOutcomeEvidenceIds: string[];
  sourceIds: string[];
  sourceTypes: string[];
  split: DatasetSplit;
  confidence: 'high' | 'medium' | 'low';
  status: ArtifactStatus;
  reviewNote: string;
  reviewer: string | null;
  reviewedAt: string | null;
};

export type PostOutcomeRecord = {
  id: string;
  eventId: string;
  observedAt: string;
  outcome: string;
  sourceIds: string[];
};
```

- [ ] **Step 4: Rerun and commit**

```bash
npx tsx --test tests/amyHoodAdvisorEventDataset.test.ts
git add shared/amyHoodDecisionAdvisor.ts tests/amyHoodAdvisorEventDataset.test.ts
git commit -m "feat: define advisor event evidence contracts"
```

### Task 2: Extract verifiable evidence spans with one bounded LLM retry

**Files:**
- Create: `agent_prompts/prompts/amy-hood-evidence-span-extractor.md`
- Create: `server/decisionAdvisor/modelClient.ts`
- Create: `server/decisionAdvisor/evidenceExtractor.ts`
- Modify: `tests/amyHoodAdvisorEventDataset.test.ts`

**Interfaces:**
- Produces: `extractEvidenceSpans(rawSource, candidate, deps)` and `validateEvidenceSpan(span, rawText)`.

- [ ] **Step 1: Add failing extraction tests**

Use an injected fake model. Test valid JSON, valid uncommon quote offsets, malformed first response followed by valid retry, and two malformed responses. On terminal failure, assert a `review_required` extraction record exists and no approved span is written.

- [ ] **Step 2: Write the extraction prompt**

Require JSON only and these rules: quote verbatim, preserve character offsets, identify speaker, distinguish decision-time context from post-outcome knowledge, return an empty span list when unsupported, and never infer a quote.

- [ ] **Step 3: Implement the local model client**

Default to `http://localhost:8080/v1/chat/completions`, configurable via environment. Send bounded chunks no larger than 12,000 characters with 500-character overlap so the 16,384-token Gemma context retains prompt and output room. Include stable chunk IDs and deduplicate spans by source ID plus offsets.

- [ ] **Step 4: Implement deterministic validation**

Verify exact substring equality at offsets, nonempty date, source/candidate identity, and `speaker === 'Amy Hood'` for direct statements. A post-outcome span must have `outcomeKnowledge: true`; every other type must be false.

- [ ] **Step 5: Run and commit**

```bash
npx tsx --test tests/amyHoodAdvisorEventDataset.test.ts
git add agent_prompts/prompts/amy-hood-evidence-span-extractor.md server/decisionAdvisor/modelClient.ts server/decisionAdvisor/evidenceExtractor.ts tests/amyHoodAdvisorEventDataset.test.ts
git commit -m "feat: extract advisor evidence spans"
```

### Task 3: Build and validate decision-event proposals

**Files:**
- Create: `agent_prompts/prompts/amy-hood-decision-event-extractor.md`
- Create: `server/decisionAdvisor/eventExtractor.ts`
- Create: `server/decisionAdvisor/eventValidator.ts`
- Create: `server/decisionAdvisor/eventStore.ts`
- Modify: `tests/amyHoodAdvisorEventDataset.test.ts`

**Interfaces:**
- Produces: `proposeDecisionEvent(candidate, spans, deps)`, `validateDecisionEvent(event, spans, sources)`, and atomic event persistence.

- [ ] **Step 1: Add failing validator tests**

Test a complete event, the exactly-two-options boundary, a one-source-type exception, and a reversal. Add failure assertions for no direct Amy span, selected option count other than one, post-outcome span in `evidenceSpanIds`, unknown evidence IDs, and an attempted partial write.

- [ ] **Step 2: Write the event prompt**

Require the model to separate fact from inference and output `conditions`, `constraints`, at least two specific options, exactly one selected option, `chosenAction`, `rejectedBenefit`, and `reversalSignals`. Prohibit outcome evaluation.

- [ ] **Step 3: Implement deterministic validation**

Approval requirements:

```text
direct Amy spans >= 1
decision context spans >= 1
options >= 2
selected options = 1
conditions >= 1
constraints >= 1
source types >= 2, or status=review_required with reviewNote
all evidence outcomeKnowledge=false
all evidence publication dates <= decisionDate
```

Confidence is `high` only with two source types and two direct Amy spans, `medium` with one direct span plus independent context, otherwise `low` and not approvable. `observations` must be directly supported; `inferences` must be labeled and linked to their supporting observations. Keep `postOutcomeEvidenceIds` in the event card for later analysis but exclude them from `evidenceSpanIds`, policy input, and runtime memory.

- [ ] **Step 4: Persist proposals separately from approved split data**

Write proposals to `data/b-track/amy-hood/advisor/events/proposed/`. Only an explicit review command may move normalized content into a split directory.

- [ ] **Step 5: Verify and commit**

```bash
npx tsx --test tests/amyHoodAdvisorEventDataset.test.ts
git add agent_prompts/prompts/amy-hood-decision-event-extractor.md server/decisionAdvisor/eventExtractor.ts server/decisionAdvisor/eventValidator.ts server/decisionAdvisor/eventStore.ts tests/amyHoodAdvisorEventDataset.test.ts
git commit -m "feat: build auditable Amy Hood decision events"
```

### Task 4: Review and freeze exactly 20 events into 12/4/4

**Files:**
- Modify: `server/runAmyHoodDecisionAdvisor.ts`
- Create: `server/decisionAdvisor/datasetFreeze.ts`
- Create: `data/b-track/amy-hood/advisor/events/dataset-manifest.json`
- Modify: `tests/amyHoodAdvisorEventDataset.test.ts`

**Interfaces:**
- CLI: `event:review --id --status --reviewer --note`, `dataset:check`, and `dataset:freeze`.

- [ ] **Step 1: Add failing dataset tests**

Assert exactly 20 approved events, 12/4/4 splits, five-domain coverage, at least 40 approved direct Amy evidence spans across the source corpus, immutable event hashes, and no duplicate source/event IDs. Reject 19 or 21 events, wrong split counts, fewer than 40 approved direct spans, low-confidence approval, missing reviewer, and any holdout ID in a train export.

- [ ] **Step 2: Implement explicit review transitions**

Only `review_required -> approved` and `approved -> superseded` are allowed. Require reviewer and timestamp. Store revisions as new files and preserve superseded hashes.

- [ ] **Step 3: Implement deterministic split freeze**

Read an operator-authored split assignment, validate it, copy immutable event versions into `events/train`, `events/development`, and `events/holdout`, then write a manifest containing IDs, hashes, domain counts, split counts, and `frozenAt`. Never auto-randomize after approval.

- [ ] **Step 4: Review source evidence and freeze the first 20-event release**

Select balanced events from the 30 candidates. Maintain at least two events per domain across the complete dataset and ensure holdout covers more than one domain. Keep unused candidates for later releases.

- [ ] **Step 5: Verify and commit**

```bash
npx tsx --test tests/amyHoodAdvisorEventDataset.test.ts
npx tsx server/runAmyHoodDecisionAdvisor.ts dataset:check
npx tsx server/runAmyHoodDecisionAdvisor.ts dataset:freeze
git add server/runAmyHoodDecisionAdvisor.ts server/decisionAdvisor/datasetFreeze.ts data/b-track/amy-hood/advisor/events tests/amyHoodAdvisorEventDataset.test.ts
git commit -m "data: freeze advisor decision event dataset"
```

### Task 5: Materialize and seal the 30-question evaluation v3 bundle

**Files:**
- Create: `server/evaluationV3/questionSet.ts`
- Create: `evaluation/v3/amy_hood_advisor_questions.json`
- Create: `evaluation/v3/amy_hood_advisor_answer_key.sealed.json`
- Create: `evaluation/v3/amy_hood_advisor_reviews.json`
- Modify: `tests/amyHoodEvaluationV3.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `validateEvaluationV3Bundle(blueprint, questions, answers, reviews, manifest)` and `freezeEvaluationV3Bundle`.

- [ ] **Step 1: Add failing bundle tests**

Assert exact blueprint ID correspondence, four concrete options for every objective item, one answer per question, one review per question, approved review status, evidence references, holdout-only temporal keys, counterfactual pair reversal, and subjective rubrics. Reject generic distractors, duplicated options, answer leakage in question text, or a missing sealed event.

- [ ] **Step 2: Author difficult evidence-backed questions**

Make distractors plausible but subtly wrong in Amy Hood's criterion order. Each trap must encode a named wrong intent such as `growth_before_proof`, `margin_before_learning`, `optionality_without_control`, or `capital_return_before_capacity`. Do not make the correct choice longer or stylistically unique.

- [ ] **Step 3: Seal answers and holdout references**

Write server-only answer data to `amy_hood_advisor_answer_key.sealed.json`. Ensure no UI loader or Vite import references this file. Store only question prompts/options in the public question file.

- [ ] **Step 4: Implement freeze validation and immutability**

Refuse overwrite when the same version exists with a different hash. A changed bundle requires a new semantic version and a new review cycle.

- [ ] **Step 5: Run the phase gate**

```bash
npm run advisor:evaluation-v3:test
npx tsx --test tests/amyHoodAdvisorEventDataset.test.ts
npx tsx server/runAmyHoodDecisionAdvisor.ts dataset:check
npm run evaluation:test
npm run lint
git diff --check
```

Expected: at least 40 direct Amy spans support 20 events validating as 12/4/4; all 30 questions and reviews are frozen; v2 remains green.

- [ ] **Step 6: Commit the frozen evaluation bundle**

```bash
git add server/evaluationV3/questionSet.ts evaluation/v3 package.json tests/amyHoodEvaluationV3.test.ts
git commit -m "data: freeze advisor evaluation v3"
```
