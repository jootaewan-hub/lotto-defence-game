import type { EnemyVariantId, TrueBossId } from "./types";

export interface EnemyVariantDefinition {
  id: EnemyVariantId;
  label: string;
  tint: number;
  tier: number;
  hpMultiplier: number;
  armorMultiplier: number;
  speedMultiplier: number;
  rewardMultiplier: number;
}

export interface TrueBossDefinition {
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

export function getTrueBossDefinition(id: TrueBossId): TrueBossDefinition {
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
    // Wave 120 only. Sits one tier above the undead demon king so the last wave
    // is the hardest single enemy in a run.
    "eclipse-sovereign": {
      id,
      label: "월식의 군주",
      variantId: "blackguard",
      tint: 0xf8fafc,
      tier: 11,
      hpMultiplier: 2.15,
      armorMultiplier: 1.8,
      speedMultiplier: 1,
      rewardMultiplier: 3,
    },
  };
  return bosses[id];
}

export function getEnemyVariant(waveNumber: number, isBoss: boolean, sequence: number): EnemyVariantDefinition {
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
