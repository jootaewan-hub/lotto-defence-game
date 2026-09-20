import { BOSS_FRAMES, getBossVisual } from './bossVisuals';
import { drawBossAura, drawMugeukAura } from './SovereignEffects';
import { getEvolutionVisual } from './evolutionVisuals';
import { drawEvolutionOrnaments } from './EvolutionEffects';
import { BATTLE_THEMES } from './battleThemes';
import Phaser from 'phaser';
import { getPathPosition, PATH_POINTS } from './geometry';
import { GameSimulation, type SimulationEvent } from './simulation';
import { getUnitDefinition, getUnitPortrait, getTowerType, getUniqueUnitLevel } from './units';
import { SUPER_COLORS } from './superUnits';
import { getRarity } from './rarities';
import { CombatEffects } from './CombatEffects';
const S = 1.8;
const point = (p: {
    x: number;
    y: number;
}) => ({ x: p.x * S + 39, y: p.y * 1.25 - 52.5 });
const ASSETS = `${import.meta.env.BASE_URL}assets/generated/fantasy-components/`;
export class GameScene extends Phaser.Scene {
    private ink!: Phaser.GameObjects.Graphics;
    private combat!: CombatEffects;
    private backdrop!: Phaser.GameObjects.Image;
    private arena!: Phaser.GameObjects.Graphics;
    private backdropDifficulty = '';
    private lastWave = 0;
    private visualTime = 0;
    private units = new Map<string, Phaser.GameObjects.Image>();
    private stageLabels = new Map<string, Phaser.GameObjects.Text>();
    private mobs = new Map<string, Phaser.GameObjects.Image>();
    private selected: number | null = null;
    private dragging: number | null = null;
    private hudClock = 0;
    private lastHp = 20;
    private reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    constructor(private simulation: GameSimulation, private onEvents: (events: SimulationEvent[]) => void, private onSelectionChange: (slot: number | null) => void, private getSpeedMultiplier: () => number, private onHudRefresh: () => void) { super('GameScene'); }
    preload() {
        for (const key of ['knight', 'wizard', 'priest', 'storm-archer', 'plague-warlock', 'time-mage', 'frost-witch', 'berserker', 'orc', 'undead', 'skeleton', 'ogre'])
            this.load.image(key, `${ASSETS}${key}.png`);
        this.load.image('super-atlas', `${import.meta.env.BASE_URL}assets/generated/super-unique-atlas.png`);
        this.load.image('evolution-atlas', `${import.meta.env.BASE_URL}assets/generated/tower-evolution-atlas.png`);
        this.load.image('ultimate-mugeuk', `${import.meta.env.BASE_URL}assets/generated/ultimate-mugeuk-v2.png`);
        for (const id of BOSS_FRAMES) this.load.image(`boss-${id}`, `${import.meta.env.BASE_URL}assets/generated/bosses/${id}.png`);
        this.load.image('forest', `${import.meta.env.BASE_URL}assets/moonwood.png`);
        for (const difficulty of ['nightmare', 'hell', 'insane'] as const)
            this.load.svg(BATTLE_THEMES[difficulty].texture, `${import.meta.env.BASE_URL}assets/backgrounds/${difficulty}.svg`);
    }
    create() {
        const atlas = this.textures.get('super-atlas');
        const source = atlas.getSourceImage() as HTMLImageElement;
        const half = source.width / 2;
        ['archer', 'warrior', 'mage', 'priest'].forEach((type, i) => atlas.add(`super-${type}`, 0, (i % 2) * half, Math.floor(i / 2) * half, half, half));
        const evolutionAtlas = this.textures.get('evolution-atlas');
        const evolutionSource = evolutionAtlas.getSourceImage() as HTMLImageElement;
        ['elite', 'ascended'].forEach((tier, row) => ['archer', 'warrior', 'mage', 'priest'].forEach((type, col) => {
            const w = evolutionSource.width / 4, h = evolutionSource.height / 2;
            evolutionAtlas.add(`evolution-${tier}-${type}`, 0, col * w, row * h, w, h);
        }));
        this.cameras.main.setBackgroundColor('#101f24');
        this.backdrop = this.add.image(390, 250, 'forest').setDisplaySize(780, 500).setAlpha(0.83).setDepth(-2);
        this.drawArena();
        this.updateBattleTheme();
        this.ink = this.add.graphics().setDepth(4);
        this.combat = new CombatEffects(this, this.reduced);
        this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
            const pos = { x: (p.x - 39) / S, y: (p.y + 52.5) / 1.25 };
            let found: number | null = null, distance = 25;
            this.simulation.state.board.forEach((u, i) => { const d = Math.hypot(u.x - pos.x, u.y - pos.y); if (d < distance) {
                found = i;
                distance = d;
            } });
            this.selected = found;
            this.dragging = found;
            this.onSelectionChange(found);
        });
        this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
            if (this.dragging !== null && p.isDown)
                this.simulation.moveUnitTo(this.dragging, (p.x - 39) / S, (p.y + 52.5) / 1.25);
        });
        this.input.on('pointerup', () => this.dragging = null);
        this.input.on('gameout', () => this.dragging = null);
        this.events.once('shutdown', () => { this.combat.clear(); this.units.clear(); this.stageLabels.clear(); this.mobs.clear(); });
    }
    playEvents(events: SimulationEvent[]) { this.combat?.emit(events); }
    clearSelection() { this.selected = null; this.onSelectionChange(null); }
    getSelectedSlot() { return this.selected; }
    selectSlot(slot: number) { this.selected = slot; this.onSelectionChange(slot); }
    pulseFrost() {
        const ring = this.add.circle(390, 250, 25, 0x8edfff, 0.13).setStrokeStyle(3, 0xb9f3ff, 0.9).setDepth(8);
        this.tweens.add({ targets: ring, radius: 420, alpha: 0, duration: this.reduced ? 1 : 850, onComplete: () => ring.destroy() });
    }
    private drawArena() {
        const g = this.add.graphics();
        this.arena = g;
        const pts = PATH_POINTS.map(point);
        // Layered stone causeway, following the exact simulation path.
        g.lineStyle(58, 0x030e13, 0.65);
        g.strokePoints(pts, false);
        g.lineStyle(49, 0x566564, 1);
        g.strokePoints(pts, false);
        g.lineStyle(43, 0x293f43, 1);
        g.strokePoints(pts, false);
        g.lineStyle(39, 0x35494a, 1);
        g.strokePoints(pts, false);
        // Individually shaded paving and moss soften the geometric route into the ruins.
        for (let side = 0; side < 4; side++) {
            const a = pts[side]!, b = pts[side + 1]!;
            const horizontal = side % 2 === 0, length = Math.hypot(b.x - a.x, b.y - a.y), count = Math.floor(length / 23);
            for (let tile = 0; tile < count; tile++)
                for (let row = 0; row < 3; row++) {
                    const t = (tile + 0.5) / count, x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
                    const n = (tile * 13 + row * 7 + side * 19) % 11;
                    const xx = horizontal ? x - 10 : x - 18 + row * 12, yy = horizontal ? y - 18 + row * 12 : y - 10;
                    g.fillStyle([0x47544d, 0x3a4c48, 0x4b5851, 0x354743][n % 4]!, 0.8);
                    g.fillRoundedRect(xx, yy, horizontal ? 21 : 11, horizontal ? 11 : 21, 2);
                    g.lineStyle(0.6, 0x9eac8e, 0.16);
                    g.lineBetween(xx + 2, yy + 1, xx + (horizontal ? 18 : 8), yy + 1);
                    if (n < 3) {
                        g.lineStyle(0.7, 0x152d2a, 0.65);
                        g.lineBetween(xx + 3, yy + 2, xx + 7, yy + 7);
                    }
                    if (n === 1) {
                        g.fillStyle(0x6e8a54, 0.4);
                        g.fillEllipse(xx, yy, 7, 3);
                    }
                }
        }
        for (let i = 0; i < 92; i++) {
            const p = point(getPathPosition(i / 92));
            const horizontal = i < 23 || (i >= 46 && i < 69);
            g.lineStyle(1, 0x122b31, 0.9);
            g.lineBetween(p.x - (horizontal ? 0 : 19), p.y - (horizontal ? 19 : 0), p.x + (horizontal ? 0 : 19), p.y + (horizontal ? 19 : 0));
            g.fillStyle(i % 3 ? 0x739084 : 0x99a592, 0.16);
            g.fillCircle(p.x + Math.sin(i * 8) * 12, p.y + Math.cos(i * 7) * 12, 2);
        }
        g.lineStyle(1, 0xa6c0ac, 0.19);
        g.strokeRect(161, 95, 458, 302);
        // Subtle deployment grid and central lunar seal.
        for (let row = 0; row < 5; row++)
            for (let col = 0; col < 5; col++) {
                const x = 218 + col * 86, y = 126 + row * 59;
                g.lineStyle(1, 0x87b6a3, 0.16);
                g.lineBetween(x - 4, y, x + 4, y);
                g.lineBetween(x, y - 4, x, y + 4);
            }
        g.lineStyle(1, 0xbfcab2, 0.15);
        g.strokeCircle(390, 245, 81);
        g.strokeCircle(390, 245, 71);
        for (let i = 0; i < 12; i++) {
            const a = i * Math.PI / 6;
            g.lineBetween(390 + Math.cos(a) * 75, 245 + Math.sin(a) * 75, 390 + Math.cos(a) * 80, 245 + Math.sin(a) * 80);
        }
        for (const [x, y] of [[136, 70], [644, 70], [644, 422.5], [136, 422.5]]) {
            g.fillStyle(0x09191f, 0.7);
            g.fillEllipse(x, y + 13, 62, 22);
            g.fillStyle(0x263e44);
            g.fillRect(x - 16, y - 22, 32, 39);
            g.fillStyle(0x536965);
            g.fillRect(x - 20, y - 26, 40, 9);
            g.lineStyle(1, 0x8a9680, 0.5);
            g.strokeRect(x - 16, y - 22, 32, 39);
            const glow = this.add.circle(x, y - 15, 22, 0xefbc69, 0.08);
            this.add.circle(x, y - 15, 4, 0xffdfa0, 1);
            if (!this.reduced)
                this.tweens.add({ targets: glow, alpha: 0.4, scale: 1.4, duration: 1300, repeat: -1, yoyo: true });
        }
        for (const t of [0.13, 0.38, 0.63, 0.88]) {
            const p = point(getPathPosition(t));
            const a = t < 0.25 ? 0 : t < 0.5 ? Math.PI / 2 : t < 0.75 ? Math.PI : -Math.PI / 2;
            const arrow = this.add.triangle(p.x, p.y, -5, -4, 5, 0, -5, 4, 0xc9b47c, 0.55);
            arrow.setRotation(a);
        }
        this.add.text(390, 474, '유닛을 드래그해 방어 위치를 바꾸세요', { fontFamily: 'sans-serif', fontSize: '12px', color: '#9cb3ad' }).setOrigin(0.5);
        this.add.text(137, 24, '침입 경로', { fontFamily: 'sans-serif', fontSize: '11px', color: '#dab987' }).setOrigin(0.5);
        if (!this.reduced)
            for (let i = 0; i < 18; i++) {
                const dot = this.add.circle(40 + (i * 137) % 710, 65 + (i * 97) % 365, 1.2, 0xa9f5d0, 0.45).setDepth(1);
                this.tweens.add({ targets: dot, y: dot.y - 35, alpha: 0.05, duration: 2400 + i * 133, yoyo: true, repeat: -1 });
            }
    }
    private updateBattleTheme() {
        const difficulty = this.simulation.state.difficulty;
        if (difficulty === this.backdropDifficulty) return;
        this.backdropDifficulty = difficulty;
        const theme = BATTLE_THEMES[difficulty];
        this.backdrop.setTexture(theme.texture).setDisplaySize(780, 500).setAlpha(difficulty === 'normal' ? .83 : 1);
        this.arena.setAlpha(difficulty === 'normal' ? 1 : .88);
    }
    update(_time: number, delta: number) {
        if (!this.ink)
            return;
        const speed = this.getSpeedMultiplier();
        const step = Math.min(delta, 80) * speed;
        this.visualTime += Math.min(delta,80) * Math.min(speed,2);
        const time=this.visualTime;
        this.tweens.timeScale = Math.min(speed, 3);
        if (this.simulation.state.wave < this.lastWave) this.combat.clear();
        this.lastWave = this.simulation.state.wave;
        // Small fixed upper bound prevents missed attacks at accelerated speed.
        for (let remaining = step; remaining > 0; remaining -= 40)
            this.simulation.update(Math.min(40, remaining));
        this.updateBattleTheme();
        const events = this.simulation.drainEvents();
        this.combat.emit(events);
        this.combat.update(delta, speed, new Map(this.simulation.enemies.map(e => [e.id, getPathPosition(e.progress)])));
        this.ink.clear();
        const board = this.simulation.state.board;
        const ids = new Set(board.map(u => u.instanceId));
        for (const [id, img] of this.units)
            if (!ids.has(id)) {
                img.destroy();
                this.units.delete(id);
                this.stageLabels.get(id)?.destroy();
                this.stageLabels.delete(id);
            }
        const mergeable = this.simulation.getMergeableSlots();
        board.forEach((u, i) => {
            const def = getUnitDefinition(u.definitionId), p = point(u), rarity = getRarity(def.rarity);
            const color = Phaser.Display.Color.HexStringToColor(rarity.color).color;
            const visual = getEvolutionVisual(def, getUniqueUnitLevel(this.simulation.meta, def.id), board.length);
            if (!def.ultimate) drawEvolutionOrnaments(this.ink, p.x, p.y, visual, getTowerType(def), def.ultimate ? 0xffe6a3 : def.superUnique ? SUPER_COLORS[getTowerType(def)] : color, this.reduced || !step ? 0 : time, board.length > 60);
            if (i === this.selected) {
                const range = this.simulation.getTowerCombatStats(i)!.range;
                this.ink.fillStyle(0x95dfca, 0.045);
                this.ink.fillEllipse(p.x, p.y, range * S * 2, range * 1.25 * 2);
                this.ink.lineStyle(1, 0x95dfca, 0.3);
                this.ink.strokeEllipse(p.x, p.y, range * S * 2, range * 1.25 * 2);
            }
            this.ink.fillStyle(0x030d12, 0.65);
            this.ink.fillEllipse(p.x, p.y + 13, 43, 17);
            this.ink.lineStyle(i === this.selected ? 3 : 1.4, i === this.selected ? 0xffdf95 : color, 0.8);
            this.ink.strokeEllipse(p.x, p.y + 10, 43, 20);
            if (mergeable.has(i)) {
                this.ink.fillStyle(0xffda8c, 0.85);
                this.ink.fillCircle(p.x + 20, p.y - 28, 3);
            }
            if (def.ultimate) drawMugeukAura(this.ink, p.x, p.y, this.reduced ? 0 : time, this.simulation.isSuperBerserk(u));
            if(def.superUnique && !def.ultimate){
                const color=def.ultimate?0xffe6a3:SUPER_COLORS[getTowerType(def)],active=this.simulation.isSuperBerserk(u);
                this.ink.fillStyle(color,active?0.16:0.08);this.ink.fillEllipse(p.x,p.y+7,91,39);
                this.ink.lineStyle(2,color,0.7);this.ink.strokeEllipse(p.x,p.y+7,81,32);
                this.ink.lineStyle(1,0xffe8b2,0.55);this.ink.strokeEllipse(p.x,p.y+7,96,42);
                for(let k=0;k<6;k++){const angle=(this.reduced?0:time/1300)+k*Math.PI/3;const x=p.x+Math.cos(angle)*42,y=p.y+7+Math.sin(angle)*17;this.ink.fillStyle(k%2?0xffe4a0:color,0.9);this.ink.fillTriangle(x,y-4,x-3,y,x+3,y);this.ink.fillTriangle(x,y+4,x-3,y,x+3,y);}
                for(let k=0;k<4;k++){const phase=((this.reduced?0:time/28)+k*19)%70;this.ink.fillStyle(color,(1-phase/70)*0.6);this.ink.fillCircle(p.x+Math.sin(k*7+time/1700)*28,p.y-phase,1.5);}
            }
            let img = this.units.get(u.instanceId);
            if (!img) {
                const key = getUnitPortrait(def);
                const texture = def.ultimate ? 'ultimate-mugeuk' : def.superUnique ? 'super-atlas' : key.startsWith('evolution-') ? 'evolution-atlas' : key;
                img = this.add.image(p.x, p.y, texture, texture !== key ? key : undefined).setOrigin(0.5, 0.78).setDepth(5);
                const size = visual.size;
                img.setDisplaySize(size, size);
                this.units.set(u.instanceId, img);
                const glow = this.add.circle(p.x, p.y, 28, color, 0.25).setDepth(7);
                this.tweens.add({ targets: glow, scale: 2, alpha: 0, duration: 500, onComplete: () => glow.destroy() });
            }
            const size = visual.size;
            let badge = this.stageLabels.get(u.instanceId);
            if (!badge) {
                badge = this.add.text(p.x, p.y + 19, visual.badge, { fontFamily: 'sans-serif', fontSize: '10px', fontStyle: 'bold', color: def.superUnique ? '#ffdf8a' : rarity.color, backgroundColor: '#10212c', padding: { x: 3, y: 1 } }).setOrigin(.5).setDepth(7);
                this.stageLabels.set(u.instanceId, badge);
            }
            badge.setPosition(p.x, p.y + 19);
            if (badge.text !== visual.badge) badge.setText(visual.badge);
            this.combat.applyPose(u.instanceId, img, p, size, this.reduced || !step ? 0 : Math.sin(time / 440 + i) * 1.2);
        });
        const enemyIds = new Set(this.simulation.enemies.map(e => e.id));
        for (const [id, img] of this.mobs)
            if (!enemyIds.has(id) && !this.combat.heldTargets().has(id)) {
                img.destroy();
                this.mobs.delete(id);
            }
        for (const enemy of this.simulation.enemies) {
            const p = point(getPathPosition(enemy.progress));
            const boss = enemy.isBoss ? getBossVisual(enemy) : null;
            if (boss) p.y = Math.max(p.y, boss.size * .75 + 10);
            const frozen = enemy.effects.some(e => e.kind === 'freeze');
            const motion = this.reduced || !step || frozen ? 0 : time;
            if (boss) drawBossAura(this.ink, p.x, p.y, boss, motion);
            let img = this.mobs.get(enemy.id);
            if (!img) {
                img = this.add.image(p.x, p.y, boss ? `boss-${boss.frame}` : enemy.variantTier > 1 ? 'undead' : 'orc').setOrigin(0.5, 0.75).setDepth(6);
                img.setDisplaySize(boss?.size ?? 38, boss?.size ?? 38);
                this.mobs.set(enemy.id, img);
            }
            const phase = motion ? motion / (boss?.floating ? 400 : 125) + enemy.progress * 80 : 0;
            const bob = Math.sin(phase) * (boss?.floating ? 4 : boss ? 2 : 1.5);
            img.setPosition(p.x, p.y + bob - (boss?.floating ? 5 : 0));
            if (boss) {
                const breath = motion ? Math.sin(motion / 340) * .015 : 0;
                img.setDisplaySize(boss.size * (1 + breath), boss.size * (1 - breath));
                img.setRotation(boss.floating ? Math.sin(phase) * .025 : Math.sin(phase) * .045);
            }
            img.setFlipX(enemy.progress > 0.5);
            if (this.combat.isHit(enemy.id))
                img.setTintFill(0xfff0cb);
            else if (frozen)
                img.setTint(0x8edcff);
            else if (boss?.rank === 1 && enemy.variantTint !== 0xffffff)
                img.setTint(enemy.variantTint);
            else
                img.clearTint();
            const w = boss ? boss.size * .55 : 26;
            const healthY = boss ? boss.size * .73 : 30;
            this.ink.fillStyle(0x071319, 0.9);
            this.ink.fillRoundedRect(p.x - w / 2 - 1, p.y - (healthY + 1), w + 2, 5, 2);
            this.ink.fillStyle(enemy.isBoss ? 0xe8a060 : 0xcc7777);
            this.ink.fillRect(p.x - w / 2, p.y - healthY, w * Math.max(0, enemy.hp / enemy.maxHp), 3);
        }
        // A lethal hit must not erase its target before the visible projectile arrives.
        for (const [id, target] of this.combat.heldTargets()) {
            if (enemyIds.has(id)) continue;
            let img = this.mobs.get(id);
            if (!img) {
                img = this.add.image(target.position.x, target.position.y + 10, target.boss ? `boss-${target.boss.frame}` : target.variantTier > 1 ? 'undead' : 'orc').setOrigin(0.5, 0.75).setDepth(6);
                img.setDisplaySize(target.boss?.size ?? 38, target.boss?.size ?? 38);
                this.mobs.set(id, img);
            }
            img.setPosition(target.position.x, Math.max(target.position.y + 10, target.boss ? target.boss.size * .75 + 10 : 0));
            if (this.combat.isHit(id)) img.setTintFill(0xffe1ad).setAlpha(0.65);
        }
        if (events.length) {
            this.onEvents(events);
        }
        if (this.simulation.state.baseHealth < this.lastHp && !this.reduced)
            this.cameras.main.shake(180, 0.003);
        this.lastHp = this.simulation.state.baseHealth;
        this.hudClock += delta;
        if (this.hudClock >= 100) {
            this.hudClock = 0;
            this.onHudRefresh();
        }
    }
}
