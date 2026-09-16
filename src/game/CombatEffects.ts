import Phaser from 'phaser';
import type { Point } from './geometry';
import type { SimulationEvent } from './simulation';
import { advanceHoming, getCombatStyle, type CombatStyle } from './combatVisuals';
type Attack = Extract<SimulationEvent, {
    type: 'attack';
}>;
interface Flight {
    event: Attack;
    style: CombatStyle;
    position: Point;
    trail: Point[];
    charge: number;
    age: number;
    angle: number;
    damage?: number;
}
interface Impact {
    position: Point;
    style: CombatStyle;
    age: number;
    critical: boolean;
}
interface Pose {
    age: number;
    dx: number;
    dy: number;
    style: CombatStyle;
}
interface Target {
    position: Point;
    isBoss: boolean;
    variantTier: number;
}
const project = (p: Point): Point => ({ x: p.x * 1.8 + 39, y: p.y * 1.25 - 62.5 });
/** Target-locked presentation. Combat resolution stays deterministic in GameSimulation. */
export class CombatEffects {
    private graphics: Phaser.GameObjects.Graphics;
    private flights: Flight[] = [];
    private impacts: Impact[] = [];
    private poses = new Map<string, Pose>();
    private targets = new Map<string, Target>();
    private flashes = new Map<string, number>();
    private labels: {
        text: Phaser.GameObjects.Text;
        age: number;
        y: number;
    }[] = [];
    constructor(private scene: Phaser.Scene, private reduced: boolean) {
        this.graphics = scene.add.graphics().setDepth(9);
    }
    emit(events: SimulationEvent[]) {
        const damageByHit = new Map<string, number>();
        for (const event of events) {
            if (event.type === 'damage' && event.attackId && event.targetId)
                damageByHit.set(`${event.attackId}:${event.targetId}`, event.amount);
        }
        for (const event of events) {
            if (event.type !== 'attack')
                continue;
            const style = getCombatStyle(event.role, event.ability, event.rarityTier, event.unitLevel);
            const start = project(event.from), end = project(event.to);
            const angle = Math.atan2(end.y - start.y, end.x - start.x);
            // Origin follows the weapon side; the unit's foot position never changes.
            start.x += Math.cos(angle) * 18;
            start.y += Math.sin(angle) * 9 - 5;
            const oldPose = this.poses.get(event.sourceId);
            if (!oldPose || oldPose.age > 170)
                this.poses.set(event.sourceId, { age: 0, dx: Math.cos(angle), dy: Math.sin(angle), style });
            this.targets.set(event.target.id, { position: end, isBoss: event.target.isBoss, variantTier: event.target.variantTier });
            // Only simplify excess decoration. Every attack still gets a target-locked hit.
            if (this.flights.length >= 240) {
                const oldest = this.flights.shift()!;
                this.impact(oldest, this.targets.get(oldest.event.target.id)?.position ?? oldest.position);
            }
            this.flights.push({ event, style, position: start, trail: [{ ...start }], charge: 35, age: 0, angle,
                damage: damageByHit.get(`${event.attackId}:${event.target.id}`) });
        }
    }
    update(delta: number, speed: number, liveTargets: Map<string, Point>) {
        const dt = Math.min(delta, 80) * Math.min(speed, 3);
        this.graphics.clear();
        for (const [id, position] of liveTargets) {
            const target = this.targets.get(id);
            if (target)
                target.position = project(position);
        }
        for (const [id, pose] of this.poses) {
            pose.age += Math.min(delta, 80) * Math.min(speed, 2);
            if (pose.age >= 280)
                this.poses.delete(id);
        }
        for (const [id, time] of this.flashes) {
            if (time <= dt)
                this.flashes.delete(id);
            else
                this.flashes.set(id, time - dt);
        }
        const surviving: Flight[] = [];
        for (const flight of this.flights) {
            flight.age += dt;
            const target = this.targets.get(flight.event.target.id)?.position ?? project(flight.event.to);
            flight.angle = Math.atan2(target.y - flight.position.y, target.x - flight.position.x);
            if (flight.charge > 0) {
                flight.charge -= dt;
                this.drawCharge(flight);
                surviving.push(flight);
                continue;
            }
            const advance = advanceHoming(flight.position, target, (1750 + flight.style.intensity * 90) * dt / 1000);
            flight.position = advance.position;
            if (dt > 0) {
                flight.trail.push({ ...flight.position });
                if (flight.trail.length > 8)
                    flight.trail.shift();
            }
            this.drawFlight(flight);
            if (advance.hit)
                this.impact(flight, target);
            else
                surviving.push(flight);
        }
        this.flights = surviving;
        for (const impact of this.impacts) {
            impact.age += dt;
            this.drawImpact(impact);
        }
        this.impacts = this.impacts.filter(i => i.age < 360);
        for (const label of this.labels) {
            label.age += dt;
            label.text.setY(label.y - label.age * 0.04).setAlpha(Math.max(0, 1 - label.age / 600));
            if (label.age >= 600)
                label.text.destroy();
        }
        this.labels = this.labels.filter(l => l.age < 600);
        const held = new Set(this.flights.map(f => f.event.target.id));
        for (const id of this.targets.keys())
            if (!held.has(id) && !this.flashes.has(id))
                this.targets.delete(id);
    }
    heldTargets(): ReadonlyMap<string, Target> { return this.targets; }
    isHit(id: string) { return this.flashes.has(id); }
    applyPose(id: string, sprite: Phaser.GameObjects.Image, anchor: Point, size: number, bob: number) {
        const pose = this.poses.get(id);
        sprite.setDisplaySize(size, size).setRotation(0).setPosition(anchor.x, anchor.y + bob);
        if (!pose)
            return;
        sprite.setFlipX(pose.dx < 0);
        if (this.reduced)
            return;
        const t = pose.age / 280;
        const windup = t < 0.23 ? -Math.sin(t / 0.23 * Math.PI / 2) : 0;
        const release = t >= 0.23 ? Math.sin(Math.min(1, (t - 0.23) / 0.77) * Math.PI) : 0;
        const melee = pose.style.kind === 'blade' || pose.style.kind === 'blood';
        const strength = melee ? 9 : 5;
        sprite.setPosition(anchor.x + pose.dx * (windup * 3 + release * strength), anchor.y + pose.dy * release * 3 - (melee ? 0 : release * 4));
        sprite.setRotation(pose.dx * (windup * 0.08 + release * (melee ? 0.19 : -0.09)));
        sprite.setDisplaySize(size * (1 + release * 0.07), size * (1 - release * 0.04 - windup * 0.04));
    }
    clear() {
        this.flights = [];
        this.impacts = [];
        this.poses.clear();
        this.targets.clear();
        this.flashes.clear();
        this.labels.forEach(l => l.text.destroy());
        this.labels = [];
        this.graphics.clear();
    }
    private impact(flight: Flight, at: Point) {
        if (this.impacts.length >= 100)
            this.impacts.shift();
        this.impacts.push({ position: { ...at }, style: flight.style, age: 0, critical: flight.event.critical });
        this.flashes.set(flight.event.target.id, 110);
        if (flight.event.critical && flight.damage && this.labels.length < 24) {
            const text = this.scene.add.text(at.x, at.y - 23, `${flight.damage}!`, { fontFamily: 'Georgia', fontSize: `${15 + Math.min(4, flight.style.intensity)}px`, fontStyle: 'bold', color: '#ffe4ad', stroke: '#11202a', strokeThickness: 3 }).setOrigin(0.5).setDepth(11);
            this.labels.push({ text, age: 0, y: at.y - 23 });
        }
    }
    private drawCharge(f: Flight) {
        const g = this.graphics, p = f.position, s = f.style;
        const radius = s.radius + 5 + Math.max(0, 35 - f.charge) * 0.15;
        g.fillStyle(s.color, 0.14);
        g.fillCircle(p.x, p.y, radius);
        g.lineStyle(1, s.core, 0.8);
        g.strokeCircle(p.x, p.y, radius * 0.6);
        this.star(p, 4 + s.intensity * 0.5, s.core, 0.85, f.angle);
    }
    private drawFlight(f: Flight) {
        const g = this.graphics, p = f.position, s = f.style, r = s.radius;
        const dx = Math.cos(f.angle), dy = Math.sin(f.angle), nx = -dy, ny = dx;
        const trail = f.trail;
        for (let i = 1; i < trail.length; i++) {
            const a = trail[i - 1]!, b = trail[i]!, alpha = i / trail.length;
            g.lineStyle((r + 2) * alpha, s.color, alpha * 0.22);
            g.lineBetween(a.x, a.y, b.x, b.y);
            g.lineStyle(Math.max(1, r * 0.35 * alpha), s.core, alpha * 0.65);
            g.lineBetween(a.x, a.y, b.x, b.y);
        }
        if (!this.reduced && s.intensity >= 1) {
            g.fillStyle(s.color, 0.08);
            g.fillCircle(p.x, p.y, r * 3);
            for (let i = 0; i < Math.min(4, Math.ceil(s.intensity)); i++) {
                const a = f.age * 0.017 + i * Math.PI / 2, spread = 7 + s.intensity;
                g.fillStyle(s.core, 0.65);
                g.fillCircle(p.x + Math.cos(a) * spread, p.y + Math.sin(a) * spread, 1 + s.intensity * 0.12);
            }
        }
        switch (s.kind) {
            case 'blade':
            case 'blood': {
                const length = 11 + s.intensity * 2;
                g.lineStyle(5 + s.intensity, s.color, 0.23);
                g.beginPath();
                g.arc(p.x - dx * 5, p.y - dy * 5, length, f.angle - 0.9, f.angle + 0.9);
                g.strokePath();
                g.lineStyle(2 + s.intensity * 0.2, s.core, 1);
                g.beginPath();
                g.arc(p.x - dx * 5, p.y - dy * 5, length, f.angle - 0.85, f.angle + 0.85);
                g.strokePath();
                if (s.kind === 'blood' || s.intensity > 2)
                    this.diamond(p, f.angle, length * 1.5, r * 0.65, s.color, 0.9);
                break;
            }
            case 'fire': {
                for (let i = 4; i >= 0; i--) {
                    const wobble = Math.sin(f.age * 0.06 + i) * i;
                    g.fillStyle(i % 2 ? 0xffbb4b : s.color, 0.9 - i * 0.13);
                    g.fillCircle(p.x - dx * i * 5 + nx * wobble, p.y - dy * i * 5 + ny * wobble, Math.max(1, r - i * 0.55));
                }
                g.fillStyle(s.core);
                g.fillCircle(p.x, p.y, r * 0.5);
                break;
            }
            case 'holy': {
                g.lineStyle(1.5, s.color, 0.9);
                g.strokeCircle(p.x, p.y, r + 4);
                this.star(p, r + 6, s.core, 1, f.age * 0.006);
                g.fillStyle(0xffffff);
                g.fillCircle(p.x, p.y, 2);
                break;
            }
            case 'lightning': {
                const length = 25 + s.intensity * 4;
                g.lineStyle(5, s.color, 0.3);
                g.lineBetween(p.x - dx * length, p.y - dy * length, p.x + dx * 7, p.y + dy * 7);
                g.lineStyle(1.8, s.core, 1);
                g.beginPath();
                for (let i = 0; i < 6; i++) {
                    const back = length * (1 - i / 5), kink = i === 5 ? 0 : (i % 2 ? 1 : -1) * (3 + s.intensity);
                    const x = p.x - dx * back + nx * kink, y = p.y - dy * back + ny * kink;
                    if (i === 0)
                        g.moveTo(x, y);
                    else
                        g.lineTo(x, y);
                }
                g.strokePath();
                this.diamond(p, f.angle, 11, 3, s.core, 1);
                break;
            }
            case 'ice': {
                this.diamond(p, f.angle, 13 + s.intensity, r, s.color, 0.95);
                this.diamond(p, f.angle, 9 + s.intensity, r * 0.38, s.core, 1);
                for (const sign of [-1, 1])
                    this.diamond({ x: p.x - dx * 9 + nx * sign * 8, y: p.y - dy * 9 + ny * sign * 8 }, f.angle, 6 + s.intensity * 0.4, 2, s.color, 0.7);
                break;
            }
            case 'poison': {
                g.fillStyle(s.color, 0.8);
                g.fillCircle(p.x, p.y, r + 1);
                g.lineStyle(1.2, s.core, 0.9);
                g.strokeCircle(p.x - 1, p.y - 1, r * 0.7);
                for (let i = 0; i < 3; i++) {
                    const a = f.age * 0.01 + i * 2.1;
                    g.fillStyle(s.color, 0.5);
                    g.fillCircle(p.x - dx * 12 + Math.cos(a) * 6, p.y - dy * 12 + Math.sin(a) * 6, 2.5);
                }
                break;
            }
            case 'time': {
                g.lineStyle(1.5, s.color, 0.95);
                g.strokeEllipse(p.x, p.y, r * 4, r * 2.2);
                g.lineStyle(1, s.core, 0.7);
                g.strokeCircle(p.x, p.y, r * 1.2);
                this.diamond(p, f.age * 0.01, r, r * 0.6, s.core, 1);
                break;
            }
        }
    }
    private drawImpact(impact: Impact) {
        const g = this.graphics, p = impact.position, s = impact.style;
        const t = impact.age / 360, alpha = Math.max(0, 1 - t), r = (8 + s.intensity * 3) * (0.35 + t * 1.5);
        g.fillStyle(s.color, alpha * 0.2);
        g.fillCircle(p.x, p.y, r);
        g.lineStyle(2 * alpha, s.color, alpha * 0.8);
        g.strokeCircle(p.x, p.y, r);
        if (s.intensity > 2) {
            g.lineStyle(1, s.core, alpha * 0.6);
            g.strokeCircle(p.x, p.y, r * 1.35);
        }
        if (t < 0.35)
            this.star(p, (impact.critical ? 22 : 12) * (1 - t), s.core, alpha, Math.PI / 4);
        const count = this.reduced ? 3 : s.sparks;
        for (let i = 0; i < count; i++) {
            const a = i * Math.PI * 2 / count + (i % 2) * 0.12;
            const distance = (9 + s.intensity * 4) * (0.4 + t * 1.8);
            const x = p.x + Math.cos(a) * distance, y = p.y + Math.sin(a) * distance;
            if (s.kind === 'ice')
                this.diamond({ x, y }, a, 5 * alpha, 2 * alpha, s.core, alpha);
            else if (s.kind === 'holy' || s.kind === 'time')
                this.star({ x, y }, 3 * alpha, s.core, alpha, a);
            else if (s.kind === 'poison') {
                g.fillStyle(s.color, alpha * 0.7);
                g.fillCircle(x, y, 3 * alpha);
            }
            else {
                g.lineStyle(1.5 * alpha, s.core, alpha);
                g.lineBetween(x, y, x + Math.cos(a) * 5 * alpha, y + Math.sin(a) * 5 * alpha);
            }
        }
    }
    private diamond(p: Point, angle: number, length: number, width: number, color: number, alpha: number) {
        const dx = Math.cos(angle), dy = Math.sin(angle);
        this.graphics.fillStyle(color, alpha);
        this.graphics.fillPoints([{ x: p.x + dx * length, y: p.y + dy * length }, { x: p.x - dy * width, y: p.y + dx * width }, { x: p.x - dx * length, y: p.y - dy * length }, { x: p.x + dy * width, y: p.y - dx * width }], true);
    }
    private star(p: Point, radius: number, color: number, alpha: number, angle: number) {
        this.diamond(p, angle, radius, radius * 0.18, color, alpha);
        this.diamond(p, angle + Math.PI / 2, radius, radius * 0.18, color, alpha);
    }
}
