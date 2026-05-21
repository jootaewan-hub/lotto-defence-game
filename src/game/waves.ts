import type { WaveDefinition } from "./types";

export function buildWaves(): WaveDefinition[] {
  return Array.from({ length: 30 }, (_, index) => {
    const number = index + 1;
    const isBoss = number % 5 === 0;
    const tier = Math.floor((number - 1) / 5);

    return {
      number,
      isBoss,
      enemyCount: isBoss ? 1 : 10 + tier * 2 + (number % 5),
      healthMultiplier: isBoss ? 8 + tier * 2.7 : 1 + number * 0.18,
      speedMultiplier: isBoss ? 0.75 + tier * 0.03 : 1 + tier * 0.035,
    };
  });
}
