import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type {
  EvaluationV3Blueprint,
  EvaluationV3BlueprintSlot,
  EvaluationV3Category,
} from '../../shared/amyHoodDecisionAdvisor';

export const assertEvaluationV3Blueprint = (blueprint: EvaluationV3Blueprint): void => {
  if (
    blueprint.dataset !== 'amy_hood_decision_advisor_evaluation_blueprint' ||
    blueprint.version !== '3.0.0'
  ) {
    throw new Error('invalid evaluation v3 blueprint identity');
  }
  if (blueprint.slots.length !== 30) {
    throw new Error(`evaluation v3 requires 30 slots, got ${blueprint.slots.length}`);
  }
  const ids = blueprint.slots.map((item) => item.id);
  if (new Set(ids).size !== ids.length) {
    throw new Error('evaluation v3 slot IDs must be unique');
  }
  const expected = new Map<EvaluationV3Category, number>([
    ['amy_specific_discrimination', 10],
    ['temporal_holdout', 10],
    ['counterfactual_pair', 6],
    ['new_advisory_transfer', 4],
  ]);
  for (const [category, count] of expected) {
    const actual = blueprint.slots.filter((item) => item.category === category).length;
    if (actual !== count) {
      throw new Error(`evaluation v3 requires ${count} ${category} slots, got ${actual}`);
    }
  }
  const pairGroups = new Map<string | undefined, EvaluationV3BlueprintSlot[]>();
  for (const item of blueprint.slots.filter((slot) => slot.category === 'counterfactual_pair')) {
    const items = pairGroups.get(item.pairId) ?? [];
    items.push(item);
    pairGroups.set(item.pairId, items);
  }
  for (const [pairId, items] of pairGroups) {
    const variants = new Set(items.map((item) => item.pairVariant));
    if (!pairId || items.length !== 2 || variants.size !== 2 || !variants.has('a') || !variants.has('b')) {
      throw new Error(`invalid counterfactual pair: ${pairId ?? 'missing'}`);
    }
  }
  for (const slot of blueprint.slots) {
    if (slot.type !== 'multiple_choice') {
      throw new Error(`${slot.id} must be multiple-choice`);
    }
    if (slot.category === 'temporal_holdout' && slot.requiredSplit !== 'holdout') {
      throw new Error(`${slot.id} temporal slot must require holdout`);
    }
    if (slot.category !== 'temporal_holdout' && slot.requiredSplit !== 'none') {
      throw new Error(`${slot.id} non-temporal slot must require none`);
    }
  }
  const expectedIds = [
    ...Array.from({ length: 10 }, (_, index) => `D${String(index + 1).padStart(2, '0')}`),
    ...Array.from({ length: 10 }, (_, index) => `H${String(index + 1).padStart(2, '0')}`),
    'C01A', 'C01B', 'C02A', 'C02B', 'C03A', 'C03B',
    'T01', 'T02', 'T03', 'T04',
  ];
  if (ids.join('\n') !== expectedIds.join('\n')) {
    throw new Error('evaluation v3 slot IDs must match the fixed D10/H10/C6/T4 order');
  }
};

export const loadEvaluationV3Blueprint = async (root: string): Promise<EvaluationV3Blueprint> => {
  const path = resolve(root, 'evaluation/v3/amy_hood_advisor_blueprint.json');
  const blueprint = JSON.parse(await readFile(path, 'utf8')) as EvaluationV3Blueprint;
  assertEvaluationV3Blueprint(blueprint);
  return blueprint;
};
