import { RARITIES, getRarityIndex } from "./rarities";
import { createSeededRng, type Rng } from "./rng";
import { createDefaultMetaProgress, getSkillEffectTotal } from "./skills";
import type { JackpotReward, KillGoldReward, MetaProgress, RarityId, RunState, UnitDefinition } from "./types";
import { getUnitDefinition, getUnitsByRarity, UNIT_DEFINITIONS, isUniqueUnit } from "./units";

export { RARITIES, getRarity, getRarityIndex } from "./rarities";
export { createRandomRng, createSeededRng } from "./rng";
export { createDefaultMetaProgress, getSkillEffectTotal, purchaseSkill, skillTracks, skillTree } from "./skills";
export type * from "./types";
export { MAX_WAVES, buildWaves } from "./waves";

export type SummonKind = "normal" | "advanced";

const NORMAL_SUMMON_CHANCES: Partial<Record<RarityId, number>> = {
  common: 0.459,
  advanced: 0.255,
  rare: 0.143,
  epic: 0.082,
  hero: 0.041,
  legendary: 0.02,
};

const ADVANCED_SUMMON_CHANCES: Partial<Record<RarityId, number>> = {
  common: 0.2,
  advanced: 0.28,
  rare: 0.22,
  epic: 0.14,
  hero: 0.08,
  legendary: 0.045,
  mythic: 0.025,
  transcendent: 0.008,
  immortal: 0.002,
};

export const ADVANCED_UNIQUE_BASE_CHANCE = 0;

export function createInitialRunState(meta: MetaProgress = createDefaultMetaProgress()): RunState {
  const maxBaseHealth = 20 + getSkillEffectTotal(meta, "baseHealthBonus");
  return {
    difficulty: 'normal',
    wave: 0,
    waveTimeRemainingMs: 0,
    gold: 100 + getSkillEffectTotal(meta, "startGold"),
    freeSummons: Math.ceil(getSkillEffectTotal(meta, "startFreeSummons")),
    baseHealth: maxBaseHealth,
    maxBaseHealth,
    board: [],
    activeBuffs: [],
    status: "ready",
    defeatedEnemies: 0,
    growthShardsEarned: 0,
  };
}

export function createSummonSampler(rng: Rng): () => UnitDefinition {
  return () => {
    const rarity = pickRarity(rng, "normal");
    return rng.pick(getUnitsByRarity(rarity));
  };
}

export function pickRarity(rng: Pick<Rng, "next">, kind: SummonKind = "normal"): RarityId {
  const roll = rng.next();
  let cumulative = 0;
  const chances = kind === "advanced" ? ADVANCED_SUMMON_CHANCES : NORMAL_SUMMON_CHANCES;

  for (const rarity of RARITIES) {
    cumulative += chances[rarity.id] ?? 0;
    if (roll <= cumulative) {
      return rarity.id;
    }
  }

  return kind === "advanced" ? RARITIES[RARITIES.length - 1]!.id : "legendary";
}

export function rollAdvancedUniqueUnit(_rng: Pick<Rng, "next">, _chanceBonus = 0): UnitDefinition | null {
  return null;
}

export function getFailureGrowthShards(wave: number, defeatedEnemies: number, bonus = 0): number {
  const waveReward = 2 + Math.ceil(Math.max(1, wave) / 4);
  const killReward = Math.floor(Math.max(0, defeatedEnemies) / 30);
  return Math.max(3, Math.round((waveReward + killReward) * (1 + Math.max(0, bonus))));
}

export function createMergeCandidates(sourceUnitId: string, rng: Rng): UnitDefinition[] {
  const source = getUnitDefinition(sourceUnitId);
  const sourceIndex = getRarityIndex(source.rarity);
  const nextRarity = RARITIES[sourceIndex + 1];

  if (isUniqueUnit(source)) throw new Error("유니크는 일반 합성할 수 없습니다.");
  const candidates = nextRarity ? getUnitsByRarity(nextRarity.id).filter(u => !isUniqueUnit(u)) : UNIT_DEFINITIONS.filter(u => u.uniqueAbility && !u.superUnique);
  for (let index = candidates.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng.next() * (index + 1));
    [candidates[index], candidates[swapIndex]] = [candidates[swapIndex]!, candidates[index]!];
  }

  return candidates.slice(0, 3);
}

/** Jackpot payouts are always whole units: gold rounds up, a summon ticket is one full draw. */
const JACKPOT_GOLD_REWARD = Math.ceil(8.75);
const JACKPOT_FREE_SUMMON_REWARD = 1;

export function resolveJackpotReward(state: RunState, reward: JackpotReward): RunState {
  if (reward.type === "gold") {
    return { ...state, gold: state.gold + Math.ceil(reward.amount) };
  }
  if (reward.type === "freeSummon") {
    return { ...state, freeSummons: state.freeSummons + Math.ceil(reward.amount) };
  }

  return {
    ...state,
    activeBuffs: [
      ...state.activeBuffs,
      {
        stat: reward.stat,
        multiplier: reward.multiplier,
        remainingMs: reward.durationMs,
      },
    ],
  };
}

export function rollJackpotReward(rng: Rng): JackpotReward {
  const roll = rng.next();
  if (roll < 0.45) {
    return { type: "gold", amount: JACKPOT_GOLD_REWARD };
  }
  if (roll < 0.75) {
    return { type: "freeSummon", amount: JACKPOT_FREE_SUMMON_REWARD };
  }
  return rng.next() < 0.5
    ? { type: "buff", stat: "attack", multiplier: 1.0875, durationMs: 10_000 }
    : { type: "buff", stat: "attackSpeed", multiplier: 1.075, durationMs: 10_000 };
}

export function rollKillGoldReward(baseGold: number, rng: Pick<Rng, "next">): KillGoldReward {
  const roll = rng.next();
  if (roll >= 0.995) {
    return { tier: "legendary", amount: Math.round(baseGold * 4.5) };
  }
  if (roll >= 0.97) {
    return { tier: "epic", amount: Math.round(baseGold * 2.8) };
  }
  if (roll >= 0.86) {
    return { tier: "great", amount: Math.round(baseGold * 1.8) };
  }
  if (roll >= 0.58) {
    return { tier: "good", amount: Math.round(baseGold * 1.25) };
  }
  return { tier: "small", amount: baseGold };
}

export function createRuntimeSeed(): Rng {
  return createSeededRng(Date.now() % 1_000_000);
}
