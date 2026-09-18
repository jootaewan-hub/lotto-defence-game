import type { DragonItemKind, TowerType, UnitInstance } from './types';
import { getTowerType, getUnitDefinition, isUniqueUnit } from './units';
export const MAX_TOWERS = 200;
export const MAX_ITEM_UPGRADE_LEVEL = 24;
export const SUPER_COST = 10000;
export const TOWER_TYPES: TowerType[] = ['archer', 'warrior', 'mage', 'priest'];
export const TOWER_LABELS: Record<TowerType, string> = { archer: '궁수', warrior: '전사', mage: '마법사', priest: '사제' };
export const SUPER_COLORS: Record<TowerType, number> = { archer: 0x70dcff, warrior: 0xffbf65, mage: 0xff735a, priest: 0xc4a0ff };
export const DRAGON_ITEMS: {
    kind: DragonItemKind;
    name: string;
    price: number;
    description: string;
}[] = [
    { kind: 'weapon', name: '드래곤 무기', price: 10000, description: '공격력 +200, 강화마다 +100. +7부터 매 공격에 방어 무시 마법 피해 1,000~100,000 자동 발동.' },
    { kind: 'ring', name: '드래곤 반지', price: 10000, description: '공격마다 10% 확률로 맵 전체에 마법 피해 100. 강화 성공마다 피해량 +100~1,000.' },
    { kind: 'boots', name: '드래곤 신발', price: 10000, description: '구매 즉시, 이후 매 웨이브마다 공격속도 +10~80% 추첨. 강화 성공마다 추가 속도 +10~80% 누적.' },
];
export function getItemUpgradeCost(targetLevel: number): number { return targetLevel <= 3 ? 10000 : (targetLevel - 2) * 10000; }
export function getItemUpgradeChance(targetLevel: number): number {
    if (!Number.isInteger(targetLevel) || targetLevel < 1 || targetLevel > MAX_ITEM_UPGRADE_LEVEL) return 0;
    if (targetLevel <= 4) return 1;
    if (targetLevel <= 6) return .66;
    if (targetLevel <= 8) return .5;
    if (targetLevel === 9) return .33;
    if (targetLevel <= 12) return .2;
    if (targetLevel <= 15) return .1;
    if (targetLevel <= 20) return .05;
    return .02;
}
export interface SuperRecipe {
    type: TowerType;
    unique: number[];
    legendary: number[];
    hero: number[];
    epic: number[];
    owned: boolean;
    ready: boolean;
    slots: number[];
}
export function getSuperRecipe(board: readonly UnitInstance[], type: TowerType, gold: number): SuperRecipe {
    const recipe: SuperRecipe = { type, unique: [], legendary: [], hero: [], epic: [], owned: false, ready: false, slots: [] };
    board.forEach((unit, index) => { const d = getUnitDefinition(unit.definitionId); if (d.ultimate || getTowerType(d) !== type)
        return; if (d.superUnique) {
        recipe.owned = true;
        return;
    } if (isUniqueUnit(d))
        recipe.unique.push(index);
    else if (d.rarity === 'legendary' || d.rarity === 'hero' || d.rarity === 'epic')
        recipe[d.rarity].push(index); });
    // Consume the least-invested ingredients first; preserve upgrades through fusion.
    for (const key of ['unique', 'legendary', 'hero', 'epic'] as const)
        recipe[key].sort((a, b) => (board[a]!.upgradeGoldSpent ?? 0) - (board[b]!.upgradeGoldSpent ?? 0));
    recipe.ready = !recipe.owned && gold >= SUPER_COST && recipe.unique.length >= 1 && recipe.legendary.length >= 3 && recipe.hero.length >= 3 && recipe.epic.length >= 3;
    if (recipe.ready)
        recipe.slots = [...recipe.unique.slice(0, 1), ...recipe.legendary.slice(0, 3), ...recipe.hero.slice(0, 3), ...recipe.epic.slice(0, 3)];
    return recipe;
}
