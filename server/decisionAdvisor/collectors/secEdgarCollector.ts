import type { SourceCollector } from './types';
import { runInjectedHtmlCollector } from './types';

const SEC_USER_AGENT = 'Fins Persona Decision Advisor research contact: research@fins-persona.local';

const isSecHost = (hostname: string) =>
  hostname === 'sec.gov' || hostname.endsWith('.sec.gov');

export const SecEdgarCollector: SourceCollector = {
  name: 'sec_edgar',
  supports: (record) => record.collector === 'sec_edgar'
    && isSecHost(new URL(record.canonicalUrl).hostname),
  collect: (record, deps) => runInjectedHtmlCollector(
    record,
    deps,
    deps.userAgent ?? SEC_USER_AGENT,
  ),
};
