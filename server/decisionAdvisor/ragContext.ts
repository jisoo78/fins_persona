import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { PilotDecisionEvent, PolicyMemory, ReflectionMemory } from '../../shared/amyHoodDecisionAdvisor';
import type { AmyHoodRenderedContext, AmyHoodRetrievalResult } from '../../shared/amyHoodRag';
import { sha256 } from './canonicalJson';
import { loadActiveAmyHoodMemoryIndex } from './memoryIndex';

export const conservativeTokenEstimate = (text: string) => Math.ceil(Buffer.byteLength(text, 'utf8') / 3);

export const buildAmyHoodRagContext = async ({
  root,
  retrieval,
  projection,
  maxContextTokens = 6_000,
  maxRequestTokens = 12_000,
  systemPrompt = '',
  userPrompt = '',
}: {
  root: string;
  retrieval: AmyHoodRetrievalResult;
  projection: 'policy' | 'full';
  maxContextTokens?: number;
  maxRequestTokens?: number;
  systemPrompt?: string;
  userPrompt?: string;
}): Promise<AmyHoodRenderedContext> => {
  const index = await loadActiveAmyHoodMemoryIndex(root);
  if (retrieval.trace.indexHash !== index.manifest.indexHash) throw new Error('retrieval index hash mismatch');
  const blocks: string[] = [];
  const evidenceIds: string[] = [];
  const sourceIds: string[] = [];
  const expandedArtifactIds: string[] = [];
  if (retrieval.trace.noMatch || retrieval.matches.length === 0) {
    blocks.push('[Memory Retrieval]\nNo approved memory matched this question.');
  } else {
    for (const match of retrieval.matches) {
      const releaseRoot = path.join(index.directory, '..', '..', '..', 'memory-releases', index.manifest.releaseId);
      const filePath = path.join(releaseRoot, 'policies', `${match.id}.json`);
      const policy = JSON.parse(await readFile(filePath, 'utf8')) as PolicyMemory;
      const header = [
        `[Retrieved Policy: ${policy.id}]`,
        `Domain: ${policy.domain}`,
        `Applicability: ${policy.applicabilityConditions.join(' | ')}`,
        `Priority order: ${policy.priorityOrder.join(' > ')}`,
        `Recommended action: ${policy.recommendedAction}`,
        `Reversal signals: ${policy.reversalSignals.join(' | ')}`,
      ];
      if (projection === 'full') {
        header.push(`Exceptions: ${policy.exceptions.join(' | ')}`);
        header.push(`Non-applicability: ${policy.nonApplicabilityConditions.join(' | ')}`);
        for (const reflectionId of policy.reflectionIds) {
          const reflection = JSON.parse(await readFile(
            path.join(releaseRoot, 'reflections', `${reflectionId}.json`),
            'utf8',
          )) as ReflectionMemory;
          header.push(`Decision axis: ${reflection.decisionAxis.decisionQuestion}`);
          header.push(`Invariant: ${reflection.invariant}`);
          header.push(`Condition delta: ${reflection.conditionDelta}`);
          header.push(`Action delta: ${reflection.actionDelta}`);
        }
        const renderEvent = async (eventId: string, label: string) => {
          const event = JSON.parse(await readFile(
            path.join(releaseRoot, 'events', `${eventId}.json`),
            'utf8',
          )) as PilotDecisionEvent;
          return `${label}: ${event.id}\nSituation: ${event.situation}\nConditions: ${event.conditions.join(' | ')}\nConstraints: ${event.constraints.join(' | ')}\nChosen action: ${event.chosenAction}`;
        };
        for (const eventId of policy.supportingEventIds.slice(0, 2)) {
          header.push(await renderEvent(eventId, 'Supporting event'));
        }
        for (const eventId of policy.contrastingEventIds.slice(0, 1)) {
          header.push(await renderEvent(eventId, 'Contrasting event'));
        }
      }
      blocks.push(header.join('\n'));
      expandedArtifactIds.push(policy.id, ...policy.reflectionIds, ...policy.supportingEventIds, ...policy.contrastingEventIds);
      for (const evidenceId of [...new Set(policy.evidenceIds)]) {
        const evidence = index.evidence.find(({ id }) => id === evidenceId);
        if (!evidence) throw new Error(`indexed evidence is unresolved: ${evidenceId}`);
        const block = [
          'Amy Hood evidence',
          `- Quote: "${evidence.exactQuote}"`,
          `- Source: ${evidence.sourceTitle}`,
          `- Type: ${evidence.sourceType}`,
          `- Published: ${evidence.publishedAt}`,
          `- Source ID: ${evidence.sourceId}`,
        ].join('\n');
        const candidate = [...blocks, block].join('\n\n');
        if (conservativeTokenEstimate(candidate) > maxContextTokens) continue;
        blocks.push(block);
        evidenceIds.push(evidence.id);
        sourceIds.push(evidence.sourceId);
      }
    }
  }
  while (blocks.length > 1 && conservativeTokenEstimate(blocks.join('\n\n')) > maxContextTokens) blocks.pop();
  const text = blocks.join('\n\n');
  const contextTokens = conservativeTokenEstimate(text);
  if (contextTokens > maxContextTokens) throw new Error('RAG context exceeds token budget');
  const requestTokens = conservativeTokenEstimate(`${systemPrompt}\n${text}\n${userPrompt}`);
  if (requestTokens > maxRequestTokens) {
    throw new Error('complete model request exceeds 12000 tokens');
  }
  return {
    projection,
    text,
    trace: {
      ...retrieval.trace,
      expandedArtifactIds: [...new Set(expandedArtifactIds)],
      evidenceIds: [...new Set(evidenceIds)],
      sourceIds: [...new Set(sourceIds)],
      contextTokens,
      requestTokens,
      tokenCounter: 'conservative_estimator',
      contextHash: sha256(text),
    },
  };
};
