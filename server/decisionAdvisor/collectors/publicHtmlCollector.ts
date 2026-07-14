import type { SourceCollector } from './types';
import { runInjectedHtmlCollector } from './types';

const DEFAULT_USER_AGENT = 'Fins Persona Decision Advisor source collector/1.0';

export const PublicHtmlCollector: SourceCollector = {
  name: 'public_html',
  supports: (record) => record.collector === 'public_html'
    && record.approvedPublicHost
    && new URL(record.canonicalUrl).protocol === 'https:',
  collect: (record, deps) => runInjectedHtmlCollector(
    record,
    deps,
    deps.userAgent ?? DEFAULT_USER_AGENT,
  ),
};
