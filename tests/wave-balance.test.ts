import { expect, test } from 'vitest';
import { buildWaves } from '../src/game/waves';

test('true bosses appear every twenty waves, with bosses every five', () => {
  const waves = buildWaves();
  expect(waves.filter(w => w.isTrueBoss).map(w => w.number)).toEqual([20,40,60,80,100,120]);
  expect(waves[9]!.isBoss).toBe(true);
  expect(waves[9]!.isTrueBoss).toBe(false);
});
test('only the final wave is the final boss, and it is also a true boss', () => {
  const waves = buildWaves();
  expect(waves.filter(w => w.isFinalBoss).map(w => w.number)).toEqual([120]);
  const final = waves[119]!;
  expect(final.isBoss).toBe(true);
  expect(final.isTrueBoss).toBe(true);
  expect(final.trueBossId).toBe('eclipse-sovereign');
});
test('each boss tier cycles all four named bosses in ascending difficulty', () => {
  const waves = buildWaves();
  expect(waves.filter(w => w.isTrueBoss && !w.isFinalBoss).map(w => [w.number, w.trueBossId])).toEqual([
    [20,'orc-emperor'],[40,'ogre-king'],[60,'ancient-dragon'],[80,'undead-demon-king'],[100,'orc-emperor'],
  ]);
  expect(waves.filter(w => w.bossId).map(w => [w.number, w.bossId])).toEqual([
    [10,'orc-emperor'],[30,'ogre-king'],[50,'ancient-dragon'],[70,'undead-demon-king'],[90,'orc-emperor'],[110,'ogre-king'],
  ]);
});
test('each boss tier gets its own clear time', () => {
  const waves = buildWaves();
  expect(waves[4]!.durationMs).toBe(60_000);
  expect(waves[9]!.durationMs).toBe(95_000);
  expect(waves[19]!.durationMs).toBe(115_000);
  expect(waves[119]!.durationMs).toBe(135_000);
});
test('ordinary health compounds at 1.6 percent per wave', () => {
  const waves = buildWaves();
  expect(waves[0]!.healthMultiplier).toBeCloseTo(1.09);
  expect(waves[10]!.healthMultiplier).toBeCloseTo(1.99 * 1.016 ** 10);
});
test('late boss growth slows without decreasing same-tier health', () => {
  const waves = buildWaves();
  const old = (w: number) => (5.6 + Math.floor((w - 1) / 5) * 0.95) * (1 + Math.max(0,w-20)*.0325) * 1.006 ** (w-1);
  expect(waves[44]!.healthMultiplier).toBeCloseTo(old(45));
  expect(waves[114]!.healthMultiplier).toBeLessThan(old(115) * .65);
  expect(waves[114]!.healthMultiplier).toBeGreaterThan(waves[54]!.healthMultiplier);
});
