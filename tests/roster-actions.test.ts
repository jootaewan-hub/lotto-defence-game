import { expect, test } from 'vitest';
import { GameSimulation } from '../src/game/simulation';
import { createDefaultMetaProgress, createSeededRng } from '../src/game/systems';
import { compareUnitsForRoster } from '../src/game/towerArrangement';
import { PATH_POINTS, TOWER_SPAWN } from '../src/game/geometry';
import { getRarityIndex } from '../src/game/rarities';
import { getUnitDefinition } from '../src/game/units';

const tower = (id: string, definitionId: string) => ({ instanceId: id, definitionId, x: 120, y: 148, cooldownMs: 0 });

test('priority arrangement puts higher grades nearest the enemy entrance', () => {
  const sim = new GameSimulation(createDefaultMetaProgress(), createSeededRng(4));
  sim.state.board = [tower('p','common-support'), tower('m','common-area'), tower('a1','common-archer'), tower('w','common-single'), tower('a2','legendary-archer')];
  expect(sim.sortUnitsByType()).toBe(true);
  expect(sim.state.board.map(u => u.definitionId)).toEqual(['legendary-archer','common-archer','common-single','common-area','common-support']);
  const entrance = PATH_POINTS[0]!;
  const distances = sim.state.board.map(u => Math.hypot(u.x - entrance.x, u.y - entrance.y));
  expect(distances).toEqual([...distances].sort((a,b) => a-b));
});

test('ultimate and supers stay in the center while uniques lead normal grades', () => {
  const sim = new GameSimulation(createDefaultMetaProgress(), createSeededRng(4));
  sim.state.board = [tower('c','common-single'), tower('s','super-archer'), tower('u','mythic-ranger'), tower('m','immortal-area'), tower('a','ultimate-mugeuk')];
  expect(sim.sortUnitsByType()).toBe(true);
  expect(sim.state.board.slice(0, 2).map(u => u.definitionId)).toEqual(['ultimate-mugeuk', 'super-archer']);
  expect(sim.state.board[0]).toMatchObject(TOWER_SPAWN);
  expect(Math.hypot(sim.state.board[1]!.x - TOWER_SPAWN.x, sim.state.board[1]!.y - TOWER_SPAWN.y)).toBeLessThan(70);
  const ordinary = sim.state.board.slice(2);
  expect(ordinary.map(u => getRarityIndex(getUnitDefinition(u.definitionId).rarity))).toEqual([9, 8, 0]);
  const entrance = PATH_POINTS[0]!;
  const distances = ordinary.map(u => Math.hypot(u.x - entrance.x, u.y - entrance.y));
  expect(distances).toEqual([...distances].sort((a,b) => a-b));
});

test('automatic arrangement reacts when a tower changes grade without changing board size', () => {
  const sim = new GameSimulation(createDefaultMetaProgress(), createSeededRng(4));
  sim.state.board = [tower('c','common-single'), tower('r','rare-area')];
  sim.autoArrange = true;
  sim.update(250);
  expect(sim.state.board[0]!.definitionId).toBe('rare-area');
  sim.state.board = sim.state.board.map(u => u.instanceId === 'c' ? { ...u, definitionId: 'mythic-ranger' } : u);
  sim.update(250);
  expect(sim.state.board[0]!.definitionId).toBe('mythic-ranger');
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
