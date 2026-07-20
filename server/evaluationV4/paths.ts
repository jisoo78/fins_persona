import path from 'node:path';

export const evaluationV4Paths = (root: string) => {
  const base = path.resolve(root, 'evaluation/v4');
  return {
    root: base,
    scenarios: path.join(base, 'public/scenarios.json'),
    reviews: path.join(base, 'public/reviews.json'),
    manifest: path.join(base, 'sealed/manifest.json'),
    alignmentKey: path.join(base, 'sealed/scenario-key.json'),
    externalEventMap: path.join(base, 'sealed/external-event-map.json'),
    judgeRubric: path.join(base, 'sealed/judge-rubric.json'),
    sourceRegistry: path.join(base, 'sources/registry.json'),
    sourceRaw: path.join(base, 'sources/raw'),
    sourceNormalized: path.join(base, 'sources/normalized'),
    runs: path.join(base, 'runs'),
    retrievalCache: path.join(base, 'retrieval-cache'),
    judgePackets: path.join(base, 'judge-packets'),
    grades: path.join(base, 'grades'),
    reports: path.join(base, 'reports'),
  };
};
