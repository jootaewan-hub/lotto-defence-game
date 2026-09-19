import type { RunState, WaveDefinition } from "./types";

export const MAX_WAVES = 120;

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
    const isTrueBoss = number % 10 === 0;
    const tier = Math.floor((number - 1) / 5);
    const lateGameHealthMultiplier = (1 + Math.max(0, number - 20) * 0.0325) * Math.pow(1.006, number - 1);
    const baseHealthMultiplier = isTrueBoss ? (8 + tier * 1.35) * 1.75 : isBoss ? 8 + tier * 1.35 : 1 + number * 0.09;

    return {
      number,
      isBoss,
      isTrueBoss,
      trueBossId: isTrueBoss ? getTrueBossId(number) : undefined,
      enemyCount: isBoss ? 1 : 10 + tier * 2 + (number % 5),
      healthMultiplier: baseHealthMultiplier * lateGameHealthMultiplier,
      speedMultiplier: isTrueBoss ? 0.7 + tier * 0.01 : isBoss ? 0.75 + tier * 0.015 : 1 + tier * 0.0175,
      durationMs: isTrueBoss ? 75_000 : isBoss ? 50_000 : 28_000 + tier * 2_000,
    };
  });
}

function getTrueBossId(waveNumber: number): WaveDefinition["trueBossId"] {
  const cycle = ["orc-emperor", "ogre-king", "ancient-dragon", "undead-demon-king"] as const;
  return cycle[(Math.floor(waveNumber / 10) - 1) % cycle.length];
}
