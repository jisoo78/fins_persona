import type { AdvisorSourceRecord } from '../../shared/amyHoodDecisionAdvisor';
import {
  importReviewedSourceWithOptions,
  type ManualImportDependencies,
  type ReviewedSourceImport,
  type SpeakerSegment,
} from './manualSourceImporter';

export type TranscriptImport = ReviewedSourceImport & {
  speakerSegments: SpeakerSegment[];
};

const validateSpeakerSegments = (input: TranscriptImport) => {
  if (!Array.isArray(input.speakerSegments) || input.speakerSegments.length === 0) {
    throw new Error('transcript import requires speaker segments');
  }

  const ordered = [...input.speakerSegments].sort((left, right) =>
    left.startChar - right.startChar || left.endChar - right.endChar);
  for (const [index, segment] of ordered.entries()) {
    if (typeof segment.speaker !== 'string' || segment.speaker.trim() === '') {
      throw new Error('speaker segment requires a speaker label');
    }
    if (!Number.isInteger(segment.startChar)
      || !Number.isInteger(segment.endChar)
      || segment.startChar < 0
      || segment.endChar <= segment.startChar
      || segment.endChar > input.text.length) {
      throw new Error('speaker segment offsets must be integer bounds within the transcript');
    }
    if (index > 0 && segment.startChar < ordered[index - 1].endChar) {
      throw new Error('speaker segment offsets must not overlap');
    }
  }

  return ordered.some(({ speaker }) => speaker.trim() === 'Amy Hood');
};

export const importTranscript = async (
  input: TranscriptImport,
  root: string,
  dependencies: ManualImportDependencies = {},
): Promise<AdvisorSourceRecord> => {
  const hasVerifiedAmyHoodSegment = validateSpeakerSegments(input);
  return importReviewedSourceWithOptions(input, root, {
    collector: 'transcript_import',
    sourceType: 'transcript',
    failureReason: hasVerifiedAmyHoodSegment ? null : 'speaker_uncertain',
  }, dependencies);
};
