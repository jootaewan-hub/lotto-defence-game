import { expect, test } from 'vitest';
import { GameSimulation } from '../src/game/simulation';
import { createDefaultMetaProgress, createSeededRng } from '../src/game/systems';

test('full auto play advances through rewards and boss stages without manual input', () => {
  const sim = new GameSimulation(createDefaultMetaProgress(), createSeededRng(20260928));
  for (let i = 0; i < 3; i++) sim.summonToFirstEmpty();
  sim.autoProgress = sim.autoSummon = sim.autoUpgrade = sim.autoArrange = sim.autoCraft = true;
  let rewards = 0;
  let bossStages = 0;
  let ticks = 0;

  for (; ticks < 150_000 && sim.state.wave < 40 && sim.state.status !== 'lost'; ticks++) {
    sim.update(40);
    for (const event of sim.drainEvents()) {
      if (event.type === 'waveComplete' && event.bossLabel) bossStages++;
    }
    rewards = sim.rewardHistory.length;
  }

  expect(sim.state.wave).toBeGreaterThanOrEqual(20);
  expect(rewards).toBeGreaterThan(0);
  expect(bossStages).toBeGreaterThan(0);
  expect(sim.pendingReward).toBe(false);
  console.log(`auto-play seed 20260928: wave ${sim.state.wave}, health ${sim.state.baseHealth}, gold ${sim.state.gold}, guard ${sim.state.board.length}, rewards ${rewards}, bosses ${bossStages}, simulated ${(ticks * 40 / 1000).toFixed(0)}s`);
});
