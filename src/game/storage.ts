import { createDefaultMetaProgress } from "./skills";
import type { MetaProgress } from "./types";

const STORAGE_KEY = "lotto-defence-meta-v1";

export function loadMetaProgress(): MetaProgress {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return createDefaultMetaProgress();
    }
    const parsed = JSON.parse(raw) as Partial<MetaProgress>;
    return {
      ...createDefaultMetaProgress(),
      ...parsed,
      unlockedSkills: Array.isArray(parsed.unlockedSkills) ? parsed.unlockedSkills : [],
    };
  } catch {
    return createDefaultMetaProgress();
  }
}

export function saveMetaProgress(meta: MetaProgress): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(meta));
}
