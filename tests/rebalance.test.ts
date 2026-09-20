import { expect, test } from 'vitest';
import { AUTO_ADVANCED_TOWERS, AUTO_LEGENDARY_TOWERS, chooseAutoSummon, createMergeCandidates, createSeededRng, createDefaultMetaProgress, getRarityIndex, skillTracks } from '../src/game/systems';
import { getUnitDefinition } from '../src/game/units';
import { SUPER_COST, SUPER_INGREDIENT_COUNT } from '../src/game/superUnits';
import { IMMORTAL_MERGE_COUNT } from '../src/game/systems';
import { UNIQUE_UNIT_MAX_LEVEL } from '../src/game/units';
import { REWARD_POOL } from '../src/game/upgrades';
import { GameSimulation } from '../src/game/simulation';
import { refundRetiredSkills } from '../src/game/skills';

test('auto summon fills the board with bodies first, then buys quality', () => {
  const costs = { normal: 10, advanced: 50, legendary: 150 };
  // a thin guard needs bodies before it needs grades
  expect(chooseAutoSummon(0, 1000, costs)).toBe('normal');
  expect(chooseAutoSummon(AUTO_ADVANCED_TOWERS - 1, 1000, costs)).toBe('normal');
  // standing guard: trade quantity for quality
  expect(chooseAutoSummon(AUTO_ADVANCED_TOWERS, 1000, costs)).toBe('advanced');
  expect(chooseAutoSummon(AUTO_LEGENDARY_TOWERS - 1, 1000, costs)).toBe('advanced');
  expect(chooseAutoSummon(AUTO_LEGENDARY_TOWERS, 1000, costs)).toBe('legendary');
  expect(chooseAutoSummon(200, 1000, costs)).toBe('legendary');
  // short of its tier it saves rather than spending down on a cheaper one
  expect(chooseAutoSummon(AUTO_LEGENDARY_TOWERS, 149, costs)).toBeNull();
  expect(chooseAutoSummon(AUTO_ADVANCED_TOWERS, 49, costs)).toBeNull();
  expect(chooseAutoSummon(0, 9, costs)).toBeNull();
});
const tower = (id: string, definitionId: string, extra: Record<string, unknown> = {}) =>
  ({ instanceId: id, definitionId, x: 120, y: 148, cooldownMs: 1e9, ...extra }) as any;
const runAuto = (sim: GameSimulation, ms = 10_000) => {
  for (let t = 0; t < ms; t += 100) {
    sim.update(100);
    if (sim.pendingReward) { sim.pendingReward = false; sim.rewardChoices = []; }
  }
};

test('auto upgrade raises the whole guard and pays with the cheapest tower', () => {
  const sim = new GameSimulation(createDefaultMetaProgress(), createSeededRng(4));
  sim.state.baseHealth = sim.state.maxBaseHealth = 1e9;
  sim.state.gold = 4000;
  // the second tower has been upgraded before, so it is the dearer one to use
  sim.state.board = [tower('a', 'common-single'), tower('b', 'common-area', { upgradeCount: 6 })];
  sim.autoUpgrade = true;

  runAuto(sim, 3000);

  expect(sim.towerAttackUpgradePercent + sim.towerSpeedUpgradePercent).toBeGreaterThan(0);
  // it buys through the untouched tower until that tower's own price catches up
  // with the dearer one, then keeps the two level: always the cheapest seat
  const [cheap, dear] = [sim.state.board[0]!.upgradeCount ?? 0, sim.state.board[1]!.upgradeCount ?? 0];
  expect(cheap).toBeGreaterThan(0);
  expect(dear).toBeGreaterThanOrEqual(6);
  if (dear > 6) expect(cheap).toBeGreaterThanOrEqual(6);
  expect(Math.abs(cheap - dear)).toBeLessThanOrEqual(1);
  // and it did not summon, because that toggle is off
  expect(sim.state.board).toHaveLength(2);
});

test('auto upgrade keeps attack and speed level with each other', () => {
  const sim = new GameSimulation(createDefaultMetaProgress(), createSeededRng(4));
  sim.state.baseHealth = sim.state.maxBaseHealth = 1e9;
  sim.state.gold = 100000;
  sim.state.board = [tower('a', 'common-single'), tower('b', 'common-area')];
  sim.autoUpgrade = true;

  runAuto(sim, 20_000);

  const gap = Math.abs(sim.towerAttackUpgradePercent - sim.towerSpeedUpgradePercent);
  expect(sim.towerAttackUpgradePercent).toBeGreaterThan(0);
  expect(sim.towerSpeedUpgradePercent).toBeGreaterThan(0);
  // one roll of headroom, never a runaway on one side
  expect(gap).toBeLessThanOrEqual(5);
});

test('auto arrange reorders as the guard changes, and only then', () => {
  const sim = new GameSimulation(createDefaultMetaProgress(), createSeededRng(4));
  sim.state.baseHealth = sim.state.maxBaseHealth = 1e9;
  sim.state.board = [tower('a', 'common-support'), tower('b', 'common-single'), tower('c', 'common-area')];
  sim.autoArrange = true;

  runAuto(sim, 1000);
  const arranged = sim.state.board.map(u => u.instanceId).join(',');
  const positions = sim.state.board.map(u => `${u.x},${u.y}`).join(' ');
  expect(positions).not.toBe('120,148 120,148 120,148');
  // arranging is silent, or it would toast on every change
  expect(sim.drainEvents().some(e => e.type === 'message' && e.text.includes('정렬'))).toBe(false);

  runAuto(sim, 1000);
  expect(sim.state.board.map(u => u.instanceId).join(',')).toBe(arranged);
});

test('the four automations are independent', () => {
  const sim = new GameSimulation(createDefaultMetaProgress(), createSeededRng(4));
  sim.state.baseHealth = sim.state.maxBaseHealth = 1e9;
  sim.state.gold = 5000;
  const before = sim.state.board.length;

  // everything off: nothing moves
  runAuto(sim, 2000);
  expect(sim.state.board.length).toBe(before);
  expect(sim.state.gold).toBe(5000);
  expect(sim.towerAttackUpgradePercent).toBe(0);

  // summon only: board grows, no roulette
  sim.autoSummon = true;
  runAuto(sim, 3000);
  expect(sim.state.board.length).toBeGreaterThan(before);
  expect(sim.towerAttackUpgradePercent + sim.towerSpeedUpgradePercent).toBe(0);
});
test('auto craft banks the fee instead of spending it on summons', () => {
  const sim = new GameSimulation(createDefaultMetaProgress(), createSeededRng(4));
  sim.state.baseHealth = sim.state.maxBaseHealth = 1e9;
  const role = 'single';
  // every material for a warrior awakening, but not the fee
  sim.state.board = [
    'immortal-berserker',
    ...Array(SUPER_INGREDIENT_COUNT).fill(`legendary-${role}`),
    ...Array(SUPER_INGREDIENT_COUNT).fill(`mythic-${role}`),
    ...Array(SUPER_INGREDIENT_COUNT).fill(`transcendent-${role}`),
    ...Array(SUPER_INGREDIENT_COUNT).fill(`immortal-${role}`),
  ].map((definitionId, i) => ({ instanceId: `u${i}`, definitionId, x: 120 + i * 6, y: 148, cooldownMs: 1e9 })) as any;
  sim.state.gold = 1000;
  sim.autoSummon = true;
  sim.autoCraft = true;

  for (let t = 0; t < 4000; t += 100) sim.update(100);

  // with the materials stocked it saves rather than summoning them away
  expect(sim.state.gold).toBe(1000);
  expect(sim.state.board).toHaveLength(1 + 4 * SUPER_INGREDIENT_COUNT);

  // once the fee is there it awakens on its own
  sim.state.gold = SUPER_COST;
  for (let t = 0; t < 2000; t += 100) sim.update(100);
  expect(sim.state.board.some(u => u.definitionId === 'super-warrior')).toBe(true);
  expect(sim.state.gold).toBe(0);
});

test('auto craft holds feeders back only once the unique is in hand', () => {
  const stock = (ids: string[]) => ids.map((definitionId, i) => (
    { instanceId: `u${i}`, definitionId, x: 120 + i * 6, y: 148, cooldownMs: 1e9 }
  )) as any;
  const climb = new GameSimulation(createDefaultMetaProgress(), createSeededRng(4));
  climb.state.baseHealth = climb.state.maxBaseHealth = 1e9;
  climb.state.gold = 0;
  // no unique yet, so the pair is the recipe's only route to one
  climb.state.board = stock(Array(IMMORTAL_MERGE_COUNT).fill('immortal-single'));
  climb.autoSummon = true;
  climb.autoCraft = true;
  for (let t = 0; t < 2000; t += 100) climb.update(100);
  expect(climb.state.board).toHaveLength(1);
  expect(getUnitDefinition(climb.state.board[0]!.definitionId).rarity).toBe('unique');

  // with the unique held, the next pair is the recipe's and stays put
  const hold = new GameSimulation(createDefaultMetaProgress(), createSeededRng(4));
  hold.state.baseHealth = hold.state.maxBaseHealth = 1e9;
  hold.state.gold = 0;
  hold.state.board = stock(['immortal-berserker', ...Array(IMMORTAL_MERGE_COUNT).fill('immortal-single')]);
  hold.autoSummon = true;
  hold.autoCraft = true;
  for (let t = 0; t < 2000; t += 100) hold.update(100);
  expect(hold.state.board).toHaveLength(1 + IMMORTAL_MERGE_COUNT);
});

test('auto craft off keeps the old spend-it-all behaviour', () => {
  const sim = new GameSimulation(createDefaultMetaProgress(), createSeededRng(4));
  sim.state.baseHealth = sim.state.maxBaseHealth = 1e9;
  sim.state.gold = 1000;
  sim.autoSummon = true;
  for (let t = 0; t < 4000; t += 100) sim.update(100);
  expect(sim.state.gold).toBeLessThan(1000);
});
test('auto summon builds and merges an army on its own', () => {
  const sim = new GameSimulation(createDefaultMetaProgress(), createSeededRng(9));
  sim.state.baseHealth = sim.state.maxBaseHealth = 1e9;
  sim.state.gold = 5000;
  const startingBoard = sim.state.board.length;
  sim.autoProgress = true;
  sim.autoSummon = true;

  for (let t = 0; t < 30_000; t += 100) {
    sim.update(100);
    if (sim.pendingReward) { sim.pendingReward = false; sim.rewardChoices = []; }
  }

  expect(sim.state.board.length).toBeGreaterThan(startingBoard);
  expect(sim.state.gold).toBeLessThan(5000);
  // merging happened, so the board reaches grades no summon of this tier rolls
  const best = Math.max(...sim.state.board.map(u => getRarityIndex(getUnitDefinition(u.definitionId).rarity)));
  expect(best).toBeGreaterThan(getRarityIndex('hero'));
});
test('auto summon off leaves the board alone', () => {
  const sim = new GameSimulation(createDefaultMetaProgress(), createSeededRng(9));
  sim.state.baseHealth = sim.state.maxBaseHealth = 1e9;
  sim.state.gold = 5000;
  const before = sim.state.board.length;
  for (let t = 0; t < 10_000; t += 100) sim.update(100);
  expect(sim.state.board.length).toBe(before);
  expect(sim.state.gold).toBe(5000);
});
test('immortal fusion produces uniques; lower fusion never does', () => {
  const rng = createSeededRng(12);
  expect(createMergeCandidates('immortal-single', rng).every(u => u.uniqueAbility)).toBe(true);
  expect(createMergeCandidates('legendary-single', rng).every(u => !u.uniqueAbility)).toBe(true);
});
test('growth and reward balance', () => {
  expect(UNIQUE_UNIT_MAX_LEVEL).toBe(999);
  expect(skillTracks.every(t => t.values.length === 20)).toBe(true);
  expect(REWARD_POOL.find(r => r.id === 'attack')).toMatchObject({min: 0.2, max: 10});
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
