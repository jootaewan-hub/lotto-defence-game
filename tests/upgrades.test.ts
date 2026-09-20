import { MAX_TOWERS } from '../src/game/superUnits';
import { describe, expect, test } from 'vitest';
import { REWARD_POOL, rollNormalInteger, sampleRewards } from '../src/game/upgrades';
import { createSeededRng, createDefaultMetaProgress } from '../src/game/systems';
import { GameSimulation } from '../src/game/simulation';
const game = (seed = 21) => new GameSimulation(createDefaultMetaProgress(), createSeededRng(seed));
describe('random blessings and gold forging', () => {
    test('economic and tactical blessings change real costs, income, healing and frost', () => {
        const sim = game();
        sim.summonToFirstEmpty();
        sim.state.gold = 100;
        sim.state.baseHealth = 10;
        sim.upgrades = { waveGold: 12, interest: 5, regeneration: 2, summonDiscount: 20, upgradeDiscount: 20, frostDuration: 20, frostCooldown: 25 };
        expect(sim.summonCost).toBe(8);
        expect(sim.advancedSummonCost).toBe(40);
        expect(sim.getTowerUpgradeCost(0)).toBe(20);
        sim.startNextWave();
        expect(sim.state.gold).toBe(117);
        expect(sim.state.baseHealth).toBe(12);
        sim.update(1);
        expect(sim.castFrost()).toBe(true);
        expect(sim.frostCooldownMs).toBe(18000);
        expect(sim.enemies[0]!.effects).toContainEqual(expect.objectContaining({ kind: 'freeze', remainingMs: 3600 }));
    });
    test('paid upgrades pause combat during rolling and affect actual dealt damage', () => {
        const sim = game();
        sim.state.board = [{ instanceId: 'forged', definitionId: 'common-single', cooldownMs: 0, x: 110, y: 148 }];
        sim.startNextWave();
        const timer = sim.state.waveTimeRemainingMs;
        sim.rollTowerUpgrade(0);
        sim.update(5000);
        expect(sim.state.waveTimeRemainingMs).toBe(timer);
        sim.resolveUpgradeRoll();
        sim.state.board[0]!.attackUpgradePercent = 100;
        sim.update(1);
        const hit = sim.drainEvents().find(e => e.type === 'damage');
        expect(hit?.type === 'damage' ? hit.amount : 0).toBeGreaterThanOrEqual(30);
    });
    test('range, haste and role attack bonuses feed actual tower stats and targeting', () => {
        const sim = game();
        sim.state.board = [{ instanceId: 'long-range', definitionId: 'common-single', cooldownMs: 0, x: 260, y: 148 }];
        const initial = sim.getTowerCombatStats(0)!;
        sim.startNextWave();
        sim.update(1);
        expect(sim.drainEvents().some(e => e.type === 'attack')).toBe(false);
        sim.upgrades = { range: 80, haste: 50, singleDamage: 20 };
        sim.state.board[0]!.cooldownMs = 0;
        sim.update(1);
        const enhanced = sim.getTowerCombatStats(0)!;
        expect(enhanced.range).toBeCloseTo(initial.range * 1.8);
        expect(enhanced.attack).toBeCloseTo(initial.attack * 1.2);
        expect(enhanced.attackSpeed).toBeCloseTo(initial.attackSpeed / 1.5);
        expect(sim.drainEvents().some(e => e.type === 'attack')).toBe(true);
    });
    test('bounded normal dice have symmetric, middle-heavy outcomes', () => {
        const rng = createSeededRng(81), counts = Array(21).fill(0);
        let total = 0;
        for (let i = 0; i < 50000; i++) {
            const v = rollNormalInteger(rng, 1, 20);
            expect(v).toBeGreaterThanOrEqual(1);
            expect(v).toBeLessThanOrEqual(20);
            counts[v]++;
            total += v;
        }
        expect(total / 50000).toBeGreaterThan(10.35);
        expect(total / 50000).toBeLessThan(10.65);
        expect(counts[10]).toBeGreaterThan(counts[1] * 5);
        expect(Math.abs(counts[1] - counts[20])).toBeLessThan(120);
        expect(rollNormalInteger({ next: () => 0 }, 1, 20)).toBe(1);
        expect(rollNormalInteger({ next: () => 0.9999999 }, 1, 20)).toBe(20);
    });
    test('25 distinct upgrades yield varied offers without duplicate cards or capped stats', () => {
        expect(REWARD_POOL.length).toBeGreaterThanOrEqual(20);
        expect(new Set(REWARD_POOL.map(r => r.stat)).size).toBe(REWARD_POOL.length);
        const rng = createSeededRng(9), seen = new Set();
        for (let i = 0; i < 150; i++) {
            const cards = sampleRewards(rng, {});
            expect(cards).toHaveLength(3);
            expect(new Set(cards.map(c => c.id)).size).toBe(3);
            cards.forEach(c => seen.add(c.id));
        }
        expect(seen.size).toBe(REWARD_POOL.length);
        const capped = Object.fromEntries(REWARD_POOL.filter(r => r.stat !== 'attack').map(r => [r.stat, r.cap]));
        expect(sampleRewards(rng, capped).every(r => r.stat === 'attack')).toBe(true);
    });
    test('every tenth cleared wave offers locked choices and rolling consumes no duplicate reward', () => {
        const sim = game();
        sim.state.wave=9; sim.state.baseHealth=100; sim.state.maxBaseHealth=100; sim.startNextWave();
        sim.update(sim.waves[9]!.durationMs);
        expect(sim.pendingReward).toBe(true);
        expect(sim.rewardChoices).toHaveLength(3);
        const choices = sim.rewardChoices.map(c => c.id);
        sim.update(100000);
        expect(sim.state.wave).toBe(10);
        expect(sim.rewardChoices.map(c => c.id)).toEqual(choices);
        expect(sim.rollReward('not-offered')).toBeNull();
        const roll = sim.rollReward(choices[0]!)!;
        expect(roll).not.toBeNull();
        expect(sim.rollReward(choices[1]!)).toBeNull();
        expect(sim.getUpgradeValue(roll.stat)).toBe(0);
        expect(sim.resolveUpgradeRoll()).toBe(true);
        expect(sim.getUpgradeValue(roll.stat)).toBe(roll.value);
        expect(sim.resolveUpgradeRoll()).toBe(false);
        sim.update(5000);
        // the boss owed by wave 10 runs next, without taking a wave number
        expect(sim.state.wave).toBe(10);
        expect(sim.isBossStageActive).toBe(true);
    });
    test('a full board can spend gold repeatedly to increase a selected tower attack', () => {
        const sim = game();
        sim.state.gold = 100000;
        for (let i = 0; i < MAX_TOWERS; i++)
            sim.summonToFirstEmpty();
        const before = sim.getTowerCombatStats(0)!.attack, gold = sim.state.gold, cost = sim.getTowerUpgradeCost(0);
        const roll = sim.rollTowerUpgrade(0)!;
        expect(roll.value).toBeGreaterThanOrEqual(1);
        expect(roll.value).toBeLessThanOrEqual(20);
        expect(sim.state.gold).toBe(gold - cost);
        expect(sim.rollTowerUpgrade(0)).toBeNull();
        expect(sim.sellUnit(0)).toBe(false);
        expect(sim.resolveUpgradeRoll()).toBe(true);
        expect(sim.getTowerCombatStats(0)!.attack).toBeGreaterThan(before);
        expect(sim.state.board[0]!.attackUpgradePercent).toBe(roll.value);
        expect(sim.getTowerUpgradeCost(0)).toBeGreaterThan(cost);
        expect(sim.rollTowerUpgrade(0)).not.toBeNull();
    });
    test('unaffordable and ended upgrades leave gold untouched', () => {
        const sim = game();
        sim.summonToFirstEmpty();
        sim.state.gold = 0;
        expect(sim.rollTowerUpgrade(0)).toBeNull();
        expect(sim.state.gold).toBe(0);
        sim.state.gold = 1000;
        sim.state.status = 'lost';
        expect(sim.rollTowerUpgrade(0)).toBeNull();
        expect(sim.state.gold).toBe(1000);
    });
    test('merge inherits paid attack upgrades from all three ingredients', () => {
        const sim = game();
        sim.state.board = [0, 1, 2].map(i => ({ instanceId: `u${i}`, definitionId: 'common-single', x: 120 + i * 40, y: 148, cooldownMs: 0, attackUpgradePercent: 10, upgradeCount: 1, upgradeGoldSpent: 25 }));
        const prompt = sim.requestMerge(0)!;
        expect(sim.chooseMergeCandidate(prompt.candidates[0]!.id)).toBe(true);
        expect(sim.state.board[0]).toMatchObject({ attackUpgradePercent: 30, upgradeCount: 3, upgradeGoldSpent: 75 });
    });
    test('all offered upgrades resolve within caps, and restart clears expedition progress', () => {
        for (const reward of REWARD_POOL) {
            const sim = game();
            sim.pendingReward = true;
            sim.rewardChoices = [reward];
            const roll = sim.rollReward(reward.id)!;
            expect(roll.value).toBeGreaterThanOrEqual(reward.min);
            expect(sim.resolveUpgradeRoll()).toBe(true);
            expect(sim.getUpgradeValue(reward.stat)).toBe(roll.value);
            expect(sim.getUpgradeValue(reward.stat)).toBeLessThanOrEqual(reward.cap);
            sim.state.status = 'lost';
            sim.restartRun();
            expect(sim.getUpgradeValue(reward.stat)).toBe(0);
            expect(sim.pendingRoll).toBeNull();
        }
    });
});
