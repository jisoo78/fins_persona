import type { SourceTier } from '../../shared/amyHoodDecisionAdvisor';

export type SourceUrlClassification = {
  mode: 'automatic' | 'discovery_only';
  tier: SourceTier;
};

const autoHosts = ['microsoft.com', 'news.microsoft.com', 'sec.gov', 'data.sec.gov'];
const trackingKeys = new Set(['fbclid', 'gclid']);

const hostMatches = (host: string, allowed: string) =>
  host === allowed || host.endsWith(`.${allowed}`);

const parseHttpsUrl = (sourceUrl: string) => {
  const parsed = new URL(sourceUrl);
  if (parsed.protocol !== 'https:') {
    throw new Error(`source URL must use HTTPS: ${sourceUrl}`);
  }
  return parsed;
};

export const canonicalizeSourceUrl = (sourceUrl: string): string => {
  const canonical = parseHttpsUrl(sourceUrl);
  canonical.hash = '';

  for (const key of [...canonical.searchParams.keys()]) {
    const normalizedKey = key.toLowerCase();
    if (normalizedKey.startsWith('utm_') || trackingKeys.has(normalizedKey)) {
      canonical.searchParams.delete(key);
    }
  }
  canonical.searchParams.sort();

  return canonical.toString();
};

export const classifySourceUrl = (
  sourceUrl: string,
  approvedPublicHosts: string[] = [],
): SourceUrlClassification => {
  const canonical = parseHttpsUrl(canonicalizeSourceUrl(sourceUrl));
  const host = canonical.hostname;

  if (hostMatches(host, 'linkedin.com')) {
    return { mode: 'discovery_only', tier: 'discovery_only' };
  }

  if (autoHosts.some((allowed) => hostMatches(host, allowed))) {
    return { mode: 'automatic', tier: 1 };
  }

  const approvedHosts = new Set(
    approvedPublicHosts.map((approvedHost) => approvedHost.toLowerCase()),
  );
  if (approvedHosts.has(host)) {
    return { mode: 'automatic', tier: 3 };
  }

  throw new Error(`source host ${host} requires manual review`);
};
