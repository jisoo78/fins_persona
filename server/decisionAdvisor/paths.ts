import path from 'node:path';

export const advisorPaths = (root: string) => {
  const advisorRoot = path.resolve(root, 'data/b-track/amy-hood/advisor');

  return {
    root: advisorRoot,
    registry: path.resolve(advisorRoot, 'source-registry.json'),
    raw: path.resolve(advisorRoot, 'raw'),
    eventsPilot: path.resolve(advisorRoot, 'events/pilot'),
    pilotManifest: path.resolve(advisorRoot, 'events/pilot/pilot-manifest.json'),
    pilotPolicyEvidence: path.resolve(advisorRoot, 'events/pilot/policy-evidence.json'),
    pilotExtractionRuns: path.resolve(advisorRoot, 'events/pilot/extraction-runs'),
    policyMemory: path.resolve(advisorRoot, 'policy-memory'),
    reflectionProposals: path.resolve(advisorRoot, 'policy-memory/proposals/reflections'),
    policyProposals: path.resolve(advisorRoot, 'policy-memory/proposals/policies'),
    policyModelRuns: path.resolve(advisorRoot, 'policy-memory/proposals/model-runs'),
    approvedReflections: path.resolve(advisorRoot, 'policy-memory/approved/reflections'),
    approvedPolicies: path.resolve(advisorRoot, 'policy-memory/approved/policies'),
    rejectedReflections: path.resolve(advisorRoot, 'policy-memory/rejected/reflections'),
    rejectedPolicies: path.resolve(advisorRoot, 'policy-memory/rejected/policies'),
    policyReviews: path.resolve(advisorRoot, 'policy-memory/reviews'),
    policyGateReport: path.resolve(advisorRoot, 'policy-memory/gate-report.json'),
    memoryReleases: path.resolve(advisorRoot, 'memory-releases'),
    activeMemoryRelease: path.resolve(advisorRoot, 'memory-releases/active.json'),
  };
};
