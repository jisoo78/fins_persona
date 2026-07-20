import type {
  EventCandidate,
  PilotManifest,
} from '../../shared/amyHoodDecisionAdvisor';
import { readJsonFile } from './jsonStore';
import { advisorPaths } from './paths';

const domains = new Set([
  'm_and_a',
  'ai_cloud_capex',
  'pricing_monetization',
  'cost_efficiency',
  'shareholder_return_risk',
]);

export const validatePilotManifest = (
  value: unknown,
  candidates: EventCandidate[],
): PilotManifest => {
  if (!value || typeof value !== 'object') {
    throw new Error('pilot manifest must be an object');
  }
  const manifest = value as PilotManifest;
  if (manifest.dataset !== 'amy_hood_phase_3_pilot'
    || (manifest.version !== '1.0.0' && manifest.version !== '2.0.0')) {
    throw new Error('pilot manifest identity is invalid');
  }
  const expectedCount = manifest.version === '1.0.0' ? 10 : 15;
  if (!Array.isArray(manifest.targets) || manifest.targets.length !== expectedCount) {
    throw new Error(
      `pilot manifest ${manifest.version} requires exactly ${expectedCount} targets; found ${manifest.targets?.length ?? 0}`,
    );
  }

  const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const ids = new Set<string>();
  const priorities = new Set<number>();
  const coveredDomains = new Set<string>();

  for (const target of manifest.targets) {
    if (ids.has(target.candidateId)) {
      throw new Error(`duplicate pilot candidate: ${target.candidateId}`);
    }
    if (priorities.has(target.priority)) {
      throw new Error(`duplicate pilot priority: ${target.priority}`);
    }
    if (!Number.isInteger(target.priority)
      || target.priority < 1
      || target.priority > expectedCount) {
      throw new Error(`invalid pilot priority: ${target.priority}`);
    }
    const candidate = candidateById.get(target.candidateId);
    if (!candidate) throw new Error(`unknown pilot candidate: ${target.candidateId}`);
    if (candidate.domain !== target.domain || !domains.has(target.domain)) {
      throw new Error(`pilot domain mismatch: ${target.candidateId}`);
    }
    if (target.replacementReason !== undefined
      && target.replacementReason.trim().length < 20) {
      throw new Error(`pilot replacement reason is too short: ${target.candidateId}`);
    }
    ids.add(target.candidateId);
    priorities.add(target.priority);
    coveredDomains.add(target.domain);
  }

  if (coveredDomains.size !== 5) {
    throw new Error('pilot manifest must cover all five domains');
  }
  if (manifest.version === '2.0.0') {
    for (const domain of domains) {
      if (manifest.targets.filter((target) => target.domain === domain).length !== 3) {
        throw new Error(`pilot manifest v2 requires exactly three targets for ${domain}`);
      }
    }
  }
  return manifest;
};

export const loadPilotManifest = async (
  root: string,
  candidates: EventCandidate[],
) => validatePilotManifest(
  await readJsonFile<unknown>(advisorPaths(root).pilotManifest, null),
  candidates,
);
