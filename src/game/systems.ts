import { RARITIES, getRarityIndex } from "./rarities";
import { createSeededRng, type Rng } from "./rng";
import { createDefaultMetaProgress, getSkillEffectTotal } from "./skills";
import type { JackpotReward, KillGoldReward, MetaProgress, RarityId, RunState, UnitDefinition } from "./types";
import { getTowerType, getUnitDefinition, getUnitsByRarity, UNIT_DEFINITIONS, isUniqueUnit } from "./units";

export { RARITIES, getRarity, getRarityIndex } from "./rarities";
export { createRandomRng, createSeededRng } from "./rng";
export { createDefaultMetaProgress, getSkillEffectTotal, purchaseSkill, skillTracks, skillTree } from "./skills";
export type * from "./types";
export { MAX_WAVES, buildWaves, getBossEncounter } from "./waves";

export type SummonKind = "normal" | "advanced" | "legendary";

/** Guardian summon: common through hero. Each table sums to exactly 1. */
const NORMAL_SUMMON_CHANCES: Partial<Record<RarityId, number>> = {
  common: 0.468,
  advanced: 0.26,
  rare: 0.146,
  epic: 0.084,
  hero: 0.042,
};

/** Advanced summon: advanced through mythic. */
const ADVANCED_SUMMON_CHANCES: Partial<Record<RarityId, number>> = {
  advanced: 0.354,
  rare: 0.279,
  epic: 0.177,
  hero: 0.101,
  legendary: 0.057,
  mythic: 0.032,
};

/**
 * Legendary summon: epic through immortal, plus the only path to a unique.
 * The unique is drawn before this table, so the effective rates are these
 * values times (1 - LEGENDARY_UNIQUE_CHANCE).
 */
const LEGENDARY_SUMMON_CHANCES: Partial<Record<RarityId, number>> = {
  epic: 0.17,
  hero: 0.26,
  legendary: 0.29,
  mythic: 0.22,
  transcendent: 0.045,
  immortal: 0.013,
};

const SUMMON_CHANCES: Record<SummonKind, Partial<Record<RarityId, number>>> = {
  normal: NORMAL_SUMMON_CHANCES,
  advanced: ADVANCED_SUMMON_CHANCES,
  legendary: LEGENDARY_SUMMON_CHANCES,
};

/** Highest rarity each summon kind can reach, used when a roll overruns the table. */
const SUMMON_CEILING: Record<SummonKind, RarityId> = {
  normal: "hero",
  advanced: "mythic",
  legendary: "immortal",
};

/**
 * How many towers the guard wants standing before it trades quantity for
 * quality. Per gold the higher tiers climb the ladder faster, so the only
 * reason to buy cheap is that a thin board cannot hold the line at all.
 *
 * These used to be shares of MAX_TOWERS, a cap of 200 that a gold limited run
 * never comes close to: auto play bought the cheapest summon and nothing else
 * for an entire campaign, and the legendary table was never sampled once.
 */
export const AUTO_ADVANCED_TOWERS = 12;
export const AUTO_LEGENDARY_TOWERS = 24;

/** The tier auto play aims for at this board size, whatever it can afford. */
export function autoSummonTarget(towers: number): SummonKind {
  if (towers >= AUTO_LEGENDARY_TOWERS) return "legendary";
  if (towers >= AUTO_ADVANCED_TOWERS) return "advanced";
  return "normal";
}

/**
 * The summon auto play should buy, or null when it is still short. It buys the
 * one tier it is aiming for rather than whatever is affordable this instant:
 * gold arrives in a trickle, so taking the cheapest summon the moment it can
 * afford one means never holding enough for a better one.
 */
export function chooseAutoSummon(
  towers: number,
  gold: number,
  costs: Record<SummonKind, number>,
): SummonKind | null {
  const target = autoSummonTarget(towers);
  return gold >= costs[target] ? target : null;
}

/** Only the legendary summon can produce a unique, and only this often. */
export const LEGENDARY_UNIQUE_CHANCE = 0.002;

/**
 * What the keep starts with, and what surviving a full campaign of 120 waves
 * adds to it. A campaign is the game's one long checkpoint, so clearing one
 * both heals the keep and leaves it permanently sturdier for the next.
 */
export const BASE_KEEP_HEALTH = 50;
export const KEEP_HEALTH_PER_CAMPAIGN = 50;

export function createInitialRunState(meta: MetaProgress = createDefaultMetaProgress()): RunState {
  // Legacy skills count at a quarter of their value, which leaves stats that are
  // conceptually whole sitting on a fraction: the legacy defence-1 bonus of 5
  // becomes 1.25 and the keep shows "21.25 / 21.25". Leak damage and regeneration
  // are already whole, so only these derived starting values need rounding.
  const maxBaseHealth = Math.round(BASE_KEEP_HEALTH + getSkillEffectTotal(meta, "baseHealthBonus"));
  return {
    difficulty: 'normal',
    wave: 0,
    waveTimeRemainingMs: 0,
    gold: Math.round(100 + getSkillEffectTotal(meta, "startGold")),
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
  const chances = SUMMON_CHANCES[kind];

  for (const rarity of RARITIES) {
    cumulative += chances[rarity.id] ?? 0;
    if (roll <= cumulative) {
      return rarity.id;
    }
  }

  return SUMMON_CEILING[kind];
}

/**
 * Draws a unique for the legendary summon. Uniques are not a rarity, so they
 * cannot live in the rarity table and are rolled ahead of it. Super uniques
 * stay awakening-only.
 */
export function rollSummonUniqueUnit(rng: Pick<Rng, "next" | "pick">): UnitDefinition | null {
  if (rng.next() >= LEGENDARY_UNIQUE_CHANCE) {
    return null;
  }
  const candidates = UNIT_DEFINITIONS.filter((unit) => unit.uniqueAbility && !unit.superUnique);
  return candidates.length ? rng.pick(candidates) : null;
}

export function getFailureGrowthShards(wave: number, defeatedEnemies: number, bonus = 0): number {
  const waveReward = 2 + Math.ceil(Math.max(1, wave) / 4);
  const killReward = Math.floor(Math.max(0, defeatedEnemies) / 30);
  return Math.max(3, Math.round((waveReward + killReward) * (1 + Math.max(0, bonus))));
}

/** Every tier fuses three of a kind, except immortals, which pair into a unique. */
export const DEFAULT_MERGE_COUNT = 3;
export const IMMORTAL_MERGE_COUNT = 2;
/**
 * How many uniques a single tower class may hold. The limit used to count every
 * unique on the board at once, so a guard that had fused two archer uniques
 * could never make a warrior one however many immortals it stockpiled — and an
 * awakening needs a unique of its own class.
 */
export const UNIQUES_PER_TOWER_TYPE = 2;

export function getMergeRequirement(rarity: RarityId): number {
  return rarity === "immortal" ? IMMORTAL_MERGE_COUNT : DEFAULT_MERGE_COUNT;
}

export function getMergeRequirementFor(unitId: string): number {
  return getMergeRequirement(getUnitDefinition(unitId).rarity);
}

export function createMergeCandidates(sourceUnitId: string, rng: Rng): UnitDefinition[] {
  const source = getUnitDefinition(sourceUnitId);
  const sourceIndex = getRarityIndex(source.rarity);
  const nextRarity = RARITIES[sourceIndex + 1];

  if (isUniqueUnit(source)) throw new Error("유니크는 일반 합성할 수 없습니다.");
  // Unique is a real rarity now, so merging immortals reaches it the same way
  // every other tier is reached. Uniques alone are type-bound: two immortal
  // mages fuse into a mage unique, never into an archer one.
  const pool = nextRarity ? getUnitsByRarity(nextRarity.id) : [];
  const candidates = nextRarity?.id === "unique"
    ? pool.filter((unit) => getTowerType(unit) === getTowerType(source))
    : pool;
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
