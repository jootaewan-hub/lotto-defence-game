import { DIFFICULTIES } from "./waves";
import { getPathPosition } from "./geometry";
import { getSkillEffectTotal, resolveJackpotReward, rollJackpotReward, rollKillGoldReward } from "./systems";
import { getRarity, getRarityIndex } from "./rarities";
import { getUniqueAbilityStats } from "./uniqueAbilities";
import {
  getTowerType,
  getUniqueUnitLevel,
  getUnitDefinition,
  grantUniqueUnitExperience,
  isUniqueUnit,
} from "./units";
import { getEnemyVariant, getTrueBossDefinition } from "./enemyVariants";
import {
  applyArmor,
  applyUniqueAbility,
  describeJackpot,
  getEnemyExperienceReward,
  getEnemyMovementMultiplier,
  getWaveArmor,
  getWaveCleanupWindowMs,
  scaleEnemyReward,
} from "./combatMath";
import type { UpgradeStat } from "./upgrades";
import type { Rng } from "./rng";
import type { GameSimulation, SimulationEvent } from "./simulation";
import type {
  EnemyState,
  EnemyStatusEffect,
  MetaProgress,
  RunState,
  WaveDefinition,
} from "./types";

/** 전투 구간에서만 쓰이는 상수. simulation.ts에서 이동. */
const NORMAL_SPAWN_DENSITY = 4.8;
const BOSS_SPAWN_INTERVAL_MS = 7_200;
const POISON_TICK_MS = 500;

type TowerCombatStats = NonNullable<ReturnType<GameSimulation["getTowerCombatStats"]>>;
type DifficultyConfig = (typeof DIFFICULTIES)[RunState["difficulty"]];

/**
 * 전투 루프가 GameSimulation에서 필요로 하는 것만 명시한다.
 * GameSimulation이 구조적으로 이를 만족하므로 호출부는 spawnEnemies(this, deltaMs) 형태가 된다.
 */
export interface CombatContext {
  /** 재대입된다. */
  state: RunState;
  /** 재대입된다. */
  meta: MetaProgress;
  /** 배열 변형만 하며 참조는 고정이다. */
  readonly enemies: EnemyState[];
  /** 배열 변형만 하며 참조는 고정이다. */
  readonly events: SimulationEvent[];
  readonly waves: WaveDefinition[];
  readonly rng: Rng;
  readonly difficulty: DifficultyConfig;
  readonly currentWaveActive: boolean;
  readonly formationBonus: number;
  /** 전투 루프가 읽고 쓴다. 동일 객체를 가리키므로 쓰기 유실이 없다. */
  combatCounters: {
    enemySequence: number;
    attackSequence: number;
    remainingSpawns: number;
    spawnTimerMs: number;
    jackpotMisses: number;
  };
  bonus(stat: UpgradeStat): number;
  getBuffMultiplier(stat: "attack" | "attackSpeed"): number;
  randomInteger(min: number, max: number): number;
  getSuperAura(): number;
  getJackpotChance(): number;
  getTowerCombatStats(
    slot: number,
    shared?: { formation: number; aura: number },
  ): TowerCombatStats | null;
}

export function spawnEnemies(ctx: CombatContext, deltaMs: number): void {
  if (!ctx.currentWaveActive || ctx.combatCounters.remainingSpawns <= 0) {
    return;
  }

  const wave = ctx.waves[ctx.state.wave - 1]!;
  const cleanupWindowMs = getWaveCleanupWindowMs(wave);
  const spawnableDeltaMs = Math.min(deltaMs, Math.max(0, ctx.state.waveTimeRemainingMs - cleanupWindowMs));
  if (spawnableDeltaMs <= 0) {
    return;
  }

  ctx.combatCounters.spawnTimerMs -= spawnableDeltaMs;

  while (ctx.combatCounters.remainingSpawns > 0 && ctx.combatCounters.spawnTimerMs <= 0) {
    const baseHp = wave.isBoss ? 280 : 46;
    const sequence = ctx.combatCounters.enemySequence + 1;
    const variant = getEnemyVariant(wave.number, wave.isBoss, sequence);
    const namedBossId = wave.trueBossId ?? wave.bossId;
    const trueBoss = namedBossId ? getTrueBossDefinition(namedBossId) : null;
    const hpMultiplier = variant.hpMultiplier * (trueBoss?.hpMultiplier ?? 1);
    const armorMultiplier = variant.armorMultiplier * (trueBoss?.armorMultiplier ?? 1);
    const hp = Math.round(Math.round(baseHp * wave.healthMultiplier * hpMultiplier) * ctx.difficulty.statMultiplier);
    const armor = Math.round(Math.round(getWaveArmor(wave.number, wave.isBoss) * armorMultiplier) * ctx.difficulty.statMultiplier);
    // Double each spawn batch, including bosses, without changing wave timing.
    for (let copy = 0; copy < ctx.difficulty.spawnMultiplier; copy += 1) {
      ctx.enemies.push({
        id: `enemy-${ctx.combatCounters.enemySequence += 1}`,
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
    }

    ctx.combatCounters.remainingSpawns -= 1;
    ctx.combatCounters.spawnTimerMs += wave.isBoss ? BOSS_SPAWN_INTERVAL_MS : Math.max(180, Math.floor(wave.durationMs / (wave.enemyCount * NORMAL_SPAWN_DENSITY)));
  }
}

export function moveEnemies(ctx: CombatContext, deltaMs: number): void {
  for (const enemy of ctx.enemies) {
    enemy.progress += enemy.speed * getEnemyMovementMultiplier(enemy) * (deltaMs / 1000);
  }
}

export function attackEnemies(ctx: CombatContext, deltaMs: number): void {
  const supportCount = ctx.state.board.reduce((count, unit) => {
    return getUnitDefinition(unit.definitionId).role === "support" ? count + 1 : count;
  }, 0);
  const supportSpeedMultiplier = Math.min(1.25, 1 + supportCount * 0.025);
  const attackBuff = ctx.getBuffMultiplier("attack");
  const speedBuff =
    ctx.getBuffMultiplier("attackSpeed") *
    supportSpeedMultiplier *
    (1 + getSkillEffectTotal(ctx.meta, "attackSpeedBonus"));
  const criticalChanceBonus = getSkillEffectTotal(ctx.meta, "criticalChanceBonus");
  const uniqueAttackBonus = getSkillEffectTotal(ctx.meta, "uniqueAttackBonus");
  const uniqueSkillPowerBonus = getSkillEffectTotal(ctx.meta, "uniqueSkillPowerBonus") + ctx.bonus("skillPower");
  const bossDamageBonus = getSkillEffectTotal(ctx.meta, "bossDamageBonus") + ctx.bonus("bossDamage");

  const shared={formation:ctx.formationBonus,aura:ctx.getSuperAura()};
  ctx.state.board.forEach((unit, unitIndex) => {
    const definition = getUnitDefinition(unit.definitionId);
    const uniqueLevel = getUniqueUnitLevel(ctx.meta, definition.id);
    const stats = ctx.getTowerCombatStats(unitIndex,shared)!;
    if (definition.ultimate && ctx.currentWaveActive && (unit.ultimateCooldownMs ?? 0) <= 0) {
      const targets = ctx.enemies.filter(e => e.hp > 0);
      if (targets.length) {
        unit.ultimateCooldownMs = 12000;
        for (const target of targets) {
          const amount = Math.round(stats.attack * 6 * attackBuff * (1 + uniqueSkillPowerBonus) * (target.isBoss ? 2 * (1 + bossDamageBonus) : 1));
          target.hp -= amount;
          target.lastHitByDefinitionId = definition.id;
          ctx.events.push({ type: 'damage', targetId: target.id, at: getPathPosition(target.progress), amount, critical: false, rarityTier: 9 });
        }
        ctx.events.push({ type: 'superSkill', skill: 'heaven-split', sourceId: unit.instanceId, at: { x: unit.x, y: unit.y }, targets: targets.map(e => getPathPosition(e.progress)) });
      }
    }
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
    const superType=definition.superUnique?getTowerType(definition):undefined;
    const targets = superType==='mage'?ctx.enemies.filter(e=>e.hp>0):findTargets(ctx, unit, stats.range, superType==='archer'||superType==='warrior'?5:multishotStats?.targetCount ?? 1);
    unit.cooldownMs = stats.attackSpeed;
    if (targets.length === 0) {
      return;
    }

    const critical = ctx.rng.next() < Math.min(0.85, stats.criticalChance + criticalChanceBonus);
    const damage = Math.round(
      stats.attack * (superType && superType !== 'priest' ? (definition.ultimate ? 0.5 : 0.25) : 1) *
        attackBuff *
        (definition.uniqueAbility ? 1 + uniqueAttackBonus : 1) *
        (critical ? 1.75 + ctx.bonus("criticalDamage") : 1) *
        (multishotStats ? multishotStats.damageMultiplier * (1 + uniqueSkillPowerBonus) : 1) *
        (berserkActive ? berserkStats!.damageMultiplier * (1 + uniqueSkillPowerBonus) : 1),
    );
    const origin = { x: unit.x, y: unit.y };
    const weapon=unit.items?.find(i=>i.kind==='weapon'),ring=unit.items?.find(i=>i.kind==='ring');
    if(superType==='mage')ctx.events.push({type:'superSkill',skill:'inferno',sourceId:unit.instanceId,at:origin,targets:targets.map(e=>getPathPosition(e.progress))});

    if (berserkStats) {
      unit.berserkRemainingMs = berserkStats.durationMs;
    }

    for (const target of targets) {
      const targetPosition = getPathPosition(target.progress);
      const attackId = `attack-${++ctx.combatCounters.attackSequence}`;
      ctx.events.push({
        type: "attack",
        attackId,
        sourceId: unit.instanceId,
        superType,
        unitLevel: uniqueLevel,
        target: { id: target.id, isBoss: target.isBoss, variantTier: target.variantTier },
        from: origin,
        to: targetPosition,
        critical,
        rarityTier,
        color: rarity.color,
        role: definition.role,
        ability: definition.uniqueAbility ?? (getTowerType(definition) === "archer" ? "multishot" : undefined),
      });
      if (!definition.superUnique && definition.role === "area" && definition.uniqueAbility !== "freeze") {
        for (const enemy of ctx.enemies) {
          if (enemy.hp <= 0) {
            continue;
          }
          const position = getPathPosition(enemy.progress);
          if (Math.hypot(position.x - targetPosition.x, position.y - targetPosition.y) <= 72 * (1 + ctx.bonus("splashRadius"))) {
            const bossAdjustedDamage = Math.round(damage * (enemy.isBoss ? 1 + bossDamageBonus : 1));
            const areaDamage = applyArmor(Math.round(bossAdjustedDamage * 0.75), enemy.armor * (1 - ctx.bonus("armorPierce")));
            enemy.lastHitByDefinitionId = definition.id;
            enemy.hp -= areaDamage;
            applyUniqueAbility(enemy, definition, areaDamage, uniqueLevel, uniqueSkillPowerBonus, ctx.rng);
            ctx.events.push({ type: "damage", attackId, targetId: enemy.id, at: position, amount: areaDamage, critical, rarityTier });
          }
        }
      } else {
        const bossAdjustedDamage = Math.round(damage * (target.isBoss ? (1 + bossDamageBonus) * (superType==='archer'||superType==='warrior'?5:1) : 1));
        const magic=weapon&&weapon.level>=7?ctx.randomInteger(500,50000):0;
        if(magic)ctx.events.push({type:'superSkill',skill:'dragon-magic',sourceId:unit.instanceId,at:targetPosition});
        const reducedDamage = applyArmor(bossAdjustedDamage, target.armor * (1 - ctx.bonus("armorPierce"))) + magic;
        target.lastHitByDefinitionId = definition.id;
        target.hp -= reducedDamage;
        applyUniqueAbility(target, definition, reducedDamage, uniqueLevel, uniqueSkillPowerBonus, ctx.rng);
        ctx.events.push({ type: "damage", attackId, targetId: target.id, at: targetPosition, amount: reducedDamage, critical, rarityTier });
      }
    }
    if(ring&&ctx.rng.next()<0.1){
      const alive=ctx.enemies.filter(e=>e.hp>0);
      for(const enemy of alive){const amount=50+ring.bonus;enemy.hp-=amount;enemy.lastHitByDefinitionId=definition.id;ctx.events.push({type:'damage',targetId:enemy.id,at:getPathPosition(enemy.progress),amount,critical:false,rarityTier});}
      ctx.events.push({type:'superSkill',skill:'dragon-ring',sourceId:unit.instanceId,at:origin,targets:alive.map(e=>getPathPosition(e.progress))});
    }
  });

  collectDefeatedEnemies(ctx);
}

export function findTargets(ctx: CombatContext, unit: { x: number; y: number }, range: number, count: number): EnemyState[] {
  const origin = { x: unit.x, y: unit.y };
  return ctx.enemies
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

export function collectDefeatedEnemies(ctx: CombatContext): void {
  for (let index = ctx.enemies.length - 1; index >= 0; index -= 1) {
    const enemy = ctx.enemies[index]!;
    if (enemy.hp > 0) {
      continue;
    }

    const position = getPathPosition(enemy.progress);
    ctx.enemies.splice(index, 1);
    const goldBonus = 1 + getSkillEffectTotal(ctx.meta, "goldBonus") + ctx.bonus("goldBonus");
    const goldReward = rollKillGoldReward(Math.round(enemy.rewardGold * goldBonus), ctx.rng);
    ctx.state = {
      ...ctx.state,
      gold: ctx.state.gold + goldReward.amount,
      defeatedEnemies: ctx.state.defeatedEnemies + 1,
    };
    ctx.events.push({ type: "goldReward", at: position, amount: goldReward.amount, tier: goldReward.tier });

    if (enemy.lastHitByDefinitionId) {
      const killer = getUnitDefinition(enemy.lastHitByDefinitionId);
      if (isUniqueUnit(killer)) {
        const experienceAmount = Math.max(
          1,
          Math.round(getEnemyExperienceReward(enemy) * (1 + getSkillEffectTotal(ctx.meta, "uniqueExperienceBonus") + ctx.bonus("experience"))),
        );
        const result = grantUniqueUnitExperience(ctx.meta, killer.id, experienceAmount);
        ctx.meta = result.meta;
        ctx.events.push({
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

    const jackpotChance = ctx.getJackpotChance();
    if (ctx.rng.next() < jackpotChance) {
      const reward = rollJackpotReward(ctx.rng);
      ctx.state = resolveJackpotReward(ctx.state, reward);
      ctx.combatCounters.jackpotMisses = 0;
      ctx.events.push({ type: "jackpot", reward, text: describeJackpot(reward) });
    } else {
      ctx.combatCounters.jackpotMisses += 1;
    }
  }
}

export function tickBuffs(ctx: CombatContext, deltaMs: number): void {
  const activeBuffs = ctx.state.activeBuffs
    .map((buff) => ({ ...buff, remainingMs: buff.remainingMs - deltaMs }))
    .filter((buff) => buff.remainingMs > 0);
  if (activeBuffs.length !== ctx.state.activeBuffs.length) {
    ctx.state = { ...ctx.state, activeBuffs };
  } else {
    ctx.state.activeBuffs = activeBuffs;
  }

  for (const unit of ctx.state.board) {
    if ((unit.berserkRemainingMs ?? 0) > 0) {
      unit.berserkRemainingMs = Math.max(0, unit.berserkRemainingMs! - deltaMs);
    }
  }
}

export function tickEnemyEffects(ctx: CombatContext, deltaMs: number): void {
  for (const enemy of ctx.enemies) {
    const nextEffects: EnemyStatusEffect[] = [];
    for (const effect of enemy.effects) {
      const nextEffect = { ...effect, remainingMs: effect.remainingMs - deltaMs };
      if (nextEffect.kind === "poison") {
        nextEffect.tickMs = (nextEffect.tickMs ?? POISON_TICK_MS) - deltaMs;
        while ((nextEffect.tickMs ?? 0) <= 0 && nextEffect.remainingMs > 0) {
          const poisonDamage = Math.max(1, Math.round(nextEffect.magnitude * (1 + ctx.bonus("poisonDamage"))));
          if (nextEffect.sourceDefinitionId) {
            enemy.lastHitByDefinitionId = nextEffect.sourceDefinitionId;
          }
          enemy.hp -= poisonDamage;
          ctx.events.push({
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

  collectDefeatedEnemies(ctx);
}
