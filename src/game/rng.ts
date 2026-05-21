export interface Rng {
  next(): number;
  pick<T>(items: readonly T[]): T;
}

export function createSeededRng(seed: number): Rng {
  let state = seed >>> 0;

  return {
    next() {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 0x100000000;
    },
    pick<T>(items: readonly T[]) {
      if (items.length === 0) {
        throw new Error("Cannot pick from an empty list.");
      }
      return items[Math.floor(this.next() * items.length)]!;
    },
  };
}

export function createRandomRng(): Rng {
  return {
    next: Math.random,
    pick<T>(items: readonly T[]) {
      if (items.length === 0) {
        throw new Error("Cannot pick from an empty list.");
      }
      return items[Math.floor(Math.random() * items.length)]!;
    },
  };
}
