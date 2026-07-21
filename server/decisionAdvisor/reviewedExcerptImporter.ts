import { createHash } from 'node:crypto';

import type { AdvisorSourceRecord } from '../../shared/amyHoodDecisionAdvisor';
import {
  importReviewedSource,
  type ManualImportDependencies,
  type ReviewedSourceImport,
} from './manualSourceImporter';

export type ReviewedExcerptImport = Omit<
  ReviewedSourceImport,
  'text' | 'expectedSha256' | 'speakerSegments' | 'contentCompleteness'
> & {
  excerptText: string;
  exactQuote: string;
  evidenceUse: 'direct_amy' | 'decision_context';
};

export const importReviewedExcerpt = async (
  input: ReviewedExcerptImport,
  root: string,
  dependencies: ManualImportDependencies = {},
): Promise<AdvisorSourceRecord> => {
  const startChar = input.excerptText.indexOf(input.exactQuote);
  if (!input.exactQuote.trim()
    || startChar < 0
    || startChar !== input.excerptText.lastIndexOf(input.exactQuote)) {
    throw new Error('reviewed excerpt requires one exact quote occurrence');
  }
  if (input.evidenceUse === 'direct_amy' && input.speaker !== 'Amy Hood') {
    throw new Error('direct reviewed excerpt requires Amy Hood as speaker');
  }
  return importReviewedSource({
    ...input,
    text: input.excerptText,
    expectedSha256: createHash('sha256').update(input.excerptText, 'utf8').digest('hex'),
    contentCompleteness: 'reviewed_excerpt',
    speakerSegments: input.evidenceUse === 'direct_amy'
      ? [{
          speaker: 'Amy Hood',
          startChar,
          endChar: startChar + input.exactQuote.length,
        }]
      : [],
  }, root, dependencies);
};
