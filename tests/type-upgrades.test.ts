import { expect, test } from 'vitest';
import { GameSimulation } from '../src/game/simulation';
import { createDefaultMetaProgress, createSeededRng } from '../src/game/systems';

const tower = (id: string, definitionId: string) => ({ instanceId: id, definitionId, x: 120, y: 148, cooldownMs: 0 });

test('roulette bonuses affect the selected type across grades, not other types', () => {
  const sim = new GameSimulation(createDefaultMetaProgress(), createSeededRng(7));
  sim.state.gold = 1000;
  sim.state.board = [tower('warrior-1', 'common-single'), tower('warrior-2', 'legendary-single'), tower('mage', 'common-area')];
  const before = sim.state.board.map((_, i) => sim.getTowerCombatStats(i)!);

  const attack = sim.rollTowerUpgrade(0, 'attack')!;
  expect(sim.resolveUpgradeRoll()).toBe(true);
  expect(sim.getTowerTypeUpgrade('warrior', 'attack')).toBe(attack.value);
  expect(sim.getTowerCombatStats(0)!.attack / before[0]!.attack).toBeCloseTo(1 + attack.value / 100);
  expect(sim.getTowerCombatStats(1)!.attack / before[1]!.attack).toBeCloseTo(1 + attack.value / 100);
  expect(sim.getTowerCombatStats(2)!.attack).toBe(before[2]!.attack);

  const haste = sim.rollTowerUpgrade(0, 'haste')!;
  expect(sim.resolveUpgradeRoll()).toBe(true);
  expect(sim.getTowerTypeUpgrade('warrior', 'haste')).toBe(haste.value);
  expect(sim.getTowerCombatStats(1)!.attackSpeed).toBeLessThan(before[1]!.attackSpeed);
  expect(sim.getTowerCombatStats(2)!.attackSpeed).toBe(before[2]!.attackSpeed);

  sim.state.board.push(tower('late-warrior', 'rare-single'));
  expect(sim.getTowerCombatStats(3)!.attack).toBeGreaterThan(sim.getTowerCombatStats(3)!.baseAttack);
  expect(sim.getTowerTypeUpgrade('mage', 'attack')).toBe(0);

  sim.sellUnit(0);
  expect(sim.getTowerTypeUpgrade('warrior', 'attack')).toBe(attack.value);
  expect(sim.getTowerCombatStats(0)!.attack / before[1]!.attack).toBeCloseTo(1 + attack.value / 100);
  sim.state.status = 'lost';
  expect(sim.restartRun()).toBe(true);
  expect(sim.getTowerTypeUpgrade('warrior', 'attack')).toBe(0);
});
