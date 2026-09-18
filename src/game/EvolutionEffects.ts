import type Phaser from 'phaser';
import type { TowerType } from './types';
import type { getEvolutionVisual } from './evolutionVisuals';

/** Shared graphics buffer: no per-frame particles, textures or tweens are allocated. */
export function drawEvolutionOrnaments(g: Phaser.GameObjects.Graphics, x: number, y: number,
    visual: ReturnType<typeof getEvolutionVisual>, type: TowerType, color: number, time: number, crowded: boolean) {
    const size = visual.size, stage = visual.ornaments;
    if (stage < 1) return;
    const radius = size * .4;
    // Evolving mantle silhouette: bow feathers, plated pauldrons, flame fins, holy wings.
    for (const side of [-1, 1]) {
        g.fillStyle(color, .35 + stage * .025);
        g.lineStyle(1, color, .8);
        const extent = size * (.12 + stage * .018);
        const points = type === 'warrior'
            ? [{x:x+side*size*.13,y:y-size*.55},{x:x+side*(size*.25+extent),y:y-size*.48},{x:x+side*size*.3,y:y-size*.25}]
            : [{x:x+side*size*.12,y:y-size*.2},{x:x+side*(size*.2+extent),y:y-size*(.4+stage*.025)},{x:x+side*size*.24,y:y-size*.03}];
        g.fillPoints(points, true); g.strokePoints(points, true);
        if (stage >= 4) {
            for (let k = 0; k < Math.min(4, stage - 3); k++) {
                const px = x + side * (size * .3 + k * 3), py = y - size * .4 + k * 6;
                g.lineStyle(1.5, 0xffecbd, .7);
                g.lineBetween(px, py, px + side * extent * .5, py - 12);
            }
        }
    }
    for (let ring = 1; ring < visual.rings; ring++) {
        g.lineStyle(1, color, .3 + ring * .12);
        g.strokeEllipse(x, y + 9, radius * 2 + ring * 10, radius * .75 + ring * 5);
    }
    if (stage >= 3) {
        const cy = y - size * .65;
        g.lineStyle(1.5, color, .85);
        g.strokeEllipse(x, cy, size * (.25 + stage * .025), 9 + stage);
        g.fillStyle(0xffeabd, .95);
        for (let k = 0; k < Math.min(5, stage - 2); k++) {
            const cx = x + (k - (Math.min(5, stage - 2) - 1) / 2) * 5;
            g.fillTriangle(cx, cy - 9, cx - 2, cy - 4, cx + 2, cy - 4);
        }
    }
    const count = crowded ? Math.min(2, visual.particles) : visual.particles;
    for (let k = 0; k < count; k++) {
        const angle = time / 1700 + k * Math.PI * 2 / count;
        const px = x + Math.cos(angle) * radius, py = y - size * .25 + Math.sin(angle) * size * .3;
        g.fillStyle(k % 2 ? 0xfff1c8 : color, .75);
        g.fillTriangle(px, py - 3, px - 2, py, px + 2, py);
        g.fillTriangle(px, py + 3, px - 2, py, px + 2, py);
    }
}
