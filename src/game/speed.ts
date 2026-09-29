export const PLAYER_SPEEDS = [1, 2, 3, 5] as const;
export const OPERATOR_SPEEDS = [10, 20, 40, 80] as const;

export function getSpeedOptions(development: boolean): number[] {
  return development ? [...PLAYER_SPEEDS, ...OPERATOR_SPEEDS] : [...PLAYER_SPEEDS];
}

/** Bound a slow frame's catch-up work at the highest operator speeds. */
export function getSimulationStepMs(frameDeltaMs: number, speed: number): number {
  return Math.min(frameDeltaMs, speed >= 40 ? 32 : 80) * speed;
}
