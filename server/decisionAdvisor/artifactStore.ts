import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, realpath, rename, rm } from 'node:fs/promises';
import path from 'node:path';

import { prepareAdvisorArtifactPath } from './sourceRegistry';

export type ArtifactWriteHooks = {
  afterParentOpen?: (handle: { stat(): Promise<unknown> }) => Promise<void> | void;
  beforeTemporaryOpen?: () => Promise<void> | void;
  beforeRename?: () => Promise<void> | void;
  afterRename?: () => Promise<void> | void;
  beforeDirectorySync?: () => Promise<void> | void;
};

export type ArtifactRemoveHooks = {
  afterParentOpen?: (handle: { stat(): Promise<unknown> }) => Promise<void> | void;
  beforeRemove?: () => Promise<void> | void;
  afterRemove?: () => Promise<void> | void;
};

export const readAdvisorArtifactSecure = async (
  root: string,
  relativePath: string,
): Promise<Buffer> => {
  const destination = await prepareAdvisorArtifactPath(root, relativePath);
  const parentPath = path.dirname(destination);
  const parentHandle = await open(
    parentPath,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  );
  let fileHandle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    const anchor = await parentHandle.stat();
    const verifyParentAnchor = async () => {
      const status = await lstat(parentPath);
      if (status.isSymbolicLink() || status.dev !== anchor.dev || status.ino !== anchor.ino) {
        throw new Error(`advisor artifact parent inode changed before read: ${relativePath}`);
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
        if (await realpath(candidate) === await realpath(parentPath)) {
          anchoredParent = candidate;
          break;
        }
      } catch {
        // Descriptor paths are platform-dependent; inode checks remain the fallback.
      }
    }
    await verifyParentAnchor();
    fileHandle = await open(
      path.join(anchoredParent ?? parentPath, path.basename(destination)),
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    const status = await fileHandle.stat();
    if (!status.isFile()) throw new Error(`advisor artifact is not a regular file: ${relativePath}`);
    const bytes = await fileHandle.readFile();
    await verifyParentAnchor();
    return bytes;
  } finally {
    await fileHandle?.close().catch(() => undefined);
    await parentHandle.close().catch(() => undefined);
  }
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
  let anchoredDestination: string | undefined;
  let promoted = false;
  let verifyParentAnchor: (() => Promise<void>) | undefined;
  try {
    await hooks?.afterParentOpen?.(parentHandle);
    const anchor = await parentHandle.stat();
    verifyParentAnchor = async () => {
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
    anchoredDestination = path.join(
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
    promoted = true;
    temporaryPath = undefined;
    await hooks?.afterRename?.();
    await verifyParentAnchor();
    await hooks?.beforeDirectorySync?.();
    await parentHandle.sync();
  } catch (operationError) {
    const cleanupErrors: unknown[] = [];
    if (handle) {
      try {
        await handle.close();
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    if (temporaryPath) {
      try {
        await rm(temporaryPath, { force: true });
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    if (promoted && anchoredDestination && verifyParentAnchor) {
      try {
        await verifyParentAnchor();
        await rm(anchoredDestination, { force: true });
        await parentHandle.sync();
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    if (cleanupErrors.length > 0) {
      throw new AggregateError(
        [operationError, ...cleanupErrors],
        'atomic advisor artifact write failed and cleanup was incomplete',
      );
    }
    throw operationError;
  } finally {
    await parentHandle.close().catch(() => undefined);
  }
};

export const removeAdvisorArtifact = async (
  root: string,
  relativePath: string,
  hooks?: ArtifactRemoveHooks,
) => {
  const destination = await prepareAdvisorArtifactPath(root, relativePath);
  const parentPath = path.dirname(destination);
  const parentHandle = await open(
    parentPath,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  );
  try {
    const anchor = await parentHandle.stat();
    await hooks?.afterParentOpen?.(parentHandle);
    const verifyParentAnchor = async () => {
      const pathnameStatus = await lstat(parentPath);
      if (pathnameStatus.isSymbolicLink()
        || pathnameStatus.dev !== anchor.dev
        || pathnameStatus.ino !== anchor.ino) {
        throw new Error(`advisor artifact parent inode changed before removal: ${relativePath}`);
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
    const anchoredDestination = path.join(
      anchoredParent ?? parentPath,
      path.basename(destination),
    );
    await hooks?.beforeRemove?.();
    await verifyParentAnchor();
    await rm(anchoredDestination, { force: true });
    await hooks?.afterRemove?.();
    await verifyParentAnchor();
    await parentHandle.sync();
  } finally {
    await parentHandle.close().catch(() => undefined);
  }
};
