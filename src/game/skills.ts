import type { MetaProgress, SkillNode } from "./types";

export const skillTree: SkillNode[] = [
  {
    id: "attack-1",
    branch: "attack",
    tier: 1,
    label: "말랑 파워",
    description: "모든 유닛 공격력 +8%",
    cost: 1,
    effect: { stat: "attackBonus", value: 0.08 },
  },
  {
    id: "attack-2",
    branch: "attack",
    tier: 2,
    label: "통통 파워",
    description: "모든 유닛 공격력 추가 +10%",
    cost: 2,
    prerequisite: "attack-1",
    effect: { stat: "attackBonus", value: 0.1 },
  },
  {
    id: "attack-3",
    branch: "attack",
    tier: 3,
    label: "반짝 일격",
    description: "모든 유닛 공격력 추가 +14%",
    cost: 3,
    prerequisite: "attack-2",
    effect: { stat: "attackBonus", value: 0.14 },
  },
  {
    id: "economy-1",
    branch: "economy",
    tier: 1,
    label: "돼지 저금통",
    description: "시작 골드 +20",
    cost: 1,
    effect: { stat: "startGold", value: 20 },
  },
  {
    id: "economy-2",
    branch: "economy",
    tier: 2,
    label: "보상 간식",
    description: "처치 골드 +15%",
    cost: 2,
    prerequisite: "economy-1",
    effect: { stat: "goldBonus", value: 0.15 },
  },
  {
    id: "economy-3",
    branch: "economy",
    tier: 3,
    label: "소환 할인권",
    description: "소환 비용 -10%",
    cost: 3,
    prerequisite: "economy-2",
    effect: { stat: "summonDiscount", value: 0.1 },
  },
  {
    id: "luck-1",
    branch: "luck",
    tier: 1,
    label: "행운 부적",
    description: "잭팟 확률 +1%",
    cost: 1,
    effect: { stat: "jackpotChance", value: 0.01 },
  },
  {
    id: "luck-2",
    branch: "luck",
    tier: 2,
    label: "반짝 번호표",
    description: "잭팟 확률 추가 +1.5%",
    cost: 2,
    prerequisite: "luck-1",
    effect: { stat: "jackpotChance", value: 0.015 },
  },
  {
    id: "luck-3",
    branch: "luck",
    tier: 3,
    label: "대박 기운",
    description: "잭팟 확률 추가 +2%",
    cost: 3,
    prerequisite: "luck-2",
    effect: { stat: "jackpotChance", value: 0.02 },
  },
];

export function createDefaultMetaProgress(): MetaProgress {
  return {
    growthShards: 0,
    unlockedSkills: [],
    highestWave: 0,
    wins: 0,
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
    return node?.effect.stat === stat ? total + node.effect.value : total;
  }, 0);
}
