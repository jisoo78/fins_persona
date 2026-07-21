import path from 'node:path';

export const evaluationV5Paths = (root: string) => {
  const base = path.resolve(root, 'evaluation/v5');
  return {
    root: base,
    scenarios: path.join(base, 'public/scenarios.json'),
    reviews: path.join(base, 'public/reviews.json'),
    manifest: path.join(base, 'sealed/manifest.json'),
    provenance: path.join(base, 'sealed/event-provenance.json'),
    alignmentKeys: path.join(base, 'sealed/scenario-keys.json'),
    pairKeys: path.join(base, 'sealed/pair-keys.json'),
    sourceRegistry: path.join(base, 'sources/registry.json'),
    sourceRaw: path.join(base, 'sources/raw'),
    sourceNormalized: path.join(base, 'sources/normalized'),
    runs: path.join(base, 'runs'),
    retrievalCache: path.join(base, 'retrieval-cache'),
    judgePackets: path.join(base, 'judge/packets'),
    localJudgeDrafts: path.join(base, 'judge/local-drafts'),
    grades: path.join(base, 'judge/grades'),
    pairGrades: path.join(base, 'judge/pair-grades'),
    reports: path.join(base, 'reports'),
  };
};
