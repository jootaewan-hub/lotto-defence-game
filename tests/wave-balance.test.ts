import { expect, test } from 'vitest';
import { buildWaves, getBossEncounter } from '../src/game/waves';
import { createDefaultMetaProgress, createInitialRunState } from '../src/game/systems';

const bossWaves = () => Array.from({ length: 120 }, (_, i) => i + 1).filter(n => getBossEncounter(n));

test('numbered waves are all ordinary; bosses are stages hanging off them', () => {
  const waves = buildWaves();
  expect(waves).toHaveLength(120);
  expect(waves.some(w => w.isBoss)).toBe(false);
  expect(waves.some(w => w.isTrueBoss)).toBe(false);
  expect(waves.some(w => w.isFinalBoss)).toBe(false);
  expect(waves.every(w => w.enemyCount > 1)).toBe(true);
});
test('a boss stage follows every fifth wave and nothing else', () => {
  expect(bossWaves()).toEqual(Array.from({ length: 24 }, (_, i) => (i + 1) * 5));
  expect(getBossEncounter(1)).toBeNull();
  expect(getBossEncounter(4)).toBeNull();
  expect(getBossEncounter(99)).toBeNull();
});
test('boss stages carry the tier of the wave they follow', () => {
  const tier = (n: number) => { const b = getBossEncounter(n)!; return b.isFinalBoss ? 'final' : b.isTrueBoss ? 'true' : b.bossId ? 'named' : 'mid'; };
  expect(tier(5)).toBe('mid');
  expect(tier(15)).toBe('mid');
  expect(tier(10)).toBe('named');
  expect(tier(30)).toBe('named');
  expect(tier(20)).toBe('true');
  expect(tier(100)).toBe('true');
  expect(tier(120)).toBe('final');
});
test('only the last wave owes a final boss, and it is also a true boss', () => {
  expect(bossWaves().filter(n => getBossEncounter(n)!.isFinalBoss)).toEqual([120]);
  const final = getBossEncounter(120)!;
  expect(final.isBoss).toBe(true);
  expect(final.isTrueBoss).toBe(true);
  expect(final.trueBossId).toBe('eclipse-sovereign');
});
test('each boss tier cycles all four named bosses in ascending difficulty', () => {
  const trueBosses = bossWaves().map(n => getBossEncounter(n)!).filter(b => b.isTrueBoss && !b.isFinalBoss);
  expect(trueBosses.map(b => [b.number, b.trueBossId])).toEqual([
    [20,'orc-emperor'],[40,'ogre-king'],[60,'ancient-dragon'],[80,'undead-demon-king'],[100,'orc-emperor'],
  ]);
  const namedBosses = bossWaves().map(n => getBossEncounter(n)!).filter(b => b.bossId);
  expect(namedBosses.map(b => [b.number, b.bossId])).toEqual([
    [10,'orc-emperor'],[30,'ogre-king'],[50,'ancient-dragon'],[70,'undead-demon-king'],[90,'orc-emperor'],[110,'ogre-king'],
  ]);
});
test('each boss tier gets its own clear time', () => {
  expect(getBossEncounter(5)!.durationMs).toBe(60_000);
  expect(getBossEncounter(10)!.durationMs).toBe(95_000);
  expect(getBossEncounter(20)!.durationMs).toBe(115_000);
  expect(getBossEncounter(120)!.durationMs).toBe(135_000);
});
test('keep durability stays whole even with legacy quarter-value skills', () => {
  // legacy defence-1 is worth 5, counted at a quarter, which used to show 21.25
  for (const skills of [['defense-1'], ['defense-1','defense-3'], ['defense-1','defense-3','defense-5'], ['economy-1']]) {
    const meta = { ...createDefaultMetaProgress(), unlockedSkills: skills };
    const state = createInitialRunState(meta);
    expect(Number.isInteger(state.maxBaseHealth)).toBe(true);
    expect(Number.isInteger(state.baseHealth)).toBe(true);
    expect(Number.isInteger(state.gold)).toBe(true);
  }
  expect(createInitialRunState({ ...createDefaultMetaProgress(), unlockedSkills: ['defense-1'] }).maxBaseHealth).toBe(21);
});
test('ordinary health compounds at 1.6 percent per wave', () => {
  const waves = buildWaves();
  expect(waves[0]!.healthMultiplier).toBeCloseTo(1.09);
  expect(waves[10]!.healthMultiplier).toBeCloseTo(1.99 * 1.016 ** 10);
});
test('late boss growth slows without decreasing same-tier health', () => {
  const boss = (w: number) => getBossEncounter(w)!.healthMultiplier;
  const old = (w: number) => (5.6 + Math.floor((w - 1) / 5) * 0.95) * (1 + Math.max(0,w-20)*.0325) * 1.006 ** (w-1);
  expect(boss(45)).toBeCloseTo(old(45));
  expect(boss(115)).toBeLessThan(old(115) * .65);
  expect(boss(115)).toBeGreaterThan(boss(55));
});
