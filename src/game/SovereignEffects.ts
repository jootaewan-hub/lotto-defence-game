import type Phaser from 'phaser';
import type { getBossVisual } from './bossVisuals';

/** Frame-local geometry: no emitters, timers or display objects accumulate. */
export function drawBossAura(g: Phaser.GameObjects.Graphics, x: number, y: number, v: ReturnType<typeof getBossVisual>, time: number) {
    const pulse = .5 + Math.sin(time / 550) * .5;
    g.fillStyle(0x020510, .45);
    g.fillEllipse(x, y + 10, v.size * .65, 18);
    g.fillStyle(v.color, .06 + pulse * .035);
    g.fillEllipse(x, y + 7, v.size * .85, 29);
    g.lineStyle(v.rank > 2 ? 2 : 1, v.color, .6);
    g.strokeEllipse(x, y + 7, v.size * .74, 24);
    if (v.rank < 3) return;
    const cy = y - v.size * .38, r = v.size * .37;
    g.lineStyle(2, v.color, .45);
    g.strokeCircle(x, cy, r);
    for (let k = 0; k < 8; k++) {
        const a = time / 2100 + k * Math.PI / 4;
        const px = x + Math.cos(a) * r, py = cy + Math.sin(a) * r;
        g.lineStyle(2, k % 2 ? 0xfff3d9 : v.color, .8);
        g.lineBetween(px, py, x + Math.cos(a) * (r + 7), cy + Math.sin(a) * (r + 7));
    }
    if (v.rank === 4) {
        g.lineStyle(3, 0xaca0ff, .35);
        g.strokeCircle(x, cy, r + 9);
        g.fillStyle(0xe9e3ff, .65);
        for (let k = 0; k < 8; k++) {
            const phase = (time / 24 + k * 13) % 90;
            g.fillCircle(x + Math.sin(k * 8) * 42, y - phase, 1.5);
        }
    }
}

export function drawMugeukAura(g: Phaser.GameObjects.Graphics, x: number, y: number, time: number, berserk: boolean) {
    const pulse = .5 + .5 * Math.sin(time / 460), radius = berserk ? 63 : 55;
    g.fillStyle(0xffcf62, .055 + pulse * .04);
    g.fillEllipse(x, y, radius * 2.3, 65);
    g.fillStyle(0x90edff, .055);
    g.fillEllipse(x, y - 25, 56, 94);
    for (let ring = 0; ring < 3; ring++) {
        g.lineStyle(ring === 0 ? 2 : 1, ring === 1 ? 0x9eefff : 0xffd579, .7 - ring * .15);
        g.strokeEllipse(x, y + 10, radius * 2 + ring * 12, 34 + ring * 8);
    }
    const cy = y - 42;
    g.lineStyle(1.5, 0xffe4a0, .55);
    g.strokeCircle(x, cy, 45);
    g.lineStyle(1, 0x9fefff, .35);
    g.strokeCircle(x, cy, 50);
    for (let k = 0; k < 8; k++) {
        const a = k * Math.PI / 4 + time / (berserk ? 1350 : 2600);
        const sx = x + Math.cos(a) * radius, sy = cy + Math.sin(a) * radius * .7;
        const dx = Math.cos(a), dy = Math.sin(a);
        g.lineStyle(3, 0xe7faff, .9);
        g.lineBetween(sx - dx * 5, sy - dy * 5, sx + dx * 9, sy + dy * 9);
        g.lineStyle(2, 0xffce66, .95);
        g.lineBetween(sx - dy * 4, sy + dx * 4, sx + dy * 4, sy - dx * 4);
        g.fillStyle(0xfff4c9, .8);
        const rise = (time / 19 + k * 13) % 95;
        g.fillCircle(x + Math.sin(k * 11) * 42, y + 10 - rise, 1.2 + pulse);
    }
}
