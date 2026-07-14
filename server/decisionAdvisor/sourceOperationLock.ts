import { advisorPaths } from './paths';
import { sourceIdForUrl } from './sourceRegistry';

const sourceOperationLocks = new Map<string, Promise<void>>();

export const withSourceFamilyOperation = async <T>(
  root: string,
  canonicalUrl: string,
  operation: () => Promise<T>,
): Promise<T> => {
  const key = `${advisorPaths(root).registry}\0${sourceIdForUrl(canonicalUrl)}`;
  const previous = sourceOperationLocks.get(key) ?? Promise.resolve();
  let release = () => undefined;
  const current = new Promise<void>((resolve) => { release = resolve; });
  const queued = previous.then(() => current);
  sourceOperationLocks.set(key, queued);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (sourceOperationLocks.get(key) === queued) sourceOperationLocks.delete(key);
  }
};
