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
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
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

  const missingAnchor = reviewedV2.replace('retrieved text', 'other text');
  await writeFile(sourcePath, missingAnchor, 'utf8');
  await assert.rejects(
    promoteReviewedAmyHoodMasterPrompt(root, sourcePath, {
      ...options,
      expectedV2Sha256: sha256(missingAnchor),
    }),
    /exact prompt anchor/,
  );
  assert.equal((await readActivePromptVersion(root)).versionId, 'base-v1');
});
