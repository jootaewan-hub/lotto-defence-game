import { RARITIES, getRarityIndex } from "./rarities";
import { createSeededRng, type Rng } from "./rng";
import { createDefaultMetaProgress, getSkillEffectTotal } from "./skills";
import type { JackpotReward, MetaProgress, RarityId, RunState, UnitDefinition } from "./types";
import { getUnitDefinition, getUnitsByRarity } from "./units";

export { RARITIES, getRarity, getRarityIndex } from "./rarities";
export { createRandomRng, createSeededRng } from "./rng";
export { createDefaultMetaProgress, getSkillEffectTotal, purchaseSkill, skillTree } from "./skills";
export type * from "./types";
export { buildWaves } from "./waves";

const BOARD_SIZE = 16;

export function createInitialRunState(meta: MetaProgress = createDefaultMetaProgress()): RunState {
  return {
    wave: 0,
    gold: 100 + getSkillEffectTotal(meta, "startGold"),
    freeSummons: 0,
    baseHealth: 20,
    maxBaseHealth: 20,
    board: Array.from({ length: BOARD_SIZE }, () => null),
    activeBuffs: [],
    status: "ready",
    defeatedEnemies: 0,
    growthShardsEarned: 0,
  };
}

export function createSummonSampler(rng: Rng): () => UnitDefinition {
  return () => {
    const rarity = pickRarity(rng);
    return rng.pick(getUnitsByRarity(rarity));
  };
}

export function pickRarity(rng: Rng): RarityId {
  const roll = rng.next();
  let cumulative = 0;

  for (const rarity of RARITIES) {
    cumulative += rarity.summonChance;
    if (roll <= cumulative) {
      return rarity.id;
    }
  }

  return RARITIES[RARITIES.length - 1]!.id;
}

export function createMergeCandidates(sourceUnitId: string, rng: Rng): UnitDefinition[] {
  const source = getUnitDefinition(sourceUnitId);
  const sourceIndex = getRarityIndex(source.rarity);
  const higherRarities = RARITIES.slice(sourceIndex + 1).map((rarity) => rarity.id);

  if (higherRarities.length === 0) {
    throw new Error("Immortal units cannot be merged into a higher rarity.");
  }

  const candidates: UnitDefinition[] = [];
  const usedIds = new Set<string>();

  while (candidates.length < 3) {
    const rarity = rng.pick(higherRarities);
    const candidate = rng.pick(getUnitsByRarity(rarity));
    if (!usedIds.has(candidate.id)) {
      candidates.push(candidate);
      usedIds.add(candidate.id);
    }
  }

  return candidates;
}

export function resolveJackpotReward(state: RunState, reward: JackpotReward): RunState {
  if (reward.type === "gold") {
    return { ...state, gold: state.gold + reward.amount };
  }
  if (reward.type === "freeSummon") {
    return { ...state, freeSummons: state.freeSummons + reward.amount };
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
    return { type: "gold", amount: 35 };
  }
  if (roll < 0.75) {
    return { type: "freeSummon", amount: 1 };
  }
  return rng.next() < 0.5
    ? { type: "buff", stat: "attack", multiplier: 1.35, durationMs: 10_000 }
    : { type: "buff", stat: "attackSpeed", multiplier: 1.3, durationMs: 10_000 };
}

export function createRuntimeSeed(): Rng {
  return createSeededRng(Date.now() % 1_000_000);
}
