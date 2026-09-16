import { describe, expect, test } from 'vitest';
import { GameSimulation } from '../src/game/simulation';
import { createDefaultMetaProgress, createSeededRng } from '../src/game/systems';
const game = () => new GameSimulation(createDefaultMetaProgress(), createSeededRng(27));
describe('expedition tactics', () => {
    test('a mixed formation activates the combined-arms bonus', () => {
        const sim = game();
        sim.state.board = ['single', 'area', 'support'].map((role, i) => ({ instanceId: `${i}`, definitionId: `common-${role}`, cooldownMs: 0, x: 195, y: 239 }));
        expect(sim.formationBonus).toBe(0.15);
        sim.sellUnit(2);
        expect(sim.formationBonus).toBe(0);
    });
    test('frost pauses enemies and cannot be spammed or used out of combat', () => {
        const sim = game();
        expect(sim.castFrost()).toBe(false);
        sim.startNextWave();
        sim.update(16);
        expect(sim.castFrost()).toBe(true);
        const progress = sim.enemies[0]!.progress;
        sim.update(500);
        expect(sim.enemies[0]!.progress).toBe(progress);
        expect(sim.castFrost()).toBe(false);
        expect(sim.frostCooldownMs).toBeGreaterThan(0);
    });
    test('third-wave reward stops time until one irreversible choice is made', () => {
        const sim = game();
        sim.state.wave = 2;
        sim.state.baseHealth = 100;
        sim.startNextWave();
        sim.update(sim.waves[2]!.durationMs);
        expect(sim.pendingReward).toBe(true);
        sim.update(100000);
        expect(sim.state.wave).toBe(3);
        const gold = sim.state.gold;
        expect(sim.chooseReward('supply')).toBe(true);
        expect(sim.state.gold).toBe(gold + 60);
        expect(sim.chooseReward('supply')).toBe(false);
        sim.update(5000);
        expect(sim.state.wave).toBe(4);
    });
    test('ended runs cannot summon and restart clears expedition bonuses', () => {
        const sim = game();
        sim.state.status = 'lost';
        expect(sim.summonToFirstEmpty()).toBe(false);
        sim.expeditionAttackBonus = 0.3;
        sim.frostCooldownMs = 10000;
        sim.restartRun();
        expect(sim.expeditionAttackBonus).toBe(0);
        expect(sim.frostCooldownMs).toBe(0);
    });
    test('formation and expedition bonuses actually increase combat damage', () => {
        const attack = (mixed: boolean) => {
            const sim = game();
            sim.state.board = (mixed ? ['single', 'area', 'support'] : ['single']).map((role, i) => ({ instanceId: `${i}`, definitionId: `common-${role}`, cooldownMs: i === 0 ? 0 : 100000, x: 104, y: 148 }));
            sim.expeditionAttackBonus = mixed ? 0.12 : 0;
            sim.startNextWave();
            sim.update(1);
            const damage = sim.drainEvents().find(e => e.type === 'damage');
            if (!damage || damage.type !== 'damage')
                throw new Error('Expected a real attack');
            return damage.amount;
        };
        expect(attack(true)).toBeGreaterThan(attack(false));
    });
    test('a full formation rejects recruitment without spending currency', () => {
        const sim = game();
        sim.state.gold = 10000;
        for (let i = 0; i < 30; i++)
            expect(sim.summonToFirstEmpty()).toBe(true);
        const gold = sim.state.gold;
        expect(sim.summonAdvanced()).toBe(false);
        expect(sim.state.gold).toBe(gold);
        expect(sim.state.board).toHaveLength(30);
    });
    test('repair caps at maximum health and rewards cannot be taken twice', () => {
        const sim = game();
        sim.pendingReward = true;
        sim.state.baseHealth = 19;
        expect(sim.chooseReward('repair')).toBe(true);
        expect(sim.state.baseHealth).toBe(20);
        expect(sim.chooseReward('power')).toBe(false);
        expect(sim.expeditionAttackBonus).toBe(0);
    });
});
