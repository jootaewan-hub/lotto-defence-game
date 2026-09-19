import { getEnemyGrowthWave } from "./waves";
import { getUniqueAbilityStats } from "./uniqueAbilities";
import type { Rng } from "./rng";
import type {
  EnemyState,
  EnemyStatusEffect,
  JackpotReward,
  UnitDefinition,
  WaveDefinition,
} from "./types";

const ENEMY_GOLD_REWARD_SCALE = 0.5;
const NORMAL_WAVE_CLEANUP_WINDOW_MS = 5_000;
const BOSS_WAVE_CLEANUP_WINDOW_MS = 20_000;
const TRUE_BOSS_WAVE_CLEANUP_WINDOW_MS = 45_000;

export function describeJackpot(reward: JackpotReward): string {
  if (reward.type === "gold") {
    return `잭팟! 골드 +${reward.amount}`;
  }
  if (reward.type === "freeSummon") {
    return "잭팟! 무료 소환 +1";
  }
  return reward.stat === "attack" ? "잭팟! 공격력 버프" : "잭팟! 공격속도 버프";
}

export function scaleEnemyReward(baseReward: number): number {
  return Math.max(1, Math.floor(baseReward * ENEMY_GOLD_REWARD_SCALE));
}

export function getWaveCleanupWindowMs(wave: WaveDefinition | null | undefined): number {
  if (wave?.isTrueBoss || wave?.bossId) {
    return TRUE_BOSS_WAVE_CLEANUP_WINDOW_MS;
  }
  return wave?.isBoss ? BOSS_WAVE_CLEANUP_WINDOW_MS : NORMAL_WAVE_CLEANUP_WINDOW_MS;
}

export function getWaveArmor(waveNumber: number, isBoss: boolean): number {
  waveNumber = getEnemyGrowthWave(waveNumber, isBoss);
  const tier = Math.floor((waveNumber - 1) / 5);
  const lateGameArmor = Math.max(0, waveNumber - 30) * 0.6;
  const normalArmor = Math.max(1, Math.floor(waveNumber * 0.4 + tier + lateGameArmor));
  return isBoss ? normalArmor * 5 : normalArmor;
}

export function applyArmor(damage: number, armor: number): number {
  return Math.max(1, Math.round(damage * (100 / (100 + armor))));
}

export function applyUniqueAbility(
  enemy: EnemyState,
  definition: UnitDefinition,
  dealtDamage: number,
  level: number,
  skillPowerBonus: number,
  rng: Rng,
): void {
  if (!definition.uniqueAbility) {
    return;
  }

  const stats = getUniqueAbilityStats(definition.uniqueAbility, level);
  if (stats.ability === "slow") {
    upsertEnemyEffect(enemy, { kind: "slow", remainingMs: stats.durationMs, magnitude: 1 - stats.slowPercent });
  }
  if (stats.ability === "poison") {
    upsertEnemyEffect(enemy, {
      kind: "poison",
      remainingMs: stats.durationMs,
      magnitude: Math.max(3, Math.round(dealtDamage * stats.damageRatio * (1 + skillPowerBonus))),
      tickMs: stats.tickMs,
      sourceDefinitionId: definition.id,
    });
  }
  if (stats.ability === "freeze" && rng.next() < stats.chance) {
    upsertEnemyEffect(enemy, { kind: "freeze", remainingMs: stats.durationMs, magnitude: 0 });
  }
}

function upsertEnemyEffect(enemy: EnemyState, effect: EnemyStatusEffect): void {
  const existing = enemy.effects.find((entry) => entry.kind === effect.kind);
  if (!existing) {
    enemy.effects.push(effect);
    return;
  }

  existing.remainingMs = Math.max(existing.remainingMs, effect.remainingMs);
  const shouldReplacePoisonSource = effect.kind === "poison" && effect.magnitude >= existing.magnitude;
  existing.magnitude = effect.kind === "slow" ? Math.min(existing.magnitude, effect.magnitude) : Math.max(existing.magnitude, effect.magnitude);
  if (shouldReplacePoisonSource && effect.sourceDefinitionId) {
    existing.sourceDefinitionId = effect.sourceDefinitionId;
  }
  if (effect.tickMs !== undefined) {
    existing.tickMs = Math.min(existing.tickMs ?? effect.tickMs, effect.tickMs);
  }
}

export function getEnemyExperienceReward(enemy: Pick<EnemyState, "wave" | "variantTier" | "isBoss" | "trueBossId">): number {
  const baseExperience = 4 + Math.floor((enemy.wave - 1) / 5) + enemy.variantTier * 2;
  return baseExperience * (enemy.isBoss && enemy.wave % 10 === 0 ? 12 : enemy.isBoss ? 5 : 1) * 0.5;
}

export function getEnemyMovementMultiplier(enemy: EnemyState): number {
  if (enemy.effects.some((effect) => effect.kind === "freeze")) {
    return 0;
  }

  return enemy.effects
    .filter((effect) => effect.kind === "slow")
    .reduce((multiplier, effect) => Math.min(multiplier, effect.magnitude), 1);
}
