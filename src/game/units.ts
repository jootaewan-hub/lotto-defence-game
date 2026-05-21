import { RARITIES } from "./rarities";
import type { RarityId, UnitDefinition, UnitRole } from "./types";

const roleBlueprints: Record<
  UnitRole,
  { label: string; attackType: string; attack: number; attackSpeed: number; criticalChance: number; range: number; skill: string }
> = {
  single: {
    label: "핀",
    attackType: "단일 집중",
    attack: 16,
    attackSpeed: 720,
    criticalChance: 0.12,
    range: 132,
    skill: "가장 앞선 적에게 강한 단일 피해",
  },
  area: {
    label: "팡",
    attackType: "범위 폭발",
    attack: 10,
    attackSpeed: 980,
    criticalChance: 0.08,
    range: 116,
    skill: "대상 주변 적에게 광역 피해",
  },
  support: {
    label: "퐁",
    attackType: "지원 탄환",
    attack: 6,
    attackSpeed: 1180,
    criticalChance: 0.05,
    range: 148,
    skill: "주변 아군의 공격 속도 보조",
  },
};

const roleOrder: UnitRole[] = ["single", "area", "support"];

export const UNIT_DEFINITIONS: UnitDefinition[] = RARITIES.flatMap((rarity) =>
  roleOrder.map((role) => createUnit(rarity.id, role)),
);

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
