import type { RarityId, TowerType, UnitInstance } from './types';
import { getTowerType, getUnitDefinition } from './units';
import { TOWER_TYPES, TOWER_LABELS } from './superUnits';

export type SynergyStat = 'attack' | 'haste' | 'criticalChance' | 'range' | 'splashRadius' | 'goldBonus' | 'criticalDamage' | 'armorPierce' | 'skillPower';

const BANDS: { label: string; rarities: RarityId[] }[] = [
  { label: '일반·고급', rarities: ['common', 'advanced'] },
  { label: '희귀·에픽', rarities: ['rare', 'epic'] },
  { label: '영웅·전설', rarities: ['hero', 'legendary'] },
  { label: '신화', rarities: ['mythic'] },
  { label: '초월', rarities: ['transcendent'] },
  { label: '불멸·유니크', rarities: ['immortal', 'unique'] },
];

const EFFECTS: Record<TowerType, [SynergyStat, number][]> = {
  archer: [['criticalChance', 2], ['attack', 3], ['range', 4], ['haste', 4], ['criticalDamage', 6], ['attack', 6]],
  warrior: [['attack', 3], ['haste', 3], ['criticalChance', 2], ['armorPierce', 4], ['attack', 6], ['criticalDamage', 8]],
  mage: [['splashRadius', 5], ['attack', 3], ['skillPower', 4], ['splashRadius', 8], ['criticalChance', 3], ['skillPower', 8]],
  priest: [['goldBonus', 3], ['range', 3], ['haste', 3], ['goldBonus', 5], ['attack', 5], ['goldBonus', 7]],
};

const STAT_LABELS: Record<SynergyStat, string> = {
  attack: '공격력', haste: '공격속도', criticalChance: '치명타 확률', range: '사거리',
  splashRadius: '광역 공격반경', goldBonus: '처치 골드', criticalDamage: '치명타 피해',
  armorPierce: '방어력 관통', skillPower: '스킬 피해',
};

export const SYNERGIES = TOWER_TYPES.flatMap(type => BANDS.map((band, index) => {
  const [stat, amount] = EFFECTS[type][index]!;
  return { id: `${type}-${index}`, type, band: band.label, rarities: band.rarities, stat, amount,
    label: `${TOWER_LABELS[type]} · ${band.label}`, description: `${STAT_LABELS[stat]} +${amount}%` };
}));

/** Three guardians of one class in the same grade band unlock a team-wide bonus. */
export function getActiveSynergies(board: readonly UnitInstance[]) {
  const counts = new Map<string, number>();
  for (const unit of board) {
    const definition = getUnitDefinition(unit.definitionId);
    const band = BANDS.findIndex(entry => entry.rarities.includes(definition.rarity));
    const key = `${getTowerType(definition)}-${band}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return SYNERGIES.filter(entry => (counts.get(entry.id) ?? 0) >= 3);
}
