import { MAX_TOWERS } from '../src/game/superUnits';
import { REWARD_POOL } from '../src/game/upgrades';
import { describe, expect, test } from 'vitest';
import { GameSimulation } from '../src/game/simulation';
import { BASE_KEEP_HEALTH, createDefaultMetaProgress, createSeededRng } from '../src/game/systems';
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
    test('wave reward stops time until one irreversible choice is made', () => {
        const sim = game();
        sim.state.wave = 9;
        sim.state.baseHealth = 100; sim.state.maxBaseHealth = 100;
        sim.startNextWave();
        sim.update(sim.waves[9]!.durationMs);
        expect(sim.pendingReward).toBe(true);
        sim.update(100000);
        expect(sim.state.wave).toBe(10);
        const reward = sim.rewardChoices[0]!;
        const roll = sim.rollReward(reward.id)!;
        expect(sim.resolveUpgradeRoll()).toBe(true);
        expect(sim.getUpgradeValue(reward.stat)).toBe(roll.value);
        expect(sim.rollReward(reward.id)).toBeNull();
        sim.update(5000);
        // the boss owed by wave 10 runs next, without taking a wave number
        expect(sim.state.wave).toBe(10);
        expect(sim.isBossStageActive).toBe(true);
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
        for (let i = 0; i < MAX_TOWERS; i++)
            expect(sim.summonToFirstEmpty()).toBe(true);
        const gold = sim.state.gold;
        expect(sim.summonAdvanced()).toBe(false);
        expect(sim.state.gold).toBe(gold);
        expect(sim.state.board).toHaveLength(MAX_TOWERS);
    });
    test('max-health rewards raise both health values and cannot be taken twice', () => {
        const sim = game();
        sim.pendingReward = true;
        sim.state.baseHealth = BASE_KEEP_HEALTH - 1;
        sim.rewardChoices = [REWARD_POOL.find(r => r.id === 'maxHealth')!];
        const roll = sim.rollReward('maxHealth')!;
        expect(sim.resolveUpgradeRoll()).toBe(true);
        expect(sim.state.baseHealth).toBe(BASE_KEEP_HEALTH - 1 + roll.value);
        expect(sim.state.maxBaseHealth).toBe(BASE_KEEP_HEALTH + roll.value);
        expect(sim.rollReward('maxHealth')).toBeNull();
        expect(sim.expeditionAttackBonus).toBe(0);
    });
});
