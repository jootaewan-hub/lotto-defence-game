import { TOWER_FIELD, TOWER_RADIUS } from "./geometry";
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
  const leftDefinition = getUnitDefinition(left.definitionId);
  const rightDefinition = getUnitDefinition(right.definitionId);
  const typeOrder = TYPE_ORDER.indexOf(getTowerType(leftDefinition)) - TYPE_ORDER.indexOf(getTowerType(rightDefinition));
  if (typeOrder !== 0) {
    return typeOrder;
  }
  return compareUnitsForRoster(left, right);
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
