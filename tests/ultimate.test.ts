import { expect, test } from 'vitest';
import { GameSimulation } from '../src/game/simulation';
import { createDefaultMetaProgress, createSeededRng } from '../src/game/systems';
import { getUnitDefinition, getUnitsByRarity } from '../src/game/units';
import type { EnemyState, UnitInstance } from '../src/game/types';
import { superForgeMarkup } from '../src/superUi';
import { ULTIMATE_COST } from '../src/game/ultimate';

const game = () => new GameSimulation(createDefaultMetaProgress(), createSeededRng(8));
const ingredients = (): UnitInstance[] => ['archer','warrior','mage','priest'].map((type, i) => ({instanceId:`s${i}`,definitionId:`super-${type}`,x:150+i*30,y:148,cooldownMs:0,attackUpgradePercent:10,speedUpgradePercent:5,upgradeCount:2,upgradeGoldSpent:65,items:[{kind:'weapon',level:i+1,bonus:100*(i+1)}]}));
const enemy = (id:string, boss=false): EnemyState => ({id,wave:1,variantId:'grunt',variantLabel:'test',variantTint:0,variantTier:0,hp:1e9,maxHp:1e9,armor:1e9,effects:[],progress:.8,speed:0,rewardGold:1,isBoss:boss});

test('ultimate consumes exactly four distinct supers and its whole fee, inheriting upgrades and equipment', () => {
  const sim=game(); sim.state.board=ingredients(); sim.state.gold=ULTIMATE_COST;
  expect(sim.craftUltimate()).toBe(true);
  expect(sim.state.gold).toBe(0); expect(sim.state.board).toHaveLength(1);
  expect(sim.state.board[0]).toMatchObject({definitionId:'ultimate-mugeuk',attackUpgradePercent:40,speedUpgradePercent:20,upgradeCount:8,upgradeGoldSpent:260,items:[{kind:'weapon',level:4,bonus:1000}]});
  expect(sim.meta.uniqueUnitLevels['ultimate-mugeuk']).toBe(1);
  sim.state.gold=ULTIMATE_COST; sim.state.board.push(...ingredients());
  const before=JSON.stringify(sim.state); expect(sim.craftUltimate()).toBe(false); expect(JSON.stringify(sim.state)).toBe(before);
});

test.each(['gold','missing','duplicate','reward','ended'])('invalid %s recipe never consumes resources', condition => {
  const sim=game(); sim.state.board=ingredients(); sim.state.gold=ULTIMATE_COST;
  if(condition==='gold')sim.state.gold=ULTIMATE_COST-1;
  if(condition==='missing')sim.state.board.pop();
  if(condition==='duplicate')sim.state.board[3]!.definitionId='super-archer';
  if(condition==='reward')sim.pendingReward=true;
  if(condition==='ended')sim.state.status='won';
  const before=JSON.stringify(sim.state); expect(sim.craftUltimate()).toBe(false); expect(JSON.stringify(sim.state)).toBe(before);
});

test('ultimate is excluded from ordinary summon pools', () => {
  expect(getUnitDefinition('ultimate-mugeuk').ultimate).toBe(true);
  expect(getUnitsByRarity('immortal').some(u=>u.ultimate)).toBe(false);
});

test('forge shows missing materials, exact price, skill details and owned lock', () => {
  const sim=game();
  expect(superForgeMarkup(sim)).toContain('data-craft-ultimate disabled');
  sim.state.board=ingredients();sim.state.gold=ULTIMATE_COST;
  expect(superForgeMarkup(sim)).toContain(`무극신 강림 · ${ULTIMATE_COST.toLocaleString()}G`);
  expect(superForgeMarkup(sim)).toContain('무극·천지개벽');
  sim.craftUltimate(); expect(superForgeMarkup(sim)).toContain('무극신 보유 중');
  expect(sim.getSuperRecipe('warrior').owned).toBe(false);
});

test('heaven split kills grant gold and unique experience exactly once', () => {
  const sim=game();sim.state.board=[{instanceId:'u',definitionId:'ultimate-mugeuk',x:150,y:148,cooldownMs:1e9}];
  sim.startNextWave();sim.update(1);sim.enemies.splice(0);sim.drainEvents();
  const target=enemy('reward');target.hp=1;sim.enemies.push(target);sim.state.board[0]!.ultimateCooldownMs=0;
  const gold=sim.state.gold, kills=sim.state.defeatedEnemies;
  sim.update(1);expect(sim.state.defeatedEnemies).toBe(kills+1);expect(sim.state.gold).toBeGreaterThan(gold);
  expect(sim.drainEvents()).toContainEqual(expect.objectContaining({type:'unitExperience',definitionId:'ultimate-mugeuk'}));
  sim.update(1);expect(sim.state.defeatedEnemies).toBe(kills+1);
});

test('ultimate berserk and global aura apply only in combat, without stacking weaker priest aura', () => {
  const sim=game(); sim.state.board=[{instanceId:'u',definitionId:'ultimate-mugeuk',x:150,y:148,cooldownMs:1e9},{instanceId:'n',definitionId:'common-single',x:150,y:148,cooldownMs:1e9}];
  const own=sim.getTowerCombatStats(0)!, ally=sim.getTowerCombatStats(1)!;
  sim.startNextWave();
  expect(sim.getTowerCombatStats(0)!.attack).toBeCloseTo(own.attack*2.5);
  expect(sim.getTowerCombatStats(1)!.attack).toBeCloseTo(ally.attack*1.25);
  expect(sim.getTowerCombatStats(1)!.attackSpeed).toBeCloseTo(ally.attackSpeed/1.25);
  sim.state.board.push({instanceId:'p',definitionId:'super-priest',x:150,y:148,cooldownMs:1e9});
  expect(sim.getTowerCombatStats(1)!.attack).toBeCloseTo(ally.attack*1.25);
  sim.update(6000); expect(sim.isSuperBerserk(sim.state.board[0]!)).toBe(false);
  sim.update(4000); expect(sim.isSuperBerserk(sim.state.board[0]!)).toBe(true);
});

test('heaven split hits distant armored enemies, doubles boss damage, and respects cooldown and pause', () => {
  const sim=game(); sim.state.board=[{instanceId:'u',definitionId:'ultimate-mugeuk',x:150,y:148,cooldownMs:1e9}];
  sim.startNextWave(); sim.update(1); sim.enemies.splice(0); sim.drainEvents();
  sim.state.board[0]!.ultimateCooldownMs=0;
  const normal=enemy('n'), boss=enemy('b',true); sim.enemies.push(normal,boss);
  const damage=Math.round(sim.getTowerCombatStats(0)!.attack*6);
  sim.update(1);
  expect(normal.maxHp-normal.hp).toBe(damage); expect(boss.maxHp-boss.hp).toBe(damage*2);
  expect(sim.drainEvents()).toContainEqual(expect.objectContaining({type:'superSkill',skill:'heaven-split'}));
  sim.update(100); expect(sim.drainEvents().some(e=>e.type==='superSkill'&&e.skill==='heaven-split')).toBe(false);
  const cooldown=sim.state.board[0]!.ultimateCooldownMs;
  sim.pendingReward=true; sim.update(12000); expect(sim.state.board[0]!.ultimateCooldownMs).toBe(cooldown);
  sim.pendingReward=false; sim.update(12000);
  expect(sim.drainEvents()).toContainEqual(expect.objectContaining({type:'superSkill',skill:'heaven-split'}));
});
