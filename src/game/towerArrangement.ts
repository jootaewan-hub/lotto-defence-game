import { TOWER_FIELD, TOWER_RADIUS } from "./geometry";
import { getRarityIndex } from "./rarities";
import { getUnitDefinition } from "./units";
import type { RunState } from "./types";

export function compareUnitsForArrangement(
  left: RunState["board"][number],
  right: RunState["board"][number],
): number {
  const leftDefinition = getUnitDefinition(left.definitionId);
  const rightDefinition = getUnitDefinition(right.definitionId);
  const uniqueOrder = Number(Boolean(rightDefinition.uniqueAbility)) - Number(Boolean(leftDefinition.uniqueAbility));
  if (uniqueOrder !== 0) {
    return uniqueOrder;
  }

  const rarityOrder = getRarityIndex(rightDefinition.rarity) - getRarityIndex(leftDefinition.rarity);
  if (rarityOrder !== 0) {
    return rarityOrder;
  }
  return left.definitionId.localeCompare(right.definitionId);
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
