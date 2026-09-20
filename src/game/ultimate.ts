import type { UnitInstance } from './types';

export const ULTIMATE_ID = 'ultimate-mugeuk';
/** Twice a super-unique awakening: the last step up should not be the cheap one. */
export const ULTIMATE_COST = 60000;
export const ULTIMATE_REQUIRED = ['super-archer','super-warrior','super-mage','super-priest'] as const;
export const ULTIMATE_SKILLS = [
    { name: '무극 광폭화', description: '10초 주기, 6초간 자신의 공격력·공격속도 2배.' },
    { name: '천상 지배', description: '전투 중 자신을 포함한 모든 타워의 공격력·공격속도 +25%. 사제 축복과 중복되지 않고 더 강한 효과 적용.' },
    { name: '무극·천지개벽', description: '첫 적 등장 시, 이후 12초마다 전장 전체에 현재 공격력 6배의 방어 무시 피해. 보스 피해 추가 2배.' },
] as const;

export function getUltimateRecipe(board: readonly UnitInstance[], gold: number) {
    const slots = ULTIMATE_REQUIRED.map(id => board.findIndex(u => u.definitionId === id));
    const owned = board.some(u => u.definitionId === ULTIMATE_ID);
    return { slots, owned, ready: !owned && gold >= ULTIMATE_COST && slots.every(i => i >= 0) };
}
