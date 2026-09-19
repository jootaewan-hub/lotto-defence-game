import type { RunState, WaveDefinition } from "./types";

export const MAX_WAVES = 120;

/** Mid boss (every 5th wave) health relative to a wave-1 grunt; bosses and true bosses stack on top. */
const MID_BOSS_BASE_HEALTH = 5.6;
const MID_BOSS_HEALTH_PER_TIER = 0.95;
const BOSS_HEALTH_MULTIPLIER = 1.5;
const TRUE_BOSS_HEALTH_MULTIPLIER = 1.15;

/** After wave 50, boss health and armor advance at half the former pace. */
export function getEnemyGrowthWave(wave: number, isBoss: boolean): number {
  return isBoss && wave > 50 ? 50 + (wave - 50) * 0.5 : wave;
}

export const DIFFICULTIES: Record<RunState['difficulty'], {
  label: string;
  statMultiplier: number;
  spawnMultiplier: number;
  next: RunState['difficulty'] | null;
}> = {
  normal: { label: '보통', statMultiplier: 1, spawnMultiplier: 1, next: 'nightmare' },
  nightmare: { label: '나이트메어', statMultiplier: 1.5, spawnMultiplier: 1, next: 'hell' },
  hell: { label: '헬', statMultiplier: 2, spawnMultiplier: 1, next: 'insane' },
  insane: { label: 'Insane', statMultiplier: 3, spawnMultiplier: 2, next: null },
};

export function buildWaves(): WaveDefinition[] {
  return Array.from({ length: MAX_WAVES }, (_, index) => {
    const number = index + 1;
    const isBoss = number % 5 === 0;
    const isNamedBoss = number % 10 === 0;
    const isTrueBoss = number % 30 === 0;
    const tier = Math.floor((number - 1) / 5);
    const growthWave = getEnemyGrowthWave(number, isBoss);
    const healthTier = Math.floor((growthWave - 1) / 5);
    const lateGameHealthMultiplier = (1 + Math.max(0, growthWave - 20) * 0.0325) * Math.pow(isBoss ? 1.006 : 1.016, growthWave - 1);
    const midBossHealth = MID_BOSS_BASE_HEALTH + healthTier * MID_BOSS_HEALTH_PER_TIER;
    const baseHealthMultiplier = isNamedBoss ? midBossHealth * BOSS_HEALTH_MULTIPLIER * (isTrueBoss ? TRUE_BOSS_HEALTH_MULTIPLIER : 1) : isBoss ? midBossHealth : 1 + number * 0.09;

    return {
      number,
      isBoss,
      isTrueBoss,
      bossId: isNamedBoss && !isTrueBoss ? getTrueBossId(number) : undefined,
      trueBossId: isTrueBoss ? getTrueBossId(number) : undefined,
      enemyCount: isBoss ? 1 : 10 + tier * 2 + (number % 5),
      healthMultiplier: baseHealthMultiplier * lateGameHealthMultiplier,
      speedMultiplier: isNamedBoss ? 0.7 + tier * 0.01 : isBoss ? 0.75 + tier * 0.015 : 1 + tier * 0.0175,
      durationMs: isNamedBoss ? 75_000 : isBoss ? 50_000 : 28_000 + tier * 2_000,
    };
  });
}

function getTrueBossId(waveNumber: number): WaveDefinition["trueBossId"] {
  const cycle = ["orc-emperor", "ogre-king", "ancient-dragon", "undead-demon-king"] as const;
  return cycle[(Math.floor(waveNumber / 10) - 1) % cycle.length];
}
