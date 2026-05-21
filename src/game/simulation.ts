import { getBoardSlotCenter, getPathPosition } from "./geometry";
import {
  buildWaves,
  createInitialRunState,
  createMergeCandidates,
  createRandomRng,
  createSummonSampler,
  getSkillEffectTotal,
  resolveJackpotReward,
  rollJackpotReward,
} from "./systems";
import type { Rng } from "./rng";
import type { EnemyState, JackpotReward, MetaProgress, RunState, UnitDefinition } from "./types";
import { getRarity, getRarityIndex } from "./rarities";
import { getUnitDefinition } from "./units";

export interface MergePrompt {
  sourceSlots: number[];
  candidates: UnitDefinition[];
}

export type SimulationEvent =
  | { type: "message"; text: string }
  | { type: "jackpot"; reward: JackpotReward; text: string }
  | { type: "attack"; from: { x: number; y: number }; to: { x: number; y: number }; critical: boolean }
  | { type: "damage"; at: { x: number; y: number }; amount: number; critical: boolean }
  | { type: "waveComplete"; wave: number }
  | { type: "runEnded"; status: "won" | "lost" };

const BASE_SUMMON_COST = 28;
const CENTER_SLOTS = [5, 6, 9, 10, 1, 2, 4, 7, 8, 11, 13, 14, 0, 3, 12, 15];

export class GameSimulation {
  readonly waves = buildWaves();
  readonly enemies: EnemyState[] = [];

  state: RunState;
  meta: MetaProgress;
  pendingMerge: MergePrompt | null = null;

  private readonly rng: Rng;
  private readonly summonSampler: () => UnitDefinition;
  private readonly events: SimulationEvent[] = [];
  private enemySequence = 0;
  private unitSequence = 0;
  private remainingSpawns = 0;
  private spawnTimerMs = 0;
  private currentWaveActive = false;

  constructor(meta: MetaProgress, rng: Rng = createRandomRng()) {
    this.meta = meta;
    this.rng = rng;
    this.summonSampler = createSummonSampler(rng);
    this.state = createInitialRunState(meta);
  }

  get summonCost(): number {
    const discount = getSkillEffectTotal(this.meta, "summonDiscount");
    return Math.max(10, Math.round(BASE_SUMMON_COST * (1 - discount)));
  }

  get canStartWave(): boolean {
    return this.state.status !== "lost" && this.state.status !== "won" && !this.currentWaveActive;
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
    this.remainingSpawns = wave.enemyCount;
    this.spawnTimerMs = 0;
    this.currentWaveActive = true;
    this.events.push({ type: "message", text: wave.isBoss ? `보스 ${nextWave} 웨이브!` : `${nextWave} 웨이브 시작` });
  }

  update(deltaMs: number): void {
    if (this.state.status === "lost" || this.state.status === "won") {
      return;
    }

    this.tickBuffs(deltaMs);
    this.spawnEnemies(deltaMs);
    this.moveEnemies(deltaMs);
    this.attackEnemies(deltaMs);
    this.tickWaveTimer(deltaMs);
    this.checkWaveCompletion();
  }

  summonToFirstEmpty(): boolean {
    const emptyIndex = CENTER_SLOTS.find((slot) => this.state.board[slot] === null) ?? -1;
    if (emptyIndex < 0) {
      this.events.push({ type: "message", text: "보드가 가득 찼어요." });
      return false;
    }

    if (this.state.freeSummons > 0) {
      this.state = { ...this.state, freeSummons: this.state.freeSummons - 1 };
    } else if (this.state.gold >= this.summonCost) {
      this.state = { ...this.state, gold: this.state.gold - this.summonCost };
    } else {
      this.events.push({ type: "message", text: "골드가 부족해요." });
      return false;
    }

    const unit = this.summonSampler();
    const board = [...this.state.board];
    board[emptyIndex] = {
      instanceId: `unit-${this.unitSequence += 1}`,
      definitionId: unit.id,
      cooldownMs: 250,
    };
    this.state = { ...this.state, board };
    this.events.push({ type: "message", text: `${getRarity(unit.rarity).label} ${unit.name} 소환!` });
    return true;
  }

  moveUnit(from: number, to: number): boolean {
    if (from === to || !this.state.board[from]) {
      return false;
    }

    const board = [...this.state.board];
    const target = board[to];
    board[to] = board[from];
    board[from] = target;
    this.state = { ...this.state, board };
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
    board[slot] = null;
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
        sourceSlots: matchingSlots.slice(0, 3),
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

    const [targetSlot, ...consumedSlots] = this.pendingMerge.sourceSlots;
    const board = [...this.state.board];
    for (const slot of consumedSlots) {
      board[slot] = null;
    }
    board[targetSlot!] = {
      instanceId: `unit-${this.unitSequence += 1}`,
      definitionId: candidate.id,
      cooldownMs: 150,
    };

    this.state = { ...this.state, board };
    this.pendingMerge = null;
    this.events.push({ type: "message", text: `${candidate.name} 합성 성공!` });
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
    this.spawnTimerMs -= deltaMs;

    while (this.remainingSpawns > 0 && this.spawnTimerMs <= 0) {
      const baseHp = wave.isBoss ? 280 : 46;
      const hp = Math.round(baseHp * wave.healthMultiplier);
      this.enemies.push({
        id: `enemy-${this.enemySequence += 1}`,
        wave: wave.number,
        hp,
        maxHp: hp,
        progress: this.rng.next(),
        speed: (wave.isBoss ? 0.07 : 0.12) * wave.speedMultiplier,
        rewardGold: wave.isBoss ? 75 + wave.number * 3 : 8 + Math.floor(wave.number / 2),
        isBoss: wave.isBoss,
      });

      this.remainingSpawns -= 1;
      this.spawnTimerMs += wave.isBoss ? 900 : Math.max(220, Math.floor(wave.durationMs / wave.enemyCount));
    }
  }

  private moveEnemies(deltaMs: number): void {
    for (const enemy of this.enemies) {
      enemy.progress += enemy.speed * (deltaMs / 1000);
    }
  }

  private attackEnemies(deltaMs: number): void {
    const supportCount = this.state.board.reduce((count, unit) => {
      return unit && getUnitDefinition(unit.definitionId).role === "support" ? count + 1 : count;
    }, 0);
    const supportSpeedMultiplier = Math.min(1.25, 1 + supportCount * 0.025);
    const attackBonus = 1 + getSkillEffectTotal(this.meta, "attackBonus");
    const attackBuff = this.getBuffMultiplier("attack");
    const speedBuff = this.getBuffMultiplier("attackSpeed") * supportSpeedMultiplier;

    this.state.board.forEach((unit, slot) => {
      if (!unit) {
        return;
      }
      unit.cooldownMs -= deltaMs * speedBuff;
      if (unit.cooldownMs > 0) {
        return;
      }

      const definition = getUnitDefinition(unit.definitionId);
      const target = this.findTarget(slot, definition.range);
      unit.cooldownMs = definition.attackSpeed;
      if (!target) {
        return;
      }

      const critical = this.rng.next() < definition.criticalChance;
      const damage = Math.round(definition.attack * attackBonus * attackBuff * (critical ? 1.75 : 1));
      const origin = getBoardSlotCenter(slot);
      const targetPosition = getPathPosition(target.progress);
      this.events.push({ type: "attack", from: origin, to: targetPosition, critical });
      if (definition.role === "area") {
        for (const enemy of this.enemies) {
          const position = getPathPosition(enemy.progress);
          if (Math.hypot(position.x - targetPosition.x, position.y - targetPosition.y) <= 72) {
            const areaDamage = Math.round(damage * 0.75);
            enemy.hp -= areaDamage;
            this.events.push({ type: "damage", at: position, amount: areaDamage, critical });
          }
        }
      } else {
        target.hp -= damage;
        this.events.push({ type: "damage", at: targetPosition, amount: damage, critical });
      }
    });

    this.collectDefeatedEnemies();
  }

  private findTarget(slot: number, range: number): EnemyState | null {
    const origin = getBoardSlotCenter(slot);
    return (
      this.enemies
        .filter((enemy) => {
          const position = getPathPosition(enemy.progress);
          return Math.hypot(position.x - origin.x, position.y - origin.y) <= range;
        })
        .sort((a, b) => b.progress - a.progress)[0] ?? null
    );
  }

  private collectDefeatedEnemies(): void {
    for (let index = this.enemies.length - 1; index >= 0; index -= 1) {
      const enemy = this.enemies[index]!;
      if (enemy.hp > 0) {
        continue;
      }

      this.enemies.splice(index, 1);
      const goldBonus = 1 + getSkillEffectTotal(this.meta, "goldBonus");
      const gold = Math.round(enemy.rewardGold * goldBonus);
      this.state = {
        ...this.state,
        gold: this.state.gold + gold,
        defeatedEnemies: this.state.defeatedEnemies + 1,
      };

      const jackpotChance = 0.05 + getSkillEffectTotal(this.meta, "jackpotChance");
      if (this.rng.next() < jackpotChance) {
        const reward = rollJackpotReward(this.rng);
        this.state = resolveJackpotReward(this.state, reward);
        this.events.push({ type: "jackpot", reward, text: describeJackpot(reward) });
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

    const survivorDamage = this.enemies.reduce((total, enemy) => total + (enemy.isBoss ? 5 : 1), 0);
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
    const growthShardsEarned = this.state.growthShardsEarned + (isBoss ? 1 : 0);
    this.currentWaveActive = false;
    this.state = { ...this.state, waveTimeRemainingMs: 0, growthShardsEarned };
    this.events.push({ type: "waveComplete", wave: completedWave });

    if (completedWave >= 30) {
      this.endRun("won");
    }
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

  private getBuffMultiplier(stat: "attack" | "attackSpeed"): number {
    return this.state.activeBuffs
      .filter((buff) => buff.stat === stat)
      .reduce((total, buff) => total * buff.multiplier, 1);
  }

  private endRun(status: "won" | "lost"): void {
    if (this.state.status === status) {
      return;
    }
    this.currentWaveActive = false;
    this.remainingSpawns = 0;
    this.state = { ...this.state, status };
    this.completeRunRewards();
    this.events.push({ type: "runEnded", status });
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
