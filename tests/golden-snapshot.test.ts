import { expect, test } from 'vitest';
import { GameSimulation, type SimulationEvent } from '../src/game/simulation';
import { createDefaultMetaProgress, createSeededRng } from '../src/game/systems';

const SEED = 20260919;
const TICK_MS = 16;
const MAX_WAVE = 40;
const BOARD_CAP = 60;
const GOLD_RESERVE = 200;
const POLICY_INTERVAL_TICKS = 64;
const SORT_AT_TICK = 5_000;
const TICK_LIMIT = 400_000;

/** FNV-1a. 이벤트 수치를 그대로 문자열화해 접으므로 산술 편차가 즉시 드러난다. */
function foldString(hash: number, text: string): number {
  let next = hash;
  for (let index = 0; index < text.length; index += 1) {
    next ^= text.charCodeAt(index);
    next = Math.imul(next, 16777619);
  }
  return next >>> 0;
}

/** 연출용 이벤트(attack·superSkill·message)는 제외하고 산술 결과만 접는다. */
function foldEvent(hash: number, event: SimulationEvent): number {
  switch (event.type) {
    case 'damage':
      return foldString(hash, `d|${event.amount}|${event.critical ? 1 : 0}|${event.targetId ?? ''}`);
    case 'goldReward':
      return foldString(hash, `g|${event.amount}|${event.tier}`);
    case 'unitExperience':
      return foldString(hash, `x|${event.definitionId}|${event.amount}|${event.level}`);
    case 'waveComplete':
      return foldString(hash, `w|${event.wave}|${event.growthShardsAwarded}`);
    case 'runEnded':
      return foldString(hash, `r|${event.status}|${event.growthShardsAwarded}|${event.failureShardsAwarded}`);
    case 'jackpot':
      return foldString(hash, `j|${event.text}`);
    default:
      return hash;
  }
}

/** 시뮬레이션 상태만 보고 결정하므로 RNG 소비 순서가 고정된다. */
function applyPolicy(sim: GameSimulation): void {
  while (sim.state.board.length < BOARD_CAP && sim.state.gold >= sim.summonCost + GOLD_RESERVE) {
    if (!sim.summonToFirstEmpty()) break;
  }
  sim.bulkMergeAll();
  if (sim.state.board.length > 0) {
    const cost = sim.getTowerUpgradeCost(0);
    if (sim.state.gold >= cost + GOLD_RESERVE && sim.rollTowerUpgrade(0, 'attack')) {
      sim.resolveUpgradeRoll();
    }
  }
}

interface WaveRecord {
  completedWave: number;
  gold: number;
  baseHealth: number;
  defeatedEnemies: number;
  growthShardsEarned: number;
  board: string;
  eventHash: number;
}

function runGolden(): { records: WaveRecord[]; ticks: number } {
  const sim = new GameSimulation(createDefaultMetaProgress(), createSeededRng(SEED));
  sim.autoProgress = true;

  const records: WaveRecord[] = [];
  let eventHash = 2166136261 >>> 0;
  let seenWave = sim.state.wave;
  let ticks = 0;
  let sorted = false;

  while (
    sim.state.wave <= MAX_WAVE &&
    sim.state.status !== 'won' &&
    sim.state.status !== 'lost' &&
    ticks < TICK_LIMIT
  ) {
    sim.update(TICK_MS);
    ticks += 1;

    for (const event of sim.drainEvents()) {
      eventHash = foldEvent(eventHash, event);
    }

    if (ticks % POLICY_INTERVAL_TICKS === 0) {
      applyPolicy(sim);
    }
    if (!sorted && ticks === SORT_AT_TICK) {
      sim.sortUnitsByType();
      sorted = true;
    }

    if (sim.state.wave !== seenWave) {
      records.push({
        completedWave: seenWave,
        gold: sim.state.gold,
        baseHealth: sim.state.baseHealth,
        defeatedEnemies: sim.state.defeatedEnemies,
        growthShardsEarned: sim.state.growthShardsEarned,
        board: sim.state.board.map((unit) => unit.definitionId).join(','),
        eventHash,
      });
      seenWave = sim.state.wave;
    }
  }

  return { records, ticks };
}

test('리팩터링 기준선: 40웨이브 경계 상태와 이벤트 해시', () => {
  const { records, ticks } = runGolden();

  // 루프가 조기 정지하지 않았는지 먼저 확인한다. 스냅샷이 빈 배열로 고정되면 의미가 없다.
  expect(records.length).toBeGreaterThan(30);
  expect(ticks).toBeLessThan(TICK_LIMIT);

  expect(records).toMatchSnapshot();
});
