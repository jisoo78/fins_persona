# Amy Hood Decision Advisor Phase 1 Evaluation v3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Freeze the evaluation v3 blueprint, types, scoring rules, experiment arms, review contract, and holdout-leakage guard before any Decision Advisor policy tuning begins.

**Architecture:** Evaluation v3 lives beside, not inside, the existing 15-question evaluation. A 30-slot blueprint fixes category, domain, pair, and scoring coverage now; the evidence-backed prompts and sealed answers are materialized in Phase 3 after the event split exists but before Phase 4 policy work.

**Tech Stack:** TypeScript 5.8, Node.js 22, `tsx --test`, JSON persistence, existing Express-independent server modules.

## Global Constraints

- Do not modify the semantics or files of evaluation v2.
- Fix exactly 30 slots: 10 discrimination, 10 temporal holdout, 6 counterfactual, and 4 advisory.
- Fix four arms: `generic_cfo`, `amy_prompt`, `amy_policy_rag`, `amy_full_rag`.
- Fix five repetitions per arm and a 100-point scoring contract.
- Keep answer keys and holdout event references server-only.
- Reject holdout IDs in training, policy-build, memory-release, and runtime-index scopes.
- Follow the AGENTS.md Test Plan format and do not weaken v2 tests.

---

### Task 1: Add shared Decision Advisor and evaluation v3 contracts

**Files:**
- Create: `shared/amyHoodDecisionAdvisor.ts`
- Create: `tests/amyHoodEvaluationV3.test.ts`

**Interfaces:**
- Consumes: no new feature code.
- Produces: `DatasetSplit`, `DecisionDomain`, `EvaluationV3Category`, `EvaluationV3Arm`, `EvaluationV3Blueprint`, `EvaluationV3QuestionFile`, `EvaluationV3AnswerKeyFile`, `EvaluationV3ReviewFile`, and `EvaluationV3Score`.

- [ ] **Step 1: Write the shared test-plan block and failing contract test**

Create `tests/amyHoodEvaluationV3.test.ts` with this block at the top and the first test below it:

```ts
/**
 * Test Plan:
 * 1. Happy Path:
 *    - thirty evaluation slots and four experiment arms form one valid v3 blueprint.
 *
 * 2. Edge Cases:
 *    - counterfactual slots preserve pair IDs and opposite variants.
 *    - all five decision domains remain represented after deterministic ordering.
 *    - advisory slots remain subjective while the other twenty-six slots remain multiple-choice.
 *
 * 3. Failure Path:
 *    - invalid counts, duplicate IDs, unknown arms, and holdout leakage fail before persistence.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EVALUATION_V3_ARMS,
  EVALUATION_V3_REPETITIONS,
  type EvaluationV3Blueprint,
} from '../shared/amyHoodDecisionAdvisor';

test('happy: v3 fixes four arms and five repetitions', () => {
  assert.deepEqual(EVALUATION_V3_ARMS, [
    'generic_cfo',
    'amy_prompt',
    'amy_policy_rag',
    'amy_full_rag',
  ]);
  assert.equal(EVALUATION_V3_REPETITIONS, 5);
  const blueprint: EvaluationV3Blueprint = {
    dataset: 'amy_hood_decision_advisor_evaluation_blueprint',
    version: '3.0.0',
    slots: [],
  };
  assert.equal(blueprint.version, '3.0.0');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npx tsx --test tests/amyHoodEvaluationV3.test.ts
```

Expected: FAIL because `shared/amyHoodDecisionAdvisor.ts` does not exist.

- [ ] **Step 3: Add the exact shared types and constants**

Create `shared/amyHoodDecisionAdvisor.ts` with these declarations:

```ts
export type DatasetSplit = 'train' | 'development' | 'holdout';

export type DecisionDomain =
  | 'm_and_a'
  | 'ai_cloud_capex'
  | 'pricing_monetization'
  | 'cost_efficiency'
  | 'shareholder_return_risk';

export type ArtifactStatus =
  | 'candidate'
  | 'review_required'
  | 'approved'
  | 'indexed'
  | 'superseded';

export type EvaluationV3Category =
  | 'amy_specific_discrimination'
  | 'temporal_holdout'
  | 'counterfactual_pair'
  | 'new_advisory_scenario';

export type EvaluationV3Arm =
  | 'generic_cfo'
  | 'amy_prompt'
  | 'amy_policy_rag'
  | 'amy_full_rag';

export const EVALUATION_V3_ARMS: EvaluationV3Arm[] = [
  'generic_cfo',
  'amy_prompt',
  'amy_policy_rag',
  'amy_full_rag',
];

export const EVALUATION_V3_REPETITIONS = 5;

export type EvaluationV3BlueprintSlot = {
  id: string;
  category: EvaluationV3Category;
  type: 'multiple_choice' | 'subjective';
  domain: DecisionDomain;
  pairId?: string;
  pairVariant?: 'a' | 'b';
  requiredSplit: DatasetSplit | 'none';
  scoreDimensions: Array<Exclude<keyof EvaluationV3Score, 'total'>>;
};

export type EvaluationV3Blueprint = {
  dataset: 'amy_hood_decision_advisor_evaluation_blueprint';
  version: '3.0.0';
  slots: EvaluationV3BlueprintSlot[];
};

export type EvaluationV3Question = EvaluationV3BlueprintSlot & {
  prompt: string;
  options?: [string, string, string, string];
};

export type EvaluationV3QuestionFile = {
  dataset: 'amy_hood_decision_advisor_evaluation';
  version: '3.0.0';
  frozenAt: string;
  questions: EvaluationV3Question[];
};

export type EvaluationV3SubjectiveRubric = {
  decision: string;
  criteriaPriority: string;
  conditionalTransfer: string;
  evidenceBounding: string;
  actionability: string;
};

export type EvaluationV3Answer = {
  questionId: string;
  correctChoice?: 1 | 2 | 3 | 4;
  correctIntent?: string;
  trapIntents?: Record<'1' | '2' | '3' | '4', string>;
  criteriaInPriorityOrder: string[];
  reversalSignal?: string;
  evidenceRefs: string[];
  sealedEventIds: string[];
  rubric?: EvaluationV3SubjectiveRubric;
};

export type EvaluationV3AnswerKeyFile = {
  dataset: 'amy_hood_decision_advisor_evaluation_answer_key';
  version: '3.0.0';
  answers: EvaluationV3Answer[];
};

export type EvaluationV3Review = {
  questionId: string;
  status: 'unreviewed' | 'approved' | 'revision_required';
  revisionNote: string;
  reviewedAt: string | null;
};

export type EvaluationV3ReviewFile = {
  questionSetVersion: '3.0.0';
  reviews: EvaluationV3Review[];
};

export type EvaluationV3Score = {
  decisionSelection: number;
  criteriaPriority: number;
  conditionSensitivity: number;
  evidenceFaithfulness: number;
  actionability: number;
  total: number;
};
```

- [ ] **Step 4: Run the contract test**

Run:

```bash
npx tsx --test tests/amyHoodEvaluationV3.test.ts
```

Expected: PASS with `1` passing test.

- [ ] **Step 5: Commit the shared contract**

```bash
git add shared/amyHoodDecisionAdvisor.ts tests/amyHoodEvaluationV3.test.ts
git commit -m "feat: define Amy Hood advisor evaluation contracts"
```

### Task 2: Validate and load the fixed 30-slot blueprint

**Files:**
- Create: `evaluation/v3/amy_hood_advisor_blueprint.json`
- Create: `server/evaluationV3/blueprint.ts`
- Modify: `tests/amyHoodEvaluationV3.test.ts`

**Interfaces:**
- Consumes: `EvaluationV3Blueprint` from Task 1.
- Produces: `assertEvaluationV3Blueprint(blueprint): void` and `loadEvaluationV3Blueprint(root): Promise<EvaluationV3Blueprint>`.

- [ ] **Step 1: Add failing blueprint validation tests**

Append tests that call `assertEvaluationV3Blueprint` with a valid fixture and with duplicate IDs, 29 slots, and an unpaired counterfactual. Use this helper in the test file:

```ts
const slot = (
  id: string,
  category: EvaluationV3BlueprintSlot['category'],
  index: number,
): EvaluationV3BlueprintSlot => ({
  id,
  category,
  type: category === 'new_advisory_scenario' ? 'subjective' : 'multiple_choice',
  domain: (['m_and_a', 'ai_cloud_capex', 'pricing_monetization', 'cost_efficiency', 'shareholder_return_risk'] as const)[index % 5],
  ...(category === 'counterfactual_pair'
    ? { pairId: `C${Math.floor(index / 2) + 1}`, pairVariant: index % 2 === 0 ? 'a' : 'b' }
    : {}),
  requiredSplit: category === 'temporal_holdout' ? 'holdout' : 'none',
  scoreDimensions: [category === 'new_advisory_scenario' ? 'actionability' : 'decisionSelection'],
});
```

Expected assertions:

```ts
assert.doesNotThrow(() => assertEvaluationV3Blueprint(validBlueprint));
assert.throws(() => assertEvaluationV3Blueprint(duplicateBlueprint), /unique/);
assert.throws(() => assertEvaluationV3Blueprint(shortBlueprint), /30/);
assert.throws(() => assertEvaluationV3Blueprint(unpairedBlueprint), /counterfactual pair/);
```

- [ ] **Step 2: Run the tests to verify failure**

Run:

```bash
npx tsx --test tests/amyHoodEvaluationV3.test.ts
```

Expected: FAIL because `server/evaluationV3/blueprint.ts` does not exist.

- [ ] **Step 3: Implement the blueprint validator and loader**

Create `server/evaluationV3/blueprint.ts` exporting:

```ts
export const assertEvaluationV3Blueprint = (blueprint: EvaluationV3Blueprint) => {
  if (blueprint.dataset !== 'amy_hood_decision_advisor_evaluation_blueprint' || blueprint.version !== '3.0.0') {
    throw new Error('invalid evaluation v3 blueprint identity');
  }
  if (blueprint.slots.length !== 30) throw new Error(`evaluation v3 requires 30 slots, got ${blueprint.slots.length}`);
  const ids = blueprint.slots.map((item) => item.id);
  if (new Set(ids).size !== ids.length) throw new Error('evaluation v3 slot IDs must be unique');
  const expected = new Map<EvaluationV3Category, number>([
    ['amy_specific_discrimination', 10],
    ['temporal_holdout', 10],
    ['counterfactual_pair', 6],
    ['new_advisory_scenario', 4],
  ]);
  for (const [category, count] of expected) {
    const actual = blueprint.slots.filter((item) => item.category === category).length;
    if (actual !== count) throw new Error(`evaluation v3 requires ${count} ${category} slots, got ${actual}`);
  }
  const pairGroups = new Map<string | undefined, EvaluationV3BlueprintSlot[]>();
  for (const item of blueprint.slots.filter((slot) => slot.category === 'counterfactual_pair')) {
    const items = pairGroups.get(item.pairId) ?? [];
    items.push(item);
    pairGroups.set(item.pairId, items);
  }
  for (const [pairId, items] of pairGroups) {
    if (!pairId || items.length !== 2 || new Set(items.map((item) => item.pairVariant)).size !== 2) {
      throw new Error(`invalid counterfactual pair: ${pairId ?? 'missing'}`);
    }
  }
  for (const slot of blueprint.slots) {
    if (slot.category === 'new_advisory_scenario' && slot.type !== 'subjective') {
      throw new Error(`${slot.id} advisory slot must be subjective`);
    }
    if (slot.category !== 'new_advisory_scenario' && slot.type !== 'multiple_choice') {
      throw new Error(`${slot.id} must be multiple-choice`);
    }
    if (slot.category === 'temporal_holdout' && slot.requiredSplit !== 'holdout') {
      throw new Error(`${slot.id} temporal slot must require holdout`);
    }
  }
};

export const loadEvaluationV3Blueprint = async (root: string) => {
  const path = resolve(root, 'evaluation/v3/amy_hood_advisor_blueprint.json');
  const blueprint = JSON.parse(await readFile(path, 'utf8')) as EvaluationV3Blueprint;
  assertEvaluationV3Blueprint(blueprint);
  return blueprint;
};
```

Import `readFile` from `node:fs/promises`, `resolve` from `node:path`, and the shared types.

- [ ] **Step 4: Create the exact 30-slot blueprint**

Create `evaluation/v3/amy_hood_advisor_blueprint.json` with version `3.0.0` and these IDs:

```text
D01-D10: amy_specific_discrimination, multiple_choice, requiredSplit=none
H01-H10: temporal_holdout, multiple_choice, requiredSplit=holdout
C01A,C01B,C02A,C02B,C03A,C03B: counterfactual_pair, multiple_choice, requiredSplit=none
S01-S04: new_advisory_scenario, subjective, requiredSplit=none
```

Rotate domains in this order across each category: `m_and_a`, `ai_cloud_capex`, `pricing_monetization`, `cost_efficiency`, `shareholder_return_risk`. For each counterfactual pair, set the same `pairId` and variants `a` and `b`. Set `scoreDimensions` to the dimensions that the slot can measure; every slot includes `decisionSelection` or `actionability`. `total` is aggregate-only and never appears on a slot.

- [ ] **Step 5: Run the tests**

```bash
npx tsx --test tests/amyHoodEvaluationV3.test.ts
```

Expected: all blueprint tests pass.

- [ ] **Step 6: Commit the blueprint**

```bash
git add evaluation/v3/amy_hood_advisor_blueprint.json server/evaluationV3/blueprint.ts tests/amyHoodEvaluationV3.test.ts
git commit -m "feat: freeze Amy Hood evaluation v3 blueprint"
```

### Task 3: Add scope-based holdout leakage gates

**Files:**
- Create: `server/decisionAdvisor/leakageGuard.ts`
- Modify: `tests/amyHoodEvaluationV3.test.ts`

**Interfaces:**
- Consumes: `DatasetSplit` from Task 1.
- Produces: `assertAllowedSplits(scope, artifacts): void`, where scope is `policy_build | memory_release | runtime_index | evaluation`.

- [ ] **Step 1: Add failing leakage tests**

Append these test cases:

```ts
test('edge: evaluation scope accepts holdout artifacts', () => {
  assert.doesNotThrow(() => assertAllowedSplits('evaluation', [
    { id: 'h1', split: 'holdout' },
  ]));
});

test('failure: build scopes reject holdout before writing', () => {
  for (const scope of ['policy_build', 'memory_release', 'runtime_index'] as const) {
    assert.throws(
      () => assertAllowedSplits(scope, [{ id: 'h1', split: 'holdout' }]),
      /holdout artifact h1/,
    );
  }
});
```

- [ ] **Step 2: Run the tests to verify failure**

```bash
npx tsx --test tests/amyHoodEvaluationV3.test.ts
```

Expected: FAIL because `assertAllowedSplits` is missing.

- [ ] **Step 3: Implement the guard**

Create `server/decisionAdvisor/leakageGuard.ts`:

```ts
import type { DatasetSplit } from '../../shared/amyHoodDecisionAdvisor';

export type LeakageScope = 'policy_build' | 'memory_release' | 'runtime_index' | 'evaluation';

export const assertAllowedSplits = (
  scope: LeakageScope,
  artifacts: Array<{ id: string; split: DatasetSplit }>,
) => {
  if (scope === 'evaluation') return;
  const leaked = artifacts.find((artifact) => artifact.split === 'holdout');
  if (leaked) throw new Error(`holdout artifact ${leaked.id} is forbidden in ${scope}`);
};
```

- [ ] **Step 4: Run the tests**

```bash
npx tsx --test tests/amyHoodEvaluationV3.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit the leakage gate**

```bash
git add server/decisionAdvisor/leakageGuard.ts tests/amyHoodEvaluationV3.test.ts
git commit -m "feat: block advisor holdout leakage"
```

### Task 4: Implement the 100-point score and experiment-plan contracts

**Files:**
- Create: `server/evaluationV3/scoring.ts`
- Create: `server/evaluationV3/experimentPlan.ts`
- Modify: `tests/amyHoodEvaluationV3.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: evaluation constants and `EvaluationV3Score`.
- Produces: `assertEvaluationV3Score(score): void` and `createEvaluationV3ExperimentPlan(): Array<{ arm: EvaluationV3Arm; repetition: number }>`.

- [ ] **Step 1: Add failing score and experiment tests**

Append:

```ts
test('happy: v3 score totals one hundred and experiment creates twenty runs', () => {
  const score = {
    decisionSelection: 40,
    criteriaPriority: 20,
    conditionSensitivity: 15,
    evidenceFaithfulness: 15,
    actionability: 10,
    total: 100,
  };
  assert.doesNotThrow(() => assertEvaluationV3Score(score));
  const plan = createEvaluationV3ExperimentPlan();
  assert.equal(plan.length, 20);
  assert.equal(new Set(plan.map((item) => `${item.arm}:${item.repetition}`)).size, 20);
});

test('failure: score rejects dimension overflow and mismatched total', () => {
  assert.throws(() => assertEvaluationV3Score({
    decisionSelection: 41,
    criteriaPriority: 20,
    conditionSensitivity: 15,
    evidenceFaithfulness: 15,
    actionability: 10,
    total: 101,
  }), /decisionSelection/);
});
```

- [ ] **Step 2: Run the tests to verify failure**

```bash
npx tsx --test tests/amyHoodEvaluationV3.test.ts
```

Expected: FAIL because scoring and experiment functions do not exist.

- [ ] **Step 3: Implement exact score ceilings and plan generation**

Use these ceilings in `server/evaluationV3/scoring.ts`:

```ts
const ceilings = {
  decisionSelection: 40,
  criteriaPriority: 20,
  conditionSensitivity: 15,
  evidenceFaithfulness: 15,
  actionability: 10,
} as const;

export const assertEvaluationV3Score = (score: EvaluationV3Score) => {
  for (const [key, ceiling] of Object.entries(ceilings) as Array<[keyof typeof ceilings, number]>) {
    const value = score[key];
    if (!Number.isFinite(value) || value < 0 || value > ceiling) {
      throw new Error(`${key} must be between 0 and ${ceiling}`);
    }
  }
  const total = Object.keys(ceilings)
    .map((key) => score[key as keyof typeof ceilings])
    .reduce((sum, value) => sum + value, 0);
  if (score.total !== total) throw new Error(`evaluation v3 total must equal ${total}`);
};
```

Use this implementation in `server/evaluationV3/experimentPlan.ts`:

```ts
export const createEvaluationV3ExperimentPlan = () =>
  EVALUATION_V3_ARMS.flatMap((arm) =>
    Array.from({ length: EVALUATION_V3_REPETITIONS }, (_, index) => ({
      arm,
      repetition: index + 1,
    })),
  );
```

- [ ] **Step 4: Add the phase test script**

Add to `package.json` scripts:

```json
"advisor:evaluation-v3:test": "tsx --test tests/amyHoodEvaluationV3.test.ts"
```

- [ ] **Step 5: Run Phase 1 and regression verification**

```bash
npm run advisor:evaluation-v3:test
npm run evaluation:test
npm run lint
git diff --check
```

Expected: all commands exit `0`; v2 remains green.

- [ ] **Step 6: Commit Phase 1**

```bash
git add package.json server/evaluationV3/scoring.ts server/evaluationV3/experimentPlan.ts tests/amyHoodEvaluationV3.test.ts
git commit -m "feat: add advisor evaluation v3 scoring plan"
```
