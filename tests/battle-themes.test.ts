import { expect, test } from 'vitest';
import nightmare from '../public/assets/backgrounds/nightmare.svg?raw';
import hell from '../public/assets/backgrounds/hell.svg?raw';
import insane from '../public/assets/backgrounds/insane.svg?raw';
import { BATTLE_THEMES } from '../src/game/battleThemes';
import { DIFFICULTIES } from '../src/game/waves';

test('every campaign difficulty has a distinct background and matching scene title', () => {
    expect(Object.keys(BATTLE_THEMES)).toEqual(Object.keys(DIFFICULTIES));
    expect(new Set(Object.values(BATTLE_THEMES).map(t => t.texture)).size).toBe(4);
    expect(BATTLE_THEMES.normal.texture).toBe('forest');
    for (const key of ['nightmare','hell','insane'] as const) {
        const svg = { nightmare, hell, insane }[key];
        expect(svg).toContain('viewBox="0 0 780 500"');
        expect(svg).toContain('<svg');
        expect(svg).not.toContain('<script');
    }
});
