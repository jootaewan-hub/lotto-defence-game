import { getWaveArmor, getWaveCleanupWindowMs } from './combatMath';
import { getEnemyVariant, getTrueBossDefinition } from './enemyVariants';
import type { RunState, WaveDefinition } from './types';
import { DIFFICULTIES } from './waves';

type Difficulty = (typeof DIFFICULTIES)[RunState['difficulty']];

/** Single-target, sustained attack estimate. Skills, splash and target downtime vary in battle. */
export function getExpectedTowerDps(stats: {attack: number; attackSpeed: number; criticalChance: number}, criticalMultiplier = 1.75): number {
  if (stats.attackSpeed <= 0) return 0;
  return stats.attack * (1000 / stats.attackSpeed) * (1 + stats.criticalChance * (criticalMultiplier - 1));
}

/** Raw damage per second needed to clear the estimated spawns with 25% time reserve. */
export function getRecommendedDps(wave: WaveDefinition, difficulty: Difficulty): number {
  const namedBossId = wave.trueBossId ?? wave.bossId;
  const boss = namedBossId ? getTrueBossDefinition(namedBossId) : null;
  const spawnCount = wave.isBoss
    ? wave.enemyCount * difficulty.spawnMultiplier
    : (1 + Math.floor(Math.max(0, wave.durationMs - getWaveCleanupWindowMs(wave)) /
      Math.max(180, Math.floor(wave.durationMs / (wave.enemyCount * 4.8))))) * difficulty.spawnMultiplier;
  // Sample the rotating variants without creating hundreds of enemy objects every UI refresh.
  const sampleCount = Math.min(24, spawnCount);
  let effectiveHp = 0;
  for (let sequence = 1; sequence <= sampleCount; sequence++) {
    const variant = getEnemyVariant(wave.number, wave.isBoss, sequence);
    const hp = Math.round(Math.round((wave.isBoss ? 280 : 46) * wave.healthMultiplier * variant.hpMultiplier * (boss?.hpMultiplier ?? 1)) * difficulty.statMultiplier);
    const armor = Math.round(Math.round(getWaveArmor(wave.scalingWave, wave.isBoss) * variant.armorMultiplier * (boss?.armorMultiplier ?? 1)) * difficulty.armorMultiplier);
    effectiveHp += hp * (1 + armor / 100);
  }
  return Math.max(1, Math.ceil(effectiveHp / sampleCount * spawnCount / Math.max(1, wave.durationMs / 1000 * 0.75)));
}
