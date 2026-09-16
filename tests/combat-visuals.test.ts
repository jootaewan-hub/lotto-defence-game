import { describe, expect, test } from 'vitest';
import { advanceHoming, getCombatStyle } from '../src/game/combatVisuals';
import { GameSimulation } from '../src/game/simulation';
import { createDefaultMetaProgress, createSeededRng } from '../src/game/systems';
describe('targeted combat presentation', () => {
    test('simultaneous hits link damage to the correct attack and target', () => {
        const sim = new GameSimulation(createDefaultMetaProgress(), createSeededRng(11));
        sim.state.board = ['single', 'area'].map((role, i) => ({ instanceId: `shooter-${i}`, definitionId: `common-${role}`, cooldownMs: 0, x: 110, y: 148 }));
        sim.startNextWave(); sim.update(1);
        const events = sim.drainEvents();
        const attacks = events.filter(e => e.type === 'attack');
        const hits = events.filter(e => e.type === 'damage');
        expect(attacks).toHaveLength(2);
        expect(new Set(attacks.map(a => a.attackId)).size).toBe(2);
        for (const attack of attacks) {
            const matched = hits.filter(h => h.attackId === attack.attackId && h.targetId === attack.target.id);
            expect(matched).toHaveLength(1);
        }
    });
    test('projectiles converge on moving targets at every supported speed without overshooting', () => {
        for (const speed of [1, 2, 3, 5, 10]) {
            let p = { x: 0, y: 0 }, hit = false;
            for (let frame = 0; frame < 120; frame++) {
                const t = { x: 150 + frame * speed, y: 70 + Math.sin(frame / 7) * 20 };
                const step = advanceHoming(p, t, 1800 * speed * 0.016);
                p = step.position;
                if (step.hit) {
                    expect(p).toEqual(t);
                    hit = true;
                    break;
                }
            }
            expect(hit).toBe(true);
        }
    });
    test('zero elapsed time freezes flight, including at point blank range', () => {
        expect(advanceHoming({ x: 2, y: 3 }, { x: 4, y: 5 }, 0)).toEqual({ position: { x: 2, y: 3 }, hit: false });
        expect(advanceHoming({ x: 2, y: 3 }, { x: 2, y: 3 }, 5).hit).toBe(true);
    });
    test('roles and unique abilities have distinct projectile identities', () => {
        const kinds = [getCombatStyle('single', undefined, 0, 1), getCombatStyle('area', undefined, 0, 1), getCombatStyle('support', undefined, 0, 1), ...(['multishot', 'poison', 'freeze', 'slow', 'berserk'] as const).map(a => getCombatStyle('single', a, 6, 1))].map(s => s.kind);
        expect(new Set(kinds).size).toBe(8);
    });
    test('rarity and unique levels increase visual power with bounded particle counts', () => {
        const basic = getCombatStyle('area', undefined, 0, 1);
        const epic = getCombatStyle('area', undefined, 4, 1);
        const novice = getCombatStyle('area', 'freeze', 7, 1);
        const master = getCombatStyle('area', 'freeze', 7, 99);
        expect(epic.intensity).toBeGreaterThan(basic.intensity);
        expect(master.intensity).toBeGreaterThan(novice.intensity);
        expect(master.sparks).toBeLessThanOrEqual(16);
    });
    test('attack events identify their shooter, live target and unique level', () => {
        const meta = createDefaultMetaProgress();
        meta.uniqueUnitLevels['mythic-ranger'] = 35;
        const sim = new GameSimulation(meta, createSeededRng(4));
        sim.state.board = [{ instanceId: 'archer-1', definitionId: 'mythic-ranger', cooldownMs: 0, x: 120, y: 148 }];
        sim.startNextWave();
        sim.update(1);
        expect(sim.drainEvents()).toContainEqual(expect.objectContaining({ type: 'attack', sourceId: 'archer-1', unitLevel: 35, target: expect.objectContaining({ id: expect.any(String), isBoss: false }) }));
    });
});
