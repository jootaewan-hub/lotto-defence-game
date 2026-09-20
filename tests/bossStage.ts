import type { GameSimulation } from '../src/game/simulation';

/**
 * Bosses are stages that follow a numbered wave rather than waves themselves, so
 * a test cannot reach one by setting `state.wave`. This clears the ordinary wave
 * by letting it time out, then lets the inter-stage delay elapse, which is how
 * the game itself enters a boss stage. The keep is given enough durability to
 * survive the leak damage that timing out costs.
 */
export function enterBossStageAfter(sim: GameSimulation, wave: number): void {
  sim.state = { ...sim.state, wave: wave - 1, baseHealth: 1e9, maxBaseHealth: 1e9 };
  sim.startNextWave();
  sim.update(sim.waves[wave - 1]!.durationMs);
  // A blessing is offered on every tenth wave and would hold the next stage back.
  sim.pendingReward = false;
  sim.rewardChoices = [];
  sim.update(5_000);
  sim.drainEvents();
}
