import { expect, test } from 'vitest';
import { getSimulationStepMs, getSpeedOptions } from '../src/game/speed';

test('40x and 80x appear with other operator speeds only in development', () => {
  expect(getSpeedOptions(false)).toEqual([1, 2, 3, 5]);
  expect(getSpeedOptions(true)).toEqual([1, 2, 3, 5, 10, 20, 40, 80]);
});

test('operator speeds advance normally and cap catch-up after a slow frame', () => {
  expect(getSimulationStepMs(16, 40)).toBe(640);
  expect(getSimulationStepMs(16, 80)).toBe(1280);
  expect(getSimulationStepMs(120, 40)).toBe(1280);
  expect(getSimulationStepMs(120, 80)).toBe(2560);
  expect(getSimulationStepMs(120, 20)).toBe(1600);
});
