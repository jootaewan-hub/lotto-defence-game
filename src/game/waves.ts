import type { RunState, WaveDefinition } from "./types";

export const MAX_WAVES = 120;

/**
 * Boss cadence. Bosses are not waves: they are separate stages that follow a
 * numbered wave without consuming a wave number, so a run is MAX_WAVES ordinary
 * waves plus the boss stages hanging off every 5th, 10th and 20th of them.
 */
const MID_BOSS_EVERY = 5;
const NAMED_BOSS_EVERY = 10;
const TRUE_BOSS_EVERY = 20;

/** Clear time per boss tier. Ordinary waves scale with tier instead. */
const MID_BOSS_DURATION_MS = 60_000;
const NAMED_BOSS_DURATION_MS = 95_000;
const TRUE_BOSS_DURATION_MS = 115_000;
const FINAL_BOSS_DURATION_MS = 135_000;

/**
 * Past wave 50 the mid, named and true boss tiers get longer to clear, matching
 * where boss health and armor already change pace. The final boss is a fixed
 * encounter and keeps its own time.
 */
const LATE_BOSS_WAVE = 50;
const LATE_BOSS_DURATION_BONUS_MS = 20_000;

/**
 * How many mid bosses a mid boss stage sends. Named, true and final bosses are
 * single opponents. This is declared rather than left to fall out of the spawn
 * interval and the stage length, which is what used to decide it.
 */
const MID_BOSS_COUNT = 4;

/** Mid boss health relative to a wave-1 grunt; bosses and true bosses stack on top. */
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

/** A boss stage carries the number of the wave it follows, so scaling is unchanged. */
type StageKind = "normal" | "mid" | "named" | "true" | "final";

function createStage(number: number, kind: StageKind): WaveDefinition {
  const isBoss = kind !== "normal";
  const isNamedBoss = kind === "named" || kind === "true" || kind === "final";
  const isTrueBoss = kind === "true" || kind === "final";
  const isFinalBoss = kind === "final";
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
    bossId: kind === "named" ? getNamedBossId(number) : undefined,
    trueBossId: isFinalBoss ? FINAL_BOSS_ID : kind === "true" ? getTrueBossId(number) : undefined,
    enemyCount: isNamedBoss ? 1 : isBoss ? MID_BOSS_COUNT : 10 + tier * 2 + (number % 5),
    healthMultiplier: baseHealthMultiplier * lateGameHealthMultiplier,
    speedMultiplier: isNamedBoss ? 0.7 + tier * 0.01 : isBoss ? 0.75 + tier * 0.015 : 1 + tier * 0.0175,
    durationMs: isFinalBoss
      ? FINAL_BOSS_DURATION_MS
      : isBoss
        ? (isTrueBoss ? TRUE_BOSS_DURATION_MS : isNamedBoss ? NAMED_BOSS_DURATION_MS : MID_BOSS_DURATION_MS)
          + (number > LATE_BOSS_WAVE ? LATE_BOSS_DURATION_BONUS_MS : 0)
        : 28_000 + tier * 2_000,
  };
}

/** The numbered waves. Every one of them is an ordinary wave. */
export function buildWaves(): WaveDefinition[] {
  return Array.from({ length: MAX_WAVES }, (_, index) => createStage(index + 1, "normal"));
}

/** The boss stage that follows this wave, or null when no boss is due. */
export function getBossEncounter(afterWave: number): WaveDefinition | null {
  if (afterWave === MAX_WAVES) return createStage(afterWave, "final");
  if (afterWave % TRUE_BOSS_EVERY === 0) return createStage(afterWave, "true");
  if (afterWave % NAMED_BOSS_EVERY === 0) return createStage(afterWave, "named");
  if (afterWave % MID_BOSS_EVERY === 0) return createStage(afterWave, "mid");
  return null;
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
