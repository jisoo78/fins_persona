import type {
  PromptVersionDetail,
  PromptVersionManifest,
} from '../../shared/amyHoodPromptVersion';
import { request } from './evaluationApi';

export type PromptVersionListResponse = {
  ok: true;
  manifest: PromptVersionManifest;
  active: PromptVersionDetail;
};

export const listPromptVersions = (fetchImpl: typeof fetch = fetch) =>
  request<PromptVersionListResponse>(
    '/api/b-track/amy-hood/prompt-versions',
    {},
    fetchImpl,
  );

export const getPromptVersion = (
  versionId: string,
  fetchImpl: typeof fetch = fetch,
) => request<{ ok: true; version: PromptVersionDetail }>(
  `/api/b-track/amy-hood/prompt-versions/${versionId}`,
  {},
  fetchImpl,
);

export const savePromptVersion = (
  input: { content: string; basedOnVersionId?: string | null },
  fetchImpl: typeof fetch = fetch,
) => request<{ ok: true; version: PromptVersionDetail }>(
  '/api/b-track/amy-hood/prompt-versions',
  {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  },
  fetchImpl,
);

export const activatePromptVersion = (
  versionId: string,
  fetchImpl: typeof fetch = fetch,
) => request<{ ok: true; version: PromptVersionDetail }>(
  `/api/b-track/amy-hood/prompt-versions/${versionId}/activate`,
  { method: 'POST' },
  fetchImpl,
);
