import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, realpath, rename, rm } from 'node:fs/promises';
import path from 'node:path';

import { prepareAdvisorArtifactPath } from './sourceRegistry';

export type ArtifactWriteHooks = {
  afterParentOpen?: (handle: { stat(): Promise<unknown> }) => Promise<void> | void;
  beforeTemporaryOpen?: () => Promise<void> | void;
  beforeRename?: () => Promise<void> | void;
};

export const writeAdvisorArtifactAtomic = async (
  root: string,
  relativePath: string,
  text: string,
  hooks?: ArtifactWriteHooks,
) => {
  const destination = await prepareAdvisorArtifactPath(root, relativePath);
  const parentPath = path.dirname(destination);
  const parentHandle = await open(
    parentPath,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  );
  let temporaryPath: string | undefined;
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    await hooks?.afterParentOpen?.(parentHandle);
    const anchor = await parentHandle.stat();
    const verifyParentAnchor = async () => {
      const pathnameStatus = await lstat(parentPath);
      if (pathnameStatus.isSymbolicLink()
        || pathnameStatus.dev !== anchor.dev
        || pathnameStatus.ino !== anchor.ino) {
        throw new Error(`advisor artifact parent inode changed: ${relativePath}`);
      }
      await prepareAdvisorArtifactPath(root, relativePath);
    };
    const descriptorCandidates = [
      `/dev/fd/${parentHandle.fd}`,
      `/proc/self/fd/${parentHandle.fd}`,
    ];
    let anchoredParent: string | null = null;
    for (const candidate of descriptorCandidates) {
      try {
        const candidateRealpath = await realpath(candidate);
        const parentRealpath = await realpath(parentPath);
        if (candidateRealpath === parentRealpath) {
          anchoredParent = candidate;
          break;
        }
      } catch {
        // This platform has no descriptor filesystem for directory-relative operations.
      }
    }
    // Node exposes no portable openat/renameat. Descriptor paths close that gap on
    // Linux/macOS; the fallback retains inode checks but trusts same-user local code
    // not to swap the parent in the final syscall-sized interval.
    const temporaryName = `${path.basename(destination)}.${process.pid}.${randomUUID()}.tmp`;
    temporaryPath = await prepareAdvisorArtifactPath(
      root,
      path.join('.artifact-staging', temporaryName),
    );
    const anchoredDestination = path.join(
      anchoredParent ?? parentPath,
      path.basename(destination),
    );
    await hooks?.beforeTemporaryOpen?.();
    await verifyParentAnchor();
    handle = await open(
      temporaryPath,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
      0o600,
    );
    await verifyParentAnchor();
    await handle.writeFile(text, 'utf8');
    await handle.sync();
    await handle.close();
    handle = undefined;
    await hooks?.beforeRename?.();
    await verifyParentAnchor();
    await rename(temporaryPath, anchoredDestination);
    try {
      await verifyParentAnchor();
    } catch (error) {
      await rm(anchoredDestination, { force: true }).catch(() => undefined);
      throw error;
    }
    await parentHandle.sync();
  } catch (error) {
    if (handle) await handle.close().catch(() => undefined);
    if (temporaryPath) await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  } finally {
    await parentHandle.close().catch(() => undefined);
  }
};

export const removeAdvisorArtifact = async (root: string, relativePath: string) => {
  const destination = await prepareAdvisorArtifactPath(root, relativePath);
  await rm(destination, { force: true });
};
