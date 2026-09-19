# simulation.ts 구조 분리 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `src/game/simulation.ts`를 1,520줄에서 약 920줄로 줄이되 동작을 한 글자도 바꾸지 않는다.

**Architecture:** 파일 수준 순수 함수를 `enemyVariants.ts`·`combatMath.ts`·`towerArrangement.ts`로 옮기고, 전투 루프를 `CombatContext` 인터페이스를 받는 자유 함수로 `combat.ts`에 옮긴다. `GameSimulation`은 공개 API를 그대로 유지하는 호출자로 남는다. 이동 전에 골든 스냅샷 테스트를 기준선으로 먼저 커밋한다.

**Tech Stack:** TypeScript 5.9, Vitest 4.0, Vite 7.2, Phaser 3.90(이번 작업에서는 건드리지 않음)

**Spec:** `docs/superpowers/specs/2026-09-19-simulation-split-design.md`

## Global Constraints

- 기존 테스트 11개 파일을 **수정하지 않는다.** 수정하면 통과가 회귀 부재를 증명하지 못한다.
- `GameSimulation`의 공개 멤버 48개를 보존한다. 소비자 16개 파일(`src` 6, `tests` 10)은 무변경이어야 한다.
- 코드를 옮길 때 로직을 정리하거나 개선하지 않는다. 개선점은 별도로 기록만 한다.
- 각 태스크는 `npm test`와 `npm run build`를 모두 통과해야 다음으로 넘어간다.
- `npx vitest -u`(스냅샷 갱신)를 **절대 실행하지 않는다.** 기준선이 조용히 덮어씌워진다.
- 작업 브랜치는 `refactor/simulation-split`이다. push는 사용자가 지시할 때만 한다.
- 커밋 메시지 말미에 다음 두 줄을 넣는다.
  - `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`
  - `Claude-Session: https://claude.ai/code/session_01B1VJLWQmgnxe9f5zh12orU`

## File Structure

| 파일 | 책임 | 상태 |
| --- | --- | --- |
| `tests/golden-snapshot.test.ts` | 결정론적 40웨이브 구동으로 경계 상태와 이벤트 해시를 고정 | 신규 |
| `src/game/enemyVariants.ts` | 적 변종·진보스 정의 조회 | 신규 |
| `src/game/combatMath.ts` | 방어력·보상·상태이상·경험치 계산, 잭팟 문구 | 신규 |
| `src/game/towerArrangement.ts` | 타워 정렬 비교와 배치 후보 생성 | 신규 |
| `src/game/combat.ts` | `CombatContext`와 전투 루프 7개 함수 | 신규 |
| `src/game/simulation.ts` | `GameSimulation` 클래스와 공개 API | 축소 |
| `docs/asset-attribution.md` | 자산 출처. 경로 표기 수정 | 수정 |

스펙 5장은 순수 함수 추출 3개를 한 단계로 묶었으나, 각각 독립적으로 테스트·검토 가능하고 리뷰어가 하나만 반려할 수 있으므로 태스크 2·3·4로 나눈다. 커밋 단위도 그에 맞춘다.

---

### Task 1: 골든 스냅샷 기준선

리팩터링 이전 동작을 고정한다. 이 태스크가 끝나기 전에는 `simulation.ts`를 건드리지 않는다.

**Files:**
- Create: `tests/golden-snapshot.test.ts`

**Interfaces:**
- Consumes: `GameSimulation`, `SimulationEvent`(`src/game/simulation`), `createDefaultMetaProgress`·`createSeededRng`(`src/game/systems`)
- Produces: `tests/__snapshots__/golden-snapshot.test.ts.snap` — 이후 모든 태스크가 이 파일을 변경 없이 통과시켜야 한다

**배경 (구현자가 알아야 할 것):**
- `update(deltaMs)`는 `pendingReward`가 설정된 동안 조기 반환한다(`simulation.ts:433`). 보상은 10웨이브마다 뜨므로 `autoProgress = true`가 없으면 틱 루프가 10웨이브에서 영구히 멈춘다.
- `RunStatus`는 `"ready" | "running" | "won" | "lost"`이고 **초기값이 `"ready"`**다. 루프 조건을 `status === 'running'`으로 쓰면 시작하자마자 종료된다. 반드시 `!== 'won' && !== 'lost'`로 쓴다.
- 경계 상태만 기록하면 부족하다. 웨이브 경계에서 `enemies`는 비어 있고 `gold`·`baseHealth`는 처치·유출 결과가 달라질 때만 움직인다. 피해 계산이 미세하게 틀려도 처치 여부가 안 바뀌면 드러나지 않는다. 그래서 `damage` 이벤트의 타격당 수치를 해시에 넣는다.
- `attack`·`superSkill`·`message` 이벤트는 연출·문구이므로 해시에서 제외한다. 산술은 `damage`가 담는다.
- `compareUnitsForArrangement`는 `sortUnitsByType()` 경로로만 실행된다. 호출하지 않으면 태스크 4의 절반이 검증되지 않은 채 남는다.

- [ ] **Step 1: 테스트 파일 작성**

`tests/golden-snapshot.test.ts`:

```ts
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
```

- [ ] **Step 2: 실행해 통과와 소요 시간 확인**

Run: `npx vitest run tests/golden-snapshot.test.ts`

Expected: PASS. 스냅샷 파일이 새로 생성된다(`1 snapshot written` 표기). `Duration` 값을 기록해 둔다. 스펙은 3~6초를 예상한다.

`records.length`가 30 이하로 실패하면 루프가 조기 정지한 것이다. `autoProgress = true`가 설정되었는지, 루프 조건이 `status !== 'won' && status !== 'lost'`인지 확인한다.

- [ ] **Step 3: 스냅샷 안정성 확인 — 두 번 더 실행해 동일한지 본다**

Run: `npx vitest run tests/golden-snapshot.test.ts && npx vitest run tests/golden-snapshot.test.ts`

Expected: 두 번 모두 PASS이며 `written` 없이 통과한다. 실패하면 정책이 RNG를 비결정적으로 소비하고 있다는 뜻이다. 진행하지 말고 `applyPolicy`에서 시뮬레이션 상태 외의 값을 참조하는 곳을 찾는다.

- [ ] **Step 4: 전체 테스트와 빌드 확인**

Run: `npm test && npm run build`

Expected: 기존 129개 + 신규 1개가 모두 통과하고 빌드가 성공한다.

- [ ] **Step 5: 커밋**

```bash
git add tests/golden-snapshot.test.ts tests/__snapshots__/golden-snapshot.test.ts.snap
git commit
```

커밋 메시지:

```
Pin simulation behavior with a golden snapshot before splitting it

Drives 40 waves deterministically at a 16ms tick under a fixed seed and
records gold, base health, kills, shards and the board at every wave
boundary. Boundary state alone cannot see the regression this exists to
catch, since the enemy list is empty there and gold and base health only
move when a kill or leak outcome flips, so damage arithmetic could drift
silently. Fold the drainEvents() stream into an FNV-1a hash each tick and
snapshot that too, keeping only the arithmetic-bearing events.

autoProgress is set because update() returns early while a reward is
pending and rewards fire every ten waves, which would otherwise stall the
loop at wave 10. sortUnitsByType() runs once so compareUnitsForArrangement
is exercised before it moves to its own module.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01B1VJLWQmgnxe9f5zh12orU
```

---

### Task 2: enemyVariants.ts 추출

**Files:**
- Create: `src/game/enemyVariants.ts`
- Modify: `src/game/simulation.ts` (1233–1394행 삭제, import 추가)

**Interfaces:**
- Consumes: 없음(타입만)
- Produces: `getTrueBossDefinition(id: TrueBossId): TrueBossDefinition`, `getEnemyVariant(waveNumber: number, isBoss: boolean, sequence: number): EnemyVariantDefinition`, 그리고 두 인터페이스 `EnemyVariantDefinition`·`TrueBossDefinition`

**배경:** 이 구간은 `this`를 쓰지 않는다. 외부 심볼은 타입 `EnemyVariantId`·`TrueBossId` 둘뿐이다. `getTrueBossDefinition`은 `simulation.ts:421`(`startNextWave`)과 전투 구간 `731`행 양쪽에서 호출되므로 태스크 6에서 `combat.ts`도 이 모듈을 import한다.

- [ ] **Step 1: 새 파일에 구간을 그대로 옮긴다**

`src/game/simulation.ts`의 1233–1394행을 잘라내어 `src/game/enemyVariants.ts`에 붙인다. 파일 맨 위에 import를 넣고, 두 인터페이스와 두 함수에 `export`를 붙인다. 본문은 한 글자도 고치지 않는다.

```ts
import type { EnemyVariantId, TrueBossId } from "./types";
```

붙일 `export` 네 곳:
- `interface EnemyVariantDefinition` → `export interface EnemyVariantDefinition`
- `interface TrueBossDefinition` → `export interface TrueBossDefinition`
- `function getTrueBossDefinition` → `export function getTrueBossDefinition`
- `function getEnemyVariant` → `export function getEnemyVariant`

- [ ] **Step 2: simulation.ts에 import 추가**

`src/game/simulation.ts`의 import 블록 끝(50행 `} from "./units";` 다음 줄)에 추가한다.

```ts
import { getEnemyVariant, getTrueBossDefinition } from "./enemyVariants";
```

- [ ] **Step 3: 타입 검사로 누락 확인**

Run: `npx tsc --noEmit`

Expected: 오류 없음. 오류가 나면 옮긴 구간이 참조하던 심볼이 빠진 것이므로 해당 심볼을 `enemyVariants.ts`의 import에 추가한다.

- [ ] **Step 4: 테스트와 빌드**

Run: `npm test && npm run build`

Expected: 130개 전부 통과. **골든 스냅샷이 변경 없이 통과해야 한다.** 스냅샷이 실패하면 이동 중 본문이 바뀐 것이므로 되돌리고 다시 옮긴다.

- [ ] **Step 5: 커밋**

```bash
git add src/game/enemyVariants.ts src/game/simulation.ts
git commit
```

커밋 메시지:

```
Move enemy variant and true boss lookups out of simulation.ts

Lines 1233-1394 never touched instance state and depended only on two
type imports, so they move verbatim into their own module. Both
startNextWave and the combat loop call getTrueBossDefinition, so the
module is shared rather than folded into either caller.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01B1VJLWQmgnxe9f5zh12orU
```

---

### Task 3: combatMath.ts 추출

**Files:**
- Create: `src/game/combatMath.ts`
- Modify: `src/game/simulation.ts` (1219–1232행, 1395–1477행, 상수 106–109행 삭제, import·re-export 추가)

**Interfaces:**
- Consumes: 없음
- Produces: `describeJackpot(reward: JackpotReward): string`, `scaleEnemyReward(baseReward: number): number`, `getWaveCleanupWindowMs(wave: WaveDefinition | null | undefined): number`, `getWaveArmor(waveNumber: number, isBoss: boolean): number`, `applyArmor(damage: number, armor: number): number`, `applyUniqueAbility(...)`, `getEnemyExperienceReward(enemy): number`, `getEnemyMovementMultiplier(enemy: EnemyState): number`

**배경:**
- `describeJackpot`은 스펙 초안에서 `simulation.ts`에 남길 예정이었으나 정정되었다. 유일한 호출부가 960행, 즉 태스크 6에서 옮길 전투 구간 안이다. 남겨두면 `simulation → combat → simulation` 순환 import가 생긴다.
- `upsertEnemyEffect`는 `applyUniqueAbility` 내부에서만 쓰이므로 **export하지 않는다.**
- `getEnemyExperienceReward`는 현재 `simulation.ts`에서 export되며 `tests/game-systems.test.ts:23`이 직접 import한다. 테스트 무수정 원칙에 따라 `simulation.ts`에서 **re-export**해 경로를 유지해야 한다.
- 상수 4개(`ENEMY_GOLD_REWARD_SCALE`, `NORMAL_WAVE_CLEANUP_WINDOW_MS`, `BOSS_WAVE_CLEANUP_WINDOW_MS`, `TRUE_BOSS_WAVE_CLEANUP_WINDOW_MS`)는 옮기는 함수 안에서만 쓰이므로 함께 간다.
- `getWaveCleanupWindowMs`는 `simulation.ts:380`에서도 쓰이므로 `simulation.ts`가 계속 import해야 한다.

- [ ] **Step 1: 새 파일 작성**

`src/game/combatMath.ts`를 만들고 아래 import를 넣은 뒤, `simulation.ts`의 1219–1232행과 1395–1477행, 그리고 상수 106–109행을 그대로 옮긴다. `upsertEnemyEffect`를 제외한 함수 전부에 `export`를 붙인다. `getEnemyExperienceReward`는 이미 `export`가 붙어 있다.

```ts
import { getEnemyGrowthWave } from "./waves";
import { getUniqueAbilityStats } from "./uniqueAbilities";
import type { Rng } from "./rng";
import type {
  EnemyState,
  EnemyStatusEffect,
  JackpotReward,
  UnitDefinition,
  WaveDefinition,
} from "./types";
```

- [ ] **Step 2: simulation.ts에서 삭제하고 import와 re-export 추가**

삭제: 1219–1232행, 1395–1477행, 상수 4줄(106–109행).

import 블록 끝에 추가한다.

```ts
import { getEnemyExperienceReward, getWaveCleanupWindowMs } from "./combatMath";
```

그리고 import 블록 바로 아래에 re-export를 둔다.

```ts
export { getEnemyExperienceReward } from "./combatMath";
```

주의: 태스크 3 시점에는 938행(전투 구간)이 아직 남아 `getEnemyExperienceReward`를 호출한다. 그래서 **import와 re-export를 둘 다** 둔다. TypeScript는 `import { X } from 'm'`과 `export { X } from 'm'`의 공존을 허용한다. 태스크 6에서 938행이 떠나면 import 쪽은 미사용이 되므로 그때 제거한다.

- [ ] **Step 3: 타입 검사**

Run: `npx tsc --noEmit`

Expected: 오류 없음.

- [ ] **Step 4: 테스트와 빌드**

Run: `npm test && npm run build`

Expected: 130개 전부 통과, 골든 스냅샷 변경 없음. `tests/game-systems.test.ts`가 `getEnemyExperienceReward`를 `simulation`에서 계속 import하므로 re-export가 빠지면 여기서 실패한다.

- [ ] **Step 5: 커밋**

```bash
git add src/game/combatMath.ts src/game/simulation.ts
git commit
```

커밋 메시지:

```
Move armor, reward and status effect math out of simulation.ts

These file-level helpers never touched instance state. describeJackpot
joins them rather than staying behind: its only caller sits inside the
combat loop that moves next, so leaving it would create a simulation to
combat to simulation import cycle. upsertEnemyEffect stays unexported
since only applyUniqueAbility calls it, and the four constants that only
these functions read travel with them.

getEnemyExperienceReward is re-exported from simulation.ts because
tests/game-systems.test.ts imports it from there and the existing tests
must not be edited.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01B1VJLWQmgnxe9f5zh12orU
```

---

### Task 4: towerArrangement.ts 추출

**Files:**
- Create: `src/game/towerArrangement.ts`
- Modify: `src/game/simulation.ts` (1478–1520행 삭제, import 추가)

**Interfaces:**
- Consumes: 없음
- Produces: `compareUnitsForArrangement(...)`, `createTowerEdgeCandidates(count: number)` — 정확한 시그니처는 원본 1478행과 1496행을 그대로 복사한다

**배경:** 두 함수 모두 `simulation.ts`에서만 쓰인다(`530`·`531`행 `sortUnitsByType`, `1130`행 `findTowerSpawnPosition`). 전투 구간은 이들을 쓰지 않으므로 `combat.ts`는 이 모듈을 import하지 않는다.

- [ ] **Step 1: 새 파일에 옮긴다**

`simulation.ts` 1478–1520행을 `src/game/towerArrangement.ts`로 옮기고 아래 import를 넣는다. 두 함수에 `export`를 붙인다.

```ts
import { TOWER_FIELD, TOWER_RADIUS } from "./geometry";
import { getRarityIndex } from "./rarities";
import { getUnitDefinition } from "./units";
import type { RunState } from "./types";
```

- [ ] **Step 2: simulation.ts에 import 추가**

```ts
import { compareUnitsForArrangement, createTowerEdgeCandidates } from "./towerArrangement";
```

- [ ] **Step 3: 타입 검사**

Run: `npx tsc --noEmit`

Expected: 오류 없음. `RunState`가 실제로 쓰이지 않는다고 나오면 import에서 뺀다.

- [ ] **Step 4: 테스트와 빌드**

Run: `npm test && npm run build`

Expected: 130개 전부 통과, 골든 스냅샷 변경 없음. 골든 테스트가 `sortUnitsByType()`을 호출하므로 `compareUnitsForArrangement`도 실제로 실행된다.

- [ ] **Step 5: 커밋**

```bash
git add src/game/towerArrangement.ts src/game/simulation.ts
git commit
```

커밋 메시지:

```
Move tower ordering and placement candidates out of simulation.ts

Both helpers are used only by sortUnitsByType and findTowerSpawnPosition,
never by the combat loop, so they get their own module rather than
joining combatMath. The golden snapshot exercises sortUnitsByType, so
compareUnitsForArrangement is covered by the move rather than assumed.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01B1VJLWQmgnxe9f5zh12orU
```

---

### Task 5: combatCounters 묶기

코드 이동 없이 순수 개명만 한다. 태스크 6과 섞으면 회귀 시 원인을 가릴 수 없다.

**Files:**
- Modify: `src/game/simulation.ts` (약 22곳)

**Interfaces:**
- Produces: `GameSimulation.combatCounters: { enemySequence: number; attackSequence: number; remainingSpawns: number; spawnTimerMs: number; jackpotMisses: number }`

**배경:** 태스크 6의 `CombatContext`는 이 다섯 개를 읽고 쓴다. 개별로 노출하면 승격 멤버가 5개 늘고, 값 복사로 인한 쓰기 유실을 리뷰에서 눈으로 막아야 한다. 객체 하나로 묶으면 인터페이스가 동일 객체를 가리키므로 쓰기 유실이 구조적으로 불가능해진다.

전투 구간 밖 사용처는 `restartRun`(340–350행), `startNextWave`(416–417행), `checkWaveCompletion`(1030행), `resolveTimedWaveEnd`(1047행), `getJackpotChance`(1185행), `endRun`(1203행)이다.

- [ ] **Step 1: 필드 5개를 하나로 교체**

`simulation.ts` 308–318행 부근의 아래 다섯 선언을 찾아 삭제한다.

```ts
  private enemySequence = 0;
  private attackSequence = 0;
  private remainingSpawns = 0;
  private spawnTimerMs = 0;
  private jackpotMisses = 0;
```

대신 다음을 넣는다. `private`를 붙이지 않는 이유는 태스크 6에서 `CombatContext`가 접근해야 하기 때문이며, 외부 소비자용이 아님을 주석으로 남긴다.

```ts
  /** 내부 전용. combat.ts의 CombatContext가 읽고 쓰므로 private을 붙이지 않는다. */
  combatCounters = {
    enemySequence: 0,
    attackSequence: 0,
    remainingSpawns: 0,
    spawnTimerMs: 0,
    jackpotMisses: 0,
  };
```

- [ ] **Step 2: 컴파일러가 가리키는 곳을 전부 고친다**

Run: `npx tsc --noEmit`

Expected: `this.enemySequence` 등을 찾을 수 없다는 오류가 약 22곳에서 난다. 각각을 `this.combatCounters.enemySequence` 형태로 바꾼다. `+= 1`, `-= 1`, `= 0` 같은 연산자는 그대로 둔다.

예: `` id: `enemy-${this.enemySequence += 1}` `` → `` id: `enemy-${this.combatCounters.enemySequence += 1}` ``

- [ ] **Step 3: 오류가 0이 될 때까지 반복**

Run: `npx tsc --noEmit`

Expected: 오류 없음. 컴파일러가 누락을 전부 잡으므로 수동 검색은 필요 없다.

- [ ] **Step 4: 테스트와 빌드**

Run: `npm test && npm run build`

Expected: 130개 전부 통과, **골든 스냅샷 변경 없음.** 순수 개명이므로 수치가 바뀌면 개명 중 연산자나 초기값을 잘못 옮긴 것이다.

- [ ] **Step 5: 커밋**

```bash
git add src/game/simulation.ts
git commit
```

커밋 메시지:

```
Group the five combat counters into one field

The combat loop writes spawnTimerMs, remainingSpawns, enemySequence,
attackSequence and jackpotMisses, so the CombatContext it is about to
receive needs all five. Exposing them individually would promote five
private members instead of one and would leave write-back loss as
something a reviewer has to notice. A single object makes the interface
point at the same instance, so losing a write becomes impossible rather
than unlikely.

Rename only, no code movement, so a later regression cannot be blamed on
two changes at once.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01B1VJLWQmgnxe9f5zh12orU
```

---

### Task 6: combat.ts 추출과 CombatContext

위험이 집중된 단계다. 앞선 태스크가 전부 통과한 뒤에만 시작한다.

**Files:**
- Create: `src/game/combat.ts`
- Modify: `src/game/simulation.ts` (712–1016행 삭제, 상수 3개 이동, `update()` 호출부 수정, 접근 수준 승격)

**Interfaces:**
- Consumes: `getEnemyVariant`·`getTrueBossDefinition`(태스크 2), `describeJackpot`·`scaleEnemyReward`·`getWaveCleanupWindowMs`·`getWaveArmor`·`applyArmor`·`applyUniqueAbility`·`getEnemyExperienceReward`·`getEnemyMovementMultiplier`(태스크 3), `combatCounters`(태스크 5)
- Produces: `CombatContext` 인터페이스와 `spawnEnemies(ctx, deltaMs)`, `moveEnemies(ctx, deltaMs)`, `attackEnemies(ctx, deltaMs)`, `findTargets(ctx, unit, range, count)`, `collectDefeatedEnemies(ctx)`, `tickBuffs(ctx, deltaMs)`, `tickEnemyEffects(ctx, deltaMs)`

**배경:**
- 전투 구간이 **쓰는** 멤버는 `state`(재대입), `meta`(재대입), 그리고 `combatCounters`의 다섯 개다. `enemies`와 `events`는 배열 변형만 하므로 참조가 고정이다. `currentWaveActive`는 읽기만 한다(쓰기는 345·418·1067·1202행으로 전부 전투 구간 밖).
- `SimulationEvent`는 `simulation.ts`에 있다. `import type`은 컴파일 시 지워져 런타임 순환을 만들지 않으며, `CombatEffects.ts:3`이 이미 같은 패턴을 쓴다. `types.ts`로 옮기지 말 것 — `GameScene`·`ui`·`CombatEffects`의 import 경로가 바뀌어 "소비자 무변경" 기준을 깬다.
- `getTowerCombatStats`의 반환 타입은 익명 추론 타입이다. 손으로 옮겨 적으면 드리프트가 생기므로 `ReturnType`으로 유도한다.

- [ ] **Step 1: combat.ts의 머리 부분(import와 인터페이스)을 작성**

`src/game/combat.ts`:

```ts
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
import type { Rng } from "./rng";
import type { GameSimulation, SimulationEvent } from "./simulation";
import type {
  EnemyState,
  MetaProgress,
  RunState,
  UnitInstance,
  UpgradeStat,
  WaveDefinition,
} from "./types";

/** 전투 구간에서만 쓰이는 상수. simulation.ts 104·105·111행에서 이동. */
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
  isSuperBerserk(unit: UnitInstance): boolean;
}
```

참고: `isSuperBerserk`는 이미 공개 메서드다(`simulation.ts:135`). 전투 구간이 이를 직접 부르지 않고 `getTowerCombatStats`를 통해서만 쓴다면 인터페이스에서 빼도 된다 — Step 4의 타입 검사가 알려준다.

- [ ] **Step 2: 함수 7개를 옮기고 this를 ctx로 바꾼다**

`simulation.ts` 712–1016행의 7개 private 메서드를 `combat.ts`로 옮긴다. 각각을 다음 형태로 바꾼다.

이전 (`simulation.ts` 안):

```ts
  private spawnEnemies(deltaMs: number): void {
    if (!this.currentWaveActive || this.combatCounters.remainingSpawns <= 0) {
```

이후 (`combat.ts` 안):

```ts
export function spawnEnemies(ctx: CombatContext, deltaMs: number): void {
  if (!ctx.currentWaveActive || ctx.combatCounters.remainingSpawns <= 0) {
```

규칙은 세 가지뿐이다. 본문의 다른 부분은 손대지 않는다.
1. `this.` → `ctx.`
2. 태스크 5에서 묶은 다섯 카운터는 이미 `this.combatCounters.X` 형태이므로 `ctx.combatCounters.X`가 된다
3. 서로를 호출하던 `this.collectDefeatedEnemies()`·`this.findTargets(...)`는 `collectDefeatedEnemies(ctx)`·`findTargets(ctx, ...)`로 바꾼다

- [ ] **Step 3: simulation.ts의 update()와 접근 수준을 고친다**

`update()`(428행) 안의 호출을 바꾼다.

이전:

```ts
    this.tickBuffs(deltaMs);
    this.tickSuperUnits(deltaMs);
    this.tickEnemyEffects(deltaMs);
    this.spawnEnemies(deltaMs);
    this.moveEnemies(deltaMs);
    this.attackEnemies(deltaMs);
```

이후:

```ts
    tickBuffs(this, deltaMs);
    this.tickSuperUnits(deltaMs);
    tickEnemyEffects(this, deltaMs);
    spawnEnemies(this, deltaMs);
    moveEnemies(this, deltaMs);
    attackEnemies(this, deltaMs);
```

`tickSuperUnits`는 이동 대상이 아니므로 그대로 둔다.

import를 추가한다.

```ts
import { attackEnemies, moveEnemies, spawnEnemies, tickBuffs, tickEnemyEffects } from "./combat";
```

그리고 `CombatContext`를 만족시키기 위해 아래 멤버에서 `private`를 제거하고 각각에 내부 전용 주석을 단다.

- `bonus`(131행), `getBuffMultiplier`(1152행), `randomInteger`(211행), `getSuperAura`(139행), `getJackpotChance`(1183행), `rng`(306행), `events`(307행)

`combatCounters`는 태스크 5에서 이미 승격되었다. `readonly rng`와 `readonly events`의 `readonly`는 유지한다 — 재대입을 막으면서 인터페이스는 만족한다.

태스크 3에서 둔 `import { getEnemyExperienceReward, ... } from "./combatMath"`에서 `getEnemyExperienceReward`는 이제 미사용이 되므로 import 목록에서 뺀다. `export { getEnemyExperienceReward } from "./combatMath";` re-export는 **반드시 남긴다.**

- [ ] **Step 4: 타입 검사로 인터페이스를 다듬는다**

Run: `npx tsc --noEmit`

Expected: 처음에는 오류가 난다. 두 방향으로 고친다.
- `CombatContext`에 없는 멤버를 `combat.ts`가 참조하면 → 인터페이스에 추가하고 `simulation.ts`에서 해당 멤버의 `private`를 제거한다
- `CombatContext`에 선언했지만 `combat.ts`가 안 쓰는 멤버가 있으면 → 인터페이스에서 제거하고 승격도 되돌린다

오류가 0이 될 때까지 반복한다. 최종 승격 멤버 수를 세어 둔다. 스펙 4.2.2는 8개를 예상한다.

- [ ] **Step 5: 테스트와 빌드**

Run: `npm test && npm run build`

Expected: 130개 전부 통과, **골든 스냅샷 변경 없음.**

스냅샷이 실패하면 멈춘다. `git diff`로 옮긴 함수 본문을 원본과 대조해 `this.` → `ctx.` 외의 변경이 없는지 확인한다. 가장 흔한 원인은 `+=`·`-=`를 옮기며 `=`로 바꾼 것, 그리고 카운터 접근을 빠뜨린 것이다.

- [ ] **Step 6: 줄 수 확인**

Run: `wc -l src/game/simulation.ts src/game/combat.ts src/game/combatMath.ts src/game/enemyVariants.ts src/game/towerArrangement.ts`

Expected: `simulation.ts`가 약 920줄. 스펙 7장의 성공 기준이다. 크게 벗어나면 이동 누락이나 중복이 있다.

- [ ] **Step 7: 커밋**

```bash
git add src/game/combat.ts src/game/simulation.ts
git commit
```

커밋 메시지:

```
Move the combat loop behind an explicit CombatContext

The loop reached 22 instance members without saying so anywhere. Naming
them in an interface is the point of the move: what the combat code
depends on is now readable, and a fake context can drive it in isolation.
The bodies are unchanged apart from this to ctx and the inter-function
calls becoming free calls.

This widens the instance surface by promoting private members the
interface needs, which is an intended trade rather than an oversight. The
48 members consumers actually use are untouched, so all 16 importing
files and the existing tests stay as they are.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01B1VJLWQmgnxe9f5zh12orU
```

---

### Task 7: 미참조 자산 이동

**Files:**
- Move: `public/assets/generated/fantasy-components/chatgpt-image2-source.png` → `docs/asset-reference/`
- Move: `public/assets/fantasy/mini_fantasy_sprites_oga_ver.png` → `docs/asset-reference/`
- Move: `public/assets/fantasy/8x8_character_sprite_sheet.png` → `docs/asset-reference/`
- Modify: `docs/asset-attribution.md`

**배경:** 배포 총량 12MB 중 이미지가 10.3MB다. 위 세 파일은 코드 참조가 없다. `chatgpt-image2-source.png`(1.94MB)는 출처 문서에도 기재가 없다. 나머지 둘(약 60KB)은 출처 문서에 "시각 참고 자료"로 보존 의도가 명시되어 있으므로 **삭제하지 않고** 배포 경로 밖으로만 옮긴다.

- [ ] **Step 1: 저장소 전체에서 참조를 재검색한다**

앞선 조사는 `src`·`tests`·`index.html`을 `*.ts`·`*.html`·`*.css`로만 훑어 markdown과 `docs/`를 제외했다. 확장자·경로 제한 없이 다시 확인한다.

Run:

```bash
grep -rn "chatgpt-image2-source\|mini_fantasy_sprites_oga_ver\|8x8_character_sprite_sheet" . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist
```

Expected: `docs/asset-attribution.md`의 기재만 나온다. 코드에서 나오면 **멈추고** 그 파일은 옮기지 않는다.

- [ ] **Step 2: 이동 전 dist 크기를 잰다**

Run: `npm run build && du -sh dist`

Expected: 약 12M. 값을 적어 둔다.

- [ ] **Step 3: git mv로 옮긴다**

```bash
mkdir -p docs/asset-reference
git mv public/assets/generated/fantasy-components/chatgpt-image2-source.png docs/asset-reference/
git mv public/assets/fantasy/mini_fantasy_sprites_oga_ver.png docs/asset-reference/
git mv public/assets/fantasy/8x8_character_sprite_sheet.png docs/asset-reference/
```

- [ ] **Step 4: 출처 문서의 경로를 고친다**

`docs/asset-attribution.md`에서 두 경로를 바꾼다.

- `public/assets/fantasy/mini_fantasy_sprites_oga_ver.png` → `docs/asset-reference/mini_fantasy_sprites_oga_ver.png`
- `public/assets/fantasy/8x8_character_sprite_sheet.png` → `docs/asset-reference/8x8_character_sprite_sheet.png`

그리고 "OpenGameArt CC0 Sources" 절 끝에 한 줄을 더한다.

```markdown
이 참고 자료들은 게임이 불러오지 않으므로 배포 경로(`public/`) 밖에 둔다. 출처와 라이선스 기록은 유지한다.
```

- [ ] **Step 5: 빌드로 감소분을 확인한다**

Run: `rm -rf dist && npm run build && du -sh dist`

Expected: 약 10M. Step 2 대비 약 2MB 감소. 빌드가 성공해야 한다.

- [ ] **Step 6: 테스트**

Run: `npm test`

Expected: 130개 전부 통과, 골든 스냅샷 변경 없음(자산은 시뮬레이션과 무관하다).

- [ ] **Step 7: 커밋**

```bash
git add -A
git commit
```

커밋 메시지:

```
Stop shipping three images nothing loads

Images are 10.3MB of the 12MB deploy while JS is 1.33MB, roughly 90% of
which is Phaser, so chunking the bundle would have bought nothing.
chatgpt-image2-source.png ships 1.94MB with no code reference and no
attribution entry. The two OpenGameArt sprites are deliberate reference
material per the attribution doc, so they move rather than get deleted.

All three leave public/ for docs/asset-reference/ via git mv, keeping
history and provenance while dropping about 2MB from the payload.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01B1VJLWQmgnxe9f5zh12orU
```

---

## 완료 확인

모든 태스크가 끝나면 스펙 7장의 성공 기준을 대조한다.

- [ ] `wc -l src/game/simulation.ts` → 약 920줄
- [ ] `npm test` → 기존 11개 파일 129개가 **수정 없이** 통과 + 골든 1개
- [ ] `git diff main --stat -- tests/` → `golden-snapshot.test.ts`와 스냅샷 파일만 나타난다. 기존 테스트 파일이 목록에 있으면 기준 위반이다
- [ ] `git diff main --stat -- src/ui.ts src/main.ts src/superUi.ts src/evolutionUi.ts src/game/GameScene.ts src/game/CombatEffects.ts` → 변경 없음
- [ ] `npm run build` 성공, `du -sh dist` → 약 10M
- [ ] 골든 스냅샷 파일이 태스크 1 이후 한 번도 변경되지 않았다: `git log --oneline -- tests/__snapshots__/golden-snapshot.test.ts.snap` → 커밋 1개
