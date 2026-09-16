import { TOWER_FIELD, TOWER_RADIUS, TOWER_SPAWN, clampTowerPosition, getPathPosition } from "./geometry";
import {
  MAX_WAVES,
  buildWaves,
  createInitialRunState,
  createMergeCandidates,
  createRandomRng,
  getFailureGrowthShards,
  getSkillEffectTotal,
  pickRarity,
  resolveJackpotReward,
  rollAdvancedUniqueUnit,
  rollJackpotReward,
  rollKillGoldReward,
  type SummonKind,
} from "./systems";
import type { Rng } from "./rng";
import type {
  EnemyState,
  EnemyStatusEffect,
  EnemyVariantId,
  GoldRewardTier,
  JackpotReward,
  MetaProgress,
  RarityId,
  RunState,
  TrueBossId,
  UnitAbilityKind,
  UnitDefinition,
  UnitRole,
  WaveDefinition,
} from "./types";
import { getRarity, getRarityIndex } from "./rarities";
import { getUniqueAbilityStats } from "./uniqueAbilities";
import {
  getEffectiveUnitStats,
  getUniqueUnitLevel,
  getUnitDefinition,
  getUnitsByRarity,
  grantUniqueUnitExperience,
  isUniqueUnit,
  registerUniqueUnitAcquisition,
} from "./units";

export interface MergePrompt {
  sourceSlots: number[];
  candidates: UnitDefinition[];
}

export type SimulationEvent =
  | { type: "message"; text: string }
  | { type: "jackpot"; reward: JackpotReward; text: string }
  | {
      type: "attack";
      attackId: string;
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
  | { type: "waveComplete"; wave: number; growthShardsAwarded: number }
  | {
      type: "runEnded";
      status: "won" | "lost";
      growthShardsAwarded: number;
      failureShardsAwarded: number;
    };

const BASE_SUMMON_COST = 10;
const ADVANCED_SUMMON_COST_MULTIPLIER = 5;
const SUMMONS_PER_COST_INCREASE = 10;
const RARE_PITY_THRESHOLD = 7;
const EPIC_PITY_THRESHOLD = 16;
const BASE_JACKPOT_CHANCE = 0.025;
const JACKPOT_PITY_STEP = 0.002;
const JACKPOT_PITY_MAX_BONUS = 0.06;
const NORMAL_SPAWN_DENSITY = 4.8;
const BOSS_SPAWN_INTERVAL_MS = 7_200;
const ENEMY_GOLD_REWARD_SCALE = 0.5;
const NORMAL_WAVE_CLEANUP_WINDOW_MS = 5_000;
const BOSS_WAVE_CLEANUP_WINDOW_MS = 20_000;
const TRUE_BOSS_WAVE_CLEANUP_WINDOW_MS = 45_000;
const NEXT_WAVE_DELAY_MS = 5_000;
const POISON_TICK_MS = 500;
const RARE_RARITY_INDEX = getRarityIndex("rare");
const EPIC_RARITY_INDEX = getRarityIndex("epic");

export class GameSimulation {
  readonly waves = buildWaves();
  readonly enemies: EnemyState[] = [];

  state: RunState;
  meta: MetaProgress;
  pendingMerge: MergePrompt | null = null;
  pendingReward = false;
  expeditionAttackBonus = 0;
  frostCooldownMs = 0;

  get formationBonus(): number {
    return new Set(this.state.board.map(unit => getUnitDefinition(unit.definitionId).role)).size === 3 ? 0.15 : 0;
  }

  castFrost(): boolean {
    if (!this.currentWaveActive || this.frostCooldownMs > 0 || this.state.status !== 'running') return false;
    this.frostCooldownMs = 24_000;
    for (const enemy of this.enemies) enemy.effects.push({ kind: 'freeze', remainingMs: 3_000, magnitude: 1 });
    this.events.push({ type: 'message', text: '달빛 결계 · 모든 적 3초 빙결' });
    return true;
  }

  chooseReward(reward: 'power' | 'supply' | 'repair'): boolean {
    if (!this.pendingReward || !['power', 'supply', 'repair'].includes(reward)) return false;
    this.pendingReward = false;
    if (reward === 'power') this.expeditionAttackBonus += 0.12;
    if (reward === 'supply') this.state.gold += 60;
    if (reward === 'repair') this.state.baseHealth = Math.min(this.state.maxBaseHealth, this.state.baseHealth + 5);
    this.events.push({ type: 'message', text: reward === 'power' ? '달의 축복 · 이번 원정 공격력 +12%' : reward === 'supply' ? '왕국의 보급 · +60 골드' : '성채 복구 · 체력 +5' });
    return true;
  }

  private readonly rng: Rng;
  private readonly events: SimulationEvent[] = [];
  private enemySequence = 0;
  private attackSequence = 0;
  private unitSequence = 0;
  private remainingSpawns = 0;
  private spawnTimerMs = 0;
  private currentWaveActive = false;
  private nextWaveDelayMs = 0;
  private successfulSummons = 0;
  private rareDrySummons = 0;
  private epicDrySummons = 0;
  private jackpotMisses = 0;

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
    this.expeditionAttackBonus = 0;
    this.frostCooldownMs = 0;
    this.enemySequence = 0;
    this.attackSequence = 0;
    this.unitSequence = 0;
    this.remainingSpawns = 0;
    this.spawnTimerMs = 0;
    this.currentWaveActive = false;
    this.nextWaveDelayMs = 0;
    this.successfulSummons = 0;
    this.rareDrySummons = 0;
    this.epicDrySummons = 0;
    this.jackpotMisses = 0;
    this.state = createInitialRunState(this.meta);
    this.events.push({ type: "message", text: "새로운 방어를 시작합니다." });
    return true;
  }

  get summonCost(): number {
    const discount = Math.min(0.5, getSkillEffectTotal(this.meta, "summonDiscount"));
    const summonPressure = Math.floor(this.successfulSummons / SUMMONS_PER_COST_INCREASE);
    return Math.max(1, Math.round((BASE_SUMMON_COST + summonPressure) * (1 - discount)));
  }

  get advancedSummonCost(): number {
    return this.summonCost * ADVANCED_SUMMON_COST_MULTIPLIER;
  }

  get canStartWave(): boolean {
    return this.state.status !== "lost" && this.state.status !== "won" && !this.currentWaveActive && this.nextWaveDelayMs <= 0;
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
    return this.currentWaveActive ? (this.waves[this.state.wave - 1] ?? null) : null;
  }

  get upcomingWaveDefinition(): WaveDefinition | null {
    return this.currentWaveActive ? null : (this.waves[this.state.wave] ?? null);
  }

  drainEvents(): SimulationEvent[] {
    return this.events.splice(0);
  }

  startNextWave(): void {
    if (!this.canStartWave) {
      return;
    }
    const nextWave = this.state.wave + 1;
    const wave = this.waves[nextWave - 1];
    if (!wave) {
      this.endRun("won");
      return;
    }

    this.state = { ...this.state, wave: nextWave, waveTimeRemainingMs: wave.durationMs, status: "running" };
    this.remainingSpawns = wave.isTrueBoss ? 1 : Number.POSITIVE_INFINITY;
    this.spawnTimerMs = 0;
    this.currentWaveActive = true;
    this.nextWaveDelayMs = 0;
    const trueBossName = wave.trueBossId ? getTrueBossDefinition(wave.trueBossId).label : null;
    this.events.push({
      type: "message",
      text: trueBossName ? `진보스 ${trueBossName} 출현!` : wave.isBoss ? `보스 ${nextWave} 웨이브!` : `${nextWave} 웨이브 시작`,
    });
  }

  update(deltaMs: number): void {
    if (deltaMs <= 0 || this.pendingReward || this.pendingMerge) return;
    if (this.state.status === "lost" || this.state.status === "won") {
      return;
    }

    this.frostCooldownMs = Math.max(0, this.frostCooldownMs - deltaMs);
    if (this.tickNextWaveDelay(deltaMs)) {
      return;
    }
    this.tickBuffs(deltaMs);
    this.tickEnemyEffects(deltaMs);
    this.spawnEnemies(deltaMs);
    this.moveEnemies(deltaMs);
    this.attackEnemies(deltaMs);
    this.tickWaveTimer(deltaMs);
    this.checkWaveCompletion();
  }

  summonToFirstEmpty(): boolean {
    return this.summon("normal");
  }

  summonAdvanced(): boolean {
    return this.summon("advanced");
  }

  private summon(kind: SummonKind): boolean {
    if (this.state.status === 'won' || this.state.status === 'lost' || this.pendingMerge || this.pendingReward) return false;
    if (this.state.board.length >= 30) {
      this.events.push({ type: 'message', text: '수호대 정원 30명 · 합성으로 자리를 확보하세요.' });
      return false;
    }
    if (kind === "normal" && this.state.freeSummons > 0) {
      this.state = { ...this.state, freeSummons: this.state.freeSummons - 1 };
    } else {
      const cost = kind === "advanced" ? this.advancedSummonCost : this.summonCost;
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
    const prefix = pityActivated ? "행운 보정! " : kind === "advanced" ? "고급 소환! " : "";
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
    const unit = this.state.board[slot];
    if (!unit) {
      return false;
    }
    const definition = getUnitDefinition(unit.definitionId);
    const refund = 10 + getRarityIndex(definition.rarity) * 7;
    const board = [...this.state.board];
    board.splice(slot, 1);
    this.state = { ...this.state, board, gold: this.state.gold + refund };
    this.events.push({ type: "message", text: `${definition.name} 판매 +${refund}G` });
    return true;
  }

  requestMerge(slot?: number): MergePrompt | null {
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

  bulkMergeAll(): number {
    let mergedCount = 0;

    while (true) {
      const merge = this.findBulkMerge();
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
      if (slots.length < 3 || !canMergeDefinition(definitionId)) {
        continue;
      }
      for (let index = 0; index + 2 < slots.length; index += 3) {
        groups.push(slots.slice(index, index + 3));
      }
    }

    return groups;
  }

  private applyMerge(sourceSlots: number[], candidate: UnitDefinition): boolean {
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
    const highestWave = Math.max(this.meta.highestWave, this.state.wave);
    const won = this.state.status === "won";
    this.meta = {
      ...this.meta,
      highestWave,
      wins: this.meta.wins + (won ? 1 : 0),
      growthShards: this.meta.growthShards + this.state.growthShardsEarned,
    };
  }

  private spawnEnemies(deltaMs: number): void {
    if (!this.currentWaveActive || this.remainingSpawns <= 0) {
      return;
    }

    const wave = this.waves[this.state.wave - 1]!;
    const cleanupWindowMs = getWaveCleanupWindowMs(wave);
    const spawnableDeltaMs = Math.min(deltaMs, Math.max(0, this.state.waveTimeRemainingMs - cleanupWindowMs));
    if (spawnableDeltaMs <= 0) {
      return;
    }

    this.spawnTimerMs -= spawnableDeltaMs;

    while (this.remainingSpawns > 0 && this.spawnTimerMs <= 0) {
      const baseHp = wave.isBoss ? 280 : 46;
      const sequence = this.enemySequence + 1;
      const variant = getEnemyVariant(wave.number, wave.isBoss, sequence);
      const trueBoss = wave.trueBossId ? getTrueBossDefinition(wave.trueBossId) : null;
      const hpMultiplier = variant.hpMultiplier * (trueBoss?.hpMultiplier ?? 1);
      const armorMultiplier = variant.armorMultiplier * (trueBoss?.armorMultiplier ?? 1);
      const hp = Math.round(baseHp * wave.healthMultiplier * hpMultiplier);
      const armor = Math.round(getWaveArmor(wave.number, wave.isBoss) * armorMultiplier);
      this.enemies.push({
        id: `enemy-${this.enemySequence += 1}`,
        wave: wave.number,
        variantId: trueBoss?.variantId ?? variant.id,
        variantLabel: trueBoss?.label ?? variant.label,
        variantTint: trueBoss?.tint ?? variant.tint,
        variantTier: trueBoss?.tier ?? variant.tier,
        trueBossId: wave.trueBossId,
        hp,
        maxHp: hp,
        armor,
        effects: [],
        progress: 0,
        speed: (wave.isBoss ? 0.07 : 0.12) * wave.speedMultiplier * variant.speedMultiplier * (trueBoss?.speedMultiplier ?? 1),
        rewardGold: Math.max(
          1,
          Math.round(
            scaleEnemyReward(
              wave.isBoss
                ? 58 + Math.floor((wave.number - 1) / 5) * 18 + wave.number
                : 5 + Math.floor(wave.number / 4) + Math.floor((wave.number - 1) / 5),
            ) * variant.rewardMultiplier * (trueBoss?.rewardMultiplier ?? 1),
          ),
        ),
        isBoss: wave.isBoss,
      });

      this.remainingSpawns -= 1;
      this.spawnTimerMs += wave.isBoss ? BOSS_SPAWN_INTERVAL_MS : Math.max(180, Math.floor(wave.durationMs / (wave.enemyCount * NORMAL_SPAWN_DENSITY)));
    }
  }

  private moveEnemies(deltaMs: number): void {
    for (const enemy of this.enemies) {
      enemy.progress += enemy.speed * getEnemyMovementMultiplier(enemy) * (deltaMs / 1000);
    }
  }

  private attackEnemies(deltaMs: number): void {
    const supportCount = this.state.board.reduce((count, unit) => {
      return getUnitDefinition(unit.definitionId).role === "support" ? count + 1 : count;
    }, 0);
    const supportSpeedMultiplier = Math.min(1.25, 1 + supportCount * 0.025);
    const attackBonus = 1 + getSkillEffectTotal(this.meta, "attackBonus") + this.formationBonus + this.expeditionAttackBonus;
    const attackBuff = this.getBuffMultiplier("attack");
    const speedBuff =
      this.getBuffMultiplier("attackSpeed") *
      supportSpeedMultiplier *
      (1 + getSkillEffectTotal(this.meta, "attackSpeedBonus"));
    const criticalChanceBonus = getSkillEffectTotal(this.meta, "criticalChanceBonus");
    const uniqueAttackBonus = getSkillEffectTotal(this.meta, "uniqueAttackBonus");
    const uniqueSkillPowerBonus = getSkillEffectTotal(this.meta, "uniqueSkillPowerBonus");
    const bossDamageBonus = getSkillEffectTotal(this.meta, "bossDamageBonus");

    this.state.board.forEach((unit) => {
      const definition = getUnitDefinition(unit.definitionId);
      const uniqueLevel = getUniqueUnitLevel(this.meta, definition.id);
      const stats = getEffectiveUnitStats(definition, uniqueLevel);
      const abilityStats = definition.uniqueAbility ? getUniqueAbilityStats(definition.uniqueAbility, uniqueLevel) : null;
      const berserkStats = abilityStats?.ability === "berserk" ? abilityStats : null;
      const multishotStats = abilityStats?.ability === "multishot" ? abilityStats : null;
      const berserkActive = Boolean(berserkStats) && (unit.berserkRemainingMs ?? 0) > 0;
      const unitSpeedMultiplier = speedBuff * (berserkActive ? berserkStats!.speedMultiplier : 1);

      unit.cooldownMs -= deltaMs * unitSpeedMultiplier;
      if (unit.cooldownMs > 0) {
        return;
      }

      const rarity = getRarity(definition.rarity);
      const rarityTier = getRarityIndex(definition.rarity);
      const targets = this.findTargets(unit, stats.range, multishotStats?.targetCount ?? 1);
      unit.cooldownMs = stats.attackSpeed;
      if (targets.length === 0) {
        return;
      }

      const critical = this.rng.next() < Math.min(0.85, stats.criticalChance + criticalChanceBonus);
      const damage = Math.round(
        stats.attack *
          attackBonus *
          attackBuff *
          (definition.uniqueAbility ? 1 + uniqueAttackBonus : 1) *
          (critical ? 1.75 : 1) *
          (multishotStats ? multishotStats.damageMultiplier * (1 + uniqueSkillPowerBonus) : 1) *
          (berserkActive ? berserkStats!.damageMultiplier * (1 + uniqueSkillPowerBonus) : 1),
      );
      const origin = { x: unit.x, y: unit.y };

      if (berserkStats) {
        unit.berserkRemainingMs = berserkStats.durationMs;
      }

      for (const target of targets) {
        const targetPosition = getPathPosition(target.progress);
        const attackId = `attack-${++this.attackSequence}`;
        this.events.push({
          type: "attack",
          attackId,
          sourceId: unit.instanceId,
          unitLevel: uniqueLevel,
          target: { id: target.id, isBoss: target.isBoss, variantTier: target.variantTier },
          from: origin,
          to: targetPosition,
          critical,
          rarityTier,
          color: rarity.color,
          role: definition.role,
          ability: definition.uniqueAbility,
        });
        if (definition.role === "area" && definition.uniqueAbility !== "freeze") {
          for (const enemy of this.enemies) {
            if (enemy.hp <= 0) {
              continue;
            }
            const position = getPathPosition(enemy.progress);
            if (Math.hypot(position.x - targetPosition.x, position.y - targetPosition.y) <= 72) {
              const bossAdjustedDamage = Math.round(damage * (enemy.isBoss ? 1 + bossDamageBonus : 1));
              const areaDamage = applyArmor(Math.round(bossAdjustedDamage * 0.75), enemy.armor);
              enemy.lastHitByDefinitionId = definition.id;
              enemy.hp -= areaDamage;
              applyUniqueAbility(enemy, definition, areaDamage, uniqueLevel, uniqueSkillPowerBonus, this.rng);
              this.events.push({ type: "damage", attackId, targetId: enemy.id, at: position, amount: areaDamage, critical, rarityTier });
            }
          }
        } else {
          const bossAdjustedDamage = Math.round(damage * (target.isBoss ? 1 + bossDamageBonus : 1));
          const reducedDamage = applyArmor(bossAdjustedDamage, target.armor);
          target.lastHitByDefinitionId = definition.id;
          target.hp -= reducedDamage;
          applyUniqueAbility(target, definition, reducedDamage, uniqueLevel, uniqueSkillPowerBonus, this.rng);
          this.events.push({ type: "damage", attackId, targetId: target.id, at: targetPosition, amount: reducedDamage, critical, rarityTier });
        }
      }
    });

    this.collectDefeatedEnemies();
  }

  private findTargets(unit: { x: number; y: number }, range: number, count: number): EnemyState[] {
    const origin = { x: unit.x, y: unit.y };
    return this.enemies
      .filter((enemy) => {
        if (enemy.hp <= 0) {
          return false;
        }
        const position = getPathPosition(enemy.progress);
        return Math.hypot(position.x - origin.x, position.y - origin.y) <= range;
      })
      .sort((a, b) => b.progress - a.progress)
      .slice(0, count);
  }

  private collectDefeatedEnemies(): void {
    for (let index = this.enemies.length - 1; index >= 0; index -= 1) {
      const enemy = this.enemies[index]!;
      if (enemy.hp > 0) {
        continue;
      }

      const position = getPathPosition(enemy.progress);
      this.enemies.splice(index, 1);
      const goldBonus = 1 + getSkillEffectTotal(this.meta, "goldBonus");
      const goldReward = rollKillGoldReward(Math.round(enemy.rewardGold * goldBonus), this.rng);
      this.state = {
        ...this.state,
        gold: this.state.gold + goldReward.amount,
        defeatedEnemies: this.state.defeatedEnemies + 1,
      };
      this.events.push({ type: "goldReward", at: position, amount: goldReward.amount, tier: goldReward.tier });

      if (enemy.lastHitByDefinitionId) {
        const killer = getUnitDefinition(enemy.lastHitByDefinitionId);
        if (isUniqueUnit(killer)) {
          const experienceAmount = Math.max(
            1,
            Math.round(getEnemyExperienceReward(enemy) * (1 + getSkillEffectTotal(this.meta, "uniqueExperienceBonus"))),
          );
          const result = grantUniqueUnitExperience(this.meta, killer.id, experienceAmount);
          this.meta = result.meta;
          this.events.push({
            type: "unitExperience",
            at: position,
            definitionId: killer.id,
            amount: experienceAmount,
            level: result.level,
            experience: result.experience,
            experienceToNext: result.experienceToNext,
            levelsGained: result.levelsGained,
          });
        }
      }

      const jackpotChance = this.getJackpotChance();
      if (this.rng.next() < jackpotChance) {
        const reward = rollJackpotReward(this.rng);
        this.state = resolveJackpotReward(this.state, reward);
        this.jackpotMisses = 0;
        this.events.push({ type: "jackpot", reward, text: describeJackpot(reward) });
      } else {
        this.jackpotMisses += 1;
      }
    }
  }

  private tickBuffs(deltaMs: number): void {
    const activeBuffs = this.state.activeBuffs
      .map((buff) => ({ ...buff, remainingMs: buff.remainingMs - deltaMs }))
      .filter((buff) => buff.remainingMs > 0);
    if (activeBuffs.length !== this.state.activeBuffs.length) {
      this.state = { ...this.state, activeBuffs };
    } else {
      this.state.activeBuffs = activeBuffs;
    }

    for (const unit of this.state.board) {
      if ((unit.berserkRemainingMs ?? 0) > 0) {
        unit.berserkRemainingMs = Math.max(0, unit.berserkRemainingMs! - deltaMs);
      }
    }
  }

  private tickEnemyEffects(deltaMs: number): void {
    for (const enemy of this.enemies) {
      const nextEffects: EnemyStatusEffect[] = [];
      for (const effect of enemy.effects) {
        const nextEffect = { ...effect, remainingMs: effect.remainingMs - deltaMs };
        if (nextEffect.kind === "poison") {
          nextEffect.tickMs = (nextEffect.tickMs ?? POISON_TICK_MS) - deltaMs;
          while ((nextEffect.tickMs ?? 0) <= 0 && nextEffect.remainingMs > 0) {
            const poisonDamage = Math.max(1, Math.round(nextEffect.magnitude));
            if (nextEffect.sourceDefinitionId) {
              enemy.lastHitByDefinitionId = nextEffect.sourceDefinitionId;
            }
            enemy.hp -= poisonDamage;
            this.events.push({
              type: "damage",
              at: getPathPosition(enemy.progress),
              amount: poisonDamage,
              critical: false,
              rarityTier: getRarityIndex("mythic"),
            });
            nextEffect.tickMs = (nextEffect.tickMs ?? 0) + POISON_TICK_MS;
          }
        }
        if (nextEffect.remainingMs > 0) {
          nextEffects.push(nextEffect);
        }
      }
      enemy.effects = nextEffects;
    }

    this.collectDefeatedEnemies();
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
    if (!this.currentWaveActive || this.remainingSpawns > 0 || this.enemies.length > 0 || this.state.waveTimeRemainingMs > 0) {
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
    const damageReduction = Math.min(0.8, getSkillEffectTotal(this.meta, "leakDamageReduction"));
    const survivorDamage = rawSurvivorDamage > 0 ? Math.max(1, Math.ceil(rawSurvivorDamage * (1 - damageReduction))) : 0;
    this.enemies.splice(0);
    this.remainingSpawns = 0;
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
    const isBoss = completedWave % 5 === 0;
    const isTrueBoss = completedWave % 10 === 0;
    const growthShardsAwarded = isTrueBoss ? 6 : isBoss ? 3 : 1;
    const growthShardsEarned = this.state.growthShardsEarned + growthShardsAwarded;
    this.currentWaveActive = false;
    this.state = { ...this.state, waveTimeRemainingMs: 0, growthShardsEarned };
    this.events.push({ type: "waveComplete", wave: completedWave, growthShardsAwarded });

    if (completedWave >= MAX_WAVES) {
      this.endRun("won");
      return;
    }

    this.nextWaveDelayMs = NEXT_WAVE_DELAY_MS;
    this.pendingReward = completedWave % 3 === 0;
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

  private findBulkMerge(): MergePrompt | null {
    const slotsByDefinition = new Map<string, number[]>();
    this.state.board.forEach((unit, index) => {
      const slots = slotsByDefinition.get(unit.definitionId) ?? [];
      slots.push(index);
      slotsByDefinition.set(unit.definitionId, slots);
    });

    for (const [definitionId, slots] of slotsByDefinition) {
      if (slots.length < 3) {
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

  private getBuffMultiplier(stat: "attack" | "attackSpeed"): number {
    return this.state.activeBuffs
      .filter((buff) => buff.stat === stat)
      .reduce((total, buff) => total * buff.multiplier, 1);
  }

  private rollSummonUnit(kind: SummonKind): { unit: UnitDefinition; pityActivated: boolean } {
    let unit =
      kind === "advanced"
        ? rollAdvancedUniqueUnit(this.rng, getSkillEffectTotal(this.meta, "uniqueSummonBonus"))
        : null;
    let rarity: RarityId = unit?.rarity ?? pickRarity(this.rng, kind);
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
      const candidates = getUnitsByRarity(rarity).filter((candidate) => kind !== "advanced" || !isUniqueUnit(candidate));
      unit = this.rng.pick(candidates);
    }
    return { unit, pityActivated };
  }

  private getJackpotChance(): number {
    const skillBonus = getSkillEffectTotal(this.meta, "jackpotChance");
    const pityBonus = Math.min(JACKPOT_PITY_MAX_BONUS, this.jackpotMisses * JACKPOT_PITY_STEP);
    return Math.min(0.16, BASE_JACKPOT_CHANCE + skillBonus + pityBonus);
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
    this.remainingSpawns = 0;
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

function describeJackpot(reward: JackpotReward): string {
  if (reward.type === "gold") {
    return `잭팟! 골드 +${reward.amount}`;
  }
  if (reward.type === "freeSummon") {
    return "잭팟! 무료 소환 +1";
  }
  return reward.stat === "attack" ? "잭팟! 공격력 버프" : "잭팟! 공격속도 버프";
}

function scaleEnemyReward(baseReward: number): number {
  return Math.max(1, Math.floor(baseReward * ENEMY_GOLD_REWARD_SCALE));
}

interface EnemyVariantDefinition {
  id: EnemyVariantId;
  label: string;
  tint: number;
  tier: number;
  hpMultiplier: number;
  armorMultiplier: number;
  speedMultiplier: number;
  rewardMultiplier: number;
}

interface TrueBossDefinition {
  id: TrueBossId;
  label: string;
  variantId: EnemyVariantId;
  tint: number;
  tier: number;
  hpMultiplier: number;
  armorMultiplier: number;
  speedMultiplier: number;
  rewardMultiplier: number;
}

function getTrueBossDefinition(id: TrueBossId): TrueBossDefinition {
  const bosses: Record<TrueBossId, TrueBossDefinition> = {
    "orc-emperor": {
      id,
      label: "오크 황제",
      variantId: "warlord",
      tint: 0x86efac,
      tier: 7,
      hpMultiplier: 1.25,
      armorMultiplier: 1.2,
      speedMultiplier: 1.04,
      rewardMultiplier: 1.5,
    },
    "ogre-king": {
      id,
      label: "오우거 대왕",
      variantId: "warlord",
      tint: 0xfbbf24,
      tier: 8,
      hpMultiplier: 1.4,
      armorMultiplier: 1.35,
      speedMultiplier: 0.98,
      rewardMultiplier: 1.7,
    },
    "ancient-dragon": {
      id,
      label: "고대 드래곤",
      variantId: "redguard",
      tint: 0xef4444,
      tier: 9,
      hpMultiplier: 1.62,
      armorMultiplier: 1.48,
      speedMultiplier: 1.08,
      rewardMultiplier: 2,
    },
    "undead-demon-king": {
      id,
      label: "언데드 마왕",
      variantId: "blackguard",
      tint: 0xc084fc,
      tier: 10,
      hpMultiplier: 1.85,
      armorMultiplier: 1.62,
      speedMultiplier: 1.02,
      rewardMultiplier: 2.25,
    },
  };
  return bosses[id];
}

function getEnemyVariant(waveNumber: number, isBoss: boolean, sequence: number): EnemyVariantDefinition {
  if (isBoss) {
    const bossTier = Math.min(5, Math.floor((waveNumber - 5) / 5));
    const bossVariants: EnemyVariantDefinition[] = [
      { id: "blade", label: "오우거 족장", tint: 0xffffff, tier: 1, hpMultiplier: 1, armorMultiplier: 1, speedMultiplier: 1, rewardMultiplier: 1 },
      {
        id: "blackguard",
        label: "검은 오우거",
        tint: 0x5f6670,
        tier: 2,
        hpMultiplier: 1.18,
        armorMultiplier: 1.15,
        speedMultiplier: 0.98,
        rewardMultiplier: 1.15,
      },
      {
        id: "redguard",
        label: "붉은 오우거",
        tint: 0xd4543f,
        tier: 3,
        hpMultiplier: 1.35,
        armorMultiplier: 1.25,
        speedMultiplier: 1.06,
        rewardMultiplier: 1.25,
      },
      {
        id: "shaman",
        label: "오우거 주술군주",
        tint: 0x8b5cf6,
        tier: 4,
        hpMultiplier: 1.52,
        armorMultiplier: 1.35,
        speedMultiplier: 1.04,
        rewardMultiplier: 1.35,
      },
      {
        id: "blackguard",
        label: "흑철 오우거",
        tint: 0x2f3745,
        tier: 5,
        hpMultiplier: 1.72,
        armorMultiplier: 1.55,
        speedMultiplier: 1.08,
        rewardMultiplier: 1.48,
      },
      {
        id: "warlord",
        label: "피의 오우거 군주",
        tint: 0xe11d48,
        tier: 6,
        hpMultiplier: 2.05,
        armorMultiplier: 1.8,
        speedMultiplier: 1.12,
        rewardMultiplier: 1.65,
      },
    ];
    return bossVariants[bossTier]!;
  }

  if (waveNumber < 3) {
    return { id: "grunt", label: "하급", tint: 0xffffff, tier: 0, hpMultiplier: 1, armorMultiplier: 1, speedMultiplier: 1, rewardMultiplier: 1 };
  }

  const variants: EnemyVariantDefinition[] = [
    { id: "blade", label: "검병", tint: 0xf4d58d, tier: 1, hpMultiplier: 1.12, armorMultiplier: 1.08, speedMultiplier: 1.02, rewardMultiplier: 1.08 },
    { id: "shaman", label: "주술사", tint: 0x8b5cf6, tier: 2, hpMultiplier: 1.2, armorMultiplier: 0.92, speedMultiplier: 0.96, rewardMultiplier: 1.12 },
    { id: "blackguard", label: "검은 정예", tint: 0x4b5563, tier: 3, hpMultiplier: 1.35, armorMultiplier: 1.35, speedMultiplier: 0.98, rewardMultiplier: 1.22 },
    { id: "redguard", label: "붉은 돌격병", tint: 0xdc2626, tier: 4, hpMultiplier: 1.5, armorMultiplier: 1.15, speedMultiplier: 1.12, rewardMultiplier: 1.32 },
    { id: "warlord", label: "전쟁대장", tint: 0xb45309, tier: 5, hpMultiplier: 1.72, armorMultiplier: 1.42, speedMultiplier: 1.06, rewardMultiplier: 1.45 },
  ];

  if (waveNumber < 6) {
    return variants[0]!;
  }
  if (waveNumber < 10) {
    return variants[sequence % 3 === 0 ? 1 : 0]!;
  }
  if (waveNumber < 15) {
    return variants[sequence % 4 === 0 ? 2 : sequence % 3 === 0 ? 1 : 0]!;
  }
  if (waveNumber < 20) {
    return variants[sequence % 5 === 0 ? 3 : sequence % 3 === 0 ? 2 : 1]!;
  }
  if (waveNumber < 25) {
    return variants[sequence % 6 === 0 ? 4 : sequence % 2 === 0 ? 3 : 2]!;
  }
  return variants[sequence % 5 === 0 ? 4 : sequence % 2 === 0 ? 3 : 2]!;
}

function getWaveCleanupWindowMs(wave: WaveDefinition | null | undefined): number {
  if (wave?.isTrueBoss) {
    return TRUE_BOSS_WAVE_CLEANUP_WINDOW_MS;
  }
  return wave?.isBoss ? BOSS_WAVE_CLEANUP_WINDOW_MS : NORMAL_WAVE_CLEANUP_WINDOW_MS;
}

function getWaveArmor(waveNumber: number, isBoss: boolean): number {
  const tier = Math.floor((waveNumber - 1) / 5);
  const lateGameArmor = Math.max(0, waveNumber - 30) * 1.2;
  const normalArmor = Math.max(1, Math.floor(waveNumber * 0.8 + tier * 2 + lateGameArmor));
  return isBoss ? normalArmor * 5 : normalArmor;
}

function applyArmor(damage: number, armor: number): number {
  return Math.max(1, Math.round(damage * (100 / (100 + armor))));
}

function applyUniqueAbility(
  enemy: EnemyState,
  definition: UnitDefinition,
  dealtDamage: number,
  level: number,
  skillPowerBonus: number,
  rng: Rng,
): void {
  if (!definition.uniqueAbility) {
    return;
  }

  const stats = getUniqueAbilityStats(definition.uniqueAbility, level);
  if (stats.ability === "slow") {
    upsertEnemyEffect(enemy, { kind: "slow", remainingMs: stats.durationMs, magnitude: 1 - stats.slowPercent });
  }
  if (stats.ability === "poison") {
    upsertEnemyEffect(enemy, {
      kind: "poison",
      remainingMs: stats.durationMs,
      magnitude: Math.max(3, Math.round(dealtDamage * stats.damageRatio * (1 + skillPowerBonus))),
      tickMs: stats.tickMs,
      sourceDefinitionId: definition.id,
    });
  }
  if (stats.ability === "freeze" && rng.next() < stats.chance) {
    upsertEnemyEffect(enemy, { kind: "freeze", remainingMs: stats.durationMs, magnitude: 0 });
  }
}

function upsertEnemyEffect(enemy: EnemyState, effect: EnemyStatusEffect): void {
  const existing = enemy.effects.find((entry) => entry.kind === effect.kind);
  if (!existing) {
    enemy.effects.push(effect);
    return;
  }

  existing.remainingMs = Math.max(existing.remainingMs, effect.remainingMs);
  const shouldReplacePoisonSource = effect.kind === "poison" && effect.magnitude >= existing.magnitude;
  existing.magnitude = effect.kind === "slow" ? Math.min(existing.magnitude, effect.magnitude) : Math.max(existing.magnitude, effect.magnitude);
  if (shouldReplacePoisonSource && effect.sourceDefinitionId) {
    existing.sourceDefinitionId = effect.sourceDefinitionId;
  }
  if (effect.tickMs !== undefined) {
    existing.tickMs = Math.min(existing.tickMs ?? effect.tickMs, effect.tickMs);
  }
}

export function getEnemyExperienceReward(enemy: Pick<EnemyState, "wave" | "variantTier" | "isBoss" | "trueBossId">): number {
  const baseExperience = 4 + Math.floor((enemy.wave - 1) / 5) + enemy.variantTier * 2;
  return baseExperience * (enemy.trueBossId ? 12 : enemy.isBoss ? 5 : 1);
}

function getEnemyMovementMultiplier(enemy: EnemyState): number {
  if (enemy.effects.some((effect) => effect.kind === "freeze")) {
    return 0;
  }

  return enemy.effects
    .filter((effect) => effect.kind === "slow")
    .reduce((multiplier, effect) => Math.min(multiplier, effect.magnitude), 1);
}

function canMergeDefinition(definitionId: string): boolean {
  const definition = getUnitDefinition(definitionId);
  return getRarityIndex(definition.rarity) < getRarityIndex("immortal");
}

function compareUnitsForArrangement(
  left: RunState["board"][number],
  right: RunState["board"][number],
): number {
  const leftDefinition = getUnitDefinition(left.definitionId);
  const rightDefinition = getUnitDefinition(right.definitionId);
  const uniqueOrder = Number(Boolean(rightDefinition.uniqueAbility)) - Number(Boolean(leftDefinition.uniqueAbility));
  if (uniqueOrder !== 0) {
    return uniqueOrder;
  }

  const rarityOrder = getRarityIndex(rightDefinition.rarity) - getRarityIndex(leftDefinition.rarity);
  if (rarityOrder !== 0) {
    return rarityOrder;
  }
  return left.definitionId.localeCompare(right.definitionId);
}

function createTowerEdgeCandidates(count: number): Array<{ x: number; y: number }> {
  const left = TOWER_FIELD.x + TOWER_RADIUS;
  const right = TOWER_FIELD.x + TOWER_FIELD.width - TOWER_RADIUS;
  const top = TOWER_FIELD.y + TOWER_RADIUS;
  const bottom = TOWER_FIELD.y + TOWER_FIELD.height - TOWER_RADIUS;
  const width = right - left;
  const height = bottom - top;
  const perimeter = (width + height) * 2;
  const candidates: Array<{ x: number; y: number }> = [{ x: left + width / 2, y: top }];

  for (let index = 1; index < count; index += 1) {
    const distance = (index / count) * perimeter;
    if (distance <= width) {
      candidates.push({ x: left + distance, y: top });
    } else if (distance <= width + height) {
      candidates.push({ x: right, y: top + distance - width });
    } else if (distance <= width * 2 + height) {
      candidates.push({ x: right - (distance - width - height), y: bottom });
    } else {
      candidates.push({ x: left, y: bottom - (distance - width * 2 - height) });
    }
  }

  return candidates;
}
