export type RarityId =
  | "common"
  | "advanced"
  | "rare"
  | "epic"
  | "hero"
  | "legendary"
  | "mythic"
  | "transcendent"
  | "immortal";

export type UnitRole = "single" | "area" | "support";

export type BuffStat = "attack" | "attackSpeed";

export interface Rarity {
  id: RarityId;
  label: string;
  summonChance: number;
  color: string;
  powerMultiplier: number;
}

export interface UnitDefinition {
  id: string;
  name: string;
  rarity: RarityId;
  role: UnitRole;
  attackType: string;
  attack: number;
  attackSpeed: number;
  criticalChance: number;
  range: number;
  skill: string;
}

export interface WaveDefinition {
  number: number;
  enemyCount: number;
  healthMultiplier: number;
  speedMultiplier: number;
  durationMs: number;
  isBoss: boolean;
}

export interface ActiveBuff {
  stat: BuffStat;
  multiplier: number;
  remainingMs: number;
}

export interface UnitInstance {
  instanceId: string;
  definitionId: string;
  cooldownMs: number;
  x: number;
  y: number;
}

export type RunStatus = "ready" | "running" | "won" | "lost";

export interface RunState {
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
}

export type JackpotReward =
  | { type: "gold"; amount: number }
  | { type: "freeSummon"; amount: number }
  | { type: "buff"; stat: BuffStat; multiplier: number; durationMs: number };

export type SkillBranch = "attack" | "economy" | "luck";

export interface SkillNode {
  id: string;
  branch: SkillBranch;
  tier: number;
  label: string;
  description: string;
  cost: number;
  prerequisite?: string;
  effect: {
    stat: "attackBonus" | "startGold" | "goldBonus" | "jackpotChance" | "summonDiscount";
    value: number;
  };
}

export interface EnemyState {
  id: string;
  wave: number;
  hp: number;
  maxHp: number;
  progress: number;
  speed: number;
  rewardGold: number;
  isBoss: boolean;
}
