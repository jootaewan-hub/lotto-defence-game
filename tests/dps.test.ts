import { expect, test } from 'vitest';
import { getExpectedTowerDps, getRecommendedDps } from '../src/game/dps';
import { GameSimulation } from '../src/game/simulation';
import { createDefaultMetaProgress, createSeededRng } from '../src/game/systems';
import { DIFFICULTIES, buildWaves, getBossEncounter } from '../src/game/waves';

test('tower DPS accounts for attack interval and expected critical damage', () => {
  expect(getExpectedTowerDps({attack: 100, attackSpeed: 1000, criticalChance: 0})).toBe(100);
  expect(getExpectedTowerDps({attack: 100, attackSpeed: 500, criticalChance: 0.2})).toBeCloseTo(230);
});

test('recommended DPS rises with wave and difficulty and includes boss stages', () => {
  const normal = DIFFICULTIES.normal;
  const first = getRecommendedDps(buildWaves(normal.waveOffset)[0]!, normal);
  const late = getRecommendedDps(buildWaves(normal.waveOffset)[19]!, normal);
  const nightmare = getRecommendedDps(buildWaves(DIFFICULTIES.nightmare.waveOffset)[0]!, DIFFICULTIES.nightmare);
  const boss = getRecommendedDps(getBossEncounter(20, normal.waveOffset)!, normal);
  expect(first).toBeGreaterThan(0);
  expect(late).toBeGreaterThan(first);
  expect(nightmare).toBeGreaterThan(first);
  expect(boss).toBeGreaterThan(0);
});

test('current DPS sums the same per-tower values shown in the roster', () => {
  const sim = new GameSimulation(createDefaultMetaProgress(), createSeededRng(3));
  sim.state.board = [
    {instanceId:'a', definitionId:'common-single', x:120,y:148,cooldownMs:0},
    {instanceId:'b', definitionId:'common-area', x:170,y:148,cooldownMs:0},
  ];
  expect(sim.getCurrentDps()).toBeCloseTo(sim.getTowerDps(0) + sim.getTowerDps(1));
  const before = sim.getCurrentDps();
  sim.state.gold = 1000;
  sim.rollTowerUpgrade(0);
  sim.resolveUpgradeRoll();
  expect(sim.getCurrentDps()).toBeGreaterThan(before);
});

test('recommended DPS follows the queued boss stage after a wave', () => {
  const sim = new GameSimulation(createDefaultMetaProgress(), createSeededRng(8));
  sim.state.wave = 4;
  sim.state.baseHealth = sim.state.maxBaseHealth = 1000;
  sim.startNextWave();
  const normalTarget = sim.getRecommendedDps();
  sim.update(sim.waves[4]!.durationMs);
  expect(sim.isWaveActive).toBe(false);
  expect(sim.getRecommendedDps()).toBe(getRecommendedDps(getBossEncounter(5)!, sim.difficulty));
  expect(sim.getRecommendedDps()).not.toBe(normalTarget);
});
