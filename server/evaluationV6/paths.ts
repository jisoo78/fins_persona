import path from 'node:path';

export const evaluationV6Paths = (root: string) => {
  const base = path.resolve(root, 'evaluation/v6');
  return {
    root: base,
    audit: path.join(base, 'audit/v5-item-audit.json'),
    replacementLedger: path.join(base, 'audit/replacement-ledger.json'),
    scenarios: path.join(base, 'public/scenarios.json'),
    reviews: path.join(base, 'public/reviews.json'),
    provenance: path.join(base, 'sealed/event-provenance.json'),
    identityKeys: path.join(base, 'sealed/scenario-keys.json'),
    pairKeys: path.join(base, 'sealed/pair-keys.json'),
    calibrationAnswers: path.join(base, 'sealed/identity-calibration-answers.json'),
    manifest: path.join(base, 'sealed/manifest.json'),
    calibration: path.join(base, 'judge/calibration'),
    calibrationManualReview: path.join(base, 'judge/calibration/manual-review.json'),
    judgePackets: path.join(base, 'judge/packets'),
    localJudgeDrafts: path.join(base, 'judge/local-drafts'),
    grades: path.join(base, 'judge/grades'),
    pairGrades: path.join(base, 'judge/pair-grades'),
    runs: path.join(base, 'runs'),
    retrievalCache: path.join(base, 'retrieval-cache'),
    reports: path.join(base, 'reports'),
    formalRunCheckpoint: path.join(base, 'formal-run/active.json'),
  };
};
