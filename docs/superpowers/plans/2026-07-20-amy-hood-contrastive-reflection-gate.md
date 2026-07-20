# Amy Hood Contrastive Reflection Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require evidence-bound condition and action differences for every contrastive reflection, approve at least one supported policy when the sealed data permits it, activate an immutable memory release, and run one four-arm Gemma 4 Evaluation v3 experiment.

**Architecture:** Gemma 4 proposes a compact structured contrast contract, deterministic TypeScript validation checks its schema, canonical actions, event ownership, evidence coverage, and holdout boundary, and Codex records the final semantic review. Only approved reflections feed policy induction; only reviewed deployable policies enter the content-addressed release consumed by Evaluation v3.

**Tech Stack:** TypeScript 5.8, Node.js test runner through `tsx --test`, LangChain `ChatOpenAI`, local Gemma 4 OpenAI-compatible endpoint at `http://127.0.0.1:8080/v1`, JSON artifacts, SHA-256, Vite.

## Global Constraints

- Work in `/Users/hestory/Desktop/fins_persona/.worktrees/amy-hood-decision-advisor` on the existing `codex/amy-hood-decision-advisor` branch.
- Follow TDD for every behavior change: write or extend the test, observe the expected failure, implement the minimum behavior, and rerun focused plus regression tests.
- Preserve the `tests/amyHoodAdvisorPolicyMemory.test.ts` Test Plan: one happy-path category, exactly three realistic edge-case categories, and grouped failure paths.
- A decision axis is `decision object + comparable choice set + observable gating variables`.
- Cross-domain contrast is allowed only when support and contrast use the same decision axis and comparable actions.
- Every support and contrast pattern must carry its own event IDs, conditions, action, and evidence IDs.
- Gemma output is always `review_required`; builders never approve their own artifacts.
- Deterministic validation checks structure and provenance, not the truth of natural-language causal claims.
- Codex must inspect the cited event cards and exact spans before approval or rejection.
- Keep the existing three unapproved Gemma reflections and raw model run for traceability; do not promote them and do not delete them merely because they fail the new contract.
- Permit one initial generation plus one retry generation at most. If no reflection passes Codex review after two builds, stop with the exact evidence gaps.
- Do not activate a release without at least one approved medium/high deployable policy.
- Do not change source collection, the 30 Evaluation v3 questions, Main Prompt content, BGE-M3, or RAG retrieval in this plan.
- Run the real experiment with `repetitions=1`: four arms and 30 questions per arm.

---

## File Structure

### Contrast contract and validation

- Modify `shared/amyHoodDecisionAdvisor.ts`: add `DecisionAxis`, `ReflectionEvidencePattern`, and required contrast fields to `ReflectionMemory`.
- Create `server/decisionAdvisor/decisionAction.ts`: canonicalize a small, explicit action vocabulary without using an LLM.
- Modify `server/decisionAdvisor/reflectionMemory.ts`: parse and validate the structured contract and exact event/evidence ownership.
- Modify `agent_prompts/prompts/amy-hood-reflection-builder.md`: define qualified contrast, forbidden pseudo-contrast, and the exact JSON output.
- Modify `tests/amyHoodAdvisorPolicyMemory.test.ts`: keep the existing test-plan categories while adding qualified and disqualified contrast assertions.

### Human review boundary

- Modify `server/decisionAdvisor/paths.ts`: add rejected reflection and policy directories.
- Modify `server/decisionAdvisor/policyMemoryStore.ts`: persist explicit Codex rejection decisions and exclude rejected proposals from passing sets.
- Modify `server/decisionAdvisor/policyMemoryCli.ts`: add a focused `memory:review` command for one artifact and retain bulk approval only for already-inspected sets.
- Modify `tests/amyHoodAdvisorPolicyMemory.test.ts`: cover approval, rejection, immutable review records, and invalid review input.

### Real artifacts and release

- Generate `data/b-track/amy-hood/advisor/policy-memory/**`: new model runs, structured proposals, Codex reviews, approved/rejected artifacts, and gate report.
- Generate `data/b-track/amy-hood/advisor/memory-releases/**`: one verified release and `active.json`, only if a policy passes.

### One-run Evaluation v3

- Modify `server/evaluationV3/questionSet.ts`: atomically approve all 30 already-reviewed PoC questions.
- Modify `tests/amyHoodEvaluationV3QuestionSet.test.ts`: cover bulk approval and rollback-safe timestamp validation in existing test categories.
- Create `server/runAmyHoodEvaluationV3.ts`: synchronous `approve-all` and `run --repetitions 1` commands.
- Modify `package.json`: add reproducible approval and run scripts.
- Modify `evaluation/v3/public/reviews.json`: persist 30 approved review records.
- Generate `evaluation/v3/runs/*.json`: four immutable run records.
- Create `docs/reports/2026-07-20-amy-hood-phase-4-gemma-evaluation.md`: quantitative outcome and benchmark-integrity judgment.

---

### Task 1: Define and enforce the structured contrast contract

**Files:**
- Modify: `shared/amyHoodDecisionAdvisor.ts`
- Create: `server/decisionAdvisor/decisionAction.ts`
- Modify: `server/decisionAdvisor/reflectionMemory.ts`
- Modify: `agent_prompts/prompts/amy-hood-reflection-builder.md`
- Modify: `tests/amyHoodAdvisorPolicyMemory.test.ts`

**Interfaces:**
- Consumes: existing `ReflectionMemory`, `DecisionDomain`, and free-text Gemma action labels.
- Produces: `DecisionAxis`, `ReflectionEvidencePattern`, `normalizeDecisionAction(value: string): string`, strict parsing, evidence-owned validation, and the required fields `decisionAxis`, `supportPattern`, `contrastPattern`, `conditionDelta`, `actionDelta`.

- [ ] **Step 1: Extend the existing test fixtures with one valid cross-domain contrast contract**

Add this helper near `reflectionResponse` in `tests/amyHoodAdvisorPolicyMemory.test.ts` and spread it into every manually constructed `ReflectionMemory` fixture:

```ts
const qualifiedContrast = {
  decisionAxis: {
    decisionObject: 'strategic_resource_allocation',
    decisionQuestion: 'When should resources be expanded versus reduced or reallocated?',
    choiceSet: ['expand', 'reduce_or_reallocate'],
    gatingVariables: ['observable_growth_opportunity', 'resource_productivity'],
  },
  supportPattern: {
    eventIds: ['event-openai-expansion-2023'],
    conditions: ['Substantial opportunity and growth remain observable.'],
    action: 'expand focused investment',
    evidenceIds: ['span-7a8c1662a2c8a94e'],
  },
  contrastPattern: {
    eventIds: ['event-workforce-reset-2023'],
    conditions: ['Resources are not aligned to the highest-priority work.'],
    action: 'reduce or reallocate resources',
    evidenceIds: ['span-f031de15863e849e'],
  },
  conditionDelta: 'Opportunity remains substantial versus resources being below priority.',
  actionDelta: 'Expand focused investment versus reduce or reallocate lower-priority resources.',
};
```

Add these exact fields to the first object inside `reflectionResponse`:

```ts
decisionAxis: {
  decisionObject: 'strategic_transaction_structure',
  decisionQuestion: 'When should strategic reach use acquisition rather than partnership?',
  choiceSet: ['acquire', 'partner'],
  gatingVariables: ['control_requirement', 'lower_commitment_access'],
},
supportPattern: {
  eventIds: [
    'event-linkedin-acquisition-2016',
    'event-activision-acquisition-2022',
  ],
  conditions: ['The selected structure is a complete all-cash acquisition.'],
  action: 'acquire',
  evidenceIds: ['span-0b8c7fcb7c5c77af', 'span-807ee90aa032f320'],
},
contrastPattern: {
  eventIds: ['event-openai-expansion-2023'],
  conditions: ['Independent commercialization remains inside a long-term collaboration.'],
  action: 'partner',
  evidenceIds: ['span-d7a1fe8155e1f9ca'],
},
conditionDelta: 'Complete transaction ownership versus independent commercialization in collaboration.',
actionDelta: 'Acquire the company versus deepen a strategic partnership.',
```

Replace `span-7a8c1662a2c8a94e` with `span-d7a1fe8155e1f9ca` in that reflection's top-level `evidenceIds` and in `repeatedEventPolicyResponse`. The former span states a general investment principle; the latter is the exact OpenAI partnership and independent-commercialization evidence needed by this fixture.

In the existing happy path, add a direct validation assertion for a purpose-built cross-domain reflection:

```ts
const crossDomain = {
  ...approveReflectionForFixture(result.artifacts[0]),
  id: 'reflection-cross-domain-fixture',
  domain: 'ai_cloud_capex',
  supportingEventIds: qualifiedContrast.supportPattern.eventIds,
  contrastingEventIds: qualifiedContrast.contrastPattern.eventIds,
  evidenceIds: [
    ...qualifiedContrast.supportPattern.evidenceIds,
    ...qualifiedContrast.contrastPattern.evidenceIds,
  ],
  ...qualifiedContrast,
};
assert.equal(validateReflectionMemory(crossDomain, graph).passed, true);
```

- [ ] **Step 2: Extend the existing three edge categories and grouped failure tests**

Inside `edge: a material contrast narrows the reflection boundary`, retain the existing boundary assertion and add:

```ts
assert.equal(validateReflectionMemory(result.artifacts[0], graph).passed, true);
assert.equal(result.artifacts[0].supportPattern.action, 'acquire');
assert.equal(result.artifacts[0].contrastPattern.action, 'partner');
```

Inside `edge: direct Amy principle plus independent confirmation qualifies as medium`, add action normalization assertions:

```ts
assert.equal(normalizeDecisionAction('expand focused investment'), 'expand');
assert.equal(normalizeDecisionAction('increase investment'), 'expand');
assert.equal(normalizeDecisionAction('reduce or reallocate resources'), 'reduce_or_reallocate');
```

Inside `edge: rebuilding identical approved content returns the same release`, build the same proposal with reversed pattern arrays and assert canonical identity before the release assertions:

```ts
const reversedPayload = JSON.parse(reflectionResponse) as {
  reflections: Array<{
    supportPattern: { eventIds: string[]; evidenceIds: string[] };
    contrastPattern: { eventIds: string[]; evidenceIds: string[] };
  }>;
};
reversedPayload.reflections[0].supportPattern.eventIds.reverse();
reversedPayload.reflections[0].supportPattern.evidenceIds.reverse();
reversedPayload.reflections[0].contrastPattern.eventIds.reverse();
reversedPayload.reflections[0].contrastPattern.evidenceIds.reverse();
const reordered = await buildReflectionProposals(
  fixture.graph,
  createFixtureModel(JSON.stringify(reversedPayload)),
);
const original = await buildReflectionProposals(
  fixture.graph,
  createFixtureModel(reflectionResponse),
);
assert.equal(reordered.artifacts[0].id, original.artifacts[0].id);
```

Inside `failure: invalid or unsupported reflections never validate as memory`, add:

```ts
const sameAction = structuredClone(crossDomain);
sameAction.contrastPattern.action = 'increase investment';
assert.match(
  validateReflectionMemory(sameAction, graph).errors.join('\n'),
  /support and contrast actions must differ/,
);

const wrongOwner = structuredClone(crossDomain);
wrongOwner.contrastPattern.evidenceIds = ['span-7a8c1662a2c8a94e'];
assert.match(
  validateReflectionMemory(wrongOwner, graph).errors.join('\n'),
  /contrast evidence does not belong to its event/,
);

const missingCondition = structuredClone(crossDomain);
missingCondition.supportPattern.conditions = [];
assert.match(
  validateReflectionMemory(missingCondition, graph).errors.join('\n'),
  /support pattern requires conditions/,
);

const mismatchedEvidence = structuredClone(crossDomain);
mismatchedEvidence.evidenceIds = ['span-7a8c1662a2c8a94e'];
assert.match(
  validateReflectionMemory(mismatchedEvidence, graph).errors.join('\n'),
  /pattern evidence must equal reflection evidence/,
);
```

- [ ] **Step 3: Run the focused test and confirm the contract is absent**

Run:

```bash
npx tsx --test tests/amyHoodAdvisorPolicyMemory.test.ts
```

Expected: FAIL because the shared contrast fields and `decisionAction.ts` do not exist, or because current validation accepts same-action and wrong-owner pseudo-contrasts.

- [ ] **Step 4: Add the public contract types**

Insert before `ReflectionMemory` in `shared/amyHoodDecisionAdvisor.ts`:

```ts
export type DecisionAxis = {
  decisionObject: string;
  decisionQuestion: string;
  choiceSet: string[];
  gatingVariables: string[];
};

export type ReflectionEvidencePattern = {
  eventIds: string[];
  conditions: string[];
  action: string;
  evidenceIds: string[];
};
```

Add these required properties after `unresolvedConflicts` in `ReflectionMemory`:

```ts
decisionAxis: DecisionAxis;
supportPattern: ReflectionEvidencePattern;
contrastPattern: ReflectionEvidencePattern;
conditionDelta: string;
actionDelta: string;
```

- [ ] **Step 5: Implement deterministic action normalization**

Create `server/decisionAdvisor/decisionAction.ts`:

```ts
const normalizedText = (value: string) => value
  .normalize('NFKC')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '');

const aliases: Array<[RegExp, string]> = [
  [/^(?:expand|increase|invest_more|expand_focused_investment|increase_investment)$/, 'expand'],
  [/^(?:maintain|hold|continue_current_level)$/, 'maintain'],
  [/^(?:reduce|reallocate|reduce_or_reallocate|reduce_or_reallocate_resources)$/, 'reduce_or_reallocate'],
  [/^(?:acquire|acquisition|buy)$/, 'acquire'],
  [/^(?:partner|partnership|strategic_partnership)$/, 'partner'],
  [/^(?:build|organic_build|build_internally)$/, 'build'],
  [/^(?:price|list_price|charge)$/, 'price'],
  [/^(?:bundle|include_without_separate_price)$/, 'bundle'],
];

export const normalizeDecisionAction = (value: string) => {
  const normalized = normalizedText(value);
  return aliases.find(([expression]) => expression.test(normalized))?.[1] ?? normalized;
};
```

This deliberately uses a small explicit vocabulary. Do not add fuzzy similarity or an LLM call.

- [ ] **Step 6: Make a legacy-format Gemma response fail the parser contract**

In the grouped invalid-reflection test, derive a legacy response by removing the five new fields from the otherwise valid fixture. This keeps the test self-contained while representing the retained 2026-07-20 Gemma output format:

```ts
const legacyPayload = JSON.parse(reflectionResponse) as {
  reflections: Array<Record<string, unknown>>;
};
for (const reflection of legacyPayload.reflections) {
  delete reflection.decisionAxis;
  delete reflection.supportPattern;
  delete reflection.contrastPattern;
  delete reflection.conditionDelta;
  delete reflection.actionDelta;
}
const legacyResponse = JSON.stringify(legacyPayload);
const legacy = await buildReflectionProposals(
  graph,
  createFixtureModel(legacyResponse, legacyResponse),
);
assert.equal(legacy.modelRun.status, 'failed');
assert.equal(legacy.modelRun.attemptCount, 2);
assert.equal(legacy.artifacts.length, 0);
```

- [ ] **Step 7: Run the focused test and confirm the legacy response still passes or parses**

Run:

```bash
npx tsx --test tests/amyHoodAdvisorPolicyMemory.test.ts
```

Expected: FAIL because current parsing does not require the structured contrast fields.

- [ ] **Step 8: Add strict schema helpers to `reflectionMemory.ts`**

Import the new types and normalizer, then add:

```ts
const nonemptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const validAxis = (value: unknown): value is DecisionAxis => {
  if (!value || typeof value !== 'object') return false;
  const axis = value as Partial<DecisionAxis>;
  return nonemptyString(axis.decisionObject)
    && nonemptyString(axis.decisionQuestion)
    && nonemptyStrings(axis.choiceSet)
    && new Set(axis.choiceSet.map(normalizeDecisionAction)).size >= 2
    && nonemptyStrings(axis.gatingVariables);
};

const validPattern = (value: unknown): value is ReflectionEvidencePattern => {
  if (!value || typeof value !== 'object') return false;
  const pattern = value as Partial<ReflectionEvidencePattern>;
  return nonemptyStrings(pattern.eventIds)
    && nonemptyStrings(pattern.conditions)
    && nonemptyString(pattern.action)
    && nonemptyStrings(pattern.evidenceIds);
};
```

Extend the parser condition with:

```ts
|| !validAxis(item.decisionAxis)
|| !validPattern(item.supportPattern)
|| !validPattern(item.contrastPattern)
|| !nonemptyString(item.conditionDelta)
|| !nonemptyString(item.actionDelta)
```

- [ ] **Step 9: Add exact set and ownership validation**

Add these helpers:

```ts
const sameSet = (left: string[], right: string[]) => {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  return leftSet.size === rightSet.size && [...leftSet].every((value) => rightSet.has(value));
};

const patternEvidenceBelongsToEvents = (
  pattern: ReflectionEvidencePattern,
  graph: PolicyMemoryInputGraph,
) => {
  const candidateIds = new Set(graph.events
    .filter(({ id }) => pattern.eventIds.includes(id))
    .map(({ candidateId }) => candidateId));
  return pattern.evidenceIds.every((evidenceId) => {
    const span = graph.evidenceSpans.find(({ id }) => id === evidenceId);
    return Boolean(span && candidateIds.has(span.eventCandidateId));
  });
};
```

After current support/contrast checks, add:

```ts
if (!validAxis(reflection.decisionAxis)) errors.push('reflection requires a valid decision axis');
if (!validPattern(reflection.supportPattern)) errors.push('support pattern requires conditions, action, events, and evidence');
if (!validPattern(reflection.contrastPattern)) errors.push('contrast pattern requires conditions, action, events, and evidence');
if (!sameSet(reflection.supportPattern.eventIds, reflection.supportingEventIds)) {
  errors.push('support pattern events must equal supporting events');
}
if (!sameSet(reflection.contrastPattern.eventIds, reflection.contrastingEventIds)) {
  errors.push('contrast pattern events must equal contrasting events');
}
const supportAction = normalizeDecisionAction(reflection.supportPattern.action);
const contrastAction = normalizeDecisionAction(reflection.contrastPattern.action);
const choices = new Set(reflection.decisionAxis.choiceSet.map(normalizeDecisionAction));
if (!choices.has(supportAction) || !choices.has(contrastAction)) {
  errors.push('support and contrast actions must belong to the decision-axis choice set');
}
if (supportAction === contrastAction) {
  errors.push('support and contrast actions must differ');
}
if (!patternEvidenceBelongsToEvents(reflection.supportPattern, graph)) {
  errors.push('support evidence does not belong to its event');
}
if (!patternEvidenceBelongsToEvents(reflection.contrastPattern, graph)) {
  errors.push('contrast evidence does not belong to its event');
}
const patternEvidence = [
  ...reflection.supportPattern.evidenceIds,
  ...reflection.contrastPattern.evidenceIds,
];
if (!sameSet(patternEvidence, reflection.evidenceIds)) {
  errors.push('pattern evidence must equal reflection evidence');
}
if (!nonemptyString(reflection.conditionDelta)) errors.push('reflection requires condition delta');
if (!nonemptyString(reflection.actionDelta)) errors.push('reflection requires action delta');
```

Retain the existing holdout scan over the entire canonical reflection so the new text and IDs are covered automatically.

- [ ] **Step 10: Canonicalize nested arrays before computing the reflection ID**

In `toReflectionMemory`, replace the canonical construction with:

```ts
const canonical = {
  ...proposal,
  decisionAxis: {
    ...proposal.decisionAxis,
    choiceSet: [...new Set(proposal.decisionAxis.choiceSet.map(normalizeDecisionAction))].sort(),
    gatingVariables: [...new Set(proposal.decisionAxis.gatingVariables)].sort(),
  },
  supportPattern: {
    ...proposal.supportPattern,
    action: normalizeDecisionAction(proposal.supportPattern.action),
    eventIds: [...new Set(proposal.supportPattern.eventIds)].sort(),
    conditions: [...new Set(proposal.supportPattern.conditions)].sort(),
    evidenceIds: [...new Set(proposal.supportPattern.evidenceIds)].sort(),
  },
  contrastPattern: {
    ...proposal.contrastPattern,
    action: normalizeDecisionAction(proposal.contrastPattern.action),
    eventIds: [...new Set(proposal.contrastPattern.eventIds)].sort(),
    conditions: [...new Set(proposal.contrastPattern.conditions)].sort(),
    evidenceIds: [...new Set(proposal.contrastPattern.evidenceIds)].sort(),
  },
  boundaryConditions: [...new Set(proposal.boundaryConditions)].sort(),
  unresolvedConflicts: [...new Set(proposal.unresolvedConflicts)].sort(),
  supportingEventIds: [...new Set(proposal.supportingEventIds)].sort(),
  contrastingEventIds: [...new Set(proposal.contrastingEventIds)].sort(),
  evidenceIds: [...new Set(proposal.evidenceIds)].sort(),
};
```

- [ ] **Step 11: Replace the reflection prompt with the complete strict contract**

Set `agent_prompts/prompts/amy-hood-reflection-builder.md` to:

```markdown
# Role

You derive bounded cross-event decision reflections from supplied approved evidence.

# Qualified contrast

A contrast is qualified only when support and contrast answer the same decision question, use comparable choices, show an observable condition change, take materially different actions, and cite evidence for both sides. Different domains are allowed only when this same decision axis is explicit.

Do not label complementary actions as contrast. Reducing low-priority resources while increasing high-growth investment is one supporting allocation pattern, not an automatic contrast. Different dates, industries, transaction sizes, or labels alone are not contrast.

# Rules

- Use only supplied event and evidence IDs.
- Every reflection requires at least one support event and one materially contrasting event.
- Put both canonical actions in `decisionAxis.choiceSet`.
- Map every support and contrast event to its own conditions, action, and exact evidence IDs.
- `conditionDelta` must state the observable change; `actionDelta` must state the resulting action change.
- Separate observations from inferences.
- Do not use post-outcome success, private motives, personality adjectives, or universal claims.
- If the supplied evidence contains no qualified contrast, return `{"reflections":[]}`.
- Return JSON only. Do not wrap JSON in Markdown.

# Output

Return one object with a `reflections` array. Every item must contain:

- `domain`
- `crossEventQuestion`
- `observation`
- `invariant`
- `boundaryConditions`
- `unresolvedConflicts`
- `decisionAxis` with `decisionObject`, `decisionQuestion`, `choiceSet`, `gatingVariables`
- `supportPattern` with `eventIds`, `conditions`, `action`, `evidenceIds`
- `contrastPattern` with `eventIds`, `conditions`, `action`, `evidenceIds`
- `conditionDelta`
- `actionDelta`
- `supportingEventIds`
- `contrastingEventIds`
- `evidenceIds`
```

- [ ] **Step 12: Run focused and regression tests**

Run:

```bash
npm run advisor:policy-memory:test
npm run evaluation:v3:test
npm run lint
git diff --check
```

Expected: policy-memory tests pass, the retained legacy response fails after exactly two parse attempts, Evaluation v3 remains 42/42, and TypeScript reports no errors.

- [ ] **Step 13: Commit the strict builder and validator**

```bash
git add shared/amyHoodDecisionAdvisor.ts server/decisionAdvisor/decisionAction.ts server/decisionAdvisor/reflectionMemory.ts agent_prompts/prompts/amy-hood-reflection-builder.md tests/amyHoodAdvisorPolicyMemory.test.ts
git commit -m "feat: enforce qualified contrastive reflections"
```

---

### Task 2: Record selective Codex approval and rejection decisions

**Files:**
- Modify: `server/decisionAdvisor/paths.ts`
- Modify: `server/decisionAdvisor/policyMemoryStore.ts`
- Modify: `server/decisionAdvisor/policyMemoryCli.ts`
- Modify: `tests/amyHoodAdvisorPolicyMemory.test.ts`

**Interfaces:**
- Consumes: one stored reflection or policy proposal, current `PolicyMemoryInputGraph`, and a Codex review decision.
- Produces: `reviewPolicyMemoryArtifact(root, input, graph)`, immutable approved/rejected artifact copies, and `memory:review --kind ... --id ... --decision ...`.

- [ ] **Step 1: Add approval and rejection assertions to existing test categories**

In the happy path, replace the first direct approval call with:

```ts
const approvedReflection = await reviewPolicyMemoryArtifact(storeRoot, {
  kind: 'reflection',
  id: result.artifacts[0].id,
  reviewer: 'Codex',
  reviewedAt: '2026-07-20T09:30:00.000Z',
  decision: 'approved',
  rationale: 'The cited conditions, actions, and evidence form one qualified decision axis.',
}, graph) as ReflectionMemory;
assert.equal(approvedReflection.status, 'approved');
```

In the grouped approval failure test, save a second proposal and reject it:

```ts
const rejected = await reviewPolicyMemoryArtifact(root, {
  kind: 'reflection',
  id,
  reviewer: 'Codex',
  reviewedAt: '2026-07-20T10:06:00.000Z',
  decision: 'rejected',
  rationale: 'The cited events are complementary rather than contrastive.',
}, graph) as ReflectionMemory;
assert.equal(rejected.status, 'rejected');
assert.equal(rejected.review?.decision, 'rejected');
assert.equal((await buildPolicyMemoryGateReport(root, graph)).passing.reflections.includes(id), false);
```

Add CLI dispatch assertions:

```ts
assert.equal(await runPolicyMemoryCommand(root, [
  'memory:review', '--kind', 'reflection', '--id', id,
  '--decision', 'rejected', '--reviewer', 'Codex',
  '--rationale', 'The evidence does not establish a qualified contrast.',
], deps), true);
await assert.rejects(
  () => runPolicyMemoryCommand(root, [
    'memory:review', '--kind', 'reflection', '--id', id,
    '--decision', 'approved', '--reviewer', 'Codex', '--rationale', ' ',
  ], deps),
  /nonblank --rationale/,
);
```

- [ ] **Step 2: Run and confirm selective review is absent**

Run:

```bash
npx tsx --test tests/amyHoodAdvisorPolicyMemory.test.ts
```

Expected: FAIL because `reviewPolicyMemoryArtifact` and `memory:review` do not exist.

- [ ] **Step 3: Add deterministic rejected paths**

Add to `advisorPaths(root)`:

```ts
rejectedReflections: path.resolve(advisorRoot, 'policy-memory/rejected/reflections'),
rejectedPolicies: path.resolve(advisorRoot, 'policy-memory/rejected/policies'),
```

Change `approvedPath` in `policyMemoryStore.ts` to a destination selector:

```ts
const reviewedArtifactPath = (
  root: string,
  kind: 'reflection' | 'policy',
  decision: 'approved' | 'rejected',
  id: string,
) => {
  assertArtifactId(kind, id);
  const paths = advisorPaths(root);
  const directory = decision === 'approved'
    ? kind === 'reflection' ? paths.approvedReflections : paths.approvedPolicies
    : kind === 'reflection' ? paths.rejectedReflections : paths.rejectedPolicies;
  return path.join(directory, `${id}.json`);
};
```

- [ ] **Step 4: Generalize approval into explicit review**

Extend the input contract:

```ts
export type PolicyMemoryReviewInput = {
  kind: 'reflection' | 'policy';
  id: string;
  reviewer: 'Codex';
  reviewedAt: string;
  decision: 'approved' | 'rejected';
  rationale: string;
};
```

Create:

```ts
export const reviewPolicyMemoryArtifact = async (
  root: string,
  input: PolicyMemoryReviewInput,
  graph: PolicyMemoryInputGraph,
  dependencies: StoreDependencies = defaultDependencies,
): Promise<ReflectionMemory | PolicyMemory> => {
  assertReviewInput(input);
  const proposal = await readJsonFile<ReflectionMemory | PolicyMemory | null>(
    proposalPath(root, input.kind, input.id),
    null,
  );
  if (!proposal) throw new Error(`unknown ${input.kind} proposal: ${input.id}`);
  const validation = input.kind === 'reflection'
    ? validateReflectionMemory(proposal as ReflectionMemory, graph)
    : validatePolicyMemory(
      proposal as PolicyMemory,
      await loadApprovedReflections(root),
      graph,
    );
  if (input.decision === 'approved' && !validation.passed) {
    throw new Error(`cannot approve ${input.id}: ${validation.errors.join('; ')}`);
  }
  if (input.decision === 'approved' && input.kind === 'policy') {
    const policy = proposal as PolicyMemory;
    if (policy.policyKind !== 'deployable_policy' || validation.computedConfidence === 'low') {
      throw new Error(`cannot approve nondeployable policy: ${input.id}`);
    }
  }
  const review: ArtifactReview = {
    reviewer: 'Codex',
    reviewedAt: input.reviewedAt,
    decision: input.decision,
    rationale: input.rationale.trim(),
    validationHash: sha256(canonicalJson(validation)),
  };
  const reviewed = {
    ...proposal,
    confidence: validation.computedConfidence,
    status: input.decision,
    review,
  };
  await commitApprovalPairWithRollback(
    reviewedArtifactPath(root, input.kind, input.decision, input.id),
    reviewed,
    reviewPath(root, input.kind, input.id),
    review,
    dependencies,
  );
  return reviewed;
};
```

Keep `approvePolicyMemoryArtifact` as this compatibility wrapper:

```ts
export const approvePolicyMemoryArtifact = async (
  root: string,
  input: PolicyMemoryApprovalInput,
  graph: PolicyMemoryInputGraph,
  dependencies: StoreDependencies = defaultDependencies,
) => reviewPolicyMemoryArtifact(root, {
  ...input,
  decision: 'approved',
}, graph, dependencies);
```

- [ ] **Step 5: Exclude reviewed rejections from passing gate output**

Add loaders next to the approved loaders:

```ts
export const loadRejectedReflections = (root: string) =>
  readDirectoryJson<ReflectionMemory>(advisorPaths(root).rejectedReflections);

export const loadRejectedPolicies = (root: string) =>
  readDirectoryJson<PolicyMemory>(advisorPaths(root).rejectedPolicies);
```

Load both arrays in `buildPolicyMemoryGateReport`, then build the ID set:

```ts
const rejectedIds = new Set([
  ...rejectedReflections.map(({ id }) => id),
  ...rejectedPolicies.map(({ id }) => id),
]);
const rejected = [...rejectedIds].sort().map((id) => `review_rejected:${id}`);
```

Replace the two passing arrays and blocked array with:

```ts
passing: {
  reflections: reflectionResults
    .filter(({ artifact, validation }) =>
      validation.passed && !rejectedIds.has(artifact.id))
    .map(({ artifact }) => artifact.id)
    .sort(),
  policies: policyResults
    .filter(({ artifact, validation }) =>
      validation.passed
      && validation.computedConfidence !== 'low'
      && artifact.policyKind === 'deployable_policy'
      && !rejectedIds.has(artifact.id))
    .map(({ artifact }) => artifact.id)
    .sort(),
},
blocked: [
  ...modelRuns.filter(({ status }) => status === 'failed').map(({ id }) => id),
  ...rejected,
].sort(),
```

- [ ] **Step 6: Add `memory:review` dispatch**

In `policyMemoryCli.ts`, parse exact options and call the review function:

```ts
const runReview = async (
  root: string,
  args: string[],
  dependencies: PolicyMemoryCliDependencies,
) => {
  const kind = requiredKind(args);
  const id = optionValue(args, '--id');
  const decision = optionValue(args, '--decision');
  const rationale = optionValue(args, '--rationale');
  if (!id || (decision !== 'approved' && decision !== 'rejected')
    || optionValue(args, '--reviewer') !== 'Codex' || !rationale?.trim()) {
    throw new Error(
      'memory:review requires --id --decision approved|rejected '
      + '--reviewer Codex and a nonblank --rationale',
    );
  }
  const graph = await loadPolicyMemoryInput(root);
  const artifact = await reviewPolicyMemoryArtifact(root, {
    kind,
    id,
    decision,
    reviewer: 'Codex',
    reviewedAt: dependencies.now(),
    rationale,
  }, graph);
  dependencies.log(JSON.stringify(artifact, null, 2));
  return true;
};
```

Add `if (command === 'memory:review') return runReview(root, args, dependencies);` before the unknown-command error.

- [ ] **Step 7: Verify and commit the review boundary**

Run:

```bash
npm run advisor:policy-memory:test
npm run lint
git diff --check
```

Expected: all 9 grouped tests pass, rejected artifacts cannot appear in passing IDs, and invalid review input produces no partial artifact or review file.

Commit:

```bash
git add server/decisionAdvisor/paths.ts server/decisionAdvisor/policyMemoryStore.ts server/decisionAdvisor/policyMemoryCli.ts tests/amyHoodAdvisorPolicyMemory.test.ts
git commit -m "feat: record policy memory review decisions"
```

---

### Task 3: Generate, inspect, approve, and activate one real policy-memory release

**Files:**
- Generate: `data/b-track/amy-hood/advisor/policy-memory/**`
- Generate: `data/b-track/amy-hood/advisor/memory-releases/**`

**Interfaces:**
- Consumes: five approved non-holdout event cards, verified evidence, strict reflection builder, local Gemma 4, and Codex review commands.
- Produces: at least one approved structured reflection, at least one approved deployable policy, or an exact two-attempt evidence-gap stop; on success, one verified active release.

- [ ] **Step 1: Verify Gemma and capture the current active-pointer baseline**

Run:

```bash
curl --fail --silent http://127.0.0.1:8080/v1/models | jq '.data[0].id'
if test -f data/b-track/amy-hood/advisor/memory-releases/active.json; then
  shasum -a 256 data/b-track/amy-hood/advisor/memory-releases/active.json
else
  echo NO_ACTIVE_RELEASE
fi
```

Expected: the model is `gemma4-v2-Q8_0.gguf`; the active baseline is recorded before any write.

- [ ] **Step 2: Run the first strict reflection generation and gate report**

```bash
LOCAL_LLM_MODEL=gemma4-v2-Q8_0.gguf npm run advisor:memory:build -- --kind reflection
npm run advisor:memory:check
jq '.passing.reflections, .reviewRequired, .blocked' data/b-track/amy-hood/advisor/policy-memory/gate-report.json
```

Expected: legacy proposals are `reviewRequired` under the new schema; only new structured proposals may appear under `passing.reflections`.

- [ ] **Step 3: Inspect every automatically passing reflection against exact evidence**

Inspect every automatically passing reflection and all of its evidence with this exact loop:

```bash
while IFS= read -r reflection_id; do
  proposal="data/b-track/amy-hood/advisor/policy-memory/proposals/reflections/${reflection_id}.json"
  jq '.' "$proposal"
  while IFS= read -r evidence_id; do
    rg -n -B 5 -A 12 "\"id\": \"${evidence_id}\"" \
      data/b-track/amy-hood/advisor/events/pilot/*.json
  done < <(jq -r '.evidenceIds[]' "$proposal")
done < <(jq -r '.passing.reflections[]' \
  data/b-track/amy-hood/advisor/policy-memory/gate-report.json)
```

Codex approves only if the same decision object, comparable choices, observable condition delta, material action delta, and both evidence sides are supported. Record rejection with:

```bash
reflection_id=$(jq -r '.passing.reflections[0] // empty' \
  data/b-track/amy-hood/advisor/policy-memory/gate-report.json)
npx tsx server/runAmyHoodDecisionAdvisor.ts memory:review \
  --kind reflection \
  --id "$reflection_id" \
  --decision rejected \
  --reviewer Codex \
  --rationale "The cited events do not establish the stated condition and action contrast."
```

- [ ] **Step 4: Permit exactly one second reflection generation when none is approved**

If the first generation yields no approvable reflection, run exactly once more:

```bash
LOCAL_LLM_MODEL=gemma4-v2-Q8_0.gguf npm run advisor:memory:build -- --kind reflection
npm run advisor:memory:check
```

Inspect and review the second proposal set by the same rules. If none qualifies, stop Task 3 and Task 4, preserve all model runs and rejection reasons, and report `approved reflection count = 0; sealed event evidence lacks a qualified contrast`.

- [ ] **Step 5: Approve only individually inspected reflections**

For every qualifying ID:

```bash
approved_reflection_id=$(jq -r '.passing.reflections[0] // empty' \
  data/b-track/amy-hood/advisor/policy-memory/gate-report.json)
test -n "$approved_reflection_id"
npx tsx server/runAmyHoodDecisionAdvisor.ts memory:review \
  --kind reflection \
  --id "$approved_reflection_id" \
  --decision approved \
  --reviewer Codex \
  --rationale "Approved after checking one decision axis, observable condition delta, material action delta, exact support and contrast evidence, and holdout exclusion."
```

Verify:

```bash
find data/b-track/amy-hood/advisor/policy-memory/approved/reflections -name '*.json' -maxdepth 1 | sort
npm run advisor:memory:check
```

Expected: at least one approved reflection; rejected and legacy proposals are absent from the approved directory.

- [ ] **Step 6: Build policies with Gemma and inspect every passing proposal**

```bash
LOCAL_LLM_MODEL=gemma4-v2-Q8_0.gguf npm run advisor:memory:build -- --kind policy
npm run advisor:memory:check
jq '.passing.policies, .reviewRequired, .blocked' data/b-track/amy-hood/advisor/policy-memory/gate-report.json
```

For each passing policy, inspect the policy, all referenced reflections, and exact spans. Confirm its applicability conditions, priority order, exception, and reversal signal are bounded by the approved reflection. Reject unsupported policies with `memory:review --kind policy --decision rejected`; approve only a supported medium/high `deployable_policy` with `--decision approved`.

Use this loop to inspect all policy proposals and cited spans:

```bash
while IFS= read -r policy_id; do
  proposal="data/b-track/amy-hood/advisor/policy-memory/proposals/policies/${policy_id}.json"
  jq '.' "$proposal"
  while IFS= read -r evidence_id; do
    rg -n -B 5 -A 12 "\"id\": \"${evidence_id}\"" \
      data/b-track/amy-hood/advisor/events/pilot/*.json
  done < <(jq -r '.evidenceIds[]' "$proposal")
done < <(jq -r '.passing.policies[]' \
  data/b-track/amy-hood/advisor/policy-memory/gate-report.json)
```

After Codex confirms the first passing policy, approve it with:

```bash
approved_policy_id=$(jq -r '.passing.policies[0] // empty' \
  data/b-track/amy-hood/advisor/policy-memory/gate-report.json)
test -n "$approved_policy_id"
npx tsx server/runAmyHoodDecisionAdvisor.ts memory:review \
  --kind policy \
  --id "$approved_policy_id" \
  --decision approved \
  --reviewer Codex \
  --rationale "Approved after checking support threshold, decision ordering, exception, reversal signal, exact evidence, and holdout exclusion."
```

- [ ] **Step 7: Build, activate, and verify the immutable release**

```bash
npm run advisor:memory:release
npm run advisor:memory:activate -- --latest
npm run advisor:memory:check
jq '.' data/b-track/amy-hood/advisor/memory-releases/active.json
```

Resolve both RAG arms without invoking Gemma:

```bash
npx tsx -e "import { resolveEvaluationV3ArmContext } from './server/evaluationV3/context.ts'; const root=process.cwd(); for (const arm of ['amy_policy_rag','amy_full_rag'] as const) console.log(arm, await resolveEvaluationV3ArmContext(root, arm));"
```

Expected: both arms share one non-null release ID and hash; policy context is nonempty; full context adds reflections, events, and reviewed counterexamples; holdout leakage is zero.

- [ ] **Step 8: Verify and commit reviewed real artifacts**

```bash
npm run advisor:policy-memory:test
npm run evaluation:v3:test
npm run lint
git diff --check
git status --short
git add data/b-track/amy-hood/advisor/policy-memory data/b-track/amy-hood/advisor/memory-releases
git commit -m "data: publish strict Amy Hood policy memory"
```

Expected: raw model responses remain in model-run JSON; only Codex-approved artifacts enter the release.

---

### Task 4: Approve the benchmark and run one real four-arm Evaluation v3 experiment

**Files:**
- Modify: `server/evaluationV3/questionSet.ts`
- Modify: `tests/amyHoodEvaluationV3QuestionSet.test.ts`
- Create: `server/runAmyHoodEvaluationV3.ts`
- Modify: `package.json`
- Modify: `evaluation/v3/public/reviews.json`
- Generate: `evaluation/v3/runs/*.json`
- Create: `docs/reports/2026-07-20-amy-hood-phase-4-gemma-evaluation.md`

**Interfaces:**
- Consumes: active prompt version, verified active memory release, 30-question Evaluation v3 bundle, local Gemma 4, and `createEvaluationV3Runner`.
- Produces: `approveAllEvaluationV3Reviews(root, reviewedAt)`, two synchronous CLI commands, four completed run IDs, and one reproducible quantitative report.

- [ ] **Step 1: Extend the existing happy and failure tests for atomic bulk approval**

Import `approveAllEvaluationV3Reviews` in `tests/amyHoodEvaluationV3QuestionSet.test.ts`. Extend the happy-path test using a temporary copied bundle:

```ts
const approved = await approveAllEvaluationV3Reviews(
  root,
  '2026-07-20T13:00:00.000Z',
);
assert.equal(approved.reviews.length, 30);
assert.equal(approved.reviews.every(({ status, revisionNote, reviewedAt }) =>
  status === 'approved'
  && revisionNote === ''
  && reviewedAt === '2026-07-20T13:00:00.000Z'), true);
```

In the grouped failure test, reuse the copied temporary bundle helper and add:

```ts
const root = await createQuestionSetFixture();
const reviewPath = path.join(root, 'evaluation/v3/public/reviews.json');
const before = await readFile(reviewPath);
await assert.rejects(
  () => approveAllEvaluationV3Reviews(root, 'not-a-timestamp'),
  /timestamp/,
);
assert.deepEqual(await readFile(reviewPath), before);
```

Extract the file-copy setup currently inside the Korean revision-note edge test into this helper and use it from both tests:

```ts
const createQuestionSetFixture = async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'evaluation-v3-review-'));
  const source = path.join(process.cwd(), 'evaluation/v3');
  for (const relative of [
    'public/questions.json',
    'public/reviews.json',
    'sealed/answer-key.json',
  ]) {
    const destination = path.join(root, 'evaluation/v3', relative);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, await readFile(path.join(source, relative), 'utf8'));
  }
  return root;
};
```

- [ ] **Step 2: Run and confirm the bulk operation is absent**

```bash
npx tsx --test tests/amyHoodEvaluationV3QuestionSet.test.ts
```

Expected: FAIL because `approveAllEvaluationV3Reviews` is not exported.

- [ ] **Step 3: Implement atomic all-question approval**

Add to `server/evaluationV3/questionSet.ts`:

```ts
export const approveAllEvaluationV3Reviews = async (
  root: string,
  reviewedAt = new Date().toISOString(),
) => {
  const parsed = new Date(reviewedAt);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== reviewedAt) {
    throw new Error('Evaluation v3 review timestamp is invalid');
  }
  const reviews = await loadEvaluationV3Reviews(root);
  if (reviews.reviews.length !== 30) {
    throw new Error('Evaluation v3 requires exactly 30 reviews');
  }
  const next: EvaluationV3ReviewFile = {
    ...reviews,
    reviews: reviews.reviews.map((review) => ({
      ...review,
      status: 'approved',
      revisionNote: '',
      reviewedAt,
    })),
  };
  await writeJsonAtomic(paths(root).reviews, next);
  return next;
};
```

- [ ] **Step 4: Create the synchronous Evaluation v3 CLI**

Create `server/runAmyHoodEvaluationV3.ts`:

```ts
import path from 'node:path';

import { approveAllEvaluationV3Reviews } from './evaluationV3/questionSet';
import { createEvaluationV3Runner } from './evaluationV3/runner';
import { createModelClient } from './personaPipeline/modelClient';

const optionValue = (args: string[], option: string) => {
  const index = args.indexOf(option);
  return index < 0 ? undefined : args[index + 1];
};

const run = async () => {
  const args = process.argv.slice(2);
  const command = args[0];
  const root = path.resolve(optionValue(args, '--root') ?? process.cwd());
  if (command === 'approve-all') {
    const reviews = await approveAllEvaluationV3Reviews(root);
    console.log(JSON.stringify(reviews, null, 2));
    return;
  }
  if (command !== 'run' || optionValue(args, '--repetitions') !== '1') {
    throw new Error('Evaluation v3 CLI supports approve-all or run --repetitions 1');
  }
  const runner = createEvaluationV3Runner({
    root,
    createModel: () => createModelClient('local'),
  });
  const launch = await runner.createExperiment({ repetitions: 1 });
  const runs = await runner.executeExperiment(launch.runs.map(({ runId }) => runId));
  console.log(JSON.stringify({ experimentGroupId: launch.experimentGroupId, runs }, null, 2));
  if (runs.some(({ status }) => status !== 'complete')) process.exitCode = 1;
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
```

Add package scripts:

```json
"advisor:evaluation-v3:approve-all": "tsx server/runAmyHoodEvaluationV3.ts approve-all",
"advisor:evaluation-v3:run": "tsx server/runAmyHoodEvaluationV3.ts run"
```

- [ ] **Step 5: Verify CLI behavior and approve the 30 persisted questions**

Do not spawn subprocesses from unit tests. The bulk-approval function is covered directly; runner behavior remains covered by `amyHoodEvaluationV3Runner.test.ts`. Run:

```bash
npm run advisor:evaluation-v3:approve-all
npm run evaluation:v3:test
jq '[.reviews[] | select(.status == "approved")] | length' evaluation/v3/public/reviews.json
```

Expected: Evaluation v3 remains 42/42 and the jq output is `30`.

- [ ] **Step 6: Execute exactly one real four-arm experiment**

```bash
LOCAL_LLM_MODEL=gemma4-v2-Q8_0.gguf npm run advisor:evaluation-v3:run -- --repetitions 1
```

Expected: one experiment group, four run IDs in `generic_cfo`, `amy_prompt`, `amy_policy_rag`, `amy_full_rag` order, 30 complete answers per run, and no stale hash or holdout error. If a run becomes `incomplete`, retain it and resume with the existing runner/API; do not delete run files.

- [ ] **Step 7: Calculate and write the fixed evaluation report**

Read the four stored runs and create `docs/reports/2026-07-20-amy-hood-phase-4-gemma-evaluation.md` with these exact sections:

```markdown
# Amy Hood Phase 4 Gemma 4 Evaluation Report

## 1. Execution identity
## 2. Data and policy gate
## 3. Four-arm results
## 4. Ablation lift
## 5. Integrity and failures
## 6. Final judgment
```

The results table must be:

```markdown
| Arm | D / 10 | H / 10 | C / 6 | T / 4 | Total / 30 | Percent |
|---|---:|---:|---:|---:|---:|---:|
```

Calculate all values from the stored runs. Include experiment group ID, four run IDs, model name, prompt hashes, question/answer/holdout hashes, active release ID/hash, approved event/reflection/policy counts, reviewed contrast count, rejected reasons, holdout leakage count, choice-reason mismatches, failed questions, tokens, and elapsed time. State `benchmarkRejected: true` when Generic CFO exceeds 80%. Do not describe a high absolute score as persona replication.

- [ ] **Step 8: Run final verification**

Use `superpowers:verification-before-completion`, then run:

```bash
npm run advisor:policy-memory:test
npm run evaluation:v3:test
npm run evaluation:test
npm run persona:test
npm run lint
npm run build
git diff --check
git status --short
```

Expected: policy-memory tests pass; Evaluation v3 is 42/42; existing evaluation is 68/68; persona is 16/16; TypeScript and Vite build exit 0. The existing Vite chunk-size warning is nonblocking.

- [ ] **Step 9: Commit reproducible evaluation evidence**

```bash
git add server/evaluationV3/questionSet.ts server/runAmyHoodEvaluationV3.ts tests/amyHoodEvaluationV3QuestionSet.test.ts package.json evaluation/v3/public/reviews.json evaluation/v3/runs docs/reports/2026-07-20-amy-hood-phase-4-gemma-evaluation.md
git commit -m "test: run strict Phase 4 Gemma evaluation"
```

---

## Completion Gate

Do not claim completion until all statements are evidenced:

- Every new reflection carries one structured decision axis and evidence-owned support/contrast patterns.
- Same-action complementary cases, wrong-owner evidence, empty conditions, and evidence-set mismatches fail deterministically.
- The retained three legacy Gemma reflections are not approved under the new contract.
- Every approved reflection has a Codex review record explaining the semantic judgment.
- Every approved policy is medium/high, deployable, bounded by an approved reflection, and contains an exception and reversal signal.
- The active pointer and release/context hashes verify from disk.
- Holdout leakage is zero.
- All 30 Evaluation v3 questions are approved.
- Four real Gemma runs are complete or any external failure is persisted and resumable.
- The report distinguishes pipeline readiness from Amy-specific decision-style fidelity and rejects benchmark claims when Generic CFO exceeds 80%.
