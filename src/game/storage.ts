import { createDefaultMetaProgress, refundRetiredSkills } from "./skills";
import type { MetaProgress } from "./types";

const STORAGE_KEY = "lotto-defence-meta-v1";

export function loadMetaProgress(): MetaProgress {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return createDefaultMetaProgress();
    }
    const parsed = JSON.parse(raw) as Partial<MetaProgress>;
    return refundRetiredSkills(normalizeMetaProgress(parsed));
  } catch {
    return createDefaultMetaProgress();
  }
}

export function saveMetaProgress(meta: MetaProgress): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(meta));
  } catch {
    // Progress saves should never break an active run.
  }
}

function normalizeMetaProgress(parsed: Partial<MetaProgress>): MetaProgress {
  return {
    growthShards: toNonNegativeInteger(parsed.growthShards),
    unlockedSkills: Array.isArray(parsed.unlockedSkills)
      ? parsed.unlockedSkills.filter((skillId): skillId is string => typeof skillId === "string")
      : [],
    highestWave: toNonNegativeInteger(parsed.highestWave),
    wins: toNonNegativeInteger(parsed.wins),
    uniqueUnitLevels: normalizeUniqueLevels(parsed.uniqueUnitLevels),
    uniqueUnitExperience: normalizeUniqueExperience(parsed.uniqueUnitExperience),
  };
}

function toNonNegativeInteger(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function normalizeUniqueLevels(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const levels: Record<string, number> = {};
  for (const [unitId, level] of Object.entries(value)) {
    const normalizedLevel = Math.max(1, Math.min(999, toNonNegativeInteger(level)));
    if (normalizedLevel > 0) {
      levels[unitId] = normalizedLevel;
    }
  }
  return levels;
}

function normalizeUniqueExperience(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const experience: Record<string, number> = {};
  for (const [unitId, amount] of Object.entries(value)) {
    const normalizedAmount = toNonNegativeInteger(amount);
    if (normalizedAmount > 0) {
      experience[unitId] = normalizedAmount;
    }
  }
  return experience;
}
