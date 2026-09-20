import type { Rarity, RarityId } from "./types";

export const RARITIES: Rarity[] = [
  { id: "common", label: "일반", summonChance: 0.45, color: "#7dd87d", powerMultiplier: 1 },
  { id: "advanced", label: "고급", summonChance: 0.25, color: "#52c7ff", powerMultiplier: 1.45 },
  { id: "rare", label: "희귀", summonChance: 0.14, color: "#a78bfa", powerMultiplier: 2.05 },
  { id: "epic", label: "에픽", summonChance: 0.08, color: "#f472b6", powerMultiplier: 2.85 },
  { id: "hero", label: "영웅", summonChance: 0.04, color: "#fb923c", powerMultiplier: 3.9 },
  { id: "legendary", label: "전설", summonChance: 0.02, color: "#facc15", powerMultiplier: 5.35 },
  { id: "mythic", label: "신화", summonChance: 0.01, color: "#38bdf8", powerMultiplier: 7.25 },
  { id: "transcendent", label: "초월", summonChance: 0.007, color: "#c084fc", powerMultiplier: 9.8 },
  { id: "immortal", label: "불멸", summonChance: 0.003, color: "#f43f5e", powerMultiplier: 13 },
  // The tier above immortal. It has no generic units and is never summoned by
  // rarity: the five unique-ability guardians are its only members.
  { id: "unique", label: "유니크", summonChance: 0, color: "#f0abfc", powerMultiplier: 17 },
];

export function getRarityIndex(rarity: RarityId): number {
  const index = RARITIES.findIndex((entry) => entry.id === rarity);
  if (index < 0) {
    throw new Error(`Unknown rarity: ${rarity}`);
  }
  return index;
}

export function getRarity(rarity: RarityId): Rarity {
  return RARITIES[getRarityIndex(rarity)]!;
}
