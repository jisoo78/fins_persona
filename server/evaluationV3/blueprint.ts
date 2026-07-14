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
    ['new_advisory_scenario', 4],
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
    if (!pairId || items.length !== 2 || new Set(items.map((item) => item.pairVariant)).size !== 2) {
      throw new Error(`invalid counterfactual pair: ${pairId ?? 'missing'}`);
    }
  }
  for (const slot of blueprint.slots) {
    if (slot.category === 'new_advisory_scenario' && slot.type !== 'subjective') {
      throw new Error(`${slot.id} advisory slot must be subjective`);
    }
    if (slot.category !== 'new_advisory_scenario' && slot.type !== 'multiple_choice') {
      throw new Error(`${slot.id} must be multiple-choice`);
    }
    if (slot.category === 'temporal_holdout' && slot.requiredSplit !== 'holdout') {
      throw new Error(`${slot.id} temporal slot must require holdout`);
    }
  }
};

export const loadEvaluationV3Blueprint = async (root: string): Promise<EvaluationV3Blueprint> => {
  const path = resolve(root, 'evaluation/v3/amy_hood_advisor_blueprint.json');
  const blueprint = JSON.parse(await readFile(path, 'utf8')) as EvaluationV3Blueprint;
  assertEvaluationV3Blueprint(blueprint);
  return blueprint;
};
