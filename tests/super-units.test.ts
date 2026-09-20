import { describe, expect, test } from 'vitest';
import { GameSimulation } from '../src/game/simulation';
import { createDefaultMetaProgress, createSeededRng, MAX_WAVES } from '../src/game/systems';
import { MAX_TOWERS, SUPER_COST, SUPER_INGREDIENT_COUNT, getItemUpgradeCost, getItemUpgradeChance } from '../src/game/superUnits';
import { ULTIMATE_COST } from '../src/game/ultimate';
import { getUnitDefinition, getUnitsByRarity } from '../src/game/units';
import type { EnemyState, TowerType, UnitInstance } from '../src/game/types';
const game = () => new GameSimulation(createDefaultMetaProgress(), createSeededRng(7));
const baseUnique: Record<TowerType, string> = { archer: 'mythic-ranger', warrior: 'immortal-berserker', mage: 'mythic-plague-warlock', priest: 'transcendent-time-mage' };
function ingredients(type: TowerType): UnitInstance[] { const role = type === 'archer' ? 'archer' : type === 'warrior' ? 'single' : type === 'mage' ? 'area' : 'support'; return [baseUnique[type], ...['legendary', 'mythic', 'transcendent', 'immortal'].flatMap(r => Array(SUPER_INGREDIENT_COUNT).fill(`${r}-${role}`))].map((definitionId, i) => ({ instanceId: `u${i}`, definitionId, x: 120 + i * 8, y: 148, cooldownMs: 0, attackUpgradePercent: 2, speedUpgradePercent: 1, upgradeCount: 1 })); }
function enemy(id: string, progress: number, isBoss = false): EnemyState { return { id, wave: 1, variantId: 'grunt', variantLabel: 'test', variantTint: 0xffffff, variantTier: 0, hp: 1e9, maxHp: 1e9, armor: 0, effects: [], progress, speed: 0, rewardGold: 0, isBoss }; }
describe('super-unique towers and dragon equipment', () => {
    test('rare units cannot replace immortal ingredients and are preserved on crafting', () => {
        const sim = game();
        const recipe = ingredients('warrior');
        const rares = recipe.slice(-SUPER_INGREDIENT_COUNT).map((unit, i) => ({ ...unit, instanceId: `rare-${i}`, definitionId: 'rare-single' }));
        sim.state.gold = SUPER_COST;
        sim.state.board = [...recipe.slice(0, -SUPER_INGREDIENT_COUNT), ...rares];
        const before = JSON.stringify(sim.state);
        expect(sim.craftSuper('warrior')).toBe(false);
        expect(JSON.stringify(sim.state)).toBe(before);
        sim.state.board.push(...recipe.slice(-SUPER_INGREDIENT_COUNT));
        expect(sim.craftSuper('warrior')).toBe(true);
        expect(sim.state.board.filter(unit => unit.definitionId === 'rare-single')).toEqual(rares);
        expect(sim.state.board.some(unit => unit.definitionId === 'immortal-single')).toBe(false);
        expect(sim.state.board).toHaveLength(1 + SUPER_INGREDIENT_COUNT);
    });
    test('blessings only appear after tenth waves, excluding the final victory', () => { for (const wave of [1, 2, 3, 4, 5, 6, 10, 120]) {
        const sim = game();
        sim.state.wave = wave - 1;
        sim.state.baseHealth = sim.state.maxBaseHealth = 1e6;
        sim.startNextWave();
        sim.update(sim.waves[wave - 1]!.durationMs);
        expect(sim.pendingReward).toBe(wave % 10 === 0);
        if (wave === 120)
            expect(sim.state.status).toBe('running');
    } });
    test('speed roulette increases firing speed, consumes gold once and survives merge', () => { const sim = game(); sim.state.board = Array.from({ length: 3 }, (_, i) => ({ instanceId: `u${i}`, definitionId: 'legendary-single', x: 120 + i * 8, y: 148, cooldownMs: 0, attackUpgradePercent: 2, speedUpgradePercent: 1, upgradeCount: 1 })); sim.state.gold = 1000; const before = sim.getTowerCombatStats(0)!.attackSpeed; const roll = sim.rollTowerUpgrade(0, 'haste')!; expect(roll.stat).toBe('haste'); sim.resolveUpgradeRoll(); expect(sim.getTowerCombatStats(0)!.attackSpeed).toBeLessThan(before); const total = sim.state.board.reduce((n, u) => n + (u.speedUpgradePercent ?? 0), 0); const prompt = sim.requestMerge(0)!; sim.chooseMergeCandidate(prompt.candidates[0]!.id); expect(sim.state.board[0]!.speedUpgradePercent).toBe(total); });
    test('failed item enhancement consumes its fee without downgrading, and +24 cannot be enhanced', () => { const sim = new GameSimulation(createDefaultMetaProgress(), { next: () => .99, pick: items => items[0]! }); sim.state.board = [{ instanceId: 's', definitionId: 'super-warrior', x: 120, y: 148, cooldownMs: 0, items: [{ kind: 'weapon', level: 4, bonus: 300 }] }]; sim.state.gold = 30000; expect(sim.upgradeDragonItem(0, 'weapon')).toMatchObject({ success: false, level: 4, cost: 30000 }); expect(sim.state.gold).toBe(0); expect(sim.state.board[0]!.items![0]).toMatchObject({ level: 4, bonus: 300 }); sim.state.board[0]!.items![0]!.level = 24; sim.state.gold = 1e6; expect(sim.upgradeDragonItem(0, 'weapon')).toBeNull(); expect(sim.state.gold).toBe(1e6); });
    test('dragon ring auto-proc hits distant enemies, and super kills award experience levels', () => { const sim = new GameSimulation(createDefaultMetaProgress(), { next: () => 0, pick: items => items[0]! }); sim.state.board = [{ instanceId: 'p', definitionId: 'super-priest', x: 195, y: 148, cooldownMs: 0, items: [{ kind: 'ring', level: 1, bonus: 100 }] }]; sim.enemies.push(enemy('near', .1), enemy('far', .7)); sim.update(1); expect(sim.enemies[1]!.maxHp - sim.enemies[1]!.hp).toBe(150); expect(sim.drainEvents()).toContainEqual(expect.objectContaining({ type: 'superSkill', skill: 'dragon-ring' })); const mage = game(); mage.meta.uniqueUnitLevels['super-mage'] = 1; mage.meta.uniqueUnitExperience['super-mage'] = 79; mage.state.board = [{ instanceId: 'm', definitionId: 'super-mage', x: 195, y: 148, cooldownMs: 0 }]; const target = enemy('xp', .1); target.hp = 1; mage.enemies.push(target); mage.update(1); expect(mage.meta.uniqueUnitLevels['super-mage']).toBeGreaterThan(1); });
    test('a super-unique awakening costs half what the ultimate does', () => { expect(SUPER_COST).toBe(20000); expect(ULTIMATE_COST).toBe(SUPER_COST * 2); });
    test('campaign and formation expand to 120 waves and 200 towers', () => { expect(MAX_WAVES).toBe(120); expect(MAX_TOWERS).toBe(200); const sim = game(); sim.state.gold = 1e7; for (let i = 0; i < MAX_TOWERS; i++)
        expect(sim.summonToFirstEmpty()).toBe(true); expect(sim.summonToFirstEmpty()).toBe(false); expect(sim.state.board).toHaveLength(MAX_TOWERS); });
    test.each(['archer', 'warrior', 'mage', 'priest'] as const)('crafts exactly one %s super using the exact recipe and inherits upgrades', type => { const sim = game(); sim.state.board = ingredients(type); sim.state.gold = SUPER_COST; expect(sim.craftSuper(type)).toBe(true); expect(sim.state.gold).toBe(0); expect(sim.state.board).toHaveLength(1); const ingredientCount = 1 + 4 * SUPER_INGREDIENT_COUNT;
        expect(sim.state.board[0]).toMatchObject({ definitionId: `super-${type}`, attackUpgradePercent: ingredientCount * 2, speedUpgradePercent: ingredientCount }); expect(getUnitDefinition(sim.state.board[0]!.definitionId).superUnique).toBe(true); expect(sim.meta.uniqueUnitLevels[`super-${type}`]).toBe(1); sim.state.gold = SUPER_COST; sim.state.board.push(...ingredients(type)); expect(sim.craftSuper(type)).toBe(false); });
    test('missing or wrong-class ingredients and insufficient gold never consume anything', () => { for (const gold of [SUPER_COST - 1, SUPER_COST]) {
        const sim = game();
        sim.state.board = ingredients('archer');
        sim.state.gold = gold;
        if (gold === SUPER_COST)
            sim.state.board[4]!.definitionId = 'hero-single';
        const before = JSON.stringify(sim.state);
        expect(sim.craftSuper('archer')).toBe(false);
        expect(JSON.stringify(sim.state)).toBe(before);
    } });
    test('super units never appear in ordinary summons or merge candidates', () => { expect(getUnitsByRarity('immortal').some(u => u.superUnique)).toBe(false); expect(getUnitsByRarity('rare').some(u => u.towerType === 'archer')).toBe(true); });
    test('common berserk lasts five seconds, waits three, and adds 25% attack and speed', () => { const sim = game(); sim.state.board = [{ instanceId: 's', definitionId: 'super-warrior', cooldownMs: 1e6, x: 150, y: 148 }]; const base = sim.getTowerCombatStats(0)!; sim.startNextWave(); const active = sim.getTowerCombatStats(0)!; expect(active.attack).toBeCloseTo(base.attack * 1.25); expect(active.attackSpeed).toBeCloseTo(base.attackSpeed / 1.25); sim.update(5000); expect(sim.isSuperBerserk(sim.state.board[0]!)).toBe(false); sim.update(3000); expect(sim.isSuperBerserk(sim.state.board[0]!)).toBe(true); });
    test.each(['archer', 'warrior'] as const)('%s hits five targets and deals five times quarter-strength damage to bosses', type => { const sim = game(); sim.state.board = [{ instanceId: 's', definitionId: `super-${type}`, cooldownMs: 0, x: 195, y: 148 }]; for (let i = 0; i < 6; i++)
        sim.enemies.push(enemy(`e${i}`, 0.07 + i * 0.01, i === 5)); sim.update(1); const hits = sim.drainEvents().filter(e => e.type === 'damage'); expect(hits).toHaveLength(5); const boss = hits.find(e => e.targetId === 'e5')!; const normal = hits.find(e => e.targetId !== 'e5')!; expect(boss.amount).toBeCloseTo(normal.amount * 5); });
    test('mage strikes the whole map; priest aura affects all towers for ten seconds then waits five', () => { const mage = game(); mage.state.board = [{ instanceId: 'm', definitionId: 'super-mage', cooldownMs: 0, x: 195, y: 148 }]; mage.enemies.push(enemy('near', 0.1), enemy('far', 0.7)); mage.update(1); expect(mage.enemies.every(e => e.hp < e.maxHp)).toBe(true); const sim = game(); sim.state.board = [{ instanceId: 'p', definitionId: 'super-priest', cooldownMs: 1e6, x: 195, y: 148 }, { instanceId: 'n', definitionId: 'common-single', cooldownMs: 1e6, x: 195, y: 148 }]; const base = sim.getTowerCombatStats(1)!; sim.startNextWave(); expect(sim.getTowerCombatStats(1)!.attack).toBeCloseTo(base.attack * 1.075); sim.update(10000); expect(sim.getTowerCombatStats(1)!.attack).toBeCloseTo(base.attack); sim.update(5000); expect(sim.getTowerCombatStats(1)!.attack).toBeCloseTo(base.attack * 1.075); });
    test('only supers equip three distinct items; insufficient gold and duplicates are rejected', () => { const sim = game(); sim.state.gold = SUPER_COST + 40000; sim.state.board = ingredients('warrior'); expect(sim.buyDragonItem(0, 'weapon')).toBe(false); sim.craftSuper('warrior'); for (const kind of ['weapon', 'ring', 'boots'] as const)
        expect(sim.buyDragonItem(0, kind)).toBe(true); expect(sim.state.board[0]!.items).toHaveLength(3); expect(sim.buyDragonItem(0, 'weapon')).toBe(false); expect(sim.getTowerCombatStats(0)!.attack).toBeGreaterThan(getUnitDefinition('super-warrior').attack); });
    test('item upgrade prices and weapon probabilities follow the requested schedule', () => { expect([1, 2, 3, 4, 5, 6, 7, 8, 9].map(getItemUpgradeCost)).toEqual([10000, 10000, 10000, 20000, 30000, 40000, 50000, 60000, 70000]); expect([1, 2, 3, 4, 5, 6, 7, 8, 9].map(getItemUpgradeChance)).toEqual([1, 1, 1, 1, .66, .66, .5, .5, .33]); });
    test('weapon +7 adds automatic magic damage and shoes reroll within bounds per wave', () => { const sim = game(); sim.state.board = [{ instanceId: 's', definitionId: 'super-warrior', x: 195, y: 148, cooldownMs: 0, items: [{ kind: 'weapon', level: 7, bonus: 0 }, { kind: 'boots', level: 0, bonus: 0 }] }]; sim.startNextWave(); expect(sim.state.board[0]!.items![1]!.waveSpeedPercent).toBeGreaterThanOrEqual(5); expect(sim.state.board[0]!.items![1]!.waveSpeedPercent).toBeLessThanOrEqual(40); sim.enemies.splice(0); sim.enemies.push(enemy('magic-target', 0.1)); sim.update(1); expect(sim.drainEvents()).toContainEqual(expect.objectContaining({ type: 'superSkill', skill: 'dragon-magic' })); });
});
