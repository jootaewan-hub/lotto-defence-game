import { afterEach, describe, expect, test, vi } from "vitest";
import {
  LEGENDARY_UNIQUE_CHANCE,
  MAX_WAVES,
  RARITIES,
  buildWaves,
  createDefaultMetaProgress,
  createInitialRunState,
  createMergeCandidates,
  createSeededRng,
  createSummonSampler,
  getFailureGrowthShards,
  getSkillEffectTotal,
  getRarityIndex,
  pickRarity,
  purchaseSkill,
  resolveJackpotReward,
  rollKillGoldReward,
  rollSummonUniqueUnit,
  skillTracks,
  skillTree,
} from "../src/game/systems";
import { GameSimulation, getEnemyExperienceReward } from "../src/game/simulation";
import { getBossEncounter } from "../src/game/waves";
import { enterBossStageAfter } from "./bossStage";
import { TOWER_FIELD, TOWER_RADIUS } from "../src/game/geometry";
import { loadMetaProgress, saveMetaProgress } from "../src/game/storage";
import { getUniqueAbilityStats } from "../src/game/uniqueAbilities";
import {
  getEffectiveUnitStats,
  getUniqueAttackMultiplier,
  getUniqueAttackSpeedMultiplier,
  getUniqueCriticalChanceBonus,
  getUniqueRangeBonus,
  getUniqueUnitExperience,
  getUniqueUnitExperienceRequirement,
  getUniqueUnitLevel,
  grantUniqueUnitExperience,
  registerUniqueUnitAcquisition,
  UNIT_DEFINITIONS,
} from "../src/game/units";

describe("lotto defence game systems", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("a finished run can restart while preserving meta progression", () => {
    const meta = { ...createDefaultMetaProgress(), growthShards: 7, highestWave: 12 };
    const simulation = new GameSimulation(meta, createSeededRng(3));
    simulation.state = {
      ...simulation.state,
      wave: 12,
      gold: 999,
      baseHealth: 0,
      status: "lost",
      board: [createTestUnit("restart-unit", UNIT_DEFINITIONS[0]!.id, 100, 100)],
    };

    expect(simulation.restartRun()).toBe(true);
    expect(simulation.state).toMatchObject({
      wave: 0,
      gold: 100,
      baseHealth: 20,
      status: "ready",
      board: [],
    });
    expect(simulation.meta).toEqual(meta);
    expect(simulation.restartRun()).toBe(false);
  });

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

  test("merge candidates are three next-rarity choices", () => {
    const rng = createSeededRng(7);
    const source = UNIT_DEFINITIONS.find((unit) => unit.rarity === "rare" && unit.role === "single");

    expect(source).toBeDefined();

    const candidates = createMergeCandidates(source!.id, rng);

    expect(candidates).toHaveLength(3);
    for (const candidate of candidates) {
      expect(getRarityIndex(candidate.rarity)).toBe(getRarityIndex(source!.rarity) + 1);
    }
  });

  test("immortal units fuse into uniques", () => {
    const rng = createSeededRng(7);
    const source = UNIT_DEFINITIONS.find((unit) => unit.rarity === "immortal" && unit.role === "single");

    expect(source).toBeDefined();
    expect(createMergeCandidates(source!.id, rng).every(u => u.uniqueAbility)).toBe(true);
  });

  test("bulk merge automatically resolves every available three-of-a-kind group", () => {
    const simulation = new GameSimulation(createDefaultMetaProgress(), createSeededRng(7));
    const common = UNIT_DEFINITIONS.find((unit) => unit.rarity === "common" && unit.role === "single")!;
    const advanced = UNIT_DEFINITIONS.find((unit) => unit.rarity === "advanced" && unit.role === "area")!;

    simulation.state = {
      ...simulation.state,
      board: [
        createTestUnit("common-1", common.id, 104, 148),
        createTestUnit("common-2", common.id, 148, 148),
        createTestUnit("common-3", common.id, 192, 148),
        createTestUnit("advanced-1", advanced.id, 236, 148),
        createTestUnit("advanced-2", advanced.id, 280, 148),
        createTestUnit("advanced-3", advanced.id, 304, 192),
      ],
    };

    expect(simulation.bulkMergeAll()).toBe(2);
    expect(simulation.state.board).toHaveLength(2);
    expect(
      simulation.state.board
        .map((unit) => getRarityIndex(UNIT_DEFINITIONS.find((definition) => definition.id === unit.definitionId)!.rarity))
        .sort((a, b) => a - b),
    ).toEqual([getRarityIndex("advanced"), getRarityIndex("rare")]);
  });

  test("mergeable slots are exposed for field UI hints", () => {
    const simulation = new GameSimulation(createDefaultMetaProgress(), createSeededRng(7));
    const common = UNIT_DEFINITIONS.find((unit) => unit.rarity === "common" && unit.role === "single")!;
    const immortal = UNIT_DEFINITIONS.find((unit) => unit.rarity === "immortal" && unit.role === "single")!;

    simulation.state = {
      ...simulation.state,
      board: [
        createTestUnit("common-1", common.id, 104, 148),
        createTestUnit("common-2", common.id, 148, 148),
        createTestUnit("common-3", common.id, 192, 148),
        createTestUnit("immortal-1", immortal.id, 236, 148),
        createTestUnit("immortal-2", immortal.id, 280, 148),
        createTestUnit("immortal-3", immortal.id, 304, 192),
      ],
    };

    expect([...simulation.getMergeableSlots()].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(simulation.getMergeableGroups()).toEqual([[0, 1, 2], [3, 4, 5]]);
  });

  test("waves contain 120 ordinary rounds, with bosses as stages that follow every fifth", () => {
    const waves = buildWaves();

    expect(waves).toHaveLength(MAX_WAVES);
    expect(waves.some((wave) => wave.isBoss)).toBe(false);

    const bossWaves = Array.from({ length: MAX_WAVES }, (_, i) => i + 1).filter((n) => getBossEncounter(n));
    expect(bossWaves).toEqual(Array.from({ length: MAX_WAVES / 5 }, (_, index) => (index + 1) * 5));

    const trueBosses = bossWaves.map((n) => getBossEncounter(n)!).filter((b) => b.isTrueBoss);
    expect(trueBosses.map((b) => [b.number, b.trueBossId])).toEqual([
      [20, "orc-emperor"], [40, "ogre-king"], [60, "ancient-dragon"], [80, "undead-demon-king"],
      [100, "orc-emperor"], [120, "eclipse-sovereign"],
    ]);
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

  test("the expanded skill tree has twelve tracks with twenty meaningful tiers", () => {
    expect(skillTracks).toHaveLength(12);
    expect(skillTree).toHaveLength(240);
    for (const track of skillTracks) {
      const nodes = skillTree.filter((node) => node.branch === track.id);
      expect(nodes).toHaveLength(20);
      expect(nodes.map((node) => node.tier)).toEqual(Array.from({length:20}, (_,i)=>i+1));
    }

    const progressedMeta = {
      ...createDefaultMetaProgress(),
      unlockedSkills: [
        ...Array.from({ length: 7 }, (_, index) => `freeSummon-${index + 1}`),
        ...Array.from({ length: 7 }, (_, index) => `baseHealth-${index + 1}`),
      ],
    };
    const initialState = createInitialRunState(progressedMeta);
    expect(initialState.freeSummons).toBe(4);
    // the tree totals 10.5 here; the keep is a whole number, so it rounds to 31
    expect(initialState.baseHealth).toBe(31);
    expect(initialState.maxBaseHealth).toBe(31);
  });

  test("all twenty skill tiers combine into their documented maximum effects", () => {
    const meta = {
      ...createDefaultMetaProgress(),
      unlockedSkills: skillTree.map((node) => node.id),
    };

    expect(getSkillEffectTotal(meta, "attackBonus")).toBeCloseTo(0.4825);
    expect(getSkillEffectTotal(meta, "attackSpeedBonus")).toBeCloseTo(0.4325);
    expect(getSkillEffectTotal(meta, "criticalChanceBonus")).toBeCloseTo(0.11);
    expect(getSkillEffectTotal(meta, "startGold")).toBe(245);
    expect(getSkillEffectTotal(meta, "goldBonus")).toBeCloseTo(0.52);
    expect(getSkillEffectTotal(meta, "summonDiscount")).toBeCloseTo(0.175);
    expect(getSkillEffectTotal(meta, "startFreeSummons")).toBe(16.5);
    expect(getSkillEffectTotal(meta, "jackpotChance")).toBeCloseTo(0.047);
    expect(getSkillEffectTotal(meta, "uniqueSummonBonus")).toBe(0);
    expect(getSkillEffectTotal(meta, "baseHealthBonus")).toBe(49.5);
    expect(getSkillEffectTotal(meta, "uniqueExperienceBonus")).toBeCloseTo(1.22);
    expect(getSkillEffectTotal(meta, "uniqueAttackBonus")).toBeCloseTo(0.58);
    expect(getSkillEffectTotal(meta, "uniqueSkillPowerBonus")).toBeCloseTo(0.745);
  });

  test("skill purchases require prerequisites and persist unlocked nodes", () => {
    const firstAttack = skillTree.find((node) => node.id === "power-1")!;
    const secondAttack = skillTree.find((node) => node.id === "power-2")!;
    const meta = {
      growthShards: firstAttack.cost + secondAttack.cost,
      unlockedSkills: [] as string[],
      highestWave: 0,
      wins: 0,
      uniqueUnitLevels: {},
      uniqueUnitExperience: {},
    };

    expect(() => purchaseSkill(meta, secondAttack.id)).toThrow(/prerequisite/i);

    const afterFirst = purchaseSkill(meta, firstAttack.id);
    const afterSecond = purchaseSkill(afterFirst, secondAttack.id);

    expect(afterSecond.unlockedSkills).toEqual([firstAttack.id, secondAttack.id]);
    expect(afterSecond.growthShards).toBe(0);
  });

  test("summoned towers are unlimited and automatically placed on the square edges", () => {
    const simulation = new GameSimulation(createDefaultMetaProgress(), createSeededRng(11));
    simulation.state = { ...simulation.state, gold: 10_000 };

    for (let index = 0; index < 30; index += 1) {
      expect(simulation.summonToFirstEmpty()).toBe(true);
    }

    expect(simulation.state.board).toHaveLength(30);
    expect(simulation.state.board.every(isOnTowerFieldEdge)).toBe(true);
  });

  test("auto sort groups matching units on the square edge with unique units first", () => {
    const simulation = new GameSimulation(createDefaultMetaProgress(), createSeededRng(11));
    const commonKnight = UNIT_DEFINITIONS.find((unit) => unit.id === "common-single")!;
    const advancedMage = UNIT_DEFINITIONS.find((unit) => unit.id === "advanced-area")!;
    const uniqueRanger = UNIT_DEFINITIONS.find((unit) => unit.id === "mythic-ranger")!;
    const firstCommon = { ...createTestUnit("common-1", commonKnight.id, 195, 239), cooldownMs: 420 };

    simulation.state = {
      ...simulation.state,
      board: [
        firstCommon,
        createTestUnit("ranger-1", uniqueRanger.id, 180, 239),
        createTestUnit("advanced-1", advancedMage.id, 210, 239),
        createTestUnit("common-2", commonKnight.id, 225, 239),
        createTestUnit("ranger-2", uniqueRanger.id, 165, 239),
      ],
    };

    expect(simulation.sortUnitsByType()).toBe(true);
    expect(simulation.state.board.map((unit) => unit.definitionId)).toEqual([
      uniqueRanger.id,
      uniqueRanger.id,
      advancedMage.id,
      commonKnight.id,
      commonKnight.id,
    ]);
    expect(simulation.state.board.every(isOnTowerFieldEdge)).toBe(true);
    expect(simulation.state.board.find((unit) => unit.instanceId === firstCommon.instanceId)?.cooldownMs).toBe(420);
    expect(simulation.drainEvents()).toContainEqual(
      expect.objectContaining({ type: "message", text: expect.stringContaining("같은 종류") }),
    );
  });

  test("guardian summon tops out at hero", () => {
    const rng = { next: () => 0.999 };

    expect(pickRarity(rng, "normal")).toBe("hero");
  });

  test("advanced summon spans advanced through mythic only", () => {
    expect(pickRarity({ next: () => 0.0001 }, "advanced")).toBe("advanced");
    expect(pickRarity({ next: () => 0.999 }, "advanced")).toBe("mythic");
  });

  test("legendary summon spans epic through immortal", () => {
    expect(pickRarity({ next: () => 0.0001 }, "legendary")).toBe("epic");
    expect(pickRarity({ next: () => 0.999 }, "legendary")).toBe("immortal");
  });

  test("only the legendary summon can roll a unique, at the configured rate", () => {
    expect(LEGENDARY_UNIQUE_CHANCE).toBe(0.005);
    const pick = <T,>(items: readonly T[]): T => items[0]!;

    for (const value of [0, .001, .0049]) {
      const unit = rollSummonUniqueUnit({ next: () => value, pick });
      expect(unit).not.toBeNull();
      expect(unit!.uniqueAbility).toBeTruthy();
      expect(unit!.superUnique).toBeFalsy();
    }

    for (const value of [.005, .03, .5, .99]) {
      expect(rollSummonUniqueUnit({ next: () => value, pick })).toBeNull();
    }
  });

  test("advanced summon costs five times more and can roll mythic units", () => {
    const rng = {
      next: () => 0.975,
      pick<T>(items: readonly T[]): T {
        return items[0]!;
      },
    };
    const simulation = new GameSimulation(createDefaultMetaProgress(), rng);
    simulation.state = { ...simulation.state, gold: 100 };

    expect(simulation.advancedSummonCost).toBe(simulation.summonCost * 5);
    expect(simulation.legendarySummonCost).toBe(simulation.summonCost * 20);
    expect(simulation.summonAdvanced()).toBe(true);
    expect(simulation.state.gold).toBe(50);

    const summoned = UNIT_DEFINITIONS.find((unit) => unit.id === simulation.state.board[0]!.definitionId);
    expect(summoned?.rarity).toBe("mythic");
  });

  test("unique skills gain a new stage every five levels", () => {
    const abilities = ["multishot", "poison", "slow", "freeze", "berserk"] as const;
    for (const ability of abilities) {
      expect(getUniqueAbilityStats(ability, 4).stage).toBe(1);
      expect(getUniqueAbilityStats(ability, 5).stage).toBe(2);
      expect(getUniqueAbilityStats(ability, 9)).toEqual(getUniqueAbilityStats(ability, 5));
      expect(getUniqueAbilityStats(ability, 10).stage).toBe(3);
      expect(getUniqueAbilityStats(ability, 99).stage).toBe(20);
    }

    expect(getUniqueAbilityStats("multishot", 5)).toEqual(
      expect.objectContaining({ targetCount: 3, damageMultiplier: 1.015 }),
    );
    expect(getUniqueAbilityStats("multishot", 35)).toEqual(expect.objectContaining({ targetCount: 4 }));
    expect(getUniqueAbilityStats("multishot", 70)).toEqual(expect.objectContaining({ targetCount: 5 }));
    const poison = getUniqueAbilityStats("poison", 5);
    const slow = getUniqueAbilityStats("slow", 5);
    const freeze = getUniqueAbilityStats("freeze", 5);
    const berserk = getUniqueAbilityStats("berserk", 5);
    expect(poison).toEqual(expect.objectContaining({ durationMs: 3_025 }));
    expect(poison.ability === "poison" ? poison.damageRatio : 0).toBeCloseTo(0.19);
    expect(slow).toEqual(expect.objectContaining({ durationMs: 2_575 }));
    expect(slow.ability === "slow" ? slow.slowPercent : 0).toBeCloseTo(0.46);
    expect(freeze).toEqual(expect.objectContaining({ durationMs: 940 }));
    expect(freeze.ability === "freeze" ? freeze.chance : 0).toBeCloseTo(0.29);
    expect(berserk).toEqual(expect.objectContaining({ durationMs: 3_625 }));
    expect(berserk.ability === "berserk" ? berserk.damageMultiplier : 0).toBeCloseTo(1.625);
    expect(berserk.ability === "berserk" ? berserk.speedMultiplier : 0).toBeCloseTo(1.4675);
  });

  test("base-stage unique multishot units hit three enemies at once", () => {
    const simulation = new GameSimulation(createDefaultMetaProgress(), createStaticRng(1));
    const ranger = UNIT_DEFINITIONS.find((unit) => unit.id === "mythic-ranger")!;
    simulation.state = { ...simulation.state, board: [createTestUnit("ranger", ranger.id, 195, 148)] };
    simulation.enemies.push(createTestEnemy("enemy-1", 0.08), createTestEnemy("enemy-2", 0.1), createTestEnemy("enemy-3", 0.12));

    simulation.update(1);

    expect(simulation.enemies.every((enemy) => enemy.hp < enemy.maxHp)).toBe(true);
  });

  test("unique control units apply poison, slow, freeze, and berserk effects", () => {
    const poisonSimulation = new GameSimulation(createDefaultMetaProgress(), createStaticRng(1));
    const poisonUnit = UNIT_DEFINITIONS.find((unit) => unit.id === "mythic-plague-warlock")!;
    poisonSimulation.state = { ...poisonSimulation.state, board: [createTestUnit("poison", poisonUnit.id, 195, 148)] };
    poisonSimulation.enemies.push(createTestEnemy("poison-target", 0.1, 500));

    poisonSimulation.update(1);
    const poisonTarget = poisonSimulation.enemies[0]!;
    const hpAfterHit = poisonTarget.hp;
    expect(poisonTarget.effects.some((effect) => effect.kind === "poison")).toBe(true);
    poisonSimulation.update(500);
    expect(poisonTarget.hp).toBeLessThan(hpAfterHit);

    const slowSimulation = new GameSimulation(createDefaultMetaProgress(), createStaticRng(1));
    const slowUnit = UNIT_DEFINITIONS.find((unit) => unit.id === "transcendent-time-mage")!;
    slowSimulation.state = { ...slowSimulation.state, board: [createTestUnit("slow", slowUnit.id, 195, 148)] };
    slowSimulation.enemies.push(createTestEnemy("slow-target", 0.1, 500));
    slowSimulation.update(1);
    expect(slowSimulation.enemies[0]!.effects.some((effect) => effect.kind === "slow")).toBe(true);

    const freezeSimulation = new GameSimulation(createDefaultMetaProgress(), createSequenceRng([1, 0]));
    const freezeUnit = UNIT_DEFINITIONS.find((unit) => unit.id === "transcendent-frost-witch")!;
    freezeSimulation.state = { ...freezeSimulation.state, board: [createTestUnit("freeze", freezeUnit.id, 195, 148)] };
    freezeSimulation.enemies.push(createTestEnemy("freeze-target", 0.1, 500));
    freezeSimulation.update(1);
    const frozenProgress = freezeSimulation.enemies[0]!.progress;
    expect(freezeSimulation.enemies[0]!.effects.some((effect) => effect.kind === "freeze")).toBe(true);
    freezeSimulation.update(500);
    expect(freezeSimulation.enemies[0]!.progress).toBe(frozenProgress);

    const berserkSimulation = new GameSimulation(createDefaultMetaProgress(), createStaticRng(1));
    const berserker = UNIT_DEFINITIONS.find((unit) => unit.id === "immortal-berserker")!;
    berserkSimulation.state = { ...berserkSimulation.state, board: [createTestUnit("berserk", berserker.id, 195, 148)] };
    berserkSimulation.enemies.push(createTestEnemy("berserk-target", 0.1, 500));
    berserkSimulation.update(1);
    expect(berserkSimulation.state.board[0]!.berserkRemainingMs).toBeGreaterThan(0);
    const cooldownAfterHit = berserkSimulation.state.board[0]!.cooldownMs;
    berserkSimulation.update(100);
    expect(berserkSimulation.state.board[0]!.cooldownMs).toBeLessThan(cooldownAfterHit - 100);
  });

  test("unique unit levels persist from duplicate acquisitions and scale stats", () => {
    const ranger = UNIT_DEFINITIONS.find((unit) => unit.id === "mythic-ranger")!;
    const baseMeta = createDefaultMetaProgress();
    const first = registerUniqueUnitAcquisition(baseMeta, ranger.id);
    const second = registerUniqueUnitAcquisition(first, ranger.id);

    expect(getUniqueUnitLevel(first, ranger.id)).toBe(1);
    expect(getUniqueUnitLevel(second, ranger.id)).toBe(2);

    const levelOneStats = getEffectiveUnitStats(ranger, 1);
    const highLevelStats = getEffectiveUnitStats(ranger, 999);
    expect(highLevelStats.attack).toBeGreaterThan(levelOneStats.attack * 3);
    expect(highLevelStats.attackSpeed).toBeLessThan(levelOneStats.attackSpeed);
    expect(highLevelStats.range).toBeGreaterThan(levelOneStats.range);

    const earlyGain = getUniqueAttackMultiplier(20) - getUniqueAttackMultiplier(1);
    const lateGain = getUniqueAttackMultiplier(999) - getUniqueAttackMultiplier(80);
    const earlySpeedGain = getUniqueAttackSpeedMultiplier(20) - getUniqueAttackSpeedMultiplier(1);
    const lateSpeedGain = getUniqueAttackSpeedMultiplier(999) - getUniqueAttackSpeedMultiplier(80);
    const earlyRangeGain = getUniqueRangeBonus(20) - getUniqueRangeBonus(1);
    const lateRangeGain = getUniqueRangeBonus(999) - getUniqueRangeBonus(80);
    const earlyCriticalGain = getUniqueCriticalChanceBonus(20) - getUniqueCriticalChanceBonus(1);
    const lateCriticalGain = getUniqueCriticalChanceBonus(999) - getUniqueCriticalChanceBonus(80);

    expect(getUniqueAttackMultiplier(50)).toBeCloseTo(1.3962);
    expect(getUniqueAttackMultiplier(999)).toBeCloseTo(10.734);
    expect(getUniqueAttackSpeedMultiplier(50)).toBeCloseTo(1.1979);
    expect(getUniqueAttackSpeedMultiplier(999)).toBeCloseTo(5.792);
    expect(getUniqueRangeBonus(50)).toBe(1);
    expect(getUniqueRangeBonus(999)).toBe(50);
    expect(getUniqueCriticalChanceBonus(50)).toBeCloseTo(0.003);
    expect(getUniqueCriticalChanceBonus(999)).toBeCloseTo(0.25);
    expect(lateGain).toBeGreaterThan(earlyGain);
    expect(lateSpeedGain).toBeGreaterThan(earlySpeedGain);
    expect(lateRangeGain).toBeGreaterThan(earlyRangeGain);
    expect(lateCriticalGain).toBeGreaterThan(earlyCriticalGain);

    for (const uniqueUnit of UNIT_DEFINITIONS.filter((unit) => unit.uniqueAbility)) {
      const levelOne = getEffectiveUnitStats(uniqueUnit, 1);
      const levelNinetyNine = getEffectiveUnitStats(uniqueUnit, 999);
      expect(levelNinetyNine.attack).toBeGreaterThan(levelOne.attack * 3);
      expect(levelNinetyNine.attackSpeed).toBeLessThan(levelOne.attackSpeed * 0.5);
      expect(levelNinetyNine.range).toBe(levelOne.range + 50);
      expect(levelNinetyNine.criticalChance).toBeCloseTo(levelOne.criticalChance + 0.25);
    }
  });

  test("unique units gain persistent experience and level up to the level cap", () => {
    const ranger = UNIT_DEFINITIONS.find((unit) => unit.id === "mythic-ranger")!;
    const baseMeta = registerUniqueUnitAcquisition(createDefaultMetaProgress(), ranger.id);
    const requirement = getUniqueUnitExperienceRequirement(1);
    const almostReady = grantUniqueUnitExperience(baseMeta, ranger.id, requirement - 1);
    const leveled = grantUniqueUnitExperience(almostReady.meta, ranger.id, 1);

    expect(getUniqueUnitExperience(almostReady.meta, ranger.id)).toBe(requirement - 1);
    expect(leveled.level).toBe(2);
    expect(leveled.levelsGained).toBe(1);
    expect(leveled.experience).toBe(0);

    const maxedMeta = {
      ...leveled.meta,
      uniqueUnitLevels: { ...leveled.meta.uniqueUnitLevels, [ranger.id]: 999 },
    };
    const maxed = grantUniqueUnitExperience(maxedMeta, ranger.id, 10_000);
    expect(maxed.level).toBe(999);
    expect(maxed.experience).toBe(0);
  });

  test("unique towers receive experience for direct and poison kills", () => {
    const ranger = UNIT_DEFINITIONS.find((unit) => unit.id === "mythic-ranger")!;
    const directSimulation = new GameSimulation(
      registerUniqueUnitAcquisition(createDefaultMetaProgress(), ranger.id),
      createStaticRng(1),
    );
    directSimulation.state = { ...directSimulation.state, board: [createTestUnit("xp", ranger.id, 195, 148)] };
    const directTarget = createTestEnemy("xp-target", 0.1, 1);
    directSimulation.enemies.push(directTarget);

    directSimulation.update(1);

    const directExperience = getEnemyExperienceReward(directTarget);
    expect(getUniqueUnitExperience(directSimulation.meta, ranger.id)).toBe(directExperience);
    expect(directSimulation.drainEvents()).toContainEqual(
      expect.objectContaining({ type: "unitExperience", definitionId: ranger.id, amount: directExperience }),
    );

    const warlock = UNIT_DEFINITIONS.find((unit) => unit.id === "mythic-plague-warlock")!;
    const poisonSimulation = new GameSimulation(
      registerUniqueUnitAcquisition(createDefaultMetaProgress(), warlock.id),
      createStaticRng(1),
    );
    poisonSimulation.state = { ...poisonSimulation.state, board: [createTestUnit("poison-xp", warlock.id, 195, 148)] };
    const poisonTarget = createTestEnemy("poison-xp-target", 0.1, 500);
    poisonSimulation.enemies.push(poisonTarget);
    poisonSimulation.update(1);
    poisonTarget.hp = 1;
    poisonSimulation.state.board[0]!.cooldownMs = 10_000;

    poisonSimulation.update(500);

    expect(poisonSimulation.enemies).toHaveLength(0);
    expect(getUniqueUnitExperience(poisonSimulation.meta, warlock.id)).toBe(getEnemyExperienceReward(poisonTarget));
  });

  test("summon cost starts at 10G and rises by 1G every ten summons", () => {
    const simulation = new GameSimulation(createDefaultMetaProgress(), createSeededRng(11));
    simulation.state = { ...simulation.state, gold: 10_000 };

    expect(simulation.summonCost).toBe(10);

    for (let index = 0; index < 9; index += 1) {
      expect(simulation.summonToFirstEmpty()).toBe(true);
    }

    expect(simulation.summonCost).toBe(10);
    expect(simulation.summonToFirstEmpty()).toBe(true);
    expect(simulation.summonCost).toBe(11);

    for (let index = 0; index < 10; index += 1) {
      expect(simulation.summonToFirstEmpty()).toBe(true);
    }

    expect(simulation.state.board).toHaveLength(20);
    expect(simulation.summonCost).toBe(12);
  });

  test("bad summon streaks are corrected with a guaranteed rare unit", () => {
    const lowRollRng = {
      next: () => 0,
      pick<T>(items: readonly T[]): T {
        return items[0]!;
      },
    };
    const simulation = new GameSimulation(createDefaultMetaProgress(), lowRollRng);
    simulation.state = { ...simulation.state, gold: 10_000 };

    for (let index = 0; index < 8; index += 1) {
      simulation.summonToFirstEmpty();
    }

    const eighthUnit = UNIT_DEFINITIONS.find((unit) => unit.id === simulation.state.board[7]!.definitionId);
    expect(eighthUnit?.rarity).toBe("rare");
  });

  test("early summoned towers spread out enough to stay readable", () => {
    const simulation = new GameSimulation(createDefaultMetaProgress(), createSeededRng(11));
    simulation.state = { ...simulation.state, gold: 10_000 };

    for (let index = 0; index < 12; index += 1) {
      simulation.summonToFirstEmpty();
    }

    for (let outer = 0; outer < simulation.state.board.length; outer += 1) {
      for (let inner = outer + 1; inner < simulation.state.board.length; inner += 1) {
        const first = simulation.state.board[outer]!;
        const second = simulation.state.board[inner]!;
        expect(Math.hypot(first.x - second.x, first.y - second.y)).toBeGreaterThanOrEqual(28);
      }
    }
  });

  test("summoned towers can be freely repositioned", () => {
    const simulation = new GameSimulation(createDefaultMetaProgress(), createSeededRng(11));
    simulation.summonToFirstEmpty();

    expect(simulation.moveUnitTo(0, 260, 310)).toBe(true);
    expect(simulation.state.board[0]!.x).toBe(260);
    expect(simulation.state.board[0]!.y).toBe(310);
  });

  test("a failed run always awards persistent growth shards based on wave and kills", () => {
    expect(getFailureGrowthShards(1, 0)).toBe(3);
    expect(getFailureGrowthShards(10, 50)).toBe(6);
    expect(getFailureGrowthShards(10, 50, 0.3)).toBe(8);

    const simulation = new GameSimulation(createDefaultMetaProgress(), createSeededRng(19));
    simulation.state = { ...simulation.state, baseHealth: 1, maxBaseHealth: 1 };
    simulation.startNextWave();
    simulation.update(simulation.waves[0]!.durationMs);

    expect(simulation.state.status).toBe("lost");
    expect(simulation.meta.growthShards).toBe(3);
    expect(simulation.drainEvents()).toContainEqual(
      expect.objectContaining({ type: "runEnded", status: "lost", failureShardsAwarded: 3 }),
    );
  });

  test("wave timer damages base from survivors and starts the next wave after a five-second gap", () => {
    const simulation = new GameSimulation(createDefaultMetaProgress(), createSeededRng(19));
    simulation.startNextWave();
    const startHealth = simulation.state.baseHealth;
    const duration = simulation.waves[0]!.durationMs;

    simulation.update(duration + 1_000);

    expect(simulation.state.wave).toBe(1);
    expect(simulation.state.waveTimeRemainingMs).toBe(0);
    expect(simulation.state.baseHealth).toBeLessThan(startHealth);
    expect(simulation.enemies).toHaveLength(0);
    expect(simulation.canStartWave).toBe(false);

    simulation.update(4_999);
    expect(simulation.state.wave).toBe(1);

    simulation.update(1);
    expect(simulation.state.wave).toBe(2);
    expect(simulation.state.waveTimeRemainingMs).toBe(simulation.waves[1]!.durationMs);
  });

  test("monsters keep spawning in a line for the full wave duration", () => {
    const simulation = new GameSimulation(createDefaultMetaProgress(), createSeededRng(19));
    const firstWave = simulation.waves[0]!;

    simulation.startNextWave();
    simulation.update(firstWave.durationMs * 0.9);

    expect(simulation.enemies.length).toBeGreaterThan(firstWave.enemyCount);
    expect(simulation.enemies.every((enemy) => enemy.progress >= 0)).toBe(true);
  });

  test("denser monster pacing lowers each kill reward", () => {
    const simulation = new GameSimulation(createDefaultMetaProgress(), createSeededRng(19));
    const firstWave = simulation.waves[0]!;

    simulation.startNextWave();
    simulation.update(firstWave.durationMs * 0.5);

    expect(simulation.enemies.length).toBeGreaterThan(firstWave.enemyCount * 2);
    expect(simulation.enemies[0]!.rewardGold).toBe(2);
  });

  test("normal waves leave a five-second cleanup window so freshly spawned enemies do not cause unavoidable base damage", () => {
    const simulation = new GameSimulation(createDefaultMetaProgress(), createSeededRng(19));
    const firstWave = simulation.waves[0]!;

    simulation.startNextWave();
    simulation.update(firstWave.durationMs - 4_500);
    simulation.enemies.splice(0);
    const baseHealth = simulation.state.baseHealth;

    simulation.update(4_501);

    expect(simulation.state.baseHealth).toBe(baseHealth);
  });

  test("boss waves reserve twenty seconds to defeat the final spawned boss", () => {
    const simulation = new GameSimulation(createDefaultMetaProgress(), createSeededRng(19));
    enterBossStageAfter(simulation, 5);
    const bossWave = simulation.activeWaveDefinition!;
    expect(simulation.isBossStageActive).toBe(true);
    expect(simulation.state.wave).toBe(5);

    simulation.update(bossWave.durationMs - 20_000);

    expect(simulation.activeWaveCleanupWindowMs).toBe(20_000);
    expect(simulation.state.waveTimeRemainingMs).toBe(20_000);
    expect(simulation.enemies).toHaveLength(4);
    expect(simulation.enemies.every((enemy) => enemy.isBoss)).toBe(true);

    simulation.enemies.splice(0);
    const baseHealth = simulation.state.baseHealth;
    simulation.update(19_999);

    expect(simulation.enemies).toHaveLength(0);
    expect(simulation.state.waveTimeRemainingMs).toBe(1);
    expect(simulation.state.baseHealth).toBe(baseHealth);
  });

  test("true boss waves provide one hundred fifteen seconds with a forty-five-second final defeat window", () => {
    const simulation = new GameSimulation(createDefaultMetaProgress(), createSeededRng(19));
    enterBossStageAfter(simulation, 20);
    const trueBossWave = simulation.activeWaveDefinition!;

    expect(trueBossWave.isTrueBoss).toBe(true);
    expect(trueBossWave.durationMs).toBe(115_000);
    expect(simulation.activeWaveCleanupWindowMs).toBe(45_000);

    simulation.update(70_000);

    expect(simulation.state.waveTimeRemainingMs).toBe(45_000);
    expect(simulation.enemies).toHaveLength(1);
    expect(simulation.enemies[0]!.trueBossId).toBe("orc-emperor");

    simulation.update(44_999);

    expect(simulation.state.waveTimeRemainingMs).toBe(1);
    expect(simulation.enemies).toHaveLength(1);
    expect(simulation.state.status).toBe("running");
  });

  test("boss waves spawn at one eighth of the previous boss pace", () => {
    const simulation = new GameSimulation(createDefaultMetaProgress(), createSeededRng(19));

    enterBossStageAfter(simulation, 5);
    simulation.update(21_700);

    expect(simulation.state.wave).toBe(5);
    expect(simulation.enemies).toHaveLength(4);
    expect(simulation.enemies.every((enemy) => enemy.isBoss)).toBe(true);
  });

  test("enemy armor scales with waves and boss armor is at least five times normal armor", () => {
    const earlySimulation = new GameSimulation(createDefaultMetaProgress(), createSeededRng(19));
    earlySimulation.startNextWave();
    earlySimulation.update(1);

    const lateSimulation = new GameSimulation(createDefaultMetaProgress(), createSeededRng(19));
    lateSimulation.state = { ...lateSimulation.state, wave: 8 };
    lateSimulation.startNextWave();
    lateSimulation.update(1);

    const bossSimulation = new GameSimulation(createDefaultMetaProgress(), createSeededRng(19));
    enterBossStageAfter(bossSimulation, 10);
    bossSimulation.update(1);

    const earlyArmor = earlySimulation.enemies[0]!.armor;
    const lateArmor = lateSimulation.enemies[0]!.armor;
    const bossArmor = bossSimulation.enemies[0]!.armor;

    expect(lateArmor).toBeGreaterThan(earlyArmor);
    expect(bossArmor).toBeGreaterThanOrEqual(lateArmor * 5);
  });

  test("every twentieth wave spawns a named true boss variant", () => {
    const simulation = new GameSimulation(createDefaultMetaProgress(), createSeededRng(19));

    enterBossStageAfter(simulation, 20);
    simulation.update(1);

    expect(simulation.enemies[0]).toMatchObject({
      isBoss: true,
      trueBossId: "orc-emperor",
      variantLabel: "오크 황제",
    });
    expect(simulation.enemies[0]!.maxHp).toBeGreaterThan(3_000);
  });

  test("the same true boss keeps increasing in health and armor across cycles", () => {
    // Different boss species have different base stats; compare the same species.
    const stats = [40, 80, 120].map((wave) => {
      const simulation = new GameSimulation(createDefaultMetaProgress(), createSeededRng(wave));
      simulation.state = { ...simulation.state, wave: wave - 1 };
      simulation.startNextWave();
      simulation.update(1);
      const boss = simulation.enemies[0]!;
      return { hp: boss.maxHp, armor: boss.armor };
    });

    expect(stats[1]!.hp).toBeGreaterThan(stats[0]!.hp);
    expect(stats[2]!.hp).toBeGreaterThan(stats[1]!.hp);
    expect(stats[1]!.armor).toBeGreaterThan(stats[0]!.armor);
    expect(stats[2]!.armor).toBeGreaterThan(stats[1]!.armor);
  });

  test("true boss stages spawn only one enemy", () => {
    const simulation = new GameSimulation(createDefaultMetaProgress(), createSeededRng(19));

    enterBossStageAfter(simulation, 20);
    simulation.update(15_000);

    expect(simulation.enemies).toHaveLength(1);
    expect(simulation.enemies[0]!.trueBossId).toBe("orc-emperor");
  });

  test("named boss stages carry a boss identity without being true bosses", () => {
    const simulation = new GameSimulation(createDefaultMetaProgress(), createSeededRng(19));

    enterBossStageAfter(simulation, 30);
    const stage = simulation.activeWaveDefinition!;
    simulation.update(15_000);

    expect(stage.isTrueBoss).toBe(false);
    expect(stage.bossId).toBe("ogre-king");
    expect(stage.durationMs).toBe(95_000);
    expect(simulation.enemies).toHaveLength(1);
    expect(simulation.enemies[0]!.variantLabel).toBe("오우거 대왕");
  });

  test("kill gold rewards have larger tiers for higher rolls", () => {
    const lowReward = rollKillGoldReward(10, { next: () => 0.1 });
    const highReward = rollKillGoldReward(10, { next: () => 0.997 });

    expect(lowReward.tier).toBe("small");
    expect(highReward.tier).toBe("legendary");
    expect(highReward.amount).toBeGreaterThan(lowReward.amount * 3);
  });

  test("stored meta progress is sanitized and save failures are ignored", () => {
    const storage = {
      getItem: vi.fn(() =>
        JSON.stringify({
          growthShards: "many",
          highestWave: -3,
          wins: 2.8,
          unlockedSkills: ["attack-1", 404],
          uniqueUnitExperience: { "mythic-ranger": 12.8, broken: -3, invalid: "many" },
        }),
      ),
      setItem: vi.fn(() => {
        throw new Error("storage unavailable");
      }),
    };
    vi.stubGlobal("window", { localStorage: storage });

    expect(loadMetaProgress()).toEqual({
      growthShards: 0,
      unlockedSkills: ["attack-1"],
      highestWave: 0,
      wins: 2,
      uniqueUnitLevels: {},
      uniqueUnitExperience: { "mythic-ranger": 12 },
    });
    expect(() => saveMetaProgress(createDefaultMetaProgress())).not.toThrow();
  });
});

function isOnTowerFieldEdge(position: { x: number; y: number }): boolean {
  const left = TOWER_FIELD.x + TOWER_RADIUS;
  const right = TOWER_FIELD.x + TOWER_FIELD.width - TOWER_RADIUS;
  const top = TOWER_FIELD.y + TOWER_RADIUS;
  const bottom = TOWER_FIELD.y + TOWER_FIELD.height - TOWER_RADIUS;

  return position.x === left || position.x === right || position.y === top || position.y === bottom;
}

function createTestUnit(instanceId: string, definitionId: string, x: number, y: number) {
  return {
    instanceId,
    definitionId,
    cooldownMs: 0,
    x,
    y,
  };
}

function createTestEnemy(id: string, progress: number, hp = 100) {
  return {
    id,
    wave: 1,
    variantId: "grunt" as const,
    variantLabel: "하급",
    variantTint: 0xffffff,
    variantTier: 0,
    hp,
    maxHp: hp,
    armor: 0,
    effects: [],
    progress,
    speed: 0.1,
    rewardGold: 0,
    isBoss: false,
  };
}

function createStaticRng(value: number) {
  return {
    next: () => value,
    pick<T>(items: readonly T[]): T {
      return items[0]!;
    },
  };
}

function createSequenceRng(values: number[]) {
  let index = 0;
  return {
    next: () => values[index++] ?? values[values.length - 1] ?? 1,
    pick<T>(items: readonly T[]): T {
      return items[0]!;
    },
  };
}
