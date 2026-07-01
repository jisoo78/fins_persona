import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { PreInterviewContext } from '../src/pre-question/types';

export interface StoredPreInterviewContextSummary {
  id: string;
  label: string;
  createdAt: string;
  questionCount: number;
  fileName: string;
}

export interface StoredPreInterviewContext extends StoredPreInterviewContextSummary {
  context: PreInterviewContext;
}

interface SavePreInterviewContextInput {
  context: PreInterviewContext;
  profileName?: string;
  storageDir: string;
  now?: Date;
}

const idPattern = /^[a-zA-Z0-9._-]+$/;

const createId = (now: Date) =>
  `preinterview-context-${now.toISOString().replace(/[:.]/g, '-')}`;

const createLabel = (profileName?: string) => {
  const trimmed = profileName?.trim();
  return `${trimmed || '로컬 테스트'} 사전 질문 응답지`;
};

const getFilePath = (id: string, storageDir: string) => {
  if (!idPattern.test(id)) {
    throw new Error('Invalid pre-interview context id');
  }

  const resolvedDir = path.resolve(storageDir);
  const resolvedFile = path.resolve(resolvedDir, `${id}.json`);

  if (!resolvedFile.startsWith(`${resolvedDir}${path.sep}`)) {
    throw new Error('Invalid pre-interview context id');
  }

  return resolvedFile;
};

const toSummary = (stored: StoredPreInterviewContext): StoredPreInterviewContextSummary => ({
  id: stored.id,
  label: stored.label,
  createdAt: stored.createdAt,
  questionCount: stored.questionCount,
  fileName: stored.fileName,
});

const countContextQuestions = (context: PreInterviewContext) =>
  Object.values(context.categories).reduce((total, categoryQuestions) => total + Object.keys(categoryQuestions).length, 0);

const parseStoredContext = (raw: string): StoredPreInterviewContext => {
  const parsed = JSON.parse(raw) as StoredPreInterviewContext;

  if (!parsed.id || !parsed.context || !parsed.createdAt) {
    throw new Error('Invalid stored pre-interview context file');
  }

  return parsed;
};

export const savePreInterviewContext = async ({
  context,
  profileName,
  storageDir,
  now = new Date(),
}: SavePreInterviewContextInput): Promise<StoredPreInterviewContextSummary> => {
  await mkdir(storageDir, { recursive: true });

  const id = createId(now);
  const fileName = `${id}.json`;
  const stored: StoredPreInterviewContext = {
    id,
    label: createLabel(profileName),
    createdAt: now.toISOString(),
    questionCount: countContextQuestions(context),
    fileName,
    context,
  };

  await writeFile(path.join(storageDir, fileName), `${JSON.stringify(stored, null, 2)}\n`, 'utf8');

  return toSummary(stored);
};

export const listPreInterviewContexts = async (
  storageDir: string,
): Promise<StoredPreInterviewContextSummary[]> => {
  try {
    const entries = await readdir(storageDir, { withFileTypes: true });
    const jsonFiles = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.json'));
    const storedContexts = await Promise.all(
      jsonFiles.map(async (entry) => parseStoredContext(await readFile(path.join(storageDir, entry.name), 'utf8'))),
    );

    return storedContexts
      .sort((first, second) => second.createdAt.localeCompare(first.createdAt))
      .map(toSummary);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return [];
    }

    throw error;
  }
};

export const loadPreInterviewContext = async (
  id: string,
  storageDir: string,
): Promise<StoredPreInterviewContext> => {
  const filePath = getFilePath(id, storageDir);
  const stored = parseStoredContext(await readFile(filePath, 'utf8'));

  if (stored.id !== id) {
    throw new Error('Invalid stored pre-interview context file');
  }

  return stored;
};
