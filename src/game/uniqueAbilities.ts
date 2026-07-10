import type { UnitAbilityKind } from "./types";

export type UniqueAbilityStats =
  | { ability: "multishot"; stage: number; targetCount: number; damageMultiplier: number }
  | { ability: "poison"; stage: number; damageRatio: number; durationMs: number; tickMs: number }
  | { ability: "slow"; stage: number; slowPercent: number; durationMs: number }
  | { ability: "freeze"; stage: number; chance: number; durationMs: number }
  | { ability: "berserk"; stage: number; damageMultiplier: number; speedMultiplier: number; durationMs: number };

export function getUniqueAbilityStats(ability: UnitAbilityKind, level: number): UniqueAbilityStats {
  const step = getUniqueAbilityStep(level);
  const stage = step + 1;

  if (ability === "multishot") {
    return {
      ability,
      stage,
      targetCount: Math.min(5, 3 + Math.floor(step / 7)),
      damageMultiplier: 1 + step * 0.015,
    };
  }
  if (ability === "poison") {
    return {
      ability,
      stage,
      damageRatio: 0.18 + step * 0.01,
      durationMs: 3_000 + step * 25,
      tickMs: 500,
    };
  }
  if (ability === "slow") {
    return {
      ability,
      stage,
      slowPercent: Math.min(0.65, 0.45 + step * 0.01),
      durationMs: 2_500 + step * 75,
    };
  }
  if (ability === "freeze") {
    return {
      ability,
      stage,
      chance: Math.min(0.5, 0.28 + step * 0.01),
      durationMs: 900 + step * 40,
    };
  }
  return {
    ability,
    stage,
    damageMultiplier: 1.6 + step * 0.025,
    speedMultiplier: 1.45 + step * 0.0175,
    durationMs: 3_500 + step * 125,
  };
}

export function formatUniqueAbilityStats(ability: UnitAbilityKind, level: number): string {
  const stats = getUniqueAbilityStats(ability, level);
  if (stats.ability === "multishot") {
    return `${stats.stage}단계 ${stats.targetCount}명 x${stats.damageMultiplier.toFixed(2)}`;
  }
  if (stats.ability === "poison") {
    return `${stats.stage}단계 독 ${(stats.damageRatio * 100).toFixed(0)}% ${(stats.durationMs / 1000).toFixed(1)}초`;
  }
  if (stats.ability === "slow") {
    return `${stats.stage}단계 둔화 ${(stats.slowPercent * 100).toFixed(0)}% ${(stats.durationMs / 1000).toFixed(1)}초`;
  }
  if (stats.ability === "freeze") {
    return `${stats.stage}단계 빙결 ${(stats.chance * 100).toFixed(0)}% ${(stats.durationMs / 1000).toFixed(2)}초`;
  }
  return `${stats.stage}단계 피해 x${stats.damageMultiplier.toFixed(2)} 공속 x${stats.speedMultiplier.toFixed(2)}`;
}

function getUniqueAbilityStep(level: number): number {
  const normalizedLevel = Math.max(1, Math.min(99, Math.floor(level)));
  return Math.floor(normalizedLevel / 5);
}
