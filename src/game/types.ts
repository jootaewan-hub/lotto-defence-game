export type RarityId =
  | "common"
  | "advanced"
  | "rare"
  | "epic"
  | "hero"
  | "legendary"
  | "mythic"
  | "transcendent"
  | "immortal"
  | "unique";

export type UnitRole = "single" | "area" | "support";
export type TowerType = 'archer' | 'warrior' | 'mage' | 'priest';
export type DragonItemKind = 'weapon' | 'ring' | 'boots';
export interface DragonItem { kind: DragonItemKind; level: number; bonus: number; waveSpeedPercent?: number }

export type UnitAbilityKind = "multishot" | "slow" | "poison" | "freeze" | "berserk";

export type EnemyVariantId = "grunt" | "blade" | "shaman" | "blackguard" | "redguard" | "warlord";

export type TrueBossId = "orc-emperor" | "ogre-king" | "ancient-dragon" | "undead-demon-king" | "eclipse-sovereign";

export type BuffStat = "attack" | "attackSpeed";

export interface Rarity {
  id: RarityId;
  label: string;
  summonChance: number;
  color: string;
  powerMultiplier: number;
}

export interface UnitDefinition {
  ultimate?: boolean;
  towerType?: TowerType;
  superUnique?: boolean;
  id: string;
  name: string;
  rarity: RarityId;
  role: UnitRole;
  uniqueAbility?: UnitAbilityKind;
  attackType: string;
  attack: number;
  attackSpeed: number;
  criticalChance: number;
  range: number;
  skill: string;
}

export interface WaveDefinition {
  number: number;
  /** The wave whose curve health and armor read, which continues across difficulties. */
  scalingWave: number;
  enemyCount: number;
  healthMultiplier: number;
  speedMultiplier: number;
  durationMs: number;
  isBoss: boolean;
  isTrueBoss: boolean;
  /** Only the last wave. Final bosses are also true bosses, so existing boss handling still applies. */
  isFinalBoss: boolean;
  bossId?: TrueBossId;
  trueBossId?: TrueBossId;
}

export interface ActiveBuff {
  stat: BuffStat;
  multiplier: number;
  remainingMs: number;
}

export interface UnitInstance {
  ultimateCooldownMs?: number;
  speedUpgradePercent?: number;
  superElapsedMs?: number;
  superStarted?: boolean;
  items?: DragonItem[];
  attackUpgradePercent?: number;
  upgradeCount?: number;
  upgradeGoldSpent?: number;
  instanceId: string;
  definitionId: string;
  cooldownMs: number;
  berserkRemainingMs?: number;
  x: number;
  y: number;
}

export type RunStatus = "ready" | "running" | "won" | "lost";

export interface RunState {
  difficulty: 'normal' | 'nightmare' | 'hell' | 'insane';
  wave: number;
  waveTimeRemainingMs: number;
  gold: number;
  freeSummons: number;
  baseHealth: number;
  maxBaseHealth: number;
  board: UnitInstance[];
  activeBuffs: ActiveBuff[];
  status: RunStatus;
  defeatedEnemies: number;
  growthShardsEarned: number;
}

export interface MetaProgress {
  growthShards: number;
  unlockedSkills: string[];
  highestWave: number;
  wins: number;
  uniqueUnitLevels: Record<string, number>;
  uniqueUnitExperience: Record<string, number>;
}

export type JackpotReward =
  | { type: "gold"; amount: number }
  | { type: "freeSummon"; amount: number }
  | { type: "buff"; stat: BuffStat; multiplier: number; durationMs: number };

export type GoldRewardTier = "small" | "good" | "great" | "epic" | "legendary";

export interface KillGoldReward {
  amount: number;
  tier: GoldRewardTier;
}

export type SkillBranch =
  | "power"
  | "haste"
  | "critical"
  | "startGold"
  | "killGold"
  | "summonCost"
  | "freeSummon"
  | "jackpot"
  | "uniqueChance"
  | "baseHealth"
  | "uniqueExperience"
  | "uniqueAttack"
  | "skillPower";

export interface SkillNode {
  id: string;
  branch: SkillBranch;
  tier: number;
  label: string;
  description: string;
  cost: number;
  prerequisite?: string;
  effect: {
    stat:
      | "attackBonus"
      | "attackSpeedBonus"
      | "criticalChanceBonus"
      | "startGold"
      | "startFreeSummons"
      | "goldBonus"
      | "jackpotChance"
      | "summonDiscount"
      | "uniqueSummonBonus"
      | "baseHealthBonus"
      | "leakDamageReduction"
      | "uniqueExperienceBonus"
      | "uniqueAttackBonus"
      | "bossDamageBonus"
      | "failureShardBonus"
      | "uniqueSkillPowerBonus";
    value: number;
  };
}

export interface EnemyState {
  id: string;
  wave: number;
  variantId: EnemyVariantId;
  variantLabel: string;
  variantTint: number;
  variantTier: number;
  trueBossId?: TrueBossId;
  hp: number;
  maxHp: number;
  armor: number;
  effects: EnemyStatusEffect[];
  progress: number;
  speed: number;
  rewardGold: number;
  isBoss: boolean;
  lastHitByDefinitionId?: string;
}

export interface EnemyStatusEffect {
  kind: "slow" | "freeze" | "poison";
  remainingMs: number;
  magnitude: number;
  tickMs?: number;
  sourceDefinitionId?: string;
}
