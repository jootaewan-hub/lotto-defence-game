import { describe, expect, test } from "vitest";
import {
  RARITIES,
  buildWaves,
  createInitialRunState,
  createMergeCandidates,
  createSeededRng,
  createSummonSampler,
  getRarityIndex,
  purchaseSkill,
  resolveJackpotReward,
  skillTree,
} from "../src/game/systems";
import { UNIT_DEFINITIONS } from "../src/game/units";

describe("lotto defence game systems", () => {
  test("summon probabilities match the 9-rarity design within tolerance", () => {
    const rng = createSeededRng(42);
    const summon = createSummonSampler(rng);
    const counts = new Map(RARITIES.map((rarity) => [rarity.id, 0]));

    for (let index = 0; index < 10_000; index += 1) {
      const unit = summon();
      counts.set(unit.rarity, (counts.get(unit.rarity) ?? 0) + 1);
    }

    for (const rarity of RARITIES) {
      const observed = (counts.get(rarity.id) ?? 0) / 10_000;
      expect(observed).toBeGreaterThan(rarity.summonChance - 0.025);
      expect(observed).toBeLessThan(rarity.summonChance + 0.025);
    }
  });

  test("merge candidates are three higher-rarity choices", () => {
    const rng = createSeededRng(7);
    const source = UNIT_DEFINITIONS.find((unit) => unit.rarity === "rare" && unit.role === "single");

    expect(source).toBeDefined();

    const candidates = createMergeCandidates(source!.id, rng);

    expect(candidates).toHaveLength(3);
    for (const candidate of candidates) {
      expect(getRarityIndex(candidate.rarity)).toBeGreaterThan(getRarityIndex(source!.rarity));
    }
  });

  test("waves contain 30 rounds and every fifth wave is a boss", () => {
    const waves = buildWaves();

    expect(waves).toHaveLength(30);
    expect(waves.filter((wave) => wave.isBoss).map((wave) => wave.number)).toEqual([5, 10, 15, 20, 25, 30]);
  });

  test("jackpot rewards apply gold, free summon, and temporary buffs", () => {
    const base = createInitialRunState();

    const withGold = resolveJackpotReward(base, { type: "gold", amount: 40 });
    expect(withGold.gold).toBe(base.gold + 40);

    const withTicket = resolveJackpotReward(base, { type: "freeSummon", amount: 1 });
    expect(withTicket.freeSummons).toBe(base.freeSummons + 1);

    const withBuff = resolveJackpotReward(base, {
      type: "buff",
      stat: "attack",
      multiplier: 1.35,
      durationMs: 10_000,
    });
    expect(withBuff.activeBuffs).toContainEqual({
      stat: "attack",
      multiplier: 1.35,
      remainingMs: 10_000,
    });
  });

  test("skill purchases require prerequisites and persist unlocked nodes", () => {
    const firstAttack = skillTree.find((node) => node.id === "attack-1")!;
    const secondAttack = skillTree.find((node) => node.id === "attack-2")!;
    const meta = {
      growthShards: firstAttack.cost + secondAttack.cost,
      unlockedSkills: [] as string[],
      highestWave: 0,
      wins: 0,
    };

    expect(() => purchaseSkill(meta, secondAttack.id)).toThrow(/prerequisite/i);

    const afterFirst = purchaseSkill(meta, firstAttack.id);
    const afterSecond = purchaseSkill(afterFirst, secondAttack.id);

    expect(afterSecond.unlockedSkills).toEqual([firstAttack.id, secondAttack.id]);
    expect(afterSecond.growthShards).toBe(0);
  });
});
