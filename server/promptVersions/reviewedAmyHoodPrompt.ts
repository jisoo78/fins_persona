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
