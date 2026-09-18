import { RARITIES } from "./rarities";
import type { MetaProgress, RarityId, UnitDefinition, UnitRole, TowerType } from "./types";

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
  [...roleOrder.map((role) => createUnit(rarity.id, role)), { ...createUnit(rarity.id, "single"), id: `${rarity.id}-archer`, name: `${rarity.label} 궁수`, towerType: "archer" as const, attackType: "관통 화살", range: 154, skill: "먼 거리의 선두 적에게 집중 사격" }],
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

export const SUPER_SKILLS: Record<TowerType, string> = {
  archer: '천궁 오연사: 적 5명 동시 타격, 보스 피해 5배',
  warrior: '검성검기: 적 5명 동시 타격, 보스 피해 5배',
  mage: '종말의 화염: 공격마다 맵 전체 적에게 화염 피해',
  priest: '천상의 축복: 모든 타워 공격력·공격속도 +30%, 10초 유지 후 5초 대기',
};
for (const [towerType, name, role, attack, attackSpeed, range] of [
  ['archer', '천궁 아스트라', 'single', 380, 620, 200],
  ['warrior', '검성 레오니스', 'single', 460, 720, 190],
  ['mage', '화신 이그니스', 'area', 300, 1400, 9999],
  ['priest', '성좌 세라피엘', 'support', 280, 850, 195],
] as const) {
  UNIT_DEFINITIONS.push({id: `super-${towerType}`, name, towerType, superUnique: true, rarity: 'immortal', role, attack, attackSpeed, range, criticalChance: 0.2, attackType: '슈퍼유니크 전용 공격', skill: `${SUPER_SKILLS[towerType]} / 광폭화: 5초간 공격력·공격속도 2배, 종료 후 3초 대기`});
}
const UNITS_BY_ID = new Map(UNIT_DEFINITIONS.map(unit => [unit.id, unit]));
export function getTowerType(unit: UnitDefinition): TowerType {
  return unit.towerType ?? (unit.uniqueAbility === 'multishot' ? 'archer' : unit.role === 'single' ? 'warrior' : unit.role === 'area' ? 'mage' : 'priest');
}
export function getUnitPortrait(unit: UnitDefinition): string {
  if (unit.superUnique) return `super-${getTowerType(unit)}`;
  if (unit.uniqueAbility) return ({multishot:'storm-archer',poison:'plague-warlock',slow:'time-mage',freeze:'frost-witch',berserk:'berserker'})[unit.uniqueAbility];
  const stage = RARITIES.findIndex(r => r.id === unit.rarity) + 1;
  if (stage >= 4) return `evolution-${stage >= 7 ? 'ascended' : 'elite'}-${getTowerType(unit)}`;
  return ({archer:'storm-archer',warrior:'knight',mage:'wizard',priest:'priest'})[getTowerType(unit)];
}

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
  const unit = UNITS_BY_ID.get(unitId);
  if (!unit) {
    throw new Error(`Unknown unit definition: ${unitId}`);
  }
  return unit;
}

export function getUnitsByRarity(rarity: RarityId): UnitDefinition[] {
  return UNIT_DEFINITIONS.filter((unit) => unit.rarity === rarity && !unit.superUnique);
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
  return Boolean(definition.uniqueAbility || definition.superUnique);
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
