import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  DecisionDomain,
  EventCandidate,
  PilotDecisionEvent,
  PilotEvidenceGap,
  PilotManifest,
} from '../../shared/amyHoodDecisionAdvisor';
import type { ModelClient } from '../personaPipeline/modelClient';
import { extractPilotEvidence } from './evidenceExtractor';
import {
  eventCardPath,
  proposePilotEventCard,
  savePilotEventCard,
} from './eventCard';
import { readJsonFile, writeJsonAtomic } from './jsonStore';
import { loadPilotManifest } from './pilotManifest';
import { loadValidatedPilotPolicyEvidence } from './pilotPolicyEvidence';
import { advisorPaths } from './paths';
import { loadPilotSourceInputs, reviewedDecisionContextSpan } from './pilotSourceLoader';

export type PilotBatchResult = {
  results: PilotDecisionEvent[];
  failures: Array<{ candidateId: string; message: string }>;
};

export type PilotReportRow = {
  priority: number;
  candidateId: string;
  domain: DecisionDomain;
  status: 'approved' | 'incomplete';
  decisionQuestion: string;
  chosenAction: string;
  directQuote: string;
  policyQuote: string;
  contextQuote: string;
  gaps: PilotEvidenceGap[];
};

export type PilotReport = {
  counts: { approved: number; incomplete: number; total: number };
  domainCounts: Record<string, number>;
  rows: PilotReportRow[];
};

const candidateFile = (root: string) => path.resolve(
  root,
  'data/b-track/amy-hood/advisor/event-candidates.json',
);

const loadCandidates = async (root: string) => JSON.parse(
  await readFile(candidateFile(root), 'utf8'),
) as EventCandidate[];

const unique = <T>(values: T[]) => [...new Set(values)];

export const retainedExtractionGaps = (
  spans: PilotDecisionEvent['evidenceSpans'],
  gaps: PilotEvidenceGap[],
) => spans.length === 0
  ? unique(gaps)
  : unique(gaps.filter((gap) =>
    gap !== 'invalid_quote_offsets' && gap !== 'model_response_invalid'));

const documentFamilies = (
  inputs: Awaited<ReturnType<typeof loadPilotSourceInputs>>['core'],
) => unique(inputs.map(({ source, association }) =>
  association.documentFamilyId ?? `source:${source.id}`));

export const buildPilotEvent = async (
  root: string,
  candidateId: string,
  model: ModelClient,
  options: { refreshApproved?: boolean } = {},
) => {
  const candidates = await loadCandidates(root);
  const manifest = await loadPilotManifest(root, candidates);
  if (!manifest.targets.some((target) => target.candidateId === candidateId)) {
    throw new Error(`candidate is not in the pilot manifest: ${candidateId}`);
  }
  const candidate = candidates.find(({ id }) => id === candidateId);
  if (!candidate) throw new Error(`unknown pilot candidate: ${candidateId}`);

  const current = await readJsonFile<PilotDecisionEvent | null>(
    eventCardPath(root, candidateId),
    null,
  );
  if (current?.status === 'approved' && !options.refreshApproved) return current;

  const loaded = await loadPilotSourceInputs(root, candidate);
  const policyByCandidate = await loadValidatedPilotPolicyEvidence(root, candidates);
  const spans = [];
  const extractionGaps: PilotEvidenceGap[] = [];
  for (const input of loaded.core) {
    const reviewedContext = reviewedDecisionContextSpan(input);
    if (reviewedContext) {
      spans.push(reviewedContext);
      continue;
    }
    const result = await extractPilotEvidence({ root, ...input }, model);
    spans.push(...result.spans);
    extractionGaps.push(...result.gaps);
  }
  spans.push(...(policyByCandidate.get(candidate.id) ?? []));
  if (spans.length === 0) {
    throw new Error(`no validated decision-time evidence spans: ${candidateId}`);
  }
  const card = await proposePilotEventCard(candidate, spans, model, {
    documentFamilyIds: unique([
      ...documentFamilies(loaded.core),
      ...(policyByCandidate.get(candidate.id) ?? []).map(({ sourceId }) =>
        `source:${sourceId}`),
    ]),
  });
  card.gaps = unique([
    ...card.gaps,
    ...loaded.gaps,
    ...retainedExtractionGaps(spans, extractionGaps),
  ]);
  await savePilotEventCard(root, card);
  return card;
};

export const buildPilotBatch = async (
  root: string,
  manifest: PilotManifest,
  dependencies: {
    build: (candidateId: string) => Promise<PilotDecisionEvent>;
  },
): Promise<PilotBatchResult> => {
  const results: PilotDecisionEvent[] = [];
  const failures: PilotBatchResult['failures'] = [];
  for (const target of [...manifest.targets].sort((left, right) =>
    left.priority - right.priority)) {
    try {
      results.push(await dependencies.build(target.candidateId));
    } catch (error) {
      failures.push({
        candidateId: target.candidateId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { results, failures };
};

const escapeHtml = (value: string) => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const writeTextAtomic = async (file: string, text: string) => {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, text, { encoding: 'utf8', flag: 'wx' });
    await rename(temporary, file);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
};

const reportHtml = (report: PilotReport) => `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Amy Hood Phase 3 Pilot Review</title>
  <style>
    body{font-family:system-ui,sans-serif;margin:0;background:#f5f7fb;color:#172033}
    main{max-width:1120px;margin:auto;padding:32px 20px 64px}
    .notice{padding:16px;border-left:4px solid #ca8a04;background:#fffbeb}
    .metrics{display:flex;gap:12px;flex-wrap:wrap;margin:24px 0}
    .metric{background:white;border:1px solid #dbe2ea;border-radius:10px;padding:14px 18px}
    table{width:100%;border-collapse:collapse;background:white;font-size:14px}
    th,td{padding:10px;border:1px solid #dbe2ea;text-align:left;vertical-align:top}
    th{background:#eaf0f7}.approved{color:#047857}.incomplete{color:#b45309}
  </style>
</head>
<body><main>
  <h1>Amy Hood Phase 3 사건 카드 검토</h1>
  <p class="notice">공개자료를 바탕으로 구성된 비공식 AI 시뮬레이션이며, Amy Hood 본인이나 Microsoft의 공식 입장이 아니다.</p>
  <div class="metrics">
    <div class="metric">승인 <strong>${report.counts.approved}</strong></div>
    <div class="metric">미완성 <strong>${report.counts.incomplete}</strong></div>
    <div class="metric">전체 <strong>${report.counts.total}</strong></div>
  </div>
  <table><thead><tr><th>#</th><th>사건</th><th>도메인</th><th>상태</th><th>판단 질문·행동</th><th>Amy 판단·사건 맥락</th><th>부족 자료</th></tr></thead><tbody>
  ${report.rows.map((row) => `<tr>
    <td>${row.priority}</td>
    <td>${escapeHtml(row.candidateId)}</td>
    <td>${escapeHtml(row.domain)}</td>
    <td class="${row.status}">${row.status}</td>
    <td><strong>${escapeHtml(row.decisionQuestion)}</strong><br>${escapeHtml(row.chosenAction)}</td>
    <td><strong>Amy direct:</strong> ${escapeHtml(row.directQuote)}<br><strong>Amy policy:</strong> ${escapeHtml(row.policyQuote)}<br><strong>Context:</strong> ${escapeHtml(row.contextQuote)}</td>
    <td>${escapeHtml(row.gaps.join(', ') || 'none')}</td>
  </tr>`).join('\n')}
  </tbody></table>
</main></body></html>\n`;

export const buildPilotReport = async (
  root: string,
  manifest: PilotManifest,
  cards: PilotDecisionEvent[],
): Promise<PilotReport> => {
  const cardByCandidate = new Map(cards.map((card) => [card.candidateId, card]));
  const rows = [...manifest.targets]
    .sort((left, right) => left.priority - right.priority)
    .map((target): PilotReportRow => {
      const card = cardByCandidate.get(target.candidateId);
      const direct = card?.evidenceSpans.find(({ id }) =>
        card.directAmyEvidenceIds.includes(id));
      const policy = card?.evidenceSpans.find(({ id }) =>
        card.amyPolicyEvidenceIds?.includes(id));
      const context = card?.evidenceSpans.find(({ id }) =>
        card.contextEvidenceIds.includes(id));
      return {
        priority: target.priority,
        candidateId: target.candidateId,
        domain: target.domain,
        status: card?.status ?? 'incomplete',
        decisionQuestion: card?.decisionQuestion ?? '사건 카드 생성 실패',
        chosenAction: card?.chosenAction ?? '검증 가능한 증거가 더 필요함',
        directQuote: direct?.exactQuote ?? '없음',
        policyQuote: policy?.exactQuote ?? '없음',
        contextQuote: context?.exactQuote ?? '없음',
        gaps: card?.gaps ?? ['model_response_invalid'],
      };
    });
  const approved = rows.filter(({ status }) => status === 'approved').length;
  const report: PilotReport = {
    counts: { approved, incomplete: rows.length - approved, total: rows.length },
    domainCounts: Object.fromEntries([...new Set(rows.map(({ domain }) => domain))]
      .map((domain) => [domain, rows.filter((row) => row.domain === domain).length])),
    rows,
  };
  await writeJsonAtomic(
    path.resolve(advisorPaths(root).eventsPilot, 'pilot-report.json'),
    report,
  );
  await writeTextAtomic(
    path.resolve(root, 'docs/reports/2026-07-15-amy-hood-phase-3-pilot-review.html'),
    reportHtml(report),
  );
  return report;
};
