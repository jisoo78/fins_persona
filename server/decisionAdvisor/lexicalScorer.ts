import type { AmyHoodMemorySearchRecord } from '../../shared/amyHoodRag';

export const tokenizeAmyHoodMemory = (text: string): string[] =>
  text.toLocaleLowerCase('en-US').normalize('NFKC').match(/[\p{L}\p{N}]+/gu) ?? [];

export const scoreBm25 = (query: string, records: AmyHoodMemorySearchRecord[]) => {
  const documents = records.map(({ searchableText }) => tokenizeAmyHoodMemory(searchableText));
  const terms = [...new Set(tokenizeAmyHoodMemory(query))];
  const averageLength = documents.reduce((sum, words) => sum + words.length, 0) / Math.max(1, documents.length);
  return records.map((record, index) => {
    const words = documents[index];
    const frequencies = new Map<string, number>();
    words.forEach((word) => frequencies.set(word, (frequencies.get(word) ?? 0) + 1));
    const score = terms.reduce((sum, term) => {
      const frequency = frequencies.get(term) ?? 0;
      if (!frequency) return sum;
      const documentFrequency = documents.filter((document) => document.includes(term)).length;
      const idf = Math.log(1 + (records.length - documentFrequency + 0.5) / (documentFrequency + 0.5));
      const denominator = frequency + 1.2 * (1 - 0.75 + 0.75 * words.length / Math.max(1, averageLength));
      return sum + idf * frequency * 2.2 / denominator;
    }, 0);
    return { id: record.id, score };
  });
};
