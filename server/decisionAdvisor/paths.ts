import path from 'node:path';

export const advisorPaths = (root: string) => {
  const advisorRoot = path.resolve(root, 'data/b-track/amy-hood/advisor');

  return {
    root: advisorRoot,
    registry: path.resolve(advisorRoot, 'source-registry.json'),
    raw: path.resolve(advisorRoot, 'raw'),
    eventsPilot: path.resolve(advisorRoot, 'events/pilot'),
    pilotManifest: path.resolve(advisorRoot, 'events/pilot/pilot-manifest.json'),
    pilotExtractionRuns: path.resolve(advisorRoot, 'events/pilot/extraction-runs'),
  };
};
