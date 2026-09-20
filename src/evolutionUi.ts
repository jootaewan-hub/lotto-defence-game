import { ULTIMATE_ID, ULTIMATE_SKILLS } from './game/ultimate';
import type { UnitDefinition } from './game/types';
import { RARITIES, getRarity } from './game/rarities';
import { getTowerType, getUnitPortrait, getUnitDefinition } from './game/units';
import { TOWER_TYPES, TOWER_LABELS } from './game/superUnits';
import { getEvolutionVisual } from './game/evolutionVisuals';

export function unitArtMarkup(unit: UnitDefinition): string {
    const stage = getEvolutionVisual(unit).stage;
    const color = getRarity(unit.rarity).color;
    if (unit.ultimate) return `<span class="unit-art ultimate-art"><img src="${import.meta.env.BASE_URL}assets/generated/ultimate-mugeuk-v2.png" alt="무극신"></span>`;
    if (unit.superUnique) {
        const positions = { archer: '0% 0%', warrior: '100% 0%', mage: '0% 100%', priest: '100% 100%' };
        return `<span class="unit-art super-art" role="img" aria-label="${unit.name}" style="background-image:url('${import.meta.env.BASE_URL}assets/generated/super-unique-atlas.png');background-position:${positions[getTowerType(unit)]}"></span>`;
    }
    const portrait = getUnitPortrait(unit);
    if (portrait.startsWith('evolution-')) {
        const columns = { archer: 0, warrior: 1, mage: 2, priest: 3 };
        return `<span class="unit-art evolution-art evolution-${stage}" style="--evolution-color:${color}"><span class="evolved-sprite" role="img" aria-label="${unit.name}" style="background-image:url('${import.meta.env.BASE_URL}assets/generated/tower-evolution-atlas.png');background-position:${columns[getTowerType(unit)] * 100 / 3}% ${stage >= 7 ? 100 : 0}%;transform:scale(${.72 + stage * .03})"></span></span>`;
    }
    return `<span class="unit-art evolution-art evolution-${stage}" style="--evolution-color:${color};--evolution-size:${.72 + stage * .03}"><img src="${import.meta.env.BASE_URL}assets/generated/fantasy-components/${getUnitPortrait(unit)}.png" alt="${unit.name}">${stage >= 4 ? '<i class="evolution-crown" aria-hidden="true">♛</i>' : ''}${stage >= 7 ? '<i class="evolution-wings" aria-hidden="true">✦</i>' : ''}</span>`;
}

export function evolutionPathMarkup(unit: UnitDefinition): string {
    if (unit.ultimate) return `<div class="ultimate-skill-list">${ULTIMATE_SKILLS.map(s => `<p><b>${s.name}</b> · ${s.description}</p>`).join('')}</div>`;
    const visual = getEvolutionVisual(unit);
    return `<div class="evolution-path" aria-label="진화 단계">${RARITIES.map((r, i) => `<span class="${!unit.superUnique && i + 1 === visual.stage ? 'current' : ''}" style="--step-color:${r.color}">${i + 1} ${r.label}</span>`).join('<i>›</i>')}</div><p class="evolution-note">같은 수호자 3명 합성 · 슈퍼유니크는 별도 재료로 최종 각성</p>`;
}

export function evolutionGalleryMarkup(): string {
    const roles = { archer: 'archer', warrior: 'single', mage: 'area', priest: 'support' };
    return `<span class="dialog-eyebrow">수호자 진화 도감</span><h2 id="dialog-title">작은 수호자에서, 전장의 전설로</h2><p class="dialog-description">숫자는 등급 진화 단계입니다. 같은 수호자 3명을 합성하면 다음 등급으로 진화합니다. 유니크는 별도의 레벨과 스킬 진화도 성장합니다.</p>${TOWER_TYPES.map(type => `<section class="evolution-gallery"><h3>${TOWER_LABELS[type]}</h3><div class="evolution-gallery-grid">${RARITIES.map((r, i) => `<article>${unitArtMarkup(getUnitDefinition(`${r.id}-${roles[type]}`))}<b style="color:${r.color}">${i + 1}단계 · ${r.label}</b></article>`).join('')}</div><div class="awakening-preview">${unitArtMarkup(getUnitDefinition(`super-${type}`))}<div><small>별도 조합 · 최종 각성</small><h4>${getUnitDefinition(`super-${type}`).name}</h4><p>같은 유형 유니크 1 + 전설 3 + 신화 3 + 초월 3 + 불멸 3 + 10,000G</p></div></div></section>`).join('')}<section class="awakening-preview ultimate-preview">${unitArtMarkup(getUnitDefinition(ULTIMATE_ID))}<div><small>사신 합일 · 궁극 각성</small><h4>무극신</h4><p>슈퍼유니크 4종 + 20,000G</p>${ULTIMATE_SKILLS.map(s=>`<p><b>${s.name}</b> · ${s.description}</p>`).join('')}</div></section><button data-close class="dialog-primary">전장으로 돌아가기</button>`;
}
