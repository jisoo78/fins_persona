# Amy Hood First Policy Memory Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote the reviewed Amy Hood Master Prompt as a new immutable active version, generate and individually approve one evidence-bounded `ai_cloud_capex` policy with local Gemma 4, and build one verified inactive structured-memory release.

**Architecture:** Keep the Master Prompt as a version-pinned system-level judgment controller and keep conditional Amy Hood policy in the structured-memory release. Add one reviewed-prompt promotion boundary that verifies the user's v2 bytes before creating v2/v3 immutable versions, strengthen the independent policy-inducer instruction without weakening validators, then use the existing policy proposal, review, gate, and content-addressed release stores.

**Tech Stack:** TypeScript 5.8, Node.js test runner, `tsx`, LangChain `ChatOpenAI`, local OpenAI-compatible Gemma 4 endpoint on `http://127.0.0.1:8080/v1`, JSON/Markdown content-addressed artifacts, Vite.

## Global Constraints

- Work from local `main` in an isolated worktree; do not modify or stage the user's dirty `codex/harden-amy-hood-evaluation` checkout.
- The reviewed source Master Prompt must have version ID `0503f475-50a3-45ad-a5e8-f5a2d5575861` and SHA-256 `c3cf7538494879188a69dbc2eb5a7579deda19e3a65fb4deea4407029bb56e30` before promotion.
- Preserve the reviewed v2 bytes as an immutable prompt version before deriving v3.
- The v3 Master Prompt changes only grounding terminology and explicit evaluation-JSON precedence; it must not contain the new AI infrastructure policy.
- Policy scope is exactly `ai_cloud_capex`; the supported action is `scale_infrastructure_constrain_opex`.
- External supply is a lead-time execution tactic, not a top-level principle.
- Do not approve talent reallocation, margin guarantees, restructuring, non-AI cuts, invented ROI, payback, or numeric thresholds without exact supporting evidence.
- Use only approved reflection `reflection-4b5f7915d30581a4`, its two supporting events, one contrasting event, and six cited evidence spans.
- Use local Gemma 4 only; do not fall back to GPT-5-mini.
- Gemma 4 context is 16,384 tokens and the policy command keeps its existing 3,000-token output cap.
- Invalid JSON receives at most one recovery retry.
- Approve one selected policy individually; never use `--all-passing` for this release.
- Do not relax policy validation, holdout filtering, or text-leakage checks.
- Build and verify a memory release, but do not create or modify `memory-releases/active.json` in this plan.
- Every implementation change follows Red-Green-Refactor and the repository `AGENTS.md` test-plan requirements.

---

## File Structure

- Create `server/promptVersions/reviewedAmyHoodPrompt.ts` — exact v2 verification, bounded v3 transformation, idempotent immutable-version promotion.
- Create `server/runReviewedAmyHoodPromptPromotion.ts` — narrow CLI wrapper accepting `--source` and optional `--root`.
- Create `tests/amyHoodReviewedMasterPrompt.test.ts` — happy path, exactly three realistic edges, and safe-failure coverage for reviewed prompt promotion.
- Modify `package.json` — add `advisor:prompt:promote-reviewed` and `advisor:prompt:reviewed-test` commands.
- Modify `agent_prompts/prompts/amy-hood-policy-inducer.md` — add one explicit action-grounding constraint.
- Modify `tests/amyHoodAdvisorPolicyMemory.test.ts` — assert that the inducer contains the new grounding rule while retaining the existing policy test plan.
- Generate `data/b-track/amy-hood/prompts/0503f475-50a3-45ad-a5e8-f5a2d5575861.md` — immutable reviewed v2 imported from the user's checkout.
- Generate `data/b-track/amy-hood/prompts/amy-hood-master-v3-20260720.md` — derived reviewed v3.
- Modify `data/b-track/amy-hood/prompt-versions.json` — append v2/v3 records and point `activeVersionId` to v3.
- Modify `data/b-track/amy-hood/AMY_HOOD_PERSONA.gemma4.md` — compatibility mirror of active v3.
- Generate `data/b-track/amy-hood/advisor/policy-memory/proposals/model-runs/model-run-*.json` — actual Gemma policy run audit.
- Generate `data/b-track/amy-hood/advisor/policy-memory/proposals/policies/policy-*.json` — actual Gemma policy proposal.
- Generate `data/b-track/amy-hood/advisor/policy-memory/approved/policies/policy-*.json` — individually approved policy.
- Generate `data/b-track/amy-hood/advisor/policy-memory/reviews/policy-policy-*.json` — Codex review ledger entry.
- Modify `data/b-track/amy-hood/advisor/policy-memory/gate-report.json` — post-approval gate state.
- Generate `data/b-track/amy-hood/advisor/memory-releases/v1-*/` — immutable verified release manifest, artifacts, review ledger, and evaluation context.

---

### Task 1: Add reviewed Master Prompt promotion boundary

**Files:**
- Create: `server/promptVersions/reviewedAmyHoodPrompt.ts`
- Create: `server/runReviewedAmyHoodPromptPromotion.ts`
- Create: `tests/amyHoodReviewedMasterPrompt.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `createPromptVersion(root, input, overrides)`, `activatePromptVersion(root, versionId)`, `listPromptVersions(root)`, and `readPromptVersion(root, versionId)` from `server/promptVersions/store.ts`.
- Produces: `buildReviewedAmyHoodMasterPromptV3(v2: string): string` and `promoteReviewedAmyHoodMasterPrompt(root: string, sourcePath: string, options?: ReviewedPromptPromotionOptions)`, returning `{ v2: PromptVersionDetail; v3: PromptVersionDetail; active: PromptVersionDetail }`.

- [ ] **Step 1: Write the failing reviewed-prompt tests**

Create `tests/amyHoodReviewedMasterPrompt.test.ts` with this test plan and contract:

```ts
/**
 * Test Plan:
 * 1. Happy Path:
 *    - A hash-verified reviewed v2 becomes immutable v2/v3 versions and v3 is activated.
 * 2. Edge Cases:
 *    - Promotion is idempotent when both immutable versions already exist.
 *    - A pre-existing valid v2 is reused while only v3 is created.
 *    - The v3 transform preserves headings and does not inject the AI capacity policy.
 * 3. Failure Path:
 *    - Missing source, wrong v2 hash, missing exact transform anchors, or conflicting stored bytes preserve the prior active version.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  buildReviewedAmyHoodMasterPromptV3,
  promoteReviewedAmyHoodMasterPrompt,
} from '../server/promptVersions/reviewedAmyHoodPrompt';
import {
  createPromptVersion,
  ensurePromptVersionStore,
  readActivePromptVersion,
} from '../server/promptVersions/store';

const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');

const reviewedV2 = `## Role
You are a CFO advisor using retrieved Amy Hood and Microsoft source text.
## Identity
Evidence-led identity.
## Decision Principles
Evidence before conclusion.
## Cross-Dimension Rules
Preserve conflicts.
## Grounding Rules
- Base every claim about Amy Hood's views, priorities, past decisions, and Microsoft-specific facts on the retrieved text.
## Red Lines
Do not invent facts.
## Communication Style
Lead with the recommendation.
## Unknown Policy
State when evidence is insufficient.
## Response Format
For ordinary responses:
1. Recommendation
`;

const fixture = async () => {
  const root = await mkdtemp(join(tmpdir(), 'reviewed-master-prompt-'));
  const dataDir = join(root, 'data/b-track/amy-hood');
  await mkdir(dataDir, { recursive: true });
  await writeFile(
    join(dataDir, 'AMY_HOOD_PERSONA.gemma4.md'),
    reviewedV2,
    'utf8',
  );
  await ensurePromptVersionStore(root, {
    createId: () => 'base-v1',
    now: () => '2026-07-20T00:00:00.000Z',
  });
  const sourcePath = join(root, 'reviewed-v2.md');
  await writeFile(sourcePath, reviewedV2, 'utf8');
  return { root, sourcePath };
};

const options = {
  expectedV2Sha256: sha256(reviewedV2),
  baseVersionId: 'base-v1',
  v2VersionId: 'reviewed-v2',
  v3VersionId: 'reviewed-v3',
  now: '2026-07-20T01:00:00.000Z',
};

test('happy: verified reviewed v2 creates and activates immutable v2 and v3', async () => {
  const { root, sourcePath } = await fixture();
  const result = await promoteReviewedAmyHoodMasterPrompt(root, sourcePath, options);
  assert.equal(result.v2.versionId, 'reviewed-v2');
  assert.equal(result.v2.sha256, sha256(reviewedV2));
  assert.equal(result.v3.versionId, 'reviewed-v3');
  assert.equal((await readActivePromptVersion(root)).versionId, 'reviewed-v3');
  assert.equal((await readActivePromptVersion(root)).content, result.v3.content);
});

test('edge: promotion is idempotent when both versions already exist', async () => {
  const { root, sourcePath } = await fixture();
  const first = await promoteReviewedAmyHoodMasterPrompt(root, sourcePath, options);
  const second = await promoteReviewedAmyHoodMasterPrompt(root, sourcePath, options);
  assert.equal(second.v2.sha256, first.v2.sha256);
  assert.equal(second.v3.sha256, first.v3.sha256);
});

test('edge: a matching existing v2 is reused and v3 is created', async () => {
  const { root, sourcePath } = await fixture();
  await createPromptVersion(root, {
    content: reviewedV2,
    basedOnVersionId: 'base-v1',
  }, {
    createId: () => 'reviewed-v2',
    now: () => '2026-07-20T00:30:00.000Z',
  });
  const result = await promoteReviewedAmyHoodMasterPrompt(root, sourcePath, options);
  assert.equal(result.v2.versionId, 'reviewed-v2');
  assert.equal(result.v3.versionId, 'reviewed-v3');
});

test('edge: v3 changes only grounding scope and evaluation format precedence', () => {
  const v3 = buildReviewedAmyHoodMasterPromptV3(reviewedV2);
  assert.match(v3, /retrieved Amy Hood and Microsoft evidence or approved structured memory/);
  assert.match(v3, /retrieved evidence or approved structured memory/);
  assert.match(v3, /explicit JSON schema.*takes precedence/);
  assert.doesNotMatch(v3, /scale_infrastructure_constrain_opex|talent reallocation/i);
  for (const heading of [
    '## Role', '## Identity', '## Decision Principles', '## Cross-Dimension Rules',
    '## Red Lines', '## Communication Style', '## Unknown Policy', '## Response Format',
  ]) assert.match(v3, new RegExp(heading));
});

test('failure: invalid reviewed input preserves the previous active version', async () => {
  const { root, sourcePath } = await fixture();
  await assert.rejects(
    promoteReviewedAmyHoodMasterPrompt(root, sourcePath, {
      ...options,
      expectedV2Sha256: '0'.repeat(64),
    }),
    /reviewed v2 hash mismatch/,
  );
  assert.equal((await readActivePromptVersion(root)).versionId, 'base-v1');

  await writeFile(sourcePath, reviewedV2.replace('retrieved text', 'other text'), 'utf8');
  await assert.rejects(
    promoteReviewedAmyHoodMasterPrompt(root, sourcePath, {
      ...options,
      expectedV2Sha256: sha256(
        reviewedV2.replace('retrieved text', 'other text'),
      ),
    }),
    /exact prompt anchor/,
  );
  assert.equal((await readActivePromptVersion(root)).versionId, 'base-v1');
});
```

- [ ] **Step 2: Run the new test to verify RED**

Run:

```bash
npx tsx --test tests/amyHoodReviewedMasterPrompt.test.ts
```

Expected: FAIL with `Cannot find module '../server/promptVersions/reviewedAmyHoodPrompt'`.

- [ ] **Step 3: Implement the bounded transformation and idempotent promotion**

Create `server/promptVersions/reviewedAmyHoodPrompt.ts`:

```ts
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import {
  activatePromptVersion,
  createPromptVersion,
  listPromptVersions,
  readPromptVersion,
} from './store';

export const REVIEWED_V2_VERSION_ID = '0503f475-50a3-45ad-a5e8-f5a2d5575861';
export const REVIEWED_V2_SHA256 =
  'c3cf7538494879188a69dbc2eb5a7579deda19e3a65fb4deea4407029bb56e30';
export const REVIEWED_V3_VERSION_ID = 'amy-hood-master-v3-20260720';
export const BASE_V1_VERSION_ID = '18182235-58b4-4218-9860-4fea133bd81d';

export type ReviewedPromptPromotionOptions = {
  expectedV2Sha256?: string;
  baseVersionId?: string;
  v2VersionId?: string;
  v3VersionId?: string;
  now?: string;
};

const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');

const replaceExactlyOnce = (input: string, from: string, to: string) => {
  const parts = input.split(from);
  if (parts.length !== 2) {
    throw new Error(`exact prompt anchor must occur once: ${from}`);
  }
  return `${parts[0]}${to}${parts[1]}`;
};

export const buildReviewedAmyHoodMasterPromptV3 = (v2: string) => {
  let result = replaceExactlyOnce(
    v2,
    'using retrieved Amy Hood and Microsoft source text.',
    'using retrieved Amy Hood and Microsoft evidence or approved structured memory.',
  );
  result = replaceExactlyOnce(
    result,
    "- Base every claim about Amy Hood's views, priorities, past decisions, and Microsoft-specific facts on the retrieved text.",
    "- Base every claim about Amy Hood's views, priorities, past decisions, and Microsoft-specific facts on retrieved evidence or approved structured memory.",
  );
  result = replaceExactlyOnce(
    result,
    '## Response Format\nFor ordinary responses:',
    '## Response Format\nWhen an evaluation harness supplies an explicit JSON schema, that schema takes precedence over the ordinary and evaluation-mode formats below.\n\nFor ordinary responses:',
  );
  return result;
};

const ensureVersion = async (
  root: string,
  input: {
    versionId: string;
    content: string;
    basedOnVersionId: string;
    now: string;
  },
) => {
  const manifest = await listPromptVersions(root);
  if (manifest.versions.some(({ versionId }) => versionId === input.versionId)) {
    const existing = await readPromptVersion(root, input.versionId);
    if (existing.sha256 !== sha256(input.content)) {
      throw new Error(`stored prompt version conflicts with reviewed bytes: ${input.versionId}`);
    }
    return existing;
  }
  return createPromptVersion(root, {
    content: input.content,
    basedOnVersionId: input.basedOnVersionId,
  }, {
    createId: () => input.versionId,
    now: () => input.now,
  });
};

export const promoteReviewedAmyHoodMasterPrompt = async (
  root: string,
  sourcePath: string,
  options: ReviewedPromptPromotionOptions = {},
) => {
  const v2Content = await readFile(sourcePath, 'utf8');
  const expectedV2Sha256 = options.expectedV2Sha256 ?? REVIEWED_V2_SHA256;
  if (sha256(v2Content) !== expectedV2Sha256) {
    throw new Error('reviewed v2 hash mismatch');
  }
  const baseVersionId = options.baseVersionId ?? BASE_V1_VERSION_ID;
  const v2VersionId = options.v2VersionId ?? REVIEWED_V2_VERSION_ID;
  const v3VersionId = options.v3VersionId ?? REVIEWED_V3_VERSION_ID;
  const now = options.now ?? new Date().toISOString();
  const v3Content = buildReviewedAmyHoodMasterPromptV3(v2Content);
  const v2 = await ensureVersion(root, {
    versionId: v2VersionId,
    content: v2Content,
    basedOnVersionId: baseVersionId,
    now,
  });
  const v3 = await ensureVersion(root, {
    versionId: v3VersionId,
    content: v3Content,
    basedOnVersionId: v2VersionId,
    now,
  });
  const active = await activatePromptVersion(root, v3VersionId);
  return { v2, v3, active };
};
```

- [ ] **Step 4: Add the narrow CLI**

Create `server/runReviewedAmyHoodPromptPromotion.ts`:

```ts
import path from 'node:path';

import { promoteReviewedAmyHoodMasterPrompt } from './promptVersions/reviewedAmyHoodPrompt';

const optionValue = (args: string[], name: string, required = true) => {
  const index = args.indexOf(name);
  if (index < 0) {
    if (required) throw new Error(`${name} is required`);
    return undefined;
  }
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`);
  return value;
};

const args = process.argv.slice(2);
const root = path.resolve(optionValue(args, '--root', false) ?? process.cwd());
const source = optionValue(args, '--source');
if (!source) throw new Error('--source is required');
const sourcePath = path.resolve(source);

promoteReviewedAmyHoodMasterPrompt(root, sourcePath)
  .then((result) => console.log(JSON.stringify(result, null, 2)))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
```

Modify `package.json` scripts:

```json
"advisor:prompt:promote-reviewed": "tsx server/runReviewedAmyHoodPromptPromotion.ts",
"advisor:prompt:reviewed-test": "tsx --test tests/amyHoodReviewedMasterPrompt.test.ts"
```

- [ ] **Step 5: Run focused tests and type checking**

Run:

```bash
npm run advisor:prompt:reviewed-test
npm run lint
```

Expected: 5 reviewed-prompt tests PASS and TypeScript exits 0.

- [ ] **Step 6: Commit the promotion boundary**

```bash
git add server/promptVersions/reviewedAmyHoodPrompt.ts server/runReviewedAmyHoodPromptPromotion.ts tests/amyHoodReviewedMasterPrompt.test.ts package.json
git commit -m "feat: promote reviewed Amy Hood prompt versions"
```

---

### Task 2: Strengthen the Gemma policy-inducer grounding instruction

**Files:**
- Modify: `agent_prompts/prompts/amy-hood-policy-inducer.md`
- Modify: `tests/amyHoodAdvisorPolicyMemory.test.ts`

**Interfaces:**
- Consumes: `buildPolicyProposals(reflections, graph, model, options)` loading `agent_prompts/prompts/amy-hood-policy-inducer.md` as its system message.
- Produces: the same JSON schema and retry behavior with a stricter natural-language action boundary; no validator signature changes.

- [ ] **Step 1: Extend the existing prompt-contract assertion**

Inside the existing `edge: a material contrast narrows the reflection boundary` test, after reading `builderPrompt`, add:

```ts
assert.match(
  builderPrompt,
  /Every action in `recommendedAction` must map to the approved `supportPattern\.action`/,
);
assert.match(
  builderPrompt,
  /talent reallocation, organizational redesign, or another execution action/i,
);
assert.match(
  builderPrompt,
  /exact support evidence span explicitly states that action/i,
);
```

- [ ] **Step 2: Run the policy-memory test to verify RED**

Run:

```bash
npm run advisor:policy-memory:test
```

Expected: FAIL because the policy-inducer does not yet contain the exact action-grounding sentence.

- [ ] **Step 3: Add one bounded evidence rule**

Add this bullet immediately after the existing `recommendedAction` evidence rule in `agent_prompts/prompts/amy-hood-policy-inducer.md`:

```markdown
- Every action in `recommendedAction` must map to the approved `supportPattern.action` or to an execution tactic explicitly stated by a cited support evidence span. Do not introduce talent reallocation, organizational redesign, or another execution action unless an exact support evidence span explicitly states that action.
```

Do not add the target policy wording, the correct Evaluation v3 answers, or any holdout identifier.

- [ ] **Step 4: Run focused tests and prompt diff review**

Run:

```bash
npm run advisor:policy-memory:test
git diff --check
git diff -- agent_prompts/prompts/amy-hood-policy-inducer.md tests/amyHoodAdvisorPolicyMemory.test.ts
```

Expected: 9 policy-memory tests PASS; diff contains one new rule and three assertions only.

- [ ] **Step 5: Commit the inducer constraint**

```bash
git add agent_prompts/prompts/amy-hood-policy-inducer.md tests/amyHoodAdvisorPolicyMemory.test.ts
git commit -m "fix: bound Amy Hood policy actions to evidence"
```

---

### Task 3: Preserve reviewed v2 and activate reviewed Master Prompt v3

**Files:**
- Generate: `data/b-track/amy-hood/prompts/0503f475-50a3-45ad-a5e8-f5a2d5575861.md`
- Generate: `data/b-track/amy-hood/prompts/amy-hood-master-v3-20260720.md`
- Modify: `data/b-track/amy-hood/prompt-versions.json`
- Modify: `data/b-track/amy-hood/AMY_HOOD_PERSONA.gemma4.md`

**Interfaces:**
- Consumes: the exact user-reviewed file `/Users/hestory/Desktop/fins_persona/data/b-track/amy-hood/AMY_HOOD_PERSONA.gemma4.md` and Task 1 promotion CLI.
- Produces: active immutable prompt version `amy-hood-master-v3-20260720`, whose ID and SHA can be pinned by Evaluation v3.

- [ ] **Step 1: Verify the user-reviewed source before any write**

Run:

```bash
sha256sum /Users/hestory/Desktop/fins_persona/data/b-track/amy-hood/AMY_HOOD_PERSONA.gemma4.md
jq -r '.activeVersionId' /Users/hestory/Desktop/fins_persona/data/b-track/amy-hood/prompt-versions.json
```

Expected:

```text
c3cf7538494879188a69dbc2eb5a7579deda19e3a65fb4deea4407029bb56e30  /Users/hestory/Desktop/fins_persona/data/b-track/amy-hood/AMY_HOOD_PERSONA.gemma4.md
0503f475-50a3-45ad-a5e8-f5a2d5575861
```

If either value differs, stop without calling the promotion command.

- [ ] **Step 2: Run the reviewed promotion command**

Run from the implementation worktree:

```bash
npm run advisor:prompt:promote-reviewed -- --source /Users/hestory/Desktop/fins_persona/data/b-track/amy-hood/AMY_HOOD_PERSONA.gemma4.md
```

Expected JSON:

```json
{
  "v2": { "versionId": "0503f475-50a3-45ad-a5e8-f5a2d5575861" },
  "v3": { "versionId": "amy-hood-master-v3-20260720" },
  "active": { "versionId": "amy-hood-master-v3-20260720", "active": true }
}
```

- [ ] **Step 3: Verify version lineage, hashes, and content boundaries**

Run:

```bash
jq '.' data/b-track/amy-hood/prompt-versions.json
sha256sum data/b-track/amy-hood/prompts/0503f475-50a3-45ad-a5e8-f5a2d5575861.md
sha256sum data/b-track/amy-hood/prompts/amy-hood-master-v3-20260720.md
sha256sum data/b-track/amy-hood/AMY_HOOD_PERSONA.gemma4.md
rg -n "approved structured memory|explicit JSON schema|scale_infrastructure_constrain_opex|talent reallocation" data/b-track/amy-hood/prompts/amy-hood-master-v3-20260720.md
```

Expected:

- v2 hash is exactly `c3cf7538494879188a69dbc2eb5a7579deda19e3a65fb4deea4407029bb56e30`.
- v3 and compatibility-file hashes are equal.
- v3 contains `approved structured memory` and `explicit JSON schema`.
- v3 contains neither `scale_infrastructure_constrain_opex` nor `talent reallocation`.
- v3 record has `basedOnVersionId: 0503f475-50a3-45ad-a5e8-f5a2d5575861`.

- [ ] **Step 4: Run prompt and Evaluation v3 regression tests**

Run:

```bash
npm run advisor:prompt:reviewed-test
npx tsx --test tests/amyHoodPromptVersions.test.ts tests/amyHoodEvaluationV3Prompt.test.ts tests/amyHoodEvaluationV3Runner.test.ts
```

Expected: all selected tests PASS; Evaluation v3 still pins prompt version ID and SHA.

- [ ] **Step 5: Commit prompt artifacts only**

```bash
git add data/b-track/amy-hood/AMY_HOOD_PERSONA.gemma4.md data/b-track/amy-hood/prompt-versions.json data/b-track/amy-hood/prompts/0503f475-50a3-45ad-a5e8-f5a2d5575861.md data/b-track/amy-hood/prompts/amy-hood-master-v3-20260720.md
git commit -m "data: activate reviewed Amy Hood master prompt v3"
```

---

### Task 4: Generate and individually approve one actual Gemma 4 policy

**Files:**
- Generate: `data/b-track/amy-hood/advisor/policy-memory/proposals/model-runs/model-run-*.json`
- Generate: `data/b-track/amy-hood/advisor/policy-memory/proposals/policies/policy-*.json`
- Generate: `data/b-track/amy-hood/advisor/policy-memory/approved/policies/policy-*.json`
- Generate: `data/b-track/amy-hood/advisor/policy-memory/reviews/policy-policy-*.json`
- Modify: `data/b-track/amy-hood/advisor/policy-memory/gate-report.json`

**Interfaces:**
- Consumes: `memory:build --kind policy`, approved reflection `reflection-4b5f7915d30581a4`, local model settings, and `memory:review`.
- Produces: at least one `ai_cloud_capex` `deployable_policy` with `medium` or `high` confidence and terminal Codex approval.

- [ ] **Step 1: Verify Gemma 4 endpoint and exact model identity**

Run:

```bash
curl -fsS http://127.0.0.1:8080/v1/models | jq -r '.data[].id'
```

Expected to include:

```text
yuxinlu1/gemma-4-12B-agentic-fable5-composer2.5-v2-3.5x-tau2-GGUF:Q4_K_M
```

If the endpoint is unavailable or the model differs, stop before policy generation and report the runtime mismatch.

- [ ] **Step 2: Record the pre-build gate and approved reflection**

Run:

```bash
npm run advisor:memory:check
jq '{safeStop, approved: .reviewed.approved, passing}' data/b-track/amy-hood/advisor/policy-memory/gate-report.json
jq '{id, domain, supportPattern, contrastPattern, review}' data/b-track/amy-hood/advisor/policy-memory/approved/reflections/reflection-4b5f7915d30581a4.json
```

Expected: one approved reflection, zero approved policies, and `memory_release` blocked.

- [ ] **Step 3: Run one real policy build through local Gemma 4**

Run:

```bash
LOCAL_LLM_BASE_URL=http://127.0.0.1:8080/v1 LOCAL_LLM_MODEL='yuxinlu1/gemma-4-12B-agentic-fable5-composer2.5-v2-3.5x-tau2-GGUF:Q4_K_M' npm run advisor:memory:build -- --kind policy
```

Expected: a `complete` model run with one or more parsed policy IDs. Invalid first JSON may cause exactly one retry; two invalid responses must leave no new policy artifact.

- [ ] **Step 4: Run the structural gate and list only passing new candidates**

Run:

```bash
npm run advisor:memory:check
jq '{passing: .passing.policies, reviewRequired, blocked}' data/b-track/amy-hood/advisor/policy-memory/gate-report.json
```

Expected: at least one new ID in `passing.policies`. If none passes, stop; do not edit generated JSON or weaken validation.

- [ ] **Step 5: Perform the Codex semantic review on each passing candidate**

For each passing policy, inspect the complete artifact and its six evidence spans:

```bash
jq '.' data/b-track/amy-hood/advisor/policy-memory/proposals/policies/policy-*.json
jq '{id, chosenAction, conditions, evidenceSpans}' data/b-track/amy-hood/advisor/events/pilot/candidate-ai-capacity-opex-pivot-2023.json
jq '{id, chosenAction, conditions, evidenceSpans}' data/b-track/amy-hood/advisor/events/pilot/candidate-ai-capacity-sourcing-2024.json
jq '{id, chosenAction, conditions, evidenceSpans}' data/b-track/amy-hood/advisor/events/pilot/candidate-cloud-capacity-scale-2022.json
```

Select the narrowest candidate satisfying every condition below:

```text
domain = ai_cloud_capex
supportingEventIds = event-ai-capacity-opex-pivot-2023 + event-ai-capacity-sourcing-2024
contrastingEventIds = event-cloud-capacity-scale-2022
recommendedAction means scale infrastructure while constraining OpEx growth
external supply appears only as a lead-time tactic
priorityOrder contains criteria, not an action label
FY22 positive contrast conditions remain non-applicability boundaries
reversalSignals are observable weakening of demand, urgency, or economics
no talent reallocation, margin guarantee, restructuring, non-AI cuts, invented number, or post-outcome claim
all six evidence IDs belong to the three referenced events
```

If all passing candidates violate any line, reject them individually with the exact reason and stop without building a release.

If more than one candidate passes, select the narrowest candidate and reject every unselected candidate individually with its exact semantic-review reason. Run `npm run advisor:memory:check` again and require `passing.policies` to contain exactly one ID before approval.

- [ ] **Step 6: Individually approve exactly one selected policy**

After semantic review has reduced the gate to exactly one passing candidate, derive its ID, verify its shape, and run the individual review command:

```bash
export POLICY_ID="$(jq -er '.passing.policies | if length == 1 then .[0] else error("expected exactly one reviewed passing policy") end' data/b-track/amy-hood/advisor/policy-memory/gate-report.json)"
test "$(printf '%s' "$POLICY_ID" | sed -E 's/^policy-[a-f0-9]{16}$//')" = ''
npx tsx server/runAmyHoodDecisionAdvisor.ts memory:review --kind policy --id "$POLICY_ID" --decision approved --reviewer Codex --rationale "Approved after exact-span review: FY23 and FY24 support scaling AI infrastructure while constraining operating-expense growth; FY22 preserves the broad-demand boundary; external supply remains a lead-time tactic; talent reallocation, margin guarantees, and post-outcome claims are excluded."
```

Expected: returned artifact has `status: approved`, `confidence: medium` or `high`, `policyKind: deployable_policy`, and a 64-character `validationHash`.

- [ ] **Step 7: Rebuild the gate report and prove release eligibility**

Run:

```bash
npm run advisor:memory:check
jq '{safeStop, approved: .reviewed.approved, passing, activeReleaseVersion}' data/b-track/amy-hood/advisor/policy-memory/gate-report.json
```

Expected:

```text
safeStop = null
reviewed.approved.reflections contains reflection-4b5f7915d30581a4
reviewed.approved.policies contains the selected policy ID
activeReleaseVersion = null
```

- [ ] **Step 8: Commit only the generated policy audit artifacts**

```bash
git add data/b-track/amy-hood/advisor/policy-memory/proposals/model-runs data/b-track/amy-hood/advisor/policy-memory/proposals/policies data/b-track/amy-hood/advisor/policy-memory/approved/policies data/b-track/amy-hood/advisor/policy-memory/reviews data/b-track/amy-hood/advisor/policy-memory/gate-report.json
git commit -m "data: approve first Amy Hood capacity policy"
```

---

### Task 5: Build and verify the inactive structured-memory release

**Files:**
- Generate: `data/b-track/amy-hood/advisor/memory-releases/v1-*/manifest.json`
- Generate: `data/b-track/amy-hood/advisor/memory-releases/v1-*/evaluation-context.json`
- Generate: `data/b-track/amy-hood/advisor/memory-releases/v1-*/review-ledger.json`
- Generate: `data/b-track/amy-hood/advisor/memory-releases/v1-*/artifacts/**`

**Interfaces:**
- Consumes: `buildMemoryRelease(root, { graph, now })` through `memory:release` and the approved policy/reflection store.
- Produces: a content-addressed release matching `^v1-[a-f0-9]{12}$`, verifiable by `verifyMemoryRelease`, with no active pointer mutation.

- [ ] **Step 1: Re-run the release safety tests before changing data**

Run:

```bash
npm run advisor:policy-memory:test
```

Expected: 9 tests PASS, including idempotent release and tamper detection.

- [ ] **Step 2: Assert that no active pointer exists before release creation**

Run:

```bash
test ! -e data/b-track/amy-hood/advisor/memory-releases/active.json
```

Expected: exit 0.

- [ ] **Step 3: Build the immutable release**

Run:

```bash
npm run advisor:memory:release
```

Expected JSON contains `manifest.schemaVersion: 1`, matching `manifest.releaseId` and `manifest.version` values that satisfy `^v1-[a-f0-9]{12}$`, and `created: true`.

- [ ] **Step 4: Verify manifest, context layers, review ledger, and inactivity**

Run:

```bash
find data/b-track/amy-hood/advisor/memory-releases -maxdepth 2 -type f | sort
jq '{releaseId, version, artifacts, evaluationContextHash, reviewLedgerHash}' data/b-track/amy-hood/advisor/memory-releases/v1-*/manifest.json
jq '{releaseId, policy, reflections, events, counterexamples, references}' data/b-track/amy-hood/advisor/memory-releases/v1-*/evaluation-context.json
jq '.' data/b-track/amy-hood/advisor/memory-releases/v1-*/review-ledger.json
test ! -e data/b-track/amy-hood/advisor/memory-releases/active.json
```

Expected:

- exactly one new release directory whose name satisfies `^v1-[a-f0-9]{12}$`;
- nonempty policy, reflection, event, counterexample, and reference layers;
- review ledger contains the approved reflection and selected policy;
- no `active.json`.

- [ ] **Step 5: Prove content-addressed idempotence**

Run again:

```bash
npm run advisor:memory:release
```

Expected: same release ID and `created: false`.

- [ ] **Step 6: Commit the verified release only**

```bash
git add data/b-track/amy-hood/advisor/memory-releases/v1-*
git commit -m "data: build first Amy Hood memory release"
```

---

### Task 6: Run full regression verification and hand off activation

**Files:**
- Verify only; no new production files expected.

**Interfaces:**
- Consumes: active Master Prompt v3, approved policy, verified inactive memory release, Evaluation v3 test harness.
- Produces: evidence that the implementation is ready for the separate activation-and-one-repetition checkpoint.

- [ ] **Step 1: Run all focused and downstream test suites**

Run:

```bash
npm run advisor:prompt:reviewed-test
npx tsx --test tests/amyHoodPromptVersions.test.ts
npm run advisor:policy-memory:test
npm run evaluation:v3:test
```

Expected: all prompt-version tests, 9 policy-memory tests, and 42 Evaluation v3 tests PASS.

- [ ] **Step 2: Run static and production checks**

Run:

```bash
npm run lint
npm run build
git diff --check
```

Expected: TypeScript exits 0, Vite build succeeds, and `git diff --check` prints nothing. The existing Vite large-chunk warning is non-blocking.

- [ ] **Step 3: Verify final data invariants**

Run:

```bash
jq -r '.activeVersionId' data/b-track/amy-hood/prompt-versions.json
jq '{safeStop, approved: .reviewed.approved, activeReleaseVersion}' data/b-track/amy-hood/advisor/policy-memory/gate-report.json
test ! -e data/b-track/amy-hood/advisor/memory-releases/active.json
git status --short
```

Expected:

```text
activeVersionId = amy-hood-master-v3-20260720
safeStop = null
approved reflections >= 1
approved policies >= 1
activeReleaseVersion = null
no active.json
clean git status
```

- [ ] **Step 4: Record the next explicit checkpoint**

Do not activate in this plan. Report the verified release version and request the next authorized action:

```bash
export RELEASE_VERSION="$(jq -r '.version' data/b-track/amy-hood/advisor/memory-releases/v1-*/manifest.json)"
test "$(printf '%s' "$RELEASE_VERSION" | sed -E 's/^v1-[a-f0-9]{12}$//')" = ''
npm run advisor:memory:activate -- --version "$RELEASE_VERSION"
```

After that separate activation, create one Evaluation v3 repetition: 30 questions × 4 arms = 120 sequential Gemma calls.
