import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  DecisionDomain,
  MemoryReleaseManifest,
  PilotDecisionEvent,
  PolicyMemory,
} from '../../shared/amyHoodDecisionAdvisor';
import { EVALUATION_V4_DOMAINS } from '../../shared/amyHoodEvaluationV4';
import { validatePilotEventCard } from '../decisionAdvisor/eventCard';
import { verifyMemoryRelease } from '../decisionAdvisor/memoryReleaseStore';
import { advisorPaths } from '../decisionAdvisor/paths';

export type EvaluationV4PolicyCoverageInput = {
  policies: PolicyMemory[];
  events: PilotDecisionEvent[];
};

export type EvaluationV4PolicyCoverageReport = {
  passed: boolean;
  coveredDomains: DecisionDomain[];
  missingDomains: DecisionDomain[];
  errors: string[];
  policyIdsByDomain: Partial<Record<DecisionDomain, string[]>>;
};

export const evaluatePolicyCoverage = ({
  policies,
  events,
}: EvaluationV4PolicyCoverageInput): EvaluationV4PolicyCoverageReport => {
  const eventById = new Map(events.map((event) => [event.id, event]));
  const errors: string[] = [];
  const policyIdsByDomain: Partial<Record<DecisionDomain, string[]>> = {};

  for (const policy of policies) {
    const prefix = `policy ${policy.id}`;
    if (policy.status !== 'approved'
      || policy.policyKind !== 'deployable_policy'
      || !policy.review
      || policy.review.decision !== 'approved') {
      errors.push(`${prefix} is not reviewed and deployable`);
    }
    if (policy.schemaVersion !== 2 || !policy.guardrails?.length) {
      errors.push(`${prefix} requires explicit guardrails`);
    }
    if (new Set(policy.supportingEventIds).size < 2) {
      errors.push(`${prefix} requires two supporting events`);
    }
    if (new Set(policy.contrastingEventIds).size < 1) {
      errors.push(`${prefix} requires a contrasting event`);
    }

    const eventIds = [...new Set([
      ...policy.supportingEventIds,
      ...policy.contrastingEventIds,
    ])];
    for (const eventId of eventIds) {
      const event = eventById.get(eventId);
      if (!event) {
        errors.push(`${prefix} has unresolved event ${eventId}`);
      } else if (event.status !== 'approved' || event.directAmyEvidenceIds.length === 0) {
        errors.push(`${prefix} event ${eventId} requires direct Amy evidence`);
      } else if (event.postOutcomeEvidenceIds.some((evidenceId) =>
        policy.evidenceIds.includes(evidenceId))) {
        errors.push(`${prefix} contains post-outcome evidence ${eventId}`);
      }
    }

    if (!errors.some((error) => error.startsWith(prefix))) {
      policyIdsByDomain[policy.domain] = [
        ...(policyIdsByDomain[policy.domain] ?? []),
        policy.id,
      ].sort();
    }
  }

  const coveredDomains = EVALUATION_V4_DOMAINS.filter((domain) =>
    (policyIdsByDomain[domain]?.length ?? 0) > 0);
  const missingDomains = EVALUATION_V4_DOMAINS.filter((domain) =>
    !coveredDomains.includes(domain));
  return {
    passed: errors.length === 0 && missingDomains.length === 0,
    coveredDomains,
    missingDomains,
    errors,
    policyIdsByDomain,
  };
};

export const assertEvaluationV4PolicyCoverage = (
  report: EvaluationV4PolicyCoverageReport,
) => {
  if (!report.passed) {
    throw new Error([
      ...report.errors,
      ...report.missingDomains.map((domain) => `missing policy domain: ${domain}`),
    ].join('; '));
  }
};

const loadJson = async <T>(filePath: string): Promise<T> =>
  JSON.parse(await readFile(filePath, 'utf8')) as T;

export const loadEvaluationV4PolicyCoverage = async (
  root: string,
): Promise<EvaluationV4PolicyCoverageReport> => {
  const paths = advisorPaths(root);
  const active = await loadJson<{ releaseId: string }>(paths.activeMemoryRelease);
  const manifest = await verifyMemoryRelease(root, active.releaseId);
  if (manifest.policySchemaVersion !== 2) {
    throw new Error('Evaluation v4 requires an active schema v2 policy release');
  }
  const releaseDirectory = path.join(paths.memoryReleases, manifest.releaseId);
  const readArtifacts = async <T>(kind: 'policy' | 'event') => Promise.all(
    manifest.artifacts
      .filter((artifact) => artifact.kind === kind)
      .map((artifact) => loadJson<T>(path.join(releaseDirectory, artifact.relativePath))),
  );
  const [policies, events] = await Promise.all([
    readArtifacts<PolicyMemory>('policy'),
    readArtifacts<PilotDecisionEvent>('event'),
  ]);
  for (const event of events) {
    const validation = validatePilotEventCard(event);
    if (validation.blockingGaps.length > 0) {
      throw new Error(
        `Evaluation v4 event ${event.id} failed validation: ${validation.blockingGaps.join(', ')}`,
      );
    }
  }
  return evaluatePolicyCoverage({ policies, events });
};
