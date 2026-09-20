import { expect, test } from 'vitest';
import { createMergeCandidates, createSeededRng, createDefaultMetaProgress, skillTracks } from '../src/game/systems';
import { UNIQUE_UNIT_MAX_LEVEL } from '../src/game/units';
import { REWARD_POOL } from '../src/game/upgrades';
import { GameSimulation } from '../src/game/simulation';
import { refundRetiredSkills } from '../src/game/skills';

test('immortal fusion produces uniques; lower fusion never does', () => {
  const rng = createSeededRng(12);
  expect(createMergeCandidates('immortal-single', rng).every(u => u.uniqueAbility)).toBe(true);
  expect(createMergeCandidates('legendary-single', rng).every(u => !u.uniqueAbility)).toBe(true);
});
test('growth and reward balance', () => {
  expect(UNIQUE_UNIT_MAX_LEVEL).toBe(999);
  expect(skillTracks.every(t => t.values.length === 20)).toBe(true);
  expect(REWARD_POOL.find(r => r.id === 'attack')).toMatchObject({min: 0.2, max: 5});
});
test('upgrading supports fractional small gains', () => {
  const sim = new GameSimulation(createDefaultMetaProgress(), createSeededRng(1));
  sim.summonToFirstEmpty();
  const roll = sim.rollTowerUpgrade(0, 'haste')!;
  expect(roll.max).toBe(5);
  expect(roll.value).toBeGreaterThanOrEqual(0.2);
  expect(roll.value).toBeLessThanOrEqual(5);
});

const board = (ids: string[]) => ids.map((definitionId, i) => ({definitionId, instanceId: `r${i}`, cooldownMs: 0, x: 120, y: 148}));
test('unique cap stops manual and bulk fusion without consuming ingredients', () => {
  const sim = new GameSimulation(createDefaultMetaProgress(), createSeededRng(2));
  sim.state.board = board(['mythic-ranger', 'immortal-berserker', ...Array(3).fill('immortal-single')]);
  const before = JSON.stringify(sim.state);
  expect(sim.requestMerge(2)).toBeNull();
  expect(sim.bulkMergeAll()).toBe(0);
  expect(JSON.stringify(sim.state)).toBe(before);
  sim.sellUnit(0);
  expect(sim.bulkMergeAll()).toBe(1);
  expect(sim.state.board.filter(u => ['mythic-ranger','immortal-berserker','mythic-plague-warlock','transcendent-time-mage','transcendent-frost-witch'].includes(u.definitionId))).toHaveLength(2);
});
test('stage merge leaves higher and unrelated stages untouched', () => {
  const sim = new GameSimulation(createDefaultMetaProgress(), createSeededRng(2));
  sim.state.board = board([...Array(9).fill('common-single'), ...Array(3).fill('rare-single')]);
  expect(sim.bulkMergeAll('common')).toBe(3);
  expect(sim.state.board).toHaveLength(6);
  expect(sim.state.board.filter(u => u.definitionId === 'rare-single')).toHaveLength(3);
});
test('auto progress resolves a reward once and starts the next wave; pause stays paused', () => {
  const sim = new GameSimulation(createDefaultMetaProgress(), createSeededRng(2));
  sim.state.wave = 9;
  sim.state.baseHealth = sim.state.maxBaseHealth = 100;
  sim.startNextWave();
  sim.update(sim.waves[9]!.durationMs);
  expect(sim.pendingReward).toBe(true);
  sim.autoProgress = true;
  sim.update(0);
  expect(sim.pendingReward).toBe(true);
  sim.update(5000);
  expect(sim.pendingReward).toBe(false);
  expect(sim.rewardHistory).toHaveLength(1);
  // wave 10 owes a boss, and a boss stage does not advance the wave counter
  expect(sim.state.wave).toBe(10);
  expect(sim.isBossStageActive).toBe(true);
});
test('summons never produce uniques even with large legacy chance bonuses', () => {
  const sim = new GameSimulation(createDefaultMetaProgress(), createSeededRng(7));
  sim.state.gold = 1e8;
  sim.upgrades.uniqueChance = 10000;
  for (let i = 0; i < 200; i++) sim.summonAdvanced();
  expect(sim.state.board.every(u => !u.definitionId.includes('ranger') && !u.definitionId.includes('berserker') && !u.definitionId.includes('warlock') && !u.definitionId.includes('witch') && !u.definitionId.includes('time-mage'))).toBe(true);
});
test('retired summon growth refunds once and preserves other progress', () => {
  const meta = {...createDefaultMetaProgress(), growthShards: 3, unlockedSkills: ['uniqueChance-1', 'uniqueChance-2', 'power-1']};
  const refunded = refundRetiredSkills(meta);
  expect(refunded.growthShards).toBe(6);
  expect(refunded.unlockedSkills).toEqual(['power-1']);
  expect(refundRetiredSkills(refunded)).toEqual(refunded);
});

import { createInitialRunState, resolveJackpotReward, rollJackpotReward } from '../src/game/systems';
import { getBossEncounter } from '../src/game/waves';
import { enterBossStageAfter } from './bossStage';

const fixedRng = (value: number) => ({ next: () => value, pick: <T,>(items: T[]) => items[0]! });
test('jackpot rewards never grant fractional gold or summons', () => {
  expect(rollJackpotReward(fixedRng(0.1))).toEqual({ type: 'gold', amount: 9 });
  expect(rollJackpotReward(fixedRng(0.6))).toEqual({ type: 'freeSummon', amount: 1 });
  const state = createInitialRunState();
  expect(resolveJackpotReward(state, { type: 'gold', amount: 8.75 }).gold).toBe(state.gold + 9);
  expect(resolveJackpotReward(state, { type: 'freeSummon', amount: 0.25 }).freeSummons).toBe(state.freeSummons + 1);
});
test('boss tiers use the reduced health multipliers', () => {
  const boss = (w: number) => getBossEncounter(w)!.healthMultiplier;
  const late = (w: number) => (1 + Math.max(0, w - 20) * 0.0325) * 1.006 ** (w - 1);
  expect(boss(5)).toBeCloseTo(5.6 * late(5));
  expect(boss(10)).toBeCloseTo((5.6 + 0.95) * 1.5 * late(10));
  expect(boss(20)).toBeCloseTo((5.6 + 0.95 * 3) * 1.5 * 1.15 * late(20));
  expect(boss(30)).toBeCloseTo((5.6 + 0.95 * 5) * 1.5 * late(30));
});
test('spawned mid boss, boss and true boss health drop on normal difficulty', () => {
  const spawn = (wave: number) => {
    const sim = new GameSimulation(createDefaultMetaProgress(), createSeededRng(1));
    sim.state.board = [];
    enterBossStageAfter(sim, wave);
    sim.update(1);
    return sim.enemies[0]!.maxHp;
  };
  expect(spawn(5)).toBeLessThan(1_650);
  expect(spawn(10)).toBeLessThan(4_350);
  expect(spawn(30)).toBeLessThan(26_500);
  expect(spawn(30)).toBeGreaterThan(3_000);
});
