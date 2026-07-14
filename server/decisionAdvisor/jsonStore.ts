import {
  mkdir,
  open,
  readFile,
  rename,
  rm,
} from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

type AtomicWriteHandle = {
  writeFile(data: string, encoding: BufferEncoding): Promise<void>;
  sync(): Promise<void>;
  close(): Promise<void>;
};

export type AtomicJsonDependencies = {
  openTemporaryFile(filePath: string): Promise<AtomicWriteHandle>;
  rename(source: string, destination: string): Promise<void>;
  remove(filePath: string, options: { force: boolean }): Promise<void>;
};

const defaultDependencies: AtomicJsonDependencies = {
  openTemporaryFile: (filePath) => open(filePath, 'wx'),
  rename,
  remove: rm,
};

export const readJsonFile = async <T>(filePath: string, fallback: T): Promise<T> => {
  try {
    return JSON.parse(await readFile(filePath, 'utf8')) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fallback;
    throw error;
  }
};

export const writeJsonAtomic = async (
  filePath: string,
  value: unknown,
  injectedDependencies: Partial<AtomicJsonDependencies> = {},
): Promise<void> => {
  let serialized: string;
  try {
    const json = JSON.stringify(value, null, 2);
    if (json === undefined) throw new TypeError('unsupported JSON value');
    serialized = `${json}\n`;
  } catch {
    throw new TypeError('value must be JSON-serializable');
  }

  await mkdir(path.dirname(filePath), { recursive: true });
  const dependencies = { ...defaultDependencies, ...injectedDependencies };
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  let temporaryFile: AtomicWriteHandle | undefined;

  try {
    temporaryFile = await dependencies.openTemporaryFile(temporaryPath);
    await temporaryFile.writeFile(serialized, 'utf8');
    await temporaryFile.sync();
    const completedFile = temporaryFile;
    temporaryFile = undefined;
    await completedFile.close();
    await dependencies.rename(temporaryPath, filePath);
  } catch (operationError) {
    const cleanupErrors: unknown[] = [];

    if (temporaryFile) {
      try {
        await temporaryFile.close();
      } catch (closeError) {
        cleanupErrors.push(closeError);
      }
    }

    try {
      await dependencies.remove(temporaryPath, { force: true });
    } catch (removeError) {
      cleanupErrors.push(removeError);
    }

    if (cleanupErrors.length > 0) {
      throw new AggregateError(
        [operationError, ...cleanupErrors],
        'atomic JSON write failed and cleanup was incomplete',
      );
    }
    throw operationError;
  }
};
