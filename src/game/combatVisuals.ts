import type { Point } from './geometry';
import type { UnitAbilityKind, UnitRole } from './types';
export type ProjectileKind = 'blade' | 'fire' | 'holy' | 'lightning' | 'poison' | 'ice' | 'time' | 'blood';
export interface CombatStyle {
    kind: ProjectileKind;
    color: number;
    core: number;
    intensity: number;
    radius: number;
    sparks: number;
}
export function getCombatStyle(role: UnitRole, ability: UnitAbilityKind | undefined, rarity: number, level: number): CombatStyle {
    const kinds: Record<UnitAbilityKind, ProjectileKind> = { multishot: 'lightning', poison: 'poison', freeze: 'ice', slow: 'time', berserk: 'blood' };
    const kind = ability ? kinds[ability] : role === 'single' ? 'blade' : role === 'area' ? 'fire' : 'holy';
    const colors: Record<ProjectileKind, [
        number,
        number
    ]> = {
        blade: [0xffcf74, 0xfff2c9], fire: [0xff813b, 0xffecc1], holy: [0x6aefc2, 0xe5fff1],
        lightning: [0x5bbfff, 0xebfbff], poison: [0xa0dc56, 0xe3ff98], ice: [0x70dfff, 0xecfbff],
        time: [0xbb93ff, 0xf1dfff], blood: [0xff5473, 0xffdcc4],
    };
    const intensity = Math.min(7, Math.max(0, rarity) * 0.45 + Math.floor(Math.max(1, level) / 5) * 0.18);
    return { kind, color: colors[kind][0], core: colors[kind][1], intensity, radius: 3 + intensity * 0.65, sparks: Math.min(16, 4 + Math.floor(intensity * 2)) };
}
/** Clamp the step to the current target, including turns and high-speed frames. */
export function advanceHoming(from: Point, target: Point, distance: number): {
    position: Point;
    hit: boolean;
} {
    if (distance <= 0)
        return { position: { ...from }, hit: false };
    const dx = target.x - from.x, dy = target.y - from.y, remaining = Math.hypot(dx, dy);
    if (remaining <= distance)
        return { position: { ...target }, hit: true };
    return { position: { x: from.x + dx / remaining * distance, y: from.y + dy / remaining * distance }, hit: false };
}
