import { MAX_TOWERS, MAX_ITEM_UPGRADE_LEVEL, SUPER_COST, DRAGON_ITEMS, getSuperRecipe, getItemUpgradeChance, getItemUpgradeCost } from './superUnits';
import { DIFFICULTIES } from './waves';
import { ULTIMATE_ID, ULTIMATE_COST, getUltimateRecipe } from './ultimate';
import { rollNormalInteger, sampleRewards, type ExpeditionUpgrades, type RewardDefinition, type UpgradeRoll, type UpgradeStat } from './upgrades';
import { TOWER_SPAWN, clampTowerPosition } from "./geometry";
import {
  MAX_WAVES,
  buildWaves,
  getBossEncounter,
  createInitialRunState,
  createMergeCandidates,
  createRandomRng,
  getFailureGrowthShards,
  getSkillEffectTotal,
  pickRarity,
  rollSummonUniqueUnit,
  type SummonKind,
} from "./systems";
import type { Rng } from "./rng";
import type {
  TowerType,
  DragonItemKind,
  UnitInstance,
  EnemyState,
  GoldRewardTier,
  JackpotReward,
  MetaProgress,
  RarityId,
  RunState,
  UnitAbilityKind,
  UnitDefinition,
  UnitRole,
  WaveDefinition,
} from "./types";
import { getRarity, getRarityIndex } from "./rarities";
import {
  getEffectiveUnitStats,
  getUniqueUnitLevel,
  getUnitDefinition,
  getUnitsByRarity,
  isUniqueUnit,
  registerUniqueUnitAcquisition,
} from "./units";
import { getTrueBossDefinition } from "./enemyVariants";
import { getWaveCleanupWindowMs } from "./combatMath";
export { getEnemyExperienceReward } from "./combatMath";
import { compareUnitsForArrangement, createTowerEdgeCandidates } from "./towerArrangement";
import { attackEnemies, moveEnemies, spawnEnemies, tickBuffs, tickEnemyEffects } from "./combat";

export interface MergePrompt {
  sourceSlots: number[];
  candidates: UnitDefinition[];
}

export type SimulationEvent =
  | { type: "superSkill"; skill: "berserk" | "blessing" | "inferno" | "dragon-ring" | "dragon-magic" | "heaven-split"; sourceId: string; at: { x: number; y: number }; targets?: { x: number; y: number }[] }
  | { type: "message"; text: string }
  | { type: "jackpot"; reward: JackpotReward; text: string }
  | {
      type: "attack";
      attackId: string;
      superType?: TowerType;
      sourceId: string;
      unitLevel: number;
      target: { id: string; isBoss: boolean; variantTier: number };
      from: { x: number; y: number };
      to: { x: number; y: number };
      critical: boolean;
      rarityTier: number;
      color: string;
      role: UnitRole;
      ability?: UnitAbilityKind;
    }
  | { type: "damage"; attackId?: string; targetId?: string; at: { x: number; y: number }; amount: number; critical: boolean; rarityTier: number }
  | { type: "goldReward"; at: { x: number; y: number }; amount: number; tier: GoldRewardTier }
  | {
      type: "unitExperience";
      at: { x: number; y: number };
      definitionId: string;
      amount: number;
      level: number;
      experience: number;
      experienceToNext: number;
      levelsGained: number;
    }
  | { type: "waveComplete"; wave: number; growthShardsAwarded: number; bossLabel?: string }
  | {
      type: "runEnded";
      status: "won" | "lost";
      growthShardsAwarded: number;
      failureShardsAwarded: number;
    };

const BASE_SUMMON_COST = 10;
const ADVANCED_SUMMON_COST_MULTIPLIER = 5;
const LEGENDARY_SUMMON_COST_MULTIPLIER = 20;
const SUMMONS_PER_COST_INCREASE = 10;
const RARE_PITY_THRESHOLD = 7;
const EPIC_PITY_THRESHOLD = 16;
const BASE_JACKPOT_CHANCE = 0.025;
const JACKPOT_PITY_STEP = 0.002;
const JACKPOT_PITY_MAX_BONUS = 0.06;
const NEXT_WAVE_DELAY_MS = 5_000;
const RARE_RARITY_INDEX = getRarityIndex("rare");
const EPIC_RARITY_INDEX = getRarityIndex("epic");

export class GameSimulation {
  get difficulty() { return DIFFICULTIES[this.state.difficulty]; }
  readonly waves = buildWaves();
  /** The boss stage running right now. Boss stages do not consume a wave number. */
  private bossStage: WaveDefinition | null = null;
  /** The boss stage owed by the wave just completed, started by the next startNextWave(). */
  private queuedBossStage: WaveDefinition | null = null;
  readonly enemies: EnemyState[] = [];

  state: RunState;
  meta: MetaProgress;
  pendingMerge: MergePrompt | null = null;
  autoProgress = false;
  pendingReward = false;
  upgrades: ExpeditionUpgrades = {};
  rewardChoices: RewardDefinition[] = [];
  pendingRoll: UpgradeRoll | null = null;
  rewardHistory: UpgradeRoll[] = [];

  getUpgradeValue(stat: UpgradeStat): number { return this.upgrades[stat] ?? 0; }
  /** 내부 전용. combat.ts가 CombatContext로 접근하므로 private이 아니다. 소비자 API는 아니다. */
  bonus(stat: UpgradeStat): number { return this.getUpgradeValue(stat) / 100; }
  get expeditionAttackBonus(): number { return this.bonus('attack'); }
  set expeditionAttackBonus(value: number) { this.upgrades.attack = value * 100; }

  isSuperBerserk(unit: UnitInstance): boolean {
    const def = getUnitDefinition(unit.definitionId);
    return this.currentWaveActive && Boolean(def.superUnique) && (unit.superElapsedMs ?? 0) % (def.ultimate ? 10000 : 8000) < (def.ultimate ? 6000 : 5000);
  }
  /** 내부 전용. combat.ts가 CombatContext로 접근하므로 private이 아니다. 소비자 API는 아니다. */
  getSuperAura(): number {
    if (this.currentWaveActive && this.state.board.some(u => u.definitionId === ULTIMATE_ID)) return 1.25;
    return this.currentWaveActive && this.state.board.some(u => u.definitionId === 'super-priest' && (u.superElapsedMs ?? 0) % 15000 < 10000) ? 1.075 : 1;
  }
  getSuperRecipe(type: TowerType) { return getSuperRecipe(this.state.board, type, this.state.gold); }
  getUltimateRecipe() { return getUltimateRecipe(this.state.board, this.state.gold); }
  craftUltimate(): boolean {
    if (!this.canManageTowers()) return false;
    const recipe = this.getUltimateRecipe();
    if (!recipe.ready) return false;
    const consumed = recipe.slots.map(i => this.state.board[i]!);
    const anchor = consumed[0]!;
    const inherited = consumed.reduce((total, u) => ({
      attackUpgradePercent: total.attackUpgradePercent + (u.attackUpgradePercent ?? 0),
      speedUpgradePercent: total.speedUpgradePercent + (u.speedUpgradePercent ?? 0),
      upgradeCount: total.upgradeCount + (u.upgradeCount ?? 0),
      upgradeGoldSpent: total.upgradeGoldSpent + (u.upgradeGoldSpent ?? 0),
    }), { attackUpgradePercent: 0, speedUpgradePercent: 0, upgradeCount: 0, upgradeGoldSpent: 0 });
    const items: NonNullable<UnitInstance['items']> = [];
    for (const unit of consumed) for (const item of unit.items ?? []) {
      const existing = items.find(i => i.kind === item.kind);
      if (!existing) items.push({ ...item });
      else {
        existing.level = Math.max(existing.level, item.level);
        existing.bonus += item.bonus;
        if (item.kind === 'boots') existing.waveSpeedPercent = (existing.waveSpeedPercent ?? 0) + (item.waveSpeedPercent ?? 0);
      }
    }
    const unit: UnitInstance = { instanceId: `unit-${++this.unitSequence}`, definitionId: ULTIMATE_ID, x: anchor.x, y: anchor.y, cooldownMs: 0, superElapsedMs: 0, ultimateCooldownMs: 0, items, ...inherited };
    const slots = new Set(recipe.slots);
    this.state = { ...this.state, gold: this.state.gold - ULTIMATE_COST, board: [...this.state.board.filter((_, i) => !slots.has(i)), unit] };
    this.meta = registerUniqueUnitAcquisition(this.meta, ULTIMATE_ID);
    this.events.push({ type: 'message', text: '궁극 각성 · 무극신 강림! 네 수호자의 강화와 장비 보너스를 계승했습니다.' });
    this.events.push({ type: 'superSkill', skill: 'heaven-split', sourceId: unit.instanceId, at: { x: unit.x, y: unit.y } });
    return true;
  }
  private canManageTowers(): boolean { return !this.pendingMerge && !this.pendingRoll && !this.pendingReward && this.state.status !== 'won' && this.state.status !== 'lost'; }
  craftSuper(type: TowerType): boolean {
    if (!this.canManageTowers()) return false;
    const recipe = this.getSuperRecipe(type);
    if (!recipe.ready) return false;
    const consumed = recipe.slots.map(i => this.state.board[i]!);
    const anchor = consumed[0]!;
    const inherited = consumed.reduce((total,u)=>({attackUpgradePercent:total.attackUpgradePercent+(u.attackUpgradePercent??0),speedUpgradePercent:total.speedUpgradePercent+(u.speedUpgradePercent??0),upgradeCount:total.upgradeCount+(u.upgradeCount??0),upgradeGoldSpent:total.upgradeGoldSpent+(u.upgradeGoldSpent??0)}),{attackUpgradePercent:0,speedUpgradePercent:0,upgradeCount:0,upgradeGoldSpent:0});
    const ids = new Set(consumed.map(u=>u.instanceId));
    const unit: UnitInstance = {instanceId:`unit-${++this.unitSequence}`,definitionId:`super-${type}`,x:anchor.x,y:anchor.y,cooldownMs:0,items:[],superElapsedMs:0,...inherited};
    this.state = {...this.state,gold:this.state.gold-SUPER_COST,board:[...this.state.board.filter(u=>!ids.has(u.instanceId)),unit]};
    this.meta = registerUniqueUnitAcquisition(this.meta,unit.definitionId);
    this.events.push({type:'message',text:`유일슈퍼유니크 ${getUnitDefinition(unit.definitionId).name} 탄생!`});
    this.events.push({type:'superSkill',skill:'berserk',sourceId:unit.instanceId,at:{x:unit.x,y:unit.y}});
    return true;
  }
  buyDragonItem(slot: number, kind: DragonItemKind): boolean {
    const unit=this.state.board[slot],definition=DRAGON_ITEMS.find(d=>d.kind===kind);
    if (!this.canManageTowers() || !unit || !definition || !getUnitDefinition(unit.definitionId).superUnique || this.state.gold<definition.price || (unit.items?.length??0)>=3 || unit.items?.some(i=>i.kind===kind)) return false;
    this.state.gold-=definition.price;
    unit.items=[...(unit.items??[]),{kind,level:0,bonus:0,...(kind==='boots'?{waveSpeedPercent:this.randomInteger(5,40)}:{})}];
    this.events.push({type:'message',text:`${definition.name} 장착 · 효과 자동 발동`});
    return true;
  }
  upgradeDragonItem(slot: number, kind: DragonItemKind): {success:boolean;level:number;gain:number;cost:number}|null {
    const unit=this.state.board[slot],item=unit?.items?.find(i=>i.kind===kind);
    if (!this.canManageTowers() || !unit || !getUnitDefinition(unit.definitionId).superUnique || !item || item.level>=MAX_ITEM_UPGRADE_LEVEL) return null;
    const level=item.level+1,cost=getItemUpgradeCost(level),chance=getItemUpgradeChance(level);
    if(this.state.gold<cost)return null;
    this.state.gold-=cost;
    const success=chance===1||this.rng.next()<chance;
    const gain=success?(kind==='weapon'?50:kind==='ring'?this.randomInteger(50,500):this.randomInteger(5,40)):0;
    if(success){item.level=level;item.bonus+=gain;}
    this.events.push({type:'message',text:`${DRAGON_ITEMS.find(d=>d.kind===kind)!.name} ${success?`+${item.level} 강화 성공`:'강화 실패 · 기존 강화 유지'}`});
    return {success,level:item.level,gain,cost};
  }
  /** 내부 전용. combat.ts가 CombatContext로 접근하므로 private이 아니다. 소비자 API는 아니다. */
  randomInteger(min:number,max:number):number {return Math.min(max,min+Math.floor(this.rng.next()*(max-min+1)));}
  private tickSuperUnits(deltaMs: number): void {
    if (!this.currentWaveActive) return;
    for(const unit of this.state.board){
      const definition = getUnitDefinition(unit.definitionId);
      if(!definition.superUnique)continue;
      const before=unit.superElapsedMs??0,after=before+deltaMs;
      const cycle = definition.ultimate ? 10000 : 8000;
      if (definition.ultimate) unit.ultimateCooldownMs = Math.max(0, (unit.ultimateCooldownMs ?? 0) - deltaMs);
      if(!unit.superStarted||Math.floor(before/cycle)!==Math.floor(after/cycle))this.events.push({type:'superSkill',skill:'berserk',sourceId:unit.instanceId,at:{x:unit.x,y:unit.y}});
      if(definition.ultimate&&!unit.superStarted)this.events.push({type:'superSkill',skill:'blessing',sourceId:unit.instanceId,at:{x:unit.x,y:unit.y},targets:this.state.board.map(u=>({x:u.x,y:u.y}))});
      if(unit.definitionId==='super-priest'&&(!unit.superStarted||Math.floor(before/15000)!==Math.floor(after/15000)))this.events.push({type:'superSkill',skill:'blessing',sourceId:unit.instanceId,at:{x:unit.x,y:unit.y},targets:this.state.board.map(u=>({x:u.x,y:u.y}))});
      unit.superElapsedMs=after;unit.superStarted=true;
    }
  }
  getTowerCombatStats(slot: number, shared?: {formation:number;aura:number}) {
    const unit = this.state.board[slot];
    if (!unit) return null;
    const definition = getUnitDefinition(unit.definitionId);
    const stats = getEffectiveUnitStats(definition, getUniqueUnitLevel(this.meta, definition.id));
    const aura=shared?.aura??this.getSuperAura(), berserk=this.isSuperBerserk(unit)?(definition.ultimate?2:1.25):1;
    const weapon=unit.items?.find(i=>i.kind==='weapon'),boots=unit.items?.find(i=>i.kind==='boots');
    const equipmentAttack=weapon?100+weapon.bonus:0;
    const roleStat = definition.role === 'single' ? 'singleDamage' : definition.role === 'area' ? 'areaDamage' : 'supportDamage';
    return { ...stats,
      baseAttack: definition.attack,
      attack: (stats.attack + equipmentAttack) * (1 + (unit.attackUpgradePercent ?? 0) / 100) * (1 + getSkillEffectTotal(this.meta, 'attackBonus') + this.expeditionAttackBonus + (shared?.formation??this.formationBonus)) * (1 + this.bonus(roleStat)) * aura * berserk,
      attackSpeed: Math.max(35, stats.attackSpeed / ((1 + this.bonus('haste') + (unit.speedUpgradePercent??0)/100 + (boots?boots.bonus+(boots.waveSpeedPercent??0):0)/100) * aura * berserk)),
      range: stats.range * (1 + this.bonus('range')),
      criticalChance: Math.min(0.85, stats.criticalChance + this.bonus('criticalChance')),
    };
  }

  getTowerUpgradeCost(slot: number): number {
    const unit = this.state.board[slot];
    return unit ? Math.max(1, Math.round((25 + (unit.upgradeCount ?? 0) * 15) * (1 - this.bonus('upgradeDiscount')))) : 0;
  }

  rollTowerUpgrade(slot: number, stat: 'attack' | 'haste' = 'attack'): UpgradeRoll | null {
    const unit = this.state.board[slot];
    if (!unit || this.pendingRoll || this.pendingReward || this.pendingMerge || this.state.status === 'won' || this.state.status === 'lost') return null;
    const cost = this.getTowerUpgradeCost(slot);
    if (this.state.gold < cost) return null;
    const value = rollNormalInteger(this.rng, 0.2, 5);
    this.state.gold -= cost;
    this.pendingRoll = {kind: 'tower', title: getUnitDefinition(unit.definitionId).name, label: stat==='attack'?'타워 공격력':'타워 공격속도', stat, value, min: 0.2, max: 5, unit: '%', towerId: unit.instanceId, cost};
    return this.pendingRoll;
  }

  rollReward(id: string): UpgradeRoll | null {
    if (!this.pendingReward || this.pendingRoll || this.state.status === 'won' || this.state.status === 'lost') return null;
    const reward = this.rewardChoices.find(r => r.id === id);
    if (!reward) return null;
    const remaining = reward.cap - this.getUpgradeValue(reward.stat);
    const max = Math.min(reward.max, remaining), min = Math.min(reward.min, max);
    if (max <= 0) return null;
    this.pendingRoll = {kind: 'reward', title: reward.title, label: reward.label, stat: reward.stat, value: rollNormalInteger(this.rng, min, max), min, max, unit: reward.unit};
    return this.pendingRoll;
  }

  resolveUpgradeRoll(): boolean {
    const roll = this.pendingRoll;
    if (!roll) return false;
    if (roll.kind === 'tower') {
      const unit = this.state.board.find(u => u.instanceId === roll.towerId);
      if (!unit) { this.state.gold += roll.cost ?? 0; this.pendingRoll = null; return false; }
      if(roll.stat==='haste')unit.speedUpgradePercent=Math.round(((unit.speedUpgradePercent??0)+roll.value)*100)/100;
      else unit.attackUpgradePercent = Math.round(((unit.attackUpgradePercent ?? 0) + roll.value)*100)/100;
      unit.upgradeCount = (unit.upgradeCount ?? 0) + 1;
      unit.upgradeGoldSpent = (unit.upgradeGoldSpent ?? 0) + (roll.cost ?? 0);
    } else {
      this.upgrades[roll.stat] = Math.round((this.getUpgradeValue(roll.stat) + roll.value)*100)/100;
      if (roll.stat === 'maxHealth') { this.state.maxBaseHealth += roll.value; this.state.baseHealth += roll.value; }
      this.rewardHistory.push({ ...roll });
      this.pendingReward = false;
      this.rewardChoices = [];
    }
    this.pendingRoll = null;
    this.events.push({type: 'message', text: `${roll.title} · ${roll.label} +${roll.value}${roll.unit}`});
    return true;
  }
  frostCooldownMs = 0;

  get formationBonus(): number {
    return new Set(this.state.board.map(unit => getUnitDefinition(unit.definitionId).role)).size === 3 ? 0.15 : 0;
  }

  castFrost(): boolean {
    if (!this.currentWaveActive || this.pendingRoll || this.frostCooldownMs > 0 || this.state.status !== 'running') return false;
    this.frostCooldownMs = 24_000 * (1 - this.bonus('frostCooldown'));
    for (const enemy of this.enemies) enemy.effects.push({ kind: 'freeze', remainingMs: 3_000 * (1 + this.bonus('frostDuration')), magnitude: 1 });
    this.events.push({ type: 'message', text: `달빛 결계 · 모든 적 ${(3 * (1 + this.bonus('frostDuration'))).toFixed(1)}초 빙결` });
    return true;
  }

  /** 내부 전용. combat.ts가 CombatContext로 접근하므로 private이 아니다. 소비자 API는 아니다. */
  readonly rng: Rng;
  /** 내부 전용. combat.ts가 CombatContext로 접근하므로 private이 아니다. 소비자 API는 아니다. */
  readonly events: SimulationEvent[] = [];
  private unitSequence = 0;
  /** 내부 전용. combat.ts가 CombatContext로 접근하므로 private이 아니다. 소비자 API는 아니다. */
  currentWaveActive = false;
  private nextWaveDelayMs = 0;
  private successfulSummons = 0;
  private rareDrySummons = 0;
  private epicDrySummons = 0;
  /** 내부 전용. combat.ts의 CombatContext가 읽고 쓰므로 private을 붙이지 않는다. */
  combatCounters = {
    enemySequence: 0,
    attackSequence: 0,
    remainingSpawns: 0,
    spawnTimerMs: 0,
    jackpotMisses: 0,
  };

  constructor(meta: MetaProgress, rng: Rng = createRandomRng()) {
    this.meta = meta;
    this.rng = rng;
    this.state = createInitialRunState(meta);
  }

  restartRun(): boolean {
    if (this.state.status !== "won" && this.state.status !== "lost") {
      return false;
    }

    this.enemies.splice(0);
    this.events.splice(0);
    this.pendingMerge = null;
    this.pendingReward = false;
    this.upgrades = {};
    this.rewardChoices = [];
    this.pendingRoll = null;
    this.rewardHistory = [];
    this.frostCooldownMs = 0;
    this.combatCounters.enemySequence = 0;
    this.combatCounters.attackSequence = 0;
    this.unitSequence = 0;
    this.combatCounters.remainingSpawns = 0;
    this.combatCounters.spawnTimerMs = 0;
    this.currentWaveActive = false;
    this.nextWaveDelayMs = 0;
    this.successfulSummons = 0;
    this.rareDrySummons = 0;
    this.epicDrySummons = 0;
    this.combatCounters.jackpotMisses = 0;
    this.state = createInitialRunState(this.meta);
    this.events.push({ type: "message", text: "새로운 방어를 시작합니다." });
    return true;
  }

  get summonCost(): number {
    const discount = Math.min(0.5, getSkillEffectTotal(this.meta, "summonDiscount") + this.bonus("summonDiscount"));
    const summonPressure = Math.floor(this.successfulSummons / SUMMONS_PER_COST_INCREASE);
    return Math.max(1, Math.round((BASE_SUMMON_COST + summonPressure) * (1 - discount)));
  }

  get legendarySummonCost(): number {
    return this.summonCost * LEGENDARY_SUMMON_COST_MULTIPLIER;
  }

  get advancedSummonCost(): number {
    return this.summonCost * ADVANCED_SUMMON_COST_MULTIPLIER;
  }

  get canStartWave(): boolean {
    return this.state.status !== "lost" && this.state.status !== "won" && !this.pendingReward && !this.pendingRoll && !this.currentWaveActive && this.nextWaveDelayMs <= 0;
  }

  get nextWaveDelayRemainingMs(): number {
    return this.nextWaveDelayMs;
  }

  get isWaveActive(): boolean {
    return this.currentWaveActive;
  }

  get activeWaveCleanupWindowMs(): number {
    const wave = this.activeWaveDefinition;
    return getWaveCleanupWindowMs(wave);
  }

  get activeWaveDefinition(): WaveDefinition | null {
    if (!this.currentWaveActive) return null;
    return this.bossStage ?? this.waves[this.state.wave - 1] ?? null;
  }

  /** True while a boss stage is running rather than a numbered wave. */
  get isBossStageActive(): boolean {
    return this.currentWaveActive && this.bossStage !== null;
  }

  get upcomingWaveDefinition(): WaveDefinition | null {
    if (this.currentWaveActive || this.state.status === 'won' || this.state.status === 'lost') return null;
    if (this.queuedBossStage) return this.queuedBossStage;
    return this.waves[this.state.wave === MAX_WAVES && this.difficulty.next ? 0 : this.state.wave] ?? null;
  }

  drainEvents(): SimulationEvent[] {
    return this.events.splice(0);
  }

  startNextWave(): void {
    if (!this.canStartWave) {
      return;
    }

    // A boss owed by the wave just cleared runs as its own stage and leaves the
    // wave counter alone, so bosses never consume one of the numbered waves.
    const bossStage = this.queuedBossStage;
    if (bossStage) {
      this.queuedBossStage = null;
      this.bossStage = bossStage;
      this.beginStage(bossStage, this.state.wave);
      return;
    }

    if (this.state.wave >= MAX_WAVES && this.difficulty.next) {
      this.state = { ...this.state, difficulty: this.difficulty.next, wave: 0 };
      this.events.push({ type: 'message', text: `${this.difficulty.label} 난이도 진입 · 1웨이브부터 다시 시작합니다.` });
    }
    const nextWave = this.state.wave + 1;
    const wave = this.waves[nextWave - 1];
    if (!wave) {
      this.endRun("won");
      return;
    }

    this.bossStage = null;
    this.state = { ...this.state, wave: nextWave };
    this.beginStage(wave, nextWave);
  }

  private beginStage(stage: WaveDefinition, waveNumber: number): void {
    for(const unit of this.state.board)for(const item of unit.items??[])if(item.kind==='boots')item.waveSpeedPercent=this.randomInteger(5,40);
    const income = this.getUpgradeValue('waveGold') + Math.min(100, Math.floor(this.state.gold * this.bonus('interest')));
    this.state.gold += income;
    this.state.baseHealth = Math.min(this.state.maxBaseHealth, this.state.baseHealth + this.getUpgradeValue('regeneration'));
    this.state = { ...this.state, waveTimeRemainingMs: stage.durationMs, status: "running" };
    this.combatCounters.remainingSpawns = stage.isTrueBoss || stage.bossId ? 1 : Number.POSITIVE_INFINITY;
    this.combatCounters.spawnTimerMs = 0;
    this.currentWaveActive = true;
    this.nextWaveDelayMs = 0;
    const namedBossId = stage.trueBossId ?? stage.bossId;
    const trueBossName = namedBossId ? getTrueBossDefinition(namedBossId).label : null;
    this.events.push({
      type: "message",
      text: trueBossName
        ? `${stage.isFinalBoss ? '최종보스' : stage.isTrueBoss ? '진보스' : '보스'} ${trueBossName} 출현!`
        : stage.isBoss
          ? `${waveNumber} 웨이브 후 중간보스 출현!`
          : `${waveNumber} 웨이브 시작`,
    });
  }

  update(deltaMs: number): void {
    if (deltaMs > 0 && this.autoProgress && this.pendingReward && !this.pendingRoll && !this.pendingMerge) {
      const choice = this.rewardChoices[0];
      if (choice && this.rollReward(choice.id)) this.resolveUpgradeRoll();
    }
    if (deltaMs > 0 && this.autoProgress && this.canStartWave) this.startNextWave();
    if (deltaMs <= 0 || this.pendingReward || this.pendingMerge || this.pendingRoll) return;
    if (this.state.status === "lost" || this.state.status === "won") {
      return;
    }

    this.frostCooldownMs = Math.max(0, this.frostCooldownMs - deltaMs);
    if (this.tickNextWaveDelay(deltaMs)) {
      return;
    }
    tickBuffs(this, deltaMs);
    this.tickSuperUnits(deltaMs);
    tickEnemyEffects(this, deltaMs);
    spawnEnemies(this, deltaMs);
    moveEnemies(this, deltaMs);
    attackEnemies(this, deltaMs);
    this.tickWaveTimer(deltaMs);
    this.checkWaveCompletion();
  }

  summonToFirstEmpty(): boolean {
    return this.summon("normal");
  }

  summonAdvanced(): boolean {
    return this.summon("advanced");
  }

  summonLegendary(): boolean {
    return this.summon("legendary");
  }

  private summon(kind: SummonKind): boolean {
    if (this.state.status === 'won' || this.state.status === 'lost' || this.pendingMerge || this.pendingReward || this.pendingRoll) return false;
    if (this.state.board.length >= MAX_TOWERS) {
      this.events.push({ type: 'message', text: `수호대 정원 ${MAX_TOWERS}명 · 합성이나 골드 강화를 이용하세요.` });
      return false;
    }
    if (kind === "normal" && this.state.freeSummons >= 1) {
      this.state = { ...this.state, freeSummons: this.state.freeSummons - 1 };
    } else {
      const cost = kind === "legendary" ? this.legendarySummonCost : kind === "advanced" ? this.advancedSummonCost : this.summonCost;
      if (this.state.gold < cost) {
        this.events.push({ type: "message", text: "골드가 부족해요." });
        return false;
      }
      this.state = { ...this.state, gold: this.state.gold - cost };
    }

    const { unit, pityActivated } = this.rollSummonUnit(kind);
    this.meta = registerUniqueUnitAcquisition(this.meta, unit.id);
    const uniqueLevel = getUniqueUnitLevel(this.meta, unit.id);
    const position = this.findTowerSpawnPosition();
    const board = [...this.state.board];
    board.push({
      instanceId: `unit-${this.unitSequence += 1}`,
      definitionId: unit.id,
      cooldownMs: 250,
      x: position.x,
      y: position.y,
    });
    this.successfulSummons += 1;
    this.state = { ...this.state, board };
    const prefix = pityActivated ? "행운 보정! " : kind === "legendary" ? "전설 소환! " : kind === "advanced" ? "고급 소환! " : "";
    const levelSuffix = unit.uniqueAbility ? ` Lv.${uniqueLevel}` : "";
    this.events.push({ type: "message", text: `${prefix}${getRarity(unit.rarity).label} ${unit.name}${levelSuffix} 소환!` });
    return true;
  }

  moveUnit(from: number, to: number): boolean {
    if (from === to || !this.state.board[from] || !this.state.board[to]) {
      return false;
    }

    const board = [...this.state.board];
    const target = board[to];
    board[to] = board[from];
    board[from] = target;
    this.state = { ...this.state, board };
    return true;
  }

  moveUnitTo(index: number, x: number, y: number): boolean {
    const unit = this.state.board[index];
    if (!unit) {
      return false;
    }

    const position = clampTowerPosition({ x, y });
    const board = [...this.state.board];
    board[index] = { ...unit, x: position.x, y: position.y };
    this.state = { ...this.state, board };
    return true;
  }

  sortUnitsByType(): boolean {
    if (this.state.board.length < 2) {
      this.events.push({ type: "message", text: "정렬할 유닛이 더 필요해요." });
      return false;
    }

    const board = [...this.state.board].sort(compareUnitsForArrangement);
    const positions = createTowerEdgeCandidates(board.length);
    this.state = {
      ...this.state,
      board: board.map((unit, index) => ({ ...unit, ...positions[index]! })),
    };
    this.events.push({ type: "message", text: "유니크 우선으로 같은 종류끼리 정렬했어요." });
    return true;
  }

  sellUnit(slot: number): boolean {
    if (this.pendingRoll || this.pendingMerge || this.pendingReward) return false;
    const unit = this.state.board[slot];
    if (!unit) {
      return false;
    }
    const definition = getUnitDefinition(unit.definitionId);
    const refund = 10 + getRarityIndex(definition.rarity) * 7 + Math.floor((unit.upgradeGoldSpent ?? 0) * 0.5);
    const board = [...this.state.board];
    board.splice(slot, 1);
    this.state = { ...this.state, board, gold: this.state.gold + refund };
    this.events.push({ type: "message", text: `${definition.name} 판매 +${refund}G` });
    return true;
  }

  requestMerge(slot?: number): MergePrompt | null {
    if (this.pendingRoll || this.pendingReward) return null;
    const targetSlot = slot ?? this.state.board.findIndex((entry, index) => entry && this.findMatchingSlots(index).length >= 3);
    if (targetSlot < 0 || !this.state.board[targetSlot]) {
      this.events.push({ type: "message", text: "합성할 유닛 3개가 필요해요." });
      return null;
    }

    const matchingSlots = this.findMatchingSlots(targetSlot);
    if (matchingSlots.length < 3) {
      this.events.push({ type: "message", text: "같은 유닛 3개가 필요해요." });
      return null;
    }

    const source = this.state.board[targetSlot]!;
    if (!this.canMergeUnit(source.definitionId)) return null;
    try {
      this.pendingMerge = {
        sourceSlots: [targetSlot, ...matchingSlots.filter((matchingSlot) => matchingSlot !== targetSlot)].slice(0, 3),
        candidates: createMergeCandidates(source.definitionId, this.rng),
      };
      return this.pendingMerge;
    } catch (error) {
      this.events.push({ type: "message", text: error instanceof Error ? error.message : "합성할 수 없어요." });
      return null;
    }
  }

  chooseMergeCandidate(candidateId: string): boolean {
    if (!this.pendingMerge) {
      return false;
    }

    const candidate = this.pendingMerge.candidates.find((unit) => unit.id === candidateId);
    if (!candidate) {
      return false;
    }

    const merged = this.applyMerge(this.pendingMerge.sourceSlots, candidate);
    if (!merged) {
      return false;
    }

    this.pendingMerge = null;
    this.events.push({ type: "message", text: `${candidate.name} 합성 성공!` });
    return true;
  }

  bulkMergeAll(rarity?: RarityId): number {
    if (this.pendingRoll || this.pendingReward) return 0;
    let mergedCount = 0;

    while (true) {
      const merge = this.findBulkMerge(rarity);
      if (!merge) {
        break;
      }

      const candidate = this.rng.pick(merge.candidates);
      if (!this.applyMerge(merge.sourceSlots, candidate)) {
        break;
      }
      mergedCount += 1;
    }

    this.pendingMerge = null;
    this.events.push({
      type: "message",
      text: mergedCount > 0 ? `일괄합성 ${mergedCount}회 완료!` : "합성할 유닛 3개가 필요해요.",
    });
    return mergedCount;
  }

  getMergeableSlots(): Set<number> {
    const mergeable = new Set<number>();
    for (const group of this.getMergeableGroups()) {
      for (const slot of group) {
        mergeable.add(slot);
      }
    }

    return mergeable;
  }

  getMergeableGroups(): number[][] {
    const groups: number[][] = [];
    const slotsByDefinition = new Map<string, number[]>();

    this.state.board.forEach((unit, index) => {
      const slots = slotsByDefinition.get(unit.definitionId) ?? [];
      slots.push(index);
      slotsByDefinition.set(unit.definitionId, slots);
    });

    for (const [definitionId, slots] of slotsByDefinition) {
      if (slots.length < 3 || !this.canMergeUnit(definitionId)) {
        continue;
      }
      for (let index = 0; index + 2 < slots.length; index += 3) {
        groups.push(slots.slice(index, index + 3));
      }
    }

    return groups;
  }

  private canMergeUnit(id: string): boolean {
    const d = getUnitDefinition(id);
    return !isUniqueUnit(d) && (d.rarity !== 'immortal' || this.state.board.filter(u => Boolean(getUnitDefinition(u.definitionId).uniqueAbility)).length < 2);
  }

  private applyMerge(sourceSlots: number[], candidate: UnitDefinition): boolean {
    if (!sourceSlots.length || !this.canMergeUnit(this.state.board[sourceSlots[0]!]!.definitionId)) return false;
    const inherited = sourceSlots.reduce((total, slot) => {
      const unit = this.state.board[slot];
      return { speedUpgradePercent: total.speedUpgradePercent + (unit?.speedUpgradePercent ?? 0), attackUpgradePercent: total.attackUpgradePercent + (unit?.attackUpgradePercent ?? 0), upgradeCount: total.upgradeCount + (unit?.upgradeCount ?? 0), upgradeGoldSpent: total.upgradeGoldSpent + (unit?.upgradeGoldSpent ?? 0) };
    }, { speedUpgradePercent: 0, attackUpgradePercent: 0, upgradeCount: 0, upgradeGoldSpent: 0 });
    const [targetSlot, ...consumedSlots] = sourceSlots;
    const board = [...this.state.board];
    const sourceUnit = board[targetSlot!];
    if (!sourceUnit) {
      return false;
    }
    for (const slot of [...consumedSlots].sort((a, b) => b - a)) {
      board.splice(slot, 1);
    }
    const adjustedTargetSlot = board.findIndex((unit) => unit.instanceId === sourceUnit.instanceId);
    const insertIndex = adjustedTargetSlot >= 0 ? adjustedTargetSlot : Math.min(targetSlot!, board.length);
    board[insertIndex] = {
      instanceId: `unit-${this.unitSequence += 1}`,
      definitionId: candidate.id,
      cooldownMs: 150,
      ...inherited,
      x: sourceUnit.x,
      y: sourceUnit.y,
    };

    this.meta = registerUniqueUnitAcquisition(this.meta, candidate.id);
    this.state = { ...this.state, board };
    return true;
  }

  cancelMerge(): void {
    this.pendingMerge = null;
  }

  completeRunRewards(): void {
    const highestWave = Math.max(this.meta.highestWave, this.state.difficulty === 'normal' ? this.state.wave : MAX_WAVES);
    const won = this.state.status === "won";
    this.meta = {
      ...this.meta,
      highestWave,
      wins: this.meta.wins + (won ? 1 : 0),
      growthShards: this.meta.growthShards + this.state.growthShardsEarned,
    };
  }

  private tickWaveTimer(deltaMs: number): void {
    if (!this.currentWaveActive) {
      return;
    }

    const nextTime = Math.max(0, this.state.waveTimeRemainingMs - deltaMs);
    this.state = { ...this.state, waveTimeRemainingMs: nextTime };
    if (nextTime === 0) {
      this.resolveTimedWaveEnd();
    }
  }

  private checkWaveCompletion(): void {
    if (!this.currentWaveActive || this.combatCounters.remainingSpawns > 0 || this.enemies.length > 0 || this.state.waveTimeRemainingMs > 0) {
      return;
    }
    this.completeCurrentWave();
  }

  private resolveTimedWaveEnd(): void {
    if (!this.currentWaveActive) {
      return;
    }

    const bossDamage = this.enemies.filter((enemy) => enemy.isBoss).length * 5;
    const normalSurvivors = this.enemies.filter((enemy) => !enemy.isBoss).length;
    const rawSurvivorDamage = bossDamage + Math.ceil(normalSurvivors / 6);
    const damageReduction = Math.min(0.8, getSkillEffectTotal(this.meta, "leakDamageReduction") + this.bonus("damageReduction"));
    const survivorDamage = rawSurvivorDamage > 0 ? Math.max(1, Math.ceil(rawSurvivorDamage * (1 - damageReduction))) : 0;
    this.enemies.splice(0);
    this.combatCounters.remainingSpawns = 0;
    const baseHealth = Math.max(0, this.state.baseHealth - survivorDamage);
    this.state = { ...this.state, baseHealth };
    if (survivorDamage > 0) {
      this.events.push({ type: "message", text: `남은 몬스터 피해 -${survivorDamage} HP` });
    }
    if (baseHealth <= 0) {
      this.endRun("lost");
      return;
    }

    this.completeCurrentWave();
  }

  private completeCurrentWave(): void {
    const completedWave = this.state.wave;
    const stage = this.bossStage;
    // Boss stages pay the boss share; the wave they follow pays the ordinary one.
    const growthShardsAwarded = stage ? (stage.isTrueBoss || stage.bossId ? 6 : 3) : 1;
    const growthShardsEarned = this.state.growthShardsEarned + growthShardsAwarded;
    this.currentWaveActive = false;
    this.state = { ...this.state, waveTimeRemainingMs: 0, growthShardsEarned };
    this.events.push({
      type: "waveComplete",
      wave: completedWave,
      growthShardsAwarded,
      // A boss stage reports the wave it followed, so the label keeps the two apart.
      bossLabel: stage ? (stage.isFinalBoss ? "최종보스" : stage.isTrueBoss ? "진보스" : stage.bossId ? "보스" : "중간보스") : undefined,
    });

    if (stage) {
      this.bossStage = null;
      // The run ends on the final boss, not on the last numbered wave.
      if (stage.isFinalBoss && !this.difficulty.next) {
        this.endRun("won");
        return;
      }
      this.nextWaveDelayMs = NEXT_WAVE_DELAY_MS;
      this.rewardChoices = [];
      this.pendingReward = false;
      return;
    }

    this.queuedBossStage = getBossEncounter(completedWave);
    this.nextWaveDelayMs = NEXT_WAVE_DELAY_MS;
    this.rewardChoices = completedWave % 10 === 0 ? sampleRewards(this.rng, this.upgrades) : [];
    this.pendingReward = this.rewardChoices.length > 0;
  }

  private tickNextWaveDelay(deltaMs: number): boolean {
    if (this.currentWaveActive || this.nextWaveDelayMs <= 0) {
      return false;
    }

    this.nextWaveDelayMs = Math.max(0, this.nextWaveDelayMs - deltaMs);
    if (this.nextWaveDelayMs === 0) {
      this.startNextWave();
    }
    return true;
  }

  private findMatchingSlots(slot: number): number[] {
    const source = this.state.board[slot];
    if (!source) {
      return [];
    }
    return this.state.board
      .map((unit, index) => (unit?.definitionId === source.definitionId ? index : -1))
      .filter((index) => index >= 0);
  }

  private findBulkMerge(rarity?: RarityId): MergePrompt | null {
    const slotsByDefinition = new Map<string, number[]>();
    this.state.board.forEach((unit, index) => {
      const slots = slotsByDefinition.get(unit.definitionId) ?? [];
      slots.push(index);
      slotsByDefinition.set(unit.definitionId, slots);
    });

    for (const [definitionId, slots] of slotsByDefinition) {
      if (slots.length < 3 || (rarity && getUnitDefinition(definitionId).rarity !== rarity) || !this.canMergeUnit(definitionId)) {
        continue;
      }

      try {
        return {
          sourceSlots: slots.slice(0, 3),
          candidates: createMergeCandidates(definitionId, this.rng),
        };
      } catch {
        continue;
      }
    }

    return null;
  }

  private findTowerSpawnPosition(): { x: number; y: number } {
    const candidates = createTowerEdgeCandidates(Math.max(40, this.state.board.length + 24));
    if (this.state.board.length === 0) {
      return candidates[0] ?? TOWER_SPAWN;
    }

    let best = candidates[0] ?? TOWER_SPAWN;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (const candidate of candidates) {
      const minDistance = this.state.board.reduce((closest, unit) => {
        return Math.min(closest, Math.hypot(unit.x - candidate.x, unit.y - candidate.y));
      }, Number.POSITIVE_INFINITY);
      const centerDistance = Math.hypot(candidate.x - TOWER_SPAWN.x, candidate.y - TOWER_SPAWN.y);
      const score = minDistance - centerDistance * 0.035;
      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    }

    return best;
  }

  /** 내부 전용. combat.ts가 CombatContext로 접근하므로 private이 아니다. 소비자 API는 아니다. */
  getBuffMultiplier(stat: "attack" | "attackSpeed"): number {
    return this.state.activeBuffs
      .filter((buff) => buff.stat === stat)
      .reduce((total, buff) => total * buff.multiplier, 1);
  }

  private rollSummonUnit(kind: SummonKind): { unit: UnitDefinition; pityActivated: boolean } {
    // Uniques are not a rarity, so the legendary summon draws them ahead of the
    // rarity table. A unique skips the pity counters entirely.
    if (kind === "legendary") {
      const uniqueUnit = rollSummonUniqueUnit(this.rng);
      if (uniqueUnit) {
        return { unit: uniqueUnit, pityActivated: false };
      }
    }

    let unit: UnitDefinition | null = null;
    let rarity: RarityId = pickRarity(this.rng, kind);
    let pityActivated = false;
    const rolledRarityIndex = getRarityIndex(rarity);

    if (!unit && this.epicDrySummons >= EPIC_PITY_THRESHOLD && rolledRarityIndex < EPIC_RARITY_INDEX) {
      rarity = "epic";
      pityActivated = true;
    } else if (!unit && this.rareDrySummons >= RARE_PITY_THRESHOLD && rolledRarityIndex < RARE_RARITY_INDEX) {
      rarity = "rare";
      pityActivated = true;
    }

    const finalRarityIndex = getRarityIndex(rarity);
    this.rareDrySummons = finalRarityIndex >= RARE_RARITY_INDEX ? 0 : this.rareDrySummons + 1;
    this.epicDrySummons = finalRarityIndex >= EPIC_RARITY_INDEX ? 0 : this.epicDrySummons + 1;

    if (!unit) {
      const candidates = getUnitsByRarity(rarity).filter((candidate) => !isUniqueUnit(candidate));
      unit = this.rng.pick(candidates);
    }
    return { unit, pityActivated };
  }

  /** 내부 전용. combat.ts가 CombatContext로 접근하므로 private이 아니다. 소비자 API는 아니다. */
  getJackpotChance(): number {
    const skillBonus = getSkillEffectTotal(this.meta, "jackpotChance");
    const pityBonus = Math.min(JACKPOT_PITY_MAX_BONUS, this.combatCounters.jackpotMisses * JACKPOT_PITY_STEP);
    return Math.min(0.30, BASE_JACKPOT_CHANCE + skillBonus + pityBonus + this.bonus("jackpotChance")) / 4;
  }

  private endRun(status: "won" | "lost"): void {
    if (this.state.status === status) {
      return;
    }

    const failureShardsAwarded =
      status === "lost"
        ? getFailureGrowthShards(
            this.state.wave,
            this.state.defeatedEnemies,
            getSkillEffectTotal(this.meta, "failureShardBonus"),
          )
        : 0;
    this.currentWaveActive = false;
    this.combatCounters.remainingSpawns = 0;
    this.state = {
      ...this.state,
      status,
      growthShardsEarned: this.state.growthShardsEarned + failureShardsAwarded,
    };
    this.completeRunRewards();
    this.events.push({
      type: "runEnded",
      status,
      growthShardsAwarded: this.state.growthShardsEarned,
      failureShardsAwarded,
    });
  }
}
