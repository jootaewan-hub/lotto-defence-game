import { expect, test } from 'vitest';
import { GameSimulation } from '../src/game/simulation';
import { createDefaultMetaProgress, createSeededRng } from '../src/game/systems';
import { compareUnitsForRoster } from '../src/game/towerArrangement';

const tower = (id: string, definitionId: string) => ({ instanceId: id, definitionId, x: 120, y: 148, cooldownMs: 0 });

test('class grouping collects each tower type while retaining rarity order within it', () => {
  const sim = new GameSimulation(createDefaultMetaProgress(), createSeededRng(4));
  sim.state.board = [tower('p','common-support'), tower('m','common-area'), tower('a1','common-archer'), tower('w','common-single'), tower('a2','legendary-archer')];
  expect(sim.sortUnitsByType()).toBe(true);
  expect(sim.state.board.map(u => u.definitionId)).toEqual(['legendary-archer','common-archer','common-single','common-area','common-support']);
});

test('roster puts ultimate, super and unique above immortal', () => {
  const roster = [tower('immortal','immortal-single'), tower('unique','mythic-ranger'), tower('super','super-warrior'), tower('ultimate','ultimate-mugeuk')].sort(compareUnitsForRoster);
  expect(roster.map(u => u.instanceId)).toEqual(['ultimate','super','unique','immortal']);
});

test('selected rarity reports merges and sells only its ordinary towers', () => {
  const sim = new GameSimulation(createDefaultMetaProgress(), createSeededRng(5));
  sim.state.board = [tower('c1','common-single'),tower('c2','common-single'),tower('c3','common-single'),tower('a1','advanced-area'),tower('a2','advanced-area'),tower('a3','advanced-area'),tower('super','super-warrior'),tower('immortal','immortal-single')];
  expect(sim.getMergeableGroupCount('common')).toBe(1);
  expect(sim.getMergeableGroupCount('advanced')).toBe(1);
  expect(sim.getMergeableGroupCount('rare')).toBe(0);
  expect(sim.getSellableCount('immortal')).toBe(1);
  expect(sim.sellUnitsByRarity('common')).toBe(3);
  expect(sim.state.board.map(u=>u.instanceId)).toEqual(['a1','a2','a3','super','immortal']);
  expect(sim.getMergeableGroupCount('common')).toBe(0);
});
