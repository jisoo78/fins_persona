import type { AdvisorSourceRecord } from '../../../shared/amyHoodDecisionAdvisor';

export type HostResolver = (hostname: string) => Promise<string[]>;

export type PinnedTransportRequest = {
  url: URL;
  init: RequestInit;
  validatedAddresses: string[];
};

export type TransportImplementation = (
  request: PinnedTransportRequest,
) => Promise<Response>;

export type CollectorDependencies = {
  root: string;
  transportImpl?: TransportImplementation;
  resolveHost?: HostResolver;
  now?: () => Date;
  userAgent?: string;
  collectHtml?: (
    record: AdvisorSourceRecord,
    dependencies: CollectorDependencies,
    userAgent: string,
  ) => Promise<AdvisorSourceRecord>;
};

export type SourceCollector = {
  name: AdvisorSourceRecord['collector'];
  supports(record: AdvisorSourceRecord): boolean;
  collect(
    record: AdvisorSourceRecord,
    deps: CollectorDependencies,
  ): Promise<AdvisorSourceRecord>;
};

export const runInjectedHtmlCollector = async (
  record: AdvisorSourceRecord,
  deps: CollectorDependencies,
  userAgent: string,
) => {
  if (deps.collectHtml) return deps.collectHtml(record, deps, userAgent);
  const { collectHtmlSource } = await import('../officialSourceCollector');
  return collectHtmlSource(record, deps, userAgent);
};
