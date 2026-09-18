import { expect, test } from 'vitest';
import { RARITIES } from '../src/game/rarities';
import { getUnitDefinition, getUnitPortrait } from '../src/game/units';
import { getEvolutionVisual } from '../src/game/evolutionVisuals';
import { evolutionGalleryMarkup, unitArtMarkup } from '../src/evolutionUi';

test.each([1, 40, 100, 200])('all nine evolution sizes remain distinct with %s towers', count => {
  const profiles = RARITIES.map(r => getEvolutionVisual(getUnitDefinition(`${r.id}-single`), 1, count));
  expect(profiles.map(p => p.stage)).toEqual([1,2,3,4,5,6,7,8,9]);
  profiles.slice(1).forEach((p, i) => expect(p.size).toBeGreaterThan(profiles[i]!.size));
  expect(profiles[8]!.ornaments).toBeGreaterThan(profiles[0]!.ornaments);
});

test('super uniques use four exclusive portraits and a separate awakening label', () => {
  const units = ['archer','warrior','mage','priest'].map(t => getUnitDefinition(`super-${t}`));
  expect(units.map(getUnitPortrait)).toEqual(['super-archer','super-warrior','super-mage','super-priest']);
  for (const unit of units) expect(getEvolutionVisual(unit, 1, 200).label).toBe('최종 각성');
});

test('unique level evolution gains size and effects within bounded limits', () => {
  const unit = getUnitDefinition('mythic-ranger');
  const novice = getEvolutionVisual(unit, 1, 200);
  const master = getEvolutionVisual(unit, 99, 200);
  expect(master.size).toBeGreaterThan(novice.size);
  expect(master.skillStage).toBe(20);
  expect(master.particles).toBeLessThanOrEqual(8);
});

test.each(['archer','single','area','support'])('%s changes equipment silhouette at epic and mythic tiers', role => {
  const basic = getUnitPortrait(getUnitDefinition(`common-${role}`));
  const elite = getUnitPortrait(getUnitDefinition(`epic-${role}`));
  const ascended = getUnitPortrait(getUnitDefinition(`mythic-${role}`));
  expect(new Set([basic, elite, ascended]).size).toBe(3);
  expect(elite).toContain('evolution-elite-');
  expect(ascended).toContain('evolution-ascended-');
  expect(unitArtMarkup(getUnitDefinition(`mythic-${role}`))).toContain('tower-evolution-atlas.png');
});

test('gallery covers all four classes and nine tiers, with separate super awakenings', () => {
  const gallery = evolutionGalleryMarkup();
  expect(gallery.match(/9단계 · 불멸/g)).toHaveLength(4);
  expect(gallery.match(/별도 조합 · 최종 각성/g)).toHaveLength(4);
  expect(gallery).toContain('에픽 3');
  expect(gallery).not.toContain('super-archer.png');
});
