import type { EnemyState } from './types';
import { getBossEncounter } from './waves';

export const BOSS_FRAMES = ['chieftain', 'orc-emperor', 'ogre-king', 'ancient-dragon', 'undead-demon-king', 'eclipse-sovereign'] as const;
export function getBossVisual(enemy: Pick<EnemyState, 'isBoss' | 'wave' | 'trueBossId' | 'variantTint'>) {
    const encounter = enemy.isBoss ? getBossEncounter(enemy.wave) : null;
    const id = enemy.trueBossId ?? encounter?.bossId;
    const rank = id === 'eclipse-sovereign' ? 4 : enemy.trueBossId ? 3 : id ? 2 : 1;
    return {
        frame: id ?? 'chieftain', rank,
        size: rank === 4 ? 136 : rank === 3 ? 116 : rank === 2 ? 98 : 76,
        color: id === 'eclipse-sovereign' ? 0xe3dcff : id === 'ancient-dragon' ? 0xff683c : id === 'undead-demon-king' ? 0xb782ff : id === 'orc-emperor' ? 0x81edb1 : id === 'ogre-king' ? 0xffc66b : enemy.variantTint,
        floating: id === 'eclipse-sovereign' || id === 'undead-demon-king' || id === 'ancient-dragon',
    };
}
