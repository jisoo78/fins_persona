import type { AdvisorSourceRecord } from '../../../shared/amyHoodDecisionAdvisor';
import type { SourceCollector } from './types';
import { runInjectedHtmlCollector } from './types';

const DEFAULT_USER_AGENT = 'Fins Persona Decision Advisor source collector/1.0';

const isMicrosoftHost = (hostname: string) =>
  hostname === 'microsoft.com' || hostname.endsWith('.microsoft.com');

const isInvestorRelations = (record: AdvisorSourceRecord) => {
  const url = new URL(record.canonicalUrl);
  return isMicrosoftHost(url.hostname) && /(^|\/)investor(\/|$)/i.test(url.pathname);
};

export const MicrosoftIRCollector: SourceCollector = {
  name: 'microsoft_ir',
  supports: (record) => record.collector === 'microsoft_ir' && isInvestorRelations(record),
  collect(record, deps) {
    if (!this.supports(record)) {
      return Promise.reject(new Error('microsoft_ir does not support this source URL'));
    }
    return runInjectedHtmlCollector(record, deps, deps.userAgent ?? DEFAULT_USER_AGENT);
  },
};

export const MicrosoftSourceCollector: SourceCollector = {
  name: 'microsoft_source',
  supports: (record) => {
    const url = new URL(record.canonicalUrl);
    return record.collector === 'microsoft_source'
      && isMicrosoftHost(url.hostname)
      && !isInvestorRelations(record);
  },
  collect(record, deps) {
    if (!this.supports(record)) {
      return Promise.reject(new Error('microsoft_source does not support this source URL'));
    }
    return runInjectedHtmlCollector(record, deps, deps.userAgent ?? DEFAULT_USER_AGENT);
  },
};
