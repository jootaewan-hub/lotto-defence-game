import { getRarityIndex } from './rarities';
import { isUniqueUnit } from './units';
import type { UnitDefinition } from './types';

export function getEvolutionVisual(unit: UnitDefinition, level = 1, boardCount = 1) {
    const stage = getRarityIndex(unit.rarity) + 1;
    const skillStage = isUniqueUnit(unit) ? 1 + Math.floor(Math.min(999, Math.max(1, level)) / 5) : 0;
    const crowdScale = boardCount > 60 ? .72 : boardCount > 30 ? .85 : 1;
    return {
        stage,
        skillStage,
        label: unit.ultimate ? '궁극 각성' : unit.superUnique ? '최종 각성' : `진화 ${stage}단계`,
        badge: unit.ultimate ? '∞' : unit.superUnique ? '★' : String(stage),
        size: unit.ultimate ? 128 + skillStage * .4 : unit.superUnique ? 91 + skillStage * .45 : (43 + (stage - 1) * 3.8 + skillStage * .35) * crowdScale,
        ornaments: unit.superUnique ? 10 : stage - 1,
        rings: stage >= 7 ? 3 : stage >= 4 ? 2 : 1,
        particles: Math.min(8, Math.max(0, stage - 3) + Math.floor(skillStage / 5)),
    };
}
