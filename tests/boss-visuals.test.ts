import { expect, test } from 'vitest';
import { BOSS_FRAMES, getBossVisual } from '../src/game/bossVisuals';
import { getBossEncounter } from '../src/game/waves';

test('every encounter uses its named sprite and preserves the four visual ranks', () => {
    for (let wave = 5; wave <= 120; wave += 5) {
        const stage = getBossEncounter(wave)!;
        const visual = getBossVisual({ isBoss: true, wave, trueBossId: stage.trueBossId, variantTint: 0xffffff });
        expect(BOSS_FRAMES).toContain(visual.frame);
        expect(visual.frame).toBe(stage.trueBossId ?? stage.bossId ?? 'chieftain');
        expect(visual.rank).toBe(stage.isFinalBoss ? 4 : stage.isTrueBoss ? 3 : stage.bossId ? 2 : 1);
    }
});

test('named and awakened versions share identity but have distinct scale', () => {
    const named = getBossVisual({ isBoss: true, wave: 10, variantTint: 0xffffff });
    const awakened = getBossVisual({ isBoss: true, wave: 20, trueBossId: 'orc-emperor', variantTint: 0xffffff });
    expect(named.frame).toBe(awakened.frame);
    expect(awakened.size).toBeGreaterThan(named.size);
});
