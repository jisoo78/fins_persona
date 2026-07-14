import type { SourceCollector } from './types';
import { runInjectedHtmlCollector } from './types';

const DEFAULT_USER_AGENT = 'Fins Persona Decision Advisor source collector/1.0';

export const PublicHtmlCollector: SourceCollector = {
  name: 'public_html',
  supports: (record) => record.collector === 'public_html'
    && record.approvedPublicHost
    && new URL(record.canonicalUrl).protocol === 'https:',
  collect(record, deps) {
    if (!this.supports(record)) {
      return Promise.reject(new Error(
        'public_html does not support this source URL; an approved public host is required',
      ));
    }
    return runInjectedHtmlCollector(record, deps, deps.userAgent ?? DEFAULT_USER_AGENT);
  },
};
