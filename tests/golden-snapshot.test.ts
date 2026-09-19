import { expect, test } from 'vitest';
import { GameSimulation, type SimulationEvent } from '../src/game/simulation';
import { createDefaultMetaProgress, createSeededRng } from '../src/game/systems';

const SEED = 20260919;
const TICK_MS = 16;
const MAX_WAVE = 40;
const BOARD_CAP = 60;
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

/**
 * 시뮬레이션 상태만 보고 결정하므로 RNG 소비 순서가 고정된다.
 * 정책 1회당 소환은 최대 1회다. 소환을 루프로 돌리면 골드를 0까지 빨아들여
 * 강화 분기가 영원히 실행되지 않는다(소환 후 잔액 10 미만 < 강화비 25 이상).
 * 1회로 제한하면 64틱마다 골드가 쌓여 소환·합성·강화 세 경로가 모두 실행된다.
 */
function applyPolicy(sim: GameSimulation): void {
  if (sim.state.board.length < BOARD_CAP && sim.state.gold >= sim.summonCost) {
    sim.summonToFirstEmpty();
  }
  sim.bulkMergeAll();
  if (sim.state.board.length > 0) {
    const cost = sim.getTowerUpgradeCost(0);
    if (sim.state.gold >= cost * 2 && sim.rollTowerUpgrade(0, 'attack')) {
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

  // 루프가 조기 정지하지 않았는지만 확인한다. 정확한 도달 지점은 스냅샷이 records
  // 배열 전체로 고정하므로, 여기서 40웨이브 생존을 단언하지 않는다.
  expect(records.length).toBeGreaterThanOrEqual(10);
  expect(ticks).toBeLessThan(TICK_LIMIT);

  expect(records).toMatchSnapshot();
});
