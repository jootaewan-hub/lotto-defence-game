import type { WaveDefinition } from "./types";

export const MAX_WAVES = 60;

export function buildWaves(): WaveDefinition[] {
  return Array.from({ length: MAX_WAVES }, (_, index) => {
    const number = index + 1;
    const isBoss = number % 5 === 0;
    const isTrueBoss = number % 10 === 0;
    const tier = Math.floor((number - 1) / 5);
    const lateGameHealthMultiplier = 1 + Math.max(0, number - 30) * 0.035;
    const baseHealthMultiplier = isTrueBoss ? (8 + tier * 2.7) * 1.75 : isBoss ? 8 + tier * 2.7 : 1 + number * 0.18;

    return {
      number,
      isBoss,
      isTrueBoss,
      trueBossId: isTrueBoss ? getTrueBossId(number) : undefined,
      enemyCount: isBoss ? 1 : 10 + tier * 2 + (number % 5),
      healthMultiplier: baseHealthMultiplier * lateGameHealthMultiplier,
      speedMultiplier: isTrueBoss ? 0.7 + tier * 0.02 : isBoss ? 0.75 + tier * 0.03 : 1 + tier * 0.035,
      durationMs: isTrueBoss ? 75_000 : isBoss ? 50_000 : 28_000 + tier * 2_000,
    };
  });
}

function getTrueBossId(waveNumber: number): WaveDefinition["trueBossId"] {
  const cycle = ["orc-emperor", "ogre-king", "ancient-dragon", "undead-demon-king"] as const;
  return cycle[(Math.floor(waveNumber / 10) - 1) % cycle.length];
}
