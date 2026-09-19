# simulation.ts 구조 분리 설계

작성일 2026-09-19. 대상 저장소 `jootaewan-hub/lotto-defence-game`, 기준 커밋 `18d9670`.

## 1. 배경

`src/game/simulation.ts`가 1,520줄로 전체 TypeScript 소스 4,155줄의 37%를 차지한다. 이 파일 하나에
전투 루프, 소환, 합성, 웨이브 진행, 강화, 슈퍼유니크·장비, 타워 관리가 모두 들어 있어 한 번에 읽고
고치기 어렵다. 목적은 동작을 **한 글자도 바꾸지 않고** 읽고 고칠 수 있는 단위로 나누는 것이다.

동시에 배포 자산 중 근거 없이 포함된 대형 이미지를 배포 경로에서 제외한다.

## 2. 탐색으로 확인한 사실

설계의 전제다. 추정이 아니라 측정·조사 결과다.

- `GameSimulation`은 Phaser에 의존하지 않는다. Phaser는 `GameScene`·`CombatEffects`·
  `EvolutionEffects`·`main`에만 있다. RNG는 `createSeededRng(seed)`로 주입되며 `state`가 공개되어
  결정론적 구동이 가능하다.
- `simulation.ts`를 import하는 파일이 16개다(테스트 10, 소스 6). 소비자가 실제로 접근하는 공개 멤버는
  약 48개다. 따라서 **공개 API는 전부 보존해야 한다.**
- 클래스 본체는 115–1217행이고, 1219–1520행은 이미 `this`를 사용하지 않는 파일 수준 순수 함수다.
- 전투 루프(712–1016행)는 인스턴스 멤버 22개를 참조한다. 이 중 `collectDefeatedEnemies`와
  `findTargets`는 분리 대상 안에 있어 함께 이동하므로, 외부 의존은 **데이터 12개 + 메서드 8개**다.
  `spawnTimerMs`·`remainingSpawns`·`enemySequence`·`attackSequence`·`jackpotMisses`는 전투 함수가
  **쓰기**까지 한다.
- 배포 총량 12MB 중 JS+CSS는 1.33MB(11%)뿐이고 이미지가 10.3MB(86%)다. JS의 약 90%는 Phaser이므로
  코드 분할로는 첫 로딩량이 줄지 않는다. `public/assets/generated/fantasy-components/chatgpt-image2-source.png`
  (1.94MB)는 코드 참조 0건이며 `docs/asset-attribution.md`에도 기재가 없다.
  `public/assets/fantasy/`의 스프라이트 2개(약 60KB)는 출처 문서에 "시각 참고 자료"로 보존 의도가
  명시되어 있다.
- 기존 테스트 129개는 최대 1~2웨이브까지만 구동한다. 장기 진행 수치를 검증하는 테스트는 없다.
- 영구 성장 0에서 `update()` 1회는 200명 편성 기준 0.047ms다(만렙은 8.09ms). 성장 0 기준의 결정론적
  장기 구동은 분 단위 비용으로 가능하다.

## 3. 결정 사항

| 항목 | 결정 | 근거 |
| --- | --- | --- |
| 분리 깊이 | 파일 수준 순수 함수 + 전투 루프까지 | 동작 보증 수단이 얇아 전면 파사드화는 조용한 회귀 위험이 크다 |
| 분리 방식 | 컨텍스트 인터페이스 + 자유 함수 | 서브시스템 클래스 역참조는 줄 수만 옮기고 결합을 남긴다 |
| 공개 API | 48개 전부 보존, 기존 테스트 무수정 | 테스트를 고치면 통과가 회귀 부재를 증명하지 못한다 |
| 안전망 | 골든 스냅샷 테스트 신규 추가 | 성장 0 기준이면 비용이 분 단위다 |
| 자산 | 미참조·미기재 자산만 배포 경로 밖으로 이동 | 사용 중 PNG 압축은 화질 판단이 필요해 별도 과제 |

## 4. 설계

### 4.1 파일 경계

`src/game/`의 로직 파일은 camelCase 관례를 따른다(Phaser 결합 파일만 PascalCase).

| 새 파일 | 이동 대상 | 원본 행 | 대략 |
| --- | --- | --- | --- |
| `enemyVariants.ts` | `EnemyVariantDefinition`, `TrueBossDefinition`, `getTrueBossDefinition`, `getEnemyVariant` | 1233–1394 | ~162줄 |
| `combatMath.ts` | `scaleEnemyReward`, `getWaveCleanupWindowMs`, `getWaveArmor`, `applyArmor`, `applyUniqueAbility`, `upsertEnemyEffect`, `getEnemyExperienceReward`, `getEnemyMovementMultiplier` | 1229, 1395–1477 | ~87줄 |
| `towerArrangement.ts` | `compareUnitsForArrangement`, `createTowerEdgeCandidates` | 1478–1520 | ~43줄 |
| `combat.ts` | `CombatContext`, `spawnEnemies`, `moveEnemies`, `attackEnemies`, `findTargets`, `collectDefeatedEnemies`, `tickBuffs`, `tickEnemyEffects` | 712–1016 | ~305줄 |

`describeJackpot`(1219–1228, 10줄)은 잭팟 문구 생성이며 소환·보상 흐름에 묶여 있다. 10줄을 위해
파일을 만들지 않고 `simulation.ts`에 남긴다.

분리 후 `simulation.ts`는 약 920줄이 된다. 이동 합계는 162 + 87 + 43 + 305 = 597줄이고, 1,520 − 597 = 923줄에서 import 구문 증감을 더한 값이다.

`getEnemyExperienceReward`는 현재 `simulation.ts`에서 export되며 `tests/game-systems.test.ts`가
직접 import한다. 테스트 무수정 원칙에 따라 `combatMath.ts`로 옮긴 뒤 `simulation.ts`에서
**re-export**하여 기존 import 경로를 유지한다.

### 4.2 CombatContext

`combat.ts`가 필요로 하는 것만 명시하는 인터페이스를 정의한다. `GameSimulation`은 구조적으로 이를
만족하므로 호출부는 `spawnEnemies(this, deltaMs)` 형태가 된다.

- 데이터(읽기): `state`, `meta`, `enemies`, `waves`, `rng`, `events`, `difficulty`, `currentWaveActive`
- 데이터(읽기·쓰기): `spawnTimerMs`, `remainingSpawns`, `enemySequence`, `attackSequence`, `jackpotMisses`
- 메서드: `bonus`, `getBuffMultiplier`, `randomInteger`, `getTowerCombatStats`, `getSuperAura`,
  `getJackpotChance`, `formationBonus`

현재 `private`인 멤버(`bonus`, `getBuffMultiplier`, `randomInteger`, `getSuperAura`,
`getJackpotChance`, `rng`, `events`, 그리고 위 카운터들)는 인터페이스 충족을 위해 접근 수준을
올려야 한다. 외부 소비자에게 노출되는 것이 의도가 아님을 주석으로 표시한다.

본문 변환은 `this.` → `ctx.` 치환이 대부분이며, 이동 중 로직을 정리하거나 개선하지 않는다.
개선이 필요해 보이는 지점은 별도 과제로 기록만 한다.

### 4.3 골든 스냅샷 테스트

신규 `tests/golden-snapshot.test.ts`.

- 영구 성장 0(`createDefaultMetaProgress()`), `createSeededRng()`에 고정 시드.
- 결정론적 행동 스크립트: 정해진 순서로 소환·합성·강화를 수행한다. RNG를 소비하는 순서가 고정되어야
  하므로 조건 분기는 시뮬레이션 상태만 보고 결정한다.
- 웨이브 경계마다 기록: `wave`, `gold`, `baseHealth`, `board`의 `definitionId` 배열, 적 수,
  `growthShardsEarned`.
- 리팩터링 **이전에 먼저 커밋**하여 기준선을 만든다. 이후 각 분리 단계에서 값이 하나도 바뀌지 않아야
  한다.
- 웨이브 수는 40웨이브에서 시작해 실제 실행 시간을 측정한 뒤, 수 초 내에 머무는 선에서 확정하고 측정값을 커밋 메시지에 남긴다.

### 4.4 자산 정리

`git mv`로 배포 경로 밖으로 옮긴다. git 이력과 출처 기재는 유지된다.

- `public/assets/generated/fantasy-components/chatgpt-image2-source.png` → `docs/asset-reference/`
- `public/assets/fantasy/mini_fantasy_sprites_oga_ver.png` → `docs/asset-reference/`
- `public/assets/fantasy/8x8_character_sprite_sheet.png` → `docs/asset-reference/`

`docs/asset-attribution.md`의 경로 표기를 함께 수정한다. 이동 후 `npm run build`로 참조 누락이 없음을
확인하고, `dist` 총량 감소분을 실측해 기록한다.

## 5. 검증 절차와 커밋 전략

단계마다 별도 커밋을 만들어 회귀 시 이등분 탐색이 가능하게 한다. 각 단계에서 `npm test`와
`npm run build`를 모두 통과해야 다음으로 넘어간다.

1. 골든 스냅샷 테스트 추가 (기준선 확립)
2. `enemyVariants.ts`, `combatMath.ts`, `towerArrangement.ts` 추출 — `this` 미사용이므로 컴파일러가
   누락을 전부 잡는다
3. `combat.ts` 추출 및 `CombatContext` 도입 — 위험이 집중된 단계
4. 자산 이동 및 출처 문서 경로 수정

기존 테스트 11개 파일은 수정하지 않는다.

## 6. 위험과 완화

| 위험 | 완화 |
| --- | --- |
| 전투 루프 이동 중 조용한 수치 회귀 | 골든 스냅샷을 선행 커밋하고 단계별로 대조 |
| 쓰기 대상 카운터의 동기화 오류 | 인터페이스가 동일 인스턴스를 가리키므로 값 복사가 발생하지 않음을 리뷰에서 확인 |
| `private` 승격이 의도치 않은 공개 API 확장으로 읽힘 | 주석으로 내부 용도임을 명시. 공개 멤버 48개 목록은 변경하지 않음 |
| 자산 이동으로 런타임 404 | `git mv` 후 빌드 및 참조 검색으로 확인 |

## 7. 성공 기준

- `simulation.ts`가 1,520줄에서 약 920줄로 감소한다.
- 기존 테스트 11개 파일 129개가 **수정 없이** 전부 통과한다.
- 골든 스냅샷 값이 리팩터링 전후 완전히 동일하다.
- `npm run build`가 성공하고 `dist` 총량이 약 2MB 감소한다.
- `GameSimulation`의 공개 멤버 48개가 그대로 유지되어 소비자 16개 파일이 무변경이다.

## 8. 범위 밖

- 런타임 성능 최적화(`getSkillEffectTotal`의 만렙 저하) — 사용자가 진행하지 않기로 결정
- 밸런스 수치 변경 및 밸런스 검증 하네스 — 별도 과제로 중단 상태
- 사용 중인 대형 PNG 3개(7.97MB) 압축 — 화질 판단이 필요해 별도 과제
- UI·모바일 개선 — 후속 과제
