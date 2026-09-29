import { expect, test } from 'vitest';
import { getRecommendedDps } from '../src/game/dps';
import { buildWaves, DIFFICULTIES, getBossEncounter } from '../src/game/waves';

test('all boss stages demand more DPS than the wave they follow', () => {
  for (const [difficultyName, difficulty] of Object.entries(DIFFICULTIES)) {
    const waves = buildWaves(difficulty.waveOffset);
    for (let wave = 5; wave <= 120; wave += 5) {
      const boss = getBossEncounter(wave, difficulty.waveOffset)!;
      const normalDps = getRecommendedDps(waves[wave - 1]!, difficulty);
      const bossDps = getRecommendedDps(boss, difficulty);
      expect(bossDps / normalDps, `${difficultyName} ${wave}웨이브 보스`).toBeGreaterThanOrEqual(1.08);
    }
  }
});
