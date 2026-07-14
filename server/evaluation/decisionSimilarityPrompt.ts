import { readActivePromptVersion } from '../promptVersions/store';

export const resolveDecisionSimilarityPrompt = async (root: string) => {
  const active = await readActivePromptVersion(root);
  return {
    promptVersionId: active.versionId,
    promptHash: active.sha256,
    systemPrompt: active.content,
  };
};
