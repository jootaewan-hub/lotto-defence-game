import { expect, test } from 'vitest';
import { buildWaves } from '../src/game/waves';

test('true bosses appear every thirty waves, with bosses every five', () => {
  const waves = buildWaves();
  expect(waves.filter(w => w.isTrueBoss).map(w => w.number)).toEqual([30,60,90,120]);
  expect(waves[9]!.isBoss).toBe(true);
  expect(waves[9]!.isTrueBoss).toBe(false);
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
