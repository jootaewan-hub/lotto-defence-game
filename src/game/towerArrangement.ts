import { PATH_POINTS, TOWER_FIELD, TOWER_RADIUS, TOWER_SPAWN } from "./geometry";
import { getRarityIndex } from "./rarities";
import { getTowerType, getUnitDefinition } from "./units";
import type { RunState } from "./types";

const TYPE_ORDER = ['archer','warrior','mage','priest'] as const;

export function compareUnitsForRoster(left: RunState['board'][number], right: RunState['board'][number]): number {
  const a = getUnitDefinition(left.definitionId);
  const b = getUnitDefinition(right.definitionId);
  const rank = (unit: typeof a) => unit.ultimate ? 12 : unit.superUnique ? 11 : getRarityIndex(unit.rarity);
  return rank(b) - rank(a) || TYPE_ORDER.indexOf(getTowerType(a)) - TYPE_ORDER.indexOf(getTowerType(b)) || a.id.localeCompare(b.id);
}

export function compareUnitsForArrangement(
  left: RunState["board"][number],
  right: RunState["board"][number],
): number {
  return compareUnitsForRoster(left, right);
}

const CENTER_OFFSETS = [
  { x: 0, y: 0 }, { x: -48, y: -48 }, { x: 48, y: -48 },
  { x: 48, y: 48 }, { x: -48, y: 48 },
];

/** Keep ultimate and super units in the center; fill the edge from the enemy entrance outward. */
export function createTowerArrangementPositions(board: RunState['board']): Array<{ x: number; y: number }> {
  const edgeCount = board.filter(unit => !getUnitDefinition(unit.definitionId).superUnique).length;
  const left = TOWER_FIELD.x + TOWER_RADIUS;
  const right = TOWER_FIELD.x + TOWER_FIELD.width - TOWER_RADIUS;
  const top = TOWER_FIELD.y + TOWER_RADIUS;
  const bottom = TOWER_FIELD.y + TOWER_FIELD.height - TOWER_RADIUS;
  const width = right - left;
  const height = bottom - top;
  const perimeter = (width + height) * 2;
  const entrance = PATH_POINTS[0]!;
  const edges = Array.from({ length: edgeCount }, (_, index) => {
    const distance = index / edgeCount * perimeter;
    if (distance <= width) return { x: left + distance, y: top };
    if (distance <= width + height) return { x: right, y: top + distance - width };
    if (distance <= width * 2 + height) return { x: right - (distance - width - height), y: bottom };
    return { x: left, y: bottom - (distance - width * 2 - height) };
  }).sort((a, b) =>
    Math.hypot(a.x - entrance.x, a.y - entrance.y) - Math.hypot(b.x - entrance.x, b.y - entrance.y));
  let centerIndex = 0;
  let edgeIndex = 0;
  return board.map(unit => {
    if (!getUnitDefinition(unit.definitionId).superUnique) return edges[edgeIndex++]!;
    const offset = CENTER_OFFSETS[centerIndex++] ?? CENTER_OFFSETS.at(-1)!;
    return { x: TOWER_SPAWN.x + offset.x, y: TOWER_SPAWN.y + offset.y };
  });
}

export function createTowerEdgeCandidates(count: number): Array<{ x: number; y: number }> {
  const left = TOWER_FIELD.x + TOWER_RADIUS;
  const right = TOWER_FIELD.x + TOWER_FIELD.width - TOWER_RADIUS;
  const top = TOWER_FIELD.y + TOWER_RADIUS;
  const bottom = TOWER_FIELD.y + TOWER_FIELD.height - TOWER_RADIUS;
  const width = right - left;
  const height = bottom - top;
  const perimeter = (width + height) * 2;
  const candidates: Array<{ x: number; y: number }> = [{ x: left + width / 2, y: top }];

  for (let index = 1; index < count; index += 1) {
    const distance = (index / count) * perimeter;
    if (distance <= width) {
      candidates.push({ x: left + distance, y: top });
    } else if (distance <= width + height) {
      candidates.push({ x: right, y: top + distance - width });
    } else if (distance <= width * 2 + height) {
      candidates.push({ x: right - (distance - width - height), y: bottom });
    } else {
      candidates.push({ x: left, y: bottom - (distance - width * 2 - height) });
    }
  }

  return candidates;
}
