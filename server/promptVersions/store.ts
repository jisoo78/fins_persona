import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type {
  PromptVersionDetail,
  PromptVersionManifest,
  PromptVersionRecord,
} from '../../shared/amyHoodPromptVersion';
import { assertValidPersonaPrompt } from '../personaPipeline/promptValidation';

export type PromptStoreDeps = {
  now(): string;
  createId(): string;
  atomicWrite(path: string, text: string): Promise<void>;
};

const dataRoot = (root: string) => resolve(root, 'data/b-track/amy-hood');
const manifestPath = (root: string) => resolve(dataRoot(root), 'prompt-versions.json');
const compatibilityPath = (root: string) =>
  resolve(dataRoot(root), 'AMY_HOOD_PERSONA.gemma4.md');

const assertVersionId = (versionId: string) => {
  if (!/^[a-zA-Z0-9-]+$/.test(versionId)) {
    throw new Error(`invalid prompt version ID: ${versionId}`);
  }
};

const versionPath = (root: string, versionId: string) => {
  assertVersionId(versionId);
  return resolve(dataRoot(root), 'prompts', `${versionId}.md`);
};

const defaultAtomicWrite = async (path: string, text: string) => {
  await mkdir(resolve(path, '..'), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, text, 'utf8');
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
};

const dependencies = (overrides: Partial<PromptStoreDeps>): PromptStoreDeps => ({
  now: overrides.now ?? (() => new Date().toISOString()),
  createId: overrides.createId ?? randomUUID,
  atomicWrite: overrides.atomicWrite ?? defaultAtomicWrite,
});

const digest = (content: string) =>
  createHash('sha256').update(content).digest('hex');

const readManifest = async (root: string) =>
  JSON.parse(await readFile(manifestPath(root), 'utf8')) as PromptVersionManifest;

const writeManifest = (root: string, manifest: PromptVersionManifest, deps: PromptStoreDeps) =>
  deps.atomicWrite(manifestPath(root), `${JSON.stringify(manifest, null, 2)}\n`);

const isMissing = (error: unknown) =>
  Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT');

const validateManifest = (manifest: PromptVersionManifest) => {
  if (
    !manifest.activeVersionId ||
    !Array.isArray(manifest.versions) ||
    !manifest.versions.some((version) => version.versionId === manifest.activeVersionId)
  ) {
    throw new Error('prompt version manifest is invalid');
  }
};

export const ensurePromptVersionStore = async (
  root: string,
  overrides: Partial<PromptStoreDeps> = {},
): Promise<PromptVersionManifest> => {
  try {
    const manifest = await readManifest(root);
    validateManifest(manifest);
    return manifest;
  } catch (error) {
    if (!isMissing(error)) throw error;
  }

  const deps = dependencies(overrides);
  const content = await readFile(compatibilityPath(root), 'utf8');
  assertValidPersonaPrompt(content);
  const versionId = deps.createId();
  assertVersionId(versionId);
  const record: PromptVersionRecord = {
    versionId,
    createdAt: deps.now(),
    sha256: digest(content),
    basedOnVersionId: null,
  };
  const manifest = { activeVersionId: versionId, versions: [record] };
  await deps.atomicWrite(versionPath(root, versionId), content);
  await writeManifest(root, manifest, deps);
  return manifest;
};

export const listPromptVersions = (root: string) => ensurePromptVersionStore(root);

export const readPromptVersion = async (
  root: string,
  versionId: string,
): Promise<PromptVersionDetail> => {
  assertVersionId(versionId);
  const manifest = await ensurePromptVersionStore(root);
  const record = manifest.versions.find((version) => version.versionId === versionId);
  if (!record) throw new Error(`unknown prompt version: ${versionId}`);
  const content = await readFile(versionPath(root, versionId), 'utf8');
  if (digest(content) !== record.sha256) {
    throw new Error(`prompt version hash mismatch: ${versionId}`);
  }
  return { ...record, content, active: manifest.activeVersionId === versionId };
};

export const createPromptVersion = async (
  root: string,
  input: { content: string; basedOnVersionId?: string | null },
  overrides: Partial<PromptStoreDeps> = {},
): Promise<PromptVersionDetail> => {
  assertValidPersonaPrompt(input.content);
  const manifest = await ensurePromptVersionStore(root);
  if (
    input.basedOnVersionId &&
    !manifest.versions.some((version) => version.versionId === input.basedOnVersionId)
  ) {
    throw new Error(`unknown prompt version: ${input.basedOnVersionId}`);
  }
  const deps = dependencies(overrides);
  const versionId = deps.createId();
  assertVersionId(versionId);
  if (manifest.versions.some((version) => version.versionId === versionId)) {
    throw new Error(`prompt version already exists: ${versionId}`);
  }
  const record: PromptVersionRecord = {
    versionId,
    createdAt: deps.now(),
    sha256: digest(input.content),
    basedOnVersionId: input.basedOnVersionId ?? null,
  };
  await deps.atomicWrite(versionPath(root, versionId), input.content);
  await writeManifest(
    root,
    { ...manifest, versions: [...manifest.versions, record] },
    deps,
  );
  return { ...record, content: input.content, active: false };
};

export const activatePromptVersion = async (
  root: string,
  versionId: string,
  overrides: Partial<PromptStoreDeps> = {},
): Promise<PromptVersionDetail> => {
  const version = await readPromptVersion(root, versionId);
  assertValidPersonaPrompt(version.content);
  const manifest = await ensurePromptVersionStore(root);
  const deps = dependencies(overrides);
  await deps.atomicWrite(compatibilityPath(root), version.content);
  await writeManifest(root, { ...manifest, activeVersionId: versionId }, deps);
  return { ...version, active: true };
};

export const readActivePromptVersion = async (root: string) => {
  const manifest = await ensurePromptVersionStore(root);
  const active = await readPromptVersion(root, manifest.activeVersionId);
  let compatibility = '';
  try {
    compatibility = await readFile(compatibilityPath(root), 'utf8');
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
  if (compatibility !== active.content) {
    await defaultAtomicWrite(compatibilityPath(root), active.content);
  }
  return active;
};
