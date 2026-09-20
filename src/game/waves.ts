import type { RunState, WaveDefinition } from "./types";

export const MAX_WAVES = 120;

/** Boss cadence: mid boss every 5th wave, named boss every 10th, true boss every 20th, final boss on the last wave. */
const MID_BOSS_EVERY = 5;
const NAMED_BOSS_EVERY = 10;
const TRUE_BOSS_EVERY = 20;

/** Clear time per boss tier. Ordinary waves scale with tier instead. */
const MID_BOSS_DURATION_MS = 60_000;
const NAMED_BOSS_DURATION_MS = 95_000;
const TRUE_BOSS_DURATION_MS = 115_000;
const FINAL_BOSS_DURATION_MS = 135_000;

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
    const isBoss = number % MID_BOSS_EVERY === 0;
    const isNamedBoss = number % NAMED_BOSS_EVERY === 0;
    const isTrueBoss = number % TRUE_BOSS_EVERY === 0;
    const isFinalBoss = number === MAX_WAVES;
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
      isFinalBoss,
      bossId: isNamedBoss && !isTrueBoss ? getNamedBossId(number) : undefined,
      trueBossId: isFinalBoss ? FINAL_BOSS_ID : isTrueBoss ? getTrueBossId(number) : undefined,
      enemyCount: isBoss ? 1 : 10 + tier * 2 + (number % 5),
      healthMultiplier: baseHealthMultiplier * lateGameHealthMultiplier,
      speedMultiplier: isNamedBoss ? 0.7 + tier * 0.01 : isBoss ? 0.75 + tier * 0.015 : 1 + tier * 0.0175,
      durationMs: isFinalBoss
        ? FINAL_BOSS_DURATION_MS
        : isTrueBoss
          ? TRUE_BOSS_DURATION_MS
          : isNamedBoss
            ? NAMED_BOSS_DURATION_MS
            : isBoss
              ? MID_BOSS_DURATION_MS
              : 28_000 + tier * 2_000,
    };
  });
}

const BOSS_CYCLE = ["orc-emperor", "ogre-king", "ancient-dragon", "undead-demon-king"] as const;
const FINAL_BOSS_ID = "eclipse-sovereign" as const;

/**
 * Each boss tier indexes the cycle by its own ordinal rather than by a shared
 * wave/10 index. A shared index would lock each tier to one parity once true
 * bosses moved to every 20th wave, so only two of the four bosses would ever
 * appear in either tier.
 */
function getTrueBossId(waveNumber: number): WaveDefinition["trueBossId"] {
  return BOSS_CYCLE[(waveNumber / TRUE_BOSS_EVERY - 1) % BOSS_CYCLE.length];
}

function getNamedBossId(waveNumber: number): WaveDefinition["bossId"] {
  return BOSS_CYCLE[Math.floor((waveNumber - NAMED_BOSS_EVERY) / TRUE_BOSS_EVERY) % BOSS_CYCLE.length];
}
