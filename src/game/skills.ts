import type { MetaProgress, SkillNode } from "./types";

export interface SkillTrack {
  id: SkillNode["branch"];
  label: string;
  stat: SkillNode["effect"]["stat"];
  values: number[];
  describe(value: number): string;
}

const SKILL_LEVEL_COSTS = [1, 2, 3, 4, 5, 7, 9];

export const skillTracks: SkillTrack[] = [
  {
    id: "power",
    label: "공격력",
    stat: "attackBonus",
    values: [0.04, 0.05, 0.06, 0.07, 0.08, 0.09, 0.11],
    describe: (value) => `모든 유닛 공격력 +${Number((value * 100).toFixed(2))}%`,
  },
  {
    id: "haste",
    label: "공격속도",
    stat: "attackSpeedBonus",
    values: [0.03, 0.04, 0.05, 0.06, 0.07, 0.08, 0.1],
    describe: (value) => `모든 유닛 공격속도 +${Number((value * 100).toFixed(2))}%`,
  },
  {
    id: "critical",
    label: "치명타",
    stat: "criticalChanceBonus",
    values: [0.01, 0.012, 0.014, 0.016, 0.018, 0.02, 0.025],
    describe: (value) => `치명타 확률 +${(value * 100).toFixed(1)}%p`,
  },
  {
    id: "startGold",
    label: "시작 골드",
    stat: "startGold",
    values: [10, 15, 20, 25, 30, 40, 60],
    describe: (value) => `도전 시작 골드 +${value}`,
  },
  {
    id: "killGold",
    label: "처치 골드",
    stat: "goldBonus",
    values: [0.04, 0.05, 0.06, 0.07, 0.08, 0.1, 0.12],
    describe: (value) => `몬스터 처치 골드 +${Number((value * 100).toFixed(2))}%`,
  },
  {
    id: "summonCost",
    label: "소환 비용",
    stat: "summonDiscount",
    values: [0.02, 0.02, 0.02, 0.025, 0.025, 0.03, 0.04],
    describe: (value) => `일반·고급 소환 비용 -${(value * 100).toFixed(1)}%`,
  },
  {
    id: "freeSummon",
    label: "무료 소환",
    stat: "startFreeSummons",
    values: [1, 1, 1, 2, 2, 3, 4],
    describe: (value) => `도전 시작 무료 소환 +${value}`,
  },
  {
    id: "jackpot",
    label: "잭팟 확률",
    stat: "jackpotChance",
    values: [0.003, 0.004, 0.005, 0.006, 0.007, 0.009, 0.011],
    describe: (value) => `잭팟 확률 +${(value * 100).toFixed(1)}%p`,
  },
  {
    id: "baseHealth",
    label: "기지 HP",
    stat: "baseHealthBonus",
    values: [2, 3, 4, 5, 7, 9, 12],
    describe: (value) => `최대 기지 HP +${value}`,
  },
  {
    id: "uniqueExperience",
    label: "유니크 경험치",
    stat: "uniqueExperienceBonus",
    values: [0.05, 0.07, 0.09, 0.12, 0.15, 0.2, 0.3],
    describe: (value) => `유니크 처치 경험치 +${Number((value * 100).toFixed(2))}%`,
  },
  {
    id: "uniqueAttack",
    label: "유니크 공격력",
    stat: "uniqueAttackBonus",
    values: [0.03, 0.04, 0.05, 0.06, 0.08, 0.1, 0.14],
    describe: (value) => `유니크 기본 공격력 +${Number((value * 100).toFixed(2))}%`,
  },
  {
    id: "skillPower",
    label: "스킬 공격력",
    stat: "uniqueSkillPowerBonus",
    values: [0.04, 0.05, 0.06, 0.08, 0.1, 0.13, 0.18],
    describe: (value) => `유니크 공격 스킬 피해 +${Number((value * 100).toFixed(2))}%`,
  },
];

for (const track of skillTracks) {
  const original = [...track.values];
  track.values = Array.from({length: 20}, (_, i) => original[Math.min(i, original.length - 1)]! / 4);
}

export const skillTree: SkillNode[] = skillTracks.flatMap((track) =>
  track.values.map((value, index) => ({
    id: `${track.id}-${index + 1}`,
    branch: track.id,
    tier: index + 1,
    label: `${index + 1}단계 강화`,
    description: track.describe(value),
    cost: SKILL_LEVEL_COSTS[index] ?? 9 + (index - 6) * 2,
    prerequisite: index > 0 ? `${track.id}-${index}` : undefined,
    effect: { stat: track.stat, value },
  })),
);

const LEGACY_SKILL_EFFECTS: Record<string, SkillNode["effect"]> = {
  "attack-1": { stat: "attackBonus", value: 0.08 },
  "attack-2": { stat: "attackBonus", value: 0.1 },
  "attack-3": { stat: "attackBonus", value: 0.14 },
  "attack-4": { stat: "attackSpeedBonus", value: 0.12 },
  "attack-5": { stat: "criticalChanceBonus", value: 0.08 },
  "economy-1": { stat: "startGold", value: 20 },
  "economy-2": { stat: "goldBonus", value: 0.15 },
  "economy-3": { stat: "summonDiscount", value: 0.1 },
  "economy-4": { stat: "startFreeSummons", value: 2 },
  "economy-5": { stat: "failureShardBonus", value: 0.3 },
  "luck-1": { stat: "jackpotChance", value: 0.01 },
  "luck-2": { stat: "jackpotChance", value: 0.015 },
  "luck-3": { stat: "jackpotChance", value: 0.02 },
  "luck-4": { stat: "uniqueSummonBonus", value: 0.2 },
  "luck-5": { stat: "jackpotChance", value: 0.03 },
  "defense-1": { stat: "baseHealthBonus", value: 5 },
  "defense-2": { stat: "leakDamageReduction", value: 0.1 },
  "defense-3": { stat: "baseHealthBonus", value: 8 },
  "defense-4": { stat: "leakDamageReduction", value: 0.15 },
  "defense-5": { stat: "baseHealthBonus", value: 12 },
  "mastery-1": { stat: "uniqueExperienceBonus", value: 0.2 },
  "mastery-2": { stat: "uniqueAttackBonus", value: 0.1 },
  "mastery-3": { stat: "bossDamageBonus", value: 0.15 },
  "mastery-4": { stat: "uniqueExperienceBonus", value: 0.3 },
  "mastery-5": { stat: "uniqueAttackBonus", value: 0.2 },
};

export function createDefaultMetaProgress(): MetaProgress {
  return {
    growthShards: 0,
    unlockedSkills: [],
    highestWave: 0,
    wins: 0,
    uniqueUnitLevels: {},
    uniqueUnitExperience: {},
  };
}

/** Retired summon upgrades are refunded once; persisted IDs are removed. */
export function refundRetiredSkills(meta: MetaProgress): MetaProgress {
  const retired = [...new Set(meta.unlockedSkills)].filter(id => /^uniqueChance-[1-7]$/.test(id));
  return { ...meta,
    growthShards: meta.growthShards + retired.reduce((sum, id) => sum + SKILL_LEVEL_COSTS[Number(id.split('-')[1]) - 1]!, 0),
    unlockedSkills: meta.unlockedSkills.filter(id => !retired.includes(id)),
  };
}

export function purchaseSkill(meta: MetaProgress, skillId: string): MetaProgress {
  const node = skillTree.find((entry) => entry.id === skillId);
  if (!node) {
    throw new Error(`Unknown skill node: ${skillId}`);
  }
  if (meta.unlockedSkills.includes(skillId)) {
    return meta;
  }
  if (node.prerequisite && !meta.unlockedSkills.includes(node.prerequisite)) {
    throw new Error(`Missing prerequisite for ${skillId}.`);
  }
  if (meta.growthShards < node.cost) {
    throw new Error(`Not enough growth shards for ${skillId}.`);
  }

  return {
    ...meta,
    growthShards: meta.growthShards - node.cost,
    unlockedSkills: [...meta.unlockedSkills, skillId],
  };
}

export function getSkillEffectTotal(meta: MetaProgress, stat: SkillNode["effect"]["stat"]): number {
  return meta.unlockedSkills.reduce((total, skillId) => {
    const node = skillTree.find((entry) => entry.id === skillId);
    const effect = node?.effect ?? LEGACY_SKILL_EFFECTS[skillId];
    return effect?.stat === stat ? total + effect.value * (node ? 1 : 0.25) : total;
  }, 0);
}
