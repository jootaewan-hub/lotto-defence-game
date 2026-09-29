import { expect, test } from 'vitest';
import { GameSimulation } from '../src/game/simulation';
import { createDefaultMetaProgress, createSeededRng, rollSummonUniqueUnit } from '../src/game/systems';
import { getTowerType, getUnitDefinition } from '../src/game/units';
import { getActiveSynergies, SYNERGIES } from '../src/game/synergies';
import { collectDefeatedEnemies } from '../src/game/combat';

const tower = (id: string, definitionId: string) => ({ instanceId: id, definitionId, x: 120, y: 148, cooldownMs: 0 });

test('third unique can still be forged from three matching immortals', () => {
  const sim = new GameSimulation(createDefaultMetaProgress(), createSeededRng(12));
  sim.state.board = [tower('u1', 'mythic-ranger'), tower('u2', 'immortal-berserker'),
    tower('i1', 'immortal-area'), tower('i2', 'immortal-area'), tower('i3', 'immortal-area')];
  const prompt = sim.requestMerge(2);
  expect(prompt?.sourceSlots).toEqual([2, 3, 4]);
  expect(prompt?.candidates.every(candidate => getTowerType(candidate) === 'mage')).toBe(true);
  expect(sim.chooseMergeCandidate(prompt!.candidates[0]!.id)).toBe(true);
  expect(sim.state.board.filter(unit => getUnitDefinition(unit.definitionId).rarity === 'unique')).toHaveLength(3);
});

test('late grade class roll commits immediately, so cancelling cannot redraw it', () => {
  const sim = new GameSimulation(createDefaultMetaProgress(), createSeededRng(9));
  sim.state.board = [tower('m1', 'mythic-single'), tower('m2', 'mythic-single'), tower('m3', 'mythic-single')];
  expect(sim.requestMerge(0)).toBeNull();
  expect(sim.state.board).toHaveLength(1);
  expect(getUnitDefinition(sim.state.board[0]!.definitionId).rarity).toBe('transcendent');
  const result = sim.state.board[0]!.definitionId;
  sim.cancelMerge();
  expect(sim.state.board[0]!.definitionId).toBe(result);
});

test('a unique class stops at three while other classes remain forgeable', () => {
  const sim = new GameSimulation(createDefaultMetaProgress(), createSeededRng(3));
  sim.state.board = [tower('u1', 'immortal-berserker'), tower('u2', 'immortal-berserker'), tower('u3', 'immortal-berserker'),
    tower('w1', 'immortal-single'), tower('w2', 'immortal-single'), tower('w3', 'immortal-single'),
    tower('m1', 'immortal-area'), tower('m2', 'immortal-area'), tower('m3', 'immortal-area')];
  expect(sim.requestMerge(3)).toBeNull();
  expect(sim.getMergeableGroups()).toEqual([[6, 7, 8]]);
  expect(sim.bulkMergeAll()).toBe(1);
  expect(sim.state.board.filter(unit => getUnitDefinition(unit.definitionId).uniqueAbility && getTowerType(getUnitDefinition(unit.definitionId)) === 'warrior')).toHaveLength(3);
});

test('legendary unique draw skips classes already at their limit', () => {
  const rng = { next: () => 0, pick: <T>(items: readonly T[]) => items[0]! };
  const mage = rollSummonUniqueUnit(rng, unit => getTowerType(unit) === 'mage');
  expect(getTowerType(mage!)).toBe('mage');
  expect(rollSummonUniqueUnit(rng, () => false)).toBeNull();
});

test('one immortal or unique changes to a different class for exactly 1,000G', () => {
  for (const definitionId of ['immortal-archer', 'mythic-ranger']) {
    const sim = new GameSimulation(createDefaultMetaProgress(), createSeededRng(8));
    sim.state.gold = 1200;
    sim.state.board = [{ ...tower('chosen', definitionId), attackUpgradePercent: 12 }, tower('other', 'common-single')];
    expect(sim.rerollTowerType(0)).toBe(true);
    expect(sim.state.gold).toBe(200);
    expect(sim.state.board[0]!.instanceId).not.toBe('chosen');
    expect(sim.state.board[0]!.attackUpgradePercent).toBe(12);
    expect(getTowerType(getUnitDefinition(sim.state.board[0]!.definitionId))).not.toBe(getTowerType(getUnitDefinition(definitionId)));
    expect(getUnitDefinition(sim.state.board[0]!.definitionId).rarity).toBe(getUnitDefinition(definitionId).rarity);
    expect(sim.state.board[1]!.definitionId).toBe('common-single');
    expect(sim.rerollTowerType(0)).toBe(false);
    expect(sim.state.gold).toBe(200);
  }
});

test('unique type change cannot enter a full class', () => {
  const sim = new GameSimulation(createDefaultMetaProgress(), createSeededRng(6));
  sim.state.gold = 1000;
  sim.state.board = [tower('chosen', 'mythic-ranger'),
    ...Array.from({ length: 3 }, (_, i) => tower(`w${i}`, 'immortal-berserker')),
    ...Array.from({ length: 3 }, (_, i) => tower(`m${i}`, 'mythic-plague-warlock')),
    ...Array.from({ length: 3 }, (_, i) => tower(`p${i}`, 'transcendent-time-mage'))];
  expect(sim.canRerollTowerType(0)).toBe(false);
  expect(sim.rerollTowerType(0)).toBe(false);
  expect(sim.state.gold).toBe(1000);
});

test('24 grade and class synergies activate at three towers and feed combat bonuses', () => {
  expect(SYNERGIES).toHaveLength(24);
  expect(new Set(SYNERGIES.map(entry => entry.id)).size).toBe(24);
  expect([...new Set(SYNERGIES.map(entry => entry.stat))]).toEqual(expect.arrayContaining(['attack', 'haste', 'goldBonus', 'criticalChance', 'range', 'splashRadius']));
  const sim = new GameSimulation(createDefaultMetaProgress(), createSeededRng(1));
  sim.state.board = [tower('a', 'common-archer'), tower('b', 'advanced-archer'), tower('c', 'common-archer')];
  expect(getActiveSynergies(sim.state.board).map(entry => entry.id)).toEqual(['archer-0']);
  expect(sim.getTowerCombatStats(0)!.criticalChance).toBeGreaterThan(getUnitDefinition('common-archer').criticalChance);
  sim.state.board = [tower('a', 'common-support'), tower('b', 'advanced-support'), tower('c', 'common-support')];
  expect(sim.getActiveSynergies().map(entry => entry.id)).toEqual(['priest-0']);
  expect(sim.bonus('goldBonus')).toBeCloseTo(0.03);
  sim.state.board = sim.state.board.slice(0, 2);
  expect(sim.getActiveSynergies()).toHaveLength(0);
});

test('small priest gold bonuses accumulate across kills instead of rounding away', () => {
  const normal = new GameSimulation(createDefaultMetaProgress(), createSeededRng(22));
  const blessed = new GameSimulation(createDefaultMetaProgress(), createSeededRng(22));
  blessed.state.board = [tower('p1', 'common-support'), tower('p2', 'advanced-support'), tower('p3', 'common-support')];
  for (const sim of [normal, blessed]) {
    for (let i = 0; i < 50; i++) {
      sim.enemies.push({ id: `e${i}`, wave: 1, variantId: 'grunt', variantLabel: '적', variantTint: 0,
        variantTier: 0, hp: 0, maxHp: 10, armor: 0, effects: [], progress: 0, speed: 0, rewardGold: 5, isBoss: false });
    }
    collectDefeatedEnemies(sim);
  }
  expect(blessed.state.gold).toBeGreaterThan(normal.state.gold);
  expect(blessed.combatCounters.synergyGoldCarry).toBeGreaterThanOrEqual(0);
});
