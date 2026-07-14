export type PromptVersionRecord = {
  versionId: string;
  createdAt: string;
  sha256: string;
  basedOnVersionId: string | null;
};

export type PromptVersionManifest = {
  activeVersionId: string;
  versions: PromptVersionRecord[];
};

export type PromptVersionDetail = PromptVersionRecord & {
  content: string;
  active: boolean;
};
