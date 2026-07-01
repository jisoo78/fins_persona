export const readJsonResponse = async <T>(response: Response, fallbackMessage: string): Promise<T> => {
  const text = await response.text();

  if (!text.trim()) {
    throw new Error(fallbackMessage);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(fallbackMessage);
  }

  if (!response.ok) {
    const message = parsed && typeof parsed === 'object' && 'message' in parsed && typeof parsed.message === 'string'
      ? parsed.message
      : fallbackMessage;
    throw new Error(message);
  }

  return parsed as T;
};
