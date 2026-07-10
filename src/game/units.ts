import { RARITIES } from "./rarities";
import type { MetaProgress, RarityId, UnitDefinition, UnitRole } from "./types";

const roleBlueprints: Record<
  UnitRole,
  { label: string; attackType: string; attack: number; attackSpeed: number; criticalChance: number; range: number; skill: string }
> = {
  single: {
    label: "기사",
    attackType: "검기 집중",
    attack: 16,
    attackSpeed: 720,
    criticalChance: 0.12,
    range: 132,
    skill: "가장 앞선 적에게 강한 검기 피해",
  },
  area: {
    label: "마법사",
    attackType: "화염 폭발",
    attack: 10,
    attackSpeed: 980,
    criticalChance: 0.08,
    range: 116,
    skill: "대상 주변 적에게 마법 광역 피해",
  },
  support: {
    label: "사제",
    attackType: "축복 탄환",
    attack: 6,
    attackSpeed: 1180,
    criticalChance: 0.05,
    range: 148,
    skill: "주변 아군의 공격 속도 보조",
  },
};

const roleOrder: UnitRole[] = ["single", "area", "support"];
export const UNIQUE_UNIT_MAX_LEVEL = 99;

export const UNIT_DEFINITIONS: UnitDefinition[] = RARITIES.flatMap((rarity) =>
  roleOrder.map((role) => createUnit(rarity.id, role)),
).concat([
  {
    id: "mythic-ranger",
    name: "유니크 폭풍궁수",
    rarity: "mythic",
    role: "single",
    uniqueAbility: "multishot",
    attackType: "연속 사격",
    attack: 82,
    attackSpeed: 560,
    criticalChance: 0.24,
    range: 154,
    skill: "최대 5명의 적을 공격하며 5레벨마다 연사 위력 상승",
  },
  {
    id: "mythic-plague-warlock",
    name: "유니크 역병술사",
    rarity: "mythic",
    role: "area",
    uniqueAbility: "poison",
    attackType: "독성 저주",
    attack: 48,
    attackSpeed: 760,
    criticalChance: 0.16,
    range: 136,
    skill: "방어 무시 독 피해, 5레벨마다 피해와 지속시간 상승",
  },
  {
    id: "transcendent-time-mage",
    name: "유니크 시간마도사",
    rarity: "transcendent",
    role: "support",
    uniqueAbility: "slow",
    attackType: "시간 왜곡",
    attack: 54,
    attackSpeed: 840,
    criticalChance: 0.18,
    range: 160,
    skill: "5레벨마다 둔화율과 지속시간 상승",
  },
  {
    id: "transcendent-frost-witch",
    name: "유니크 서리마녀",
    rarity: "transcendent",
    role: "area",
    uniqueAbility: "freeze",
    attackType: "빙결 파편",
    attack: 64,
    attackSpeed: 1040,
    criticalChance: 0.18,
    range: 142,
    skill: "5레벨마다 빙결 확률과 지속시간 상승",
  },
  {
    id: "immortal-berserker",
    name: "유니크 광전사",
    rarity: "immortal",
    role: "single",
    uniqueAbility: "berserk",
    attackType: "광폭 참격",
    attack: 145,
    attackSpeed: 740,
    criticalChance: 0.28,
    range: 128,
    skill: "5레벨마다 광폭 피해, 공격속도, 지속시간 상승",
  },
]);

function createUnit(rarity: RarityId, role: UnitRole): UnitDefinition {
  const rarityInfo = RARITIES.find((entry) => entry.id === rarity)!;
  const roleInfo = roleBlueprints[role];
  const id = `${rarity}-${role}`;

  return {
    id,
    name: `${rarityInfo.label} ${roleInfo.label}`,
    rarity,
    role,
    attackType: roleInfo.attackType,
    attack: Math.round(roleInfo.attack * rarityInfo.powerMultiplier),
    attackSpeed: Math.max(250, Math.round(roleInfo.attackSpeed / Math.sqrt(rarityInfo.powerMultiplier))),
    criticalChance: Math.min(0.45, roleInfo.criticalChance + rarityInfo.powerMultiplier * 0.008),
    range: roleInfo.range,
    skill: `${rarityInfo.label} 등급: ${roleInfo.skill}`,
  };
}

export function getUnitDefinition(unitId: string): UnitDefinition {
  const unit = UNIT_DEFINITIONS.find((definition) => definition.id === unitId);
  if (!unit) {
    throw new Error(`Unknown unit definition: ${unitId}`);
  }
  return unit;
}

export function getUnitsByRarity(rarity: RarityId): UnitDefinition[] {
  return UNIT_DEFINITIONS.filter((unit) => unit.rarity === rarity);
}

export interface EffectiveUnitStats {
  attack: number;
  attackSpeed: number;
  range: number;
  criticalChance: number;
}

export interface UniqueUnitExperienceResult {
  meta: MetaProgress;
  level: number;
  experience: number;
  experienceToNext: number;
  levelsGained: number;
}

export function isUniqueUnit(definition: UnitDefinition): boolean {
  return Boolean(definition.uniqueAbility);
}

export function getUniqueUnitLevel(meta: MetaProgress, unitId: string): number {
  const definition = getUnitDefinition(unitId);
  if (!isUniqueUnit(definition)) {
    return 1;
  }

  return clampUniqueLevel(meta.uniqueUnitLevels[unitId] ?? 1);
}

export function getUniqueUnitExperience(meta: MetaProgress, unitId: string): number {
  const definition = getUnitDefinition(unitId);
  if (!isUniqueUnit(definition) || getUniqueUnitLevel(meta, unitId) >= UNIQUE_UNIT_MAX_LEVEL) {
    return 0;
  }

  return Math.max(0, Math.floor(meta.uniqueUnitExperience?.[unitId] ?? 0));
}

export function getUniqueUnitExperienceRequirement(level: number): number {
  const normalizedLevel = clampUniqueLevel(level);
  if (normalizedLevel >= UNIQUE_UNIT_MAX_LEVEL) {
    return 0;
  }

  const levelIndex = normalizedLevel - 1;
  return Math.round(80 + levelIndex * 20 + Math.pow(levelIndex, 1.25) * 6);
}

export function grantUniqueUnitExperience(meta: MetaProgress, unitId: string, amount: number): UniqueUnitExperienceResult {
  const definition = getUnitDefinition(unitId);
  let level = getUniqueUnitLevel(meta, unitId);
  let experience = getUniqueUnitExperience(meta, unitId) + Math.max(0, Math.floor(amount));
  let levelsGained = 0;

  if (!isUniqueUnit(definition) || level >= UNIQUE_UNIT_MAX_LEVEL) {
    return { meta, level, experience: 0, experienceToNext: 0, levelsGained };
  }

  while (level < UNIQUE_UNIT_MAX_LEVEL) {
    const requirement = getUniqueUnitExperienceRequirement(level);
    if (experience < requirement) {
      break;
    }
    experience -= requirement;
    level += 1;
    levelsGained += 1;
  }

  if (level >= UNIQUE_UNIT_MAX_LEVEL) {
    experience = 0;
  }

  const nextMeta: MetaProgress = {
    ...meta,
    uniqueUnitLevels: {
      ...meta.uniqueUnitLevels,
      [unitId]: level,
    },
    uniqueUnitExperience: {
      ...meta.uniqueUnitExperience,
      [unitId]: experience,
    },
  };

  return {
    meta: nextMeta,
    level,
    experience,
    experienceToNext: getUniqueUnitExperienceRequirement(level),
    levelsGained,
  };
}

export function registerUniqueUnitAcquisition(meta: MetaProgress, unitId: string): MetaProgress {
  const definition = getUnitDefinition(unitId);
  if (!isUniqueUnit(definition)) {
    return meta;
  }

  const previousLevel = meta.uniqueUnitLevels[unitId] ?? 0;
  const nextLevel = clampUniqueLevel(previousLevel === 0 ? 1 : previousLevel + 1);
  return {
    ...meta,
    uniqueUnitLevels: {
      ...meta.uniqueUnitLevels,
      [unitId]: nextLevel,
    },
    uniqueUnitExperience: {
      ...meta.uniqueUnitExperience,
      [unitId]: nextLevel >= UNIQUE_UNIT_MAX_LEVEL ? 0 : getUniqueUnitExperience(meta, unitId),
    },
  };
}

export function getEffectiveUnitStats(definition: UnitDefinition, level: number): EffectiveUnitStats {
  if (!isUniqueUnit(definition)) {
    return {
      attack: definition.attack,
      attackSpeed: definition.attackSpeed,
      range: definition.range,
      criticalChance: definition.criticalChance,
    };
  }

  const normalizedLevel = clampUniqueLevel(level);
  return {
    attack: Math.round(definition.attack * getUniqueAttackMultiplier(normalizedLevel)),
    attackSpeed: Math.max(180, Math.round(definition.attackSpeed / getUniqueAttackSpeedMultiplier(normalizedLevel))),
    range: definition.range + getUniqueRangeBonus(normalizedLevel),
    criticalChance: Math.min(0.75, definition.criticalChance + getUniqueCriticalChanceBonus(normalizedLevel)),
  };
}

export function getUniqueAttackMultiplier(level: number): number {
  const { levelBonus, progress } = getUniqueLevelCurve(level);
  return 1 + levelBonus * 0.008 + progress * progress * 1.75;
}

export function getUniqueAttackSpeedMultiplier(level: number): number {
  const { levelBonus, progress } = getUniqueLevelCurve(level);
  return 1 + levelBonus * 0.004 + progress * progress * 0.8;
}

export function getUniqueRangeBonus(level: number): number {
  const { progress } = getUniqueLevelCurve(level);
  return Math.round(progress * 15 + progress * progress * 35);
}

export function getUniqueCriticalChanceBonus(level: number): number {
  const { progress } = getUniqueLevelCurve(level);
  return progress * 0.05 + progress * progress * 0.2;
}

function getUniqueLevelCurve(level: number): { levelBonus: number; progress: number } {
  const normalizedLevel = clampUniqueLevel(level);
  const levelBonus = normalizedLevel - 1;
  return {
    levelBonus,
    progress: levelBonus / (UNIQUE_UNIT_MAX_LEVEL - 1),
  };
}

function clampUniqueLevel(level: number): number {
  return Math.max(1, Math.min(UNIQUE_UNIT_MAX_LEVEL, Math.floor(level)));
}
