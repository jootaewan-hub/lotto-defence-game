import { expect, test } from 'vitest';
import { GameSimulation } from '../src/game/simulation';
import { createDefaultMetaProgress, createSeededRng } from '../src/game/systems';
import { getItemUpgradeChance } from '../src/game/superUnits';
import { dragonShopMarkup } from '../src/superUi';

const game = () => new GameSimulation(createDefaultMetaProgress(), createSeededRng(7));

test('all four campaigns preserve the army, gold and upgrades, and only Insane wins', () => {
  const difficulties = ['normal', 'nightmare', 'hell', 'insane'] as const;
  for (const [index, difficulty] of difficulties.entries()) {
    const sim = game();
    expect(sim.state.difficulty).toBe('normal');
    sim.state.difficulty = difficulty;
    sim.summonToFirstEmpty();
    sim.state.board[0]!.cooldownMs = 1e9;
    const board = sim.state.board;
    sim.upgrades.attack = 15;
    sim.state.baseHealth = sim.state.maxBaseHealth = 10000;
    sim.state.wave = 119;
    sim.startNextWave();
    const gold = sim.state.gold;
    sim.update(135000);
    expect(sim.state.board).toBe(board);
    expect(sim.upgrades.attack).toBe(15);
    expect(sim.state.gold).toBe(gold);
    if (difficulty === 'insane') {
      expect(sim.state.status).toBe('won');
      expect(sim.pendingReward).toBe(false);
      expect(sim.restartRun()).toBe(true);
      expect(sim.state.difficulty).toBe('normal');
      expect(sim.state.wave).toBe(0);
    } else {
      expect(sim.state.status).toBe('running');
      expect(sim.pendingReward).toBe(true);
      expect(sim.upcomingWaveDefinition?.number).toBe(1);
      sim.update(5000);
      expect(sim.state.difficulty).toBe(difficulty);
      sim.rollReward(sim.rewardChoices[0]!.id);
      sim.resolveUpgradeRoll();
      sim.update(5000);
      expect(sim.state.wave).toBe(1);
      expect(sim.state.difficulty).toBe(difficulties[index + 1]);
      expect(sim.isWaveActive).toBe(true);
      expect(sim.state.board).toBe(board);
    }
  }
});

test.each([1, 5, 10, 120])('difficulty scales actual spawned enemies for wave %s', wave => {
  const snapshots = ['normal', 'nightmare', 'hell', 'insane'].map(difficulty => {
    const sim = game();
    sim.state.difficulty = difficulty as typeof sim.state.difficulty;
    sim.state.wave = wave - 1;
    sim.startNextWave();
    sim.update(10000);
    return sim.enemies;
  });
  const normal = snapshots[0]!;
  for (const [index, multiplier] of [1, 1.5, 2, 3].entries()) {
    const enemies = snapshots[index]!;
    expect(enemies).toHaveLength(normal.length * (index === 3 ? 2 : 1));
    expect(enemies[0]!.maxHp).toBe(Math.round(normal[0]!.maxHp * multiplier));
    expect(enemies[0]!.armor).toBe(Math.round(normal[0]!.armor * multiplier));
    expect(new Set(enemies.map(e => e.id)).size).toBe(enemies.length);
  }
});

test('dragon enhancement probabilities cover every level through 24', () => {
  expect(Array.from({ length: 24 }, (_, i) => getItemUpgradeChance(i + 1))).toEqual([
    1, 1, 1, 1, .66, .66, .5, .5, .33, .2, .2, .2, .1, .1, .1,
    .05, .05, .05, .05, .05, .02, .02, .02, .02,
  ]);
});

test.each(['weapon', 'ring', 'boots'] as const)('%s can reach +24 and shop prevents further spending', kind => {
  const sim = new GameSimulation(createDefaultMetaProgress(), { next: () => 0, pick: items => items[0]! });
  sim.state.board = [{ instanceId: 'super', definitionId: 'super-warrior', cooldownMs: 0, x: 150, y: 148, items: [{ kind, level: 0, bonus: 0 }] }];
  sim.state.gold = 1e7;
  for (let level = 1; level <= 24; level++) {
    expect(sim.upgradeDragonItem(0, kind)).toMatchObject({ success: true, level });
  }
  const gold = sim.state.gold;
  expect(sim.upgradeDragonItem(0, kind)).toBeNull();
  expect(sim.state.gold).toBe(gold);
  expect(dragonShopMarkup(sim, 0)).toContain('disabled>최대 +24');
});

test('losing early in Nightmare preserves the completed normal campaign record', () => {
  const sim = game();
  sim.state.difficulty = 'nightmare';
  sim.state.baseHealth = 1;
  sim.startNextWave();
  sim.update(sim.waves[0]!.durationMs);
  expect(sim.state.status).toBe('lost');
  expect(sim.meta.highestWave).toBe(120);
});
