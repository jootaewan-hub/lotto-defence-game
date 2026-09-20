import type Phaser from 'phaser';
import type { CombatStyle } from './combatVisuals';

type Vec3 = { x: number; y: number; z: number };
type Screen = { x: number; y: number };
function rotate(p: Vec3, pitch: number, yaw: number): Vec3 {
    const y = p.y * Math.cos(pitch) - p.z * Math.sin(pitch);
    const z = p.y * Math.sin(pitch) + p.z * Math.cos(pitch);
    return { x: p.x * Math.cos(yaw) + z * Math.sin(yaw), y, z: z * Math.cos(yaw) - p.x * Math.sin(yaw) };
}
function project(p: Vec3, x: number, y: number): Screen {
    const scale = 420 / (420 + p.z);
    return { x: x + p.x * scale, y: y + p.y * scale };
}
function shade(color: number, light: number) {
    return (Math.min(255, Math.round((color >> 16 & 255) * light)) << 16)
        | (Math.min(255, Math.round((color >> 8 & 255) * light)) << 8)
        | Math.min(255, Math.round((color & 255) * light));
}

/** A rotating, perspective-projected octahedron with back-to-front shaded faces. */
export function crystal(g: Phaser.GameObjects.Graphics, x: number, y: number, radius: number, height: number, spin: number, color: number, alpha = 1) {
    const points = [ {x:0,y:-height,z:0}, {x:radius,y:0,z:0}, {x:0,y:0,z:radius}, {x:-radius,y:0,z:0}, {x:0,y:0,z:-radius}, {x:0,y:height,z:0} ].map(p => rotate(p, -.28, spin));
    const faces = [[0,1,2],[0,2,3],[0,3,4],[0,4,1],[5,2,1],[5,3,2],[5,4,3],[5,1,4]].map((ids, i) => ({ ids, depth: ids.reduce((sum, id) => sum + points[id]!.z, 0), light: [.95,.6,.4,1.25,.55,.35,.5,.85][i]! })).sort((a,b) => b.depth-a.depth);
    for (const face of faces) {
        g.fillStyle(shade(color, face.light), alpha);
        g.fillPoints(face.ids.map(id => project(points[id]!, x, y)), true);
    }
}

export function glow(g: Phaser.GameObjects.Graphics, x: number, y: number, radius: number, color: number, alpha: number) {
    for (let i = 5; i >= 1; i--) {
        g.fillStyle(color, alpha * (6-i) * .018);
        g.fillCircle(x, y, radius * i / 3);
    }
    g.fillStyle(0xfff8e9, alpha * .85);
    g.fillCircle(x - radius * .12, y - radius * .15, radius * .19);
}

/** Tilted ring lives in 3D; distant segments are dimmer and narrower. */
export function orbit(g: Phaser.GameObjects.Graphics, x: number, y: number, radius: number, spin: number, color: number, alpha: number, pitch = 1.05, width = 2) {
    for (let i = 0; i < 32; i++) {
        const a = spin + i * Math.PI / 16, b = a + Math.PI / 16;
        const p = rotate({x:Math.cos(a)*radius,y:Math.sin(a)*radius,z:0},pitch,.25);
        const q = rotate({x:Math.cos(b)*radius,y:Math.sin(b)*radius,z:0},pitch,.25);
        const near = p.z < 0, start = project(p,x,y), end = project(q,x,y);
        g.lineStyle(width * (near ? 1.4 : .65), color, alpha * (near ? 1 : .35));
        g.lineBetween(start.x,start.y,end.x,end.y);
    }
}

export function dimensionalProjectile(g: Phaser.GameObjects.Graphics, p: Screen, style: CombatStyle, age: number, reduced: boolean) {
    const r = style.radius * 1.55, spin = reduced ? .4 : age / 240;
    glow(g,p.x,p.y,r*1.9,style.color,.65);
    if (style.kind === 'ice' || style.kind === 'lightning' || style.kind === 'blade' || style.kind === 'blood') {
        crystal(g,p.x,p.y,r*.65,r*1.65,spin,style.color);
        if (!reduced) for (let i=0;i<3;i++) {
            const a=spin+i*Math.PI*2/3;
            crystal(g,p.x+Math.cos(a)*r*1.6,p.y+Math.sin(a)*r*.7,r*.22,r*.6,-spin,style.core,.75);
        }
    } else {
        g.fillStyle(shade(style.color,.35),.95);g.fillCircle(p.x,p.y,r*.8);
        g.fillStyle(style.color,.8);g.fillCircle(p.x-r*.17,p.y-r*.2,r*.6);
        glow(g,p.x-r*.2,p.y-r*.25,r*.7,style.core,.9);
        orbit(g,p.x,p.y,r*1.55,spin,style.core,.8,style.kind==='time'?.55:1.15);
        if(style.kind==='time')orbit(g,p.x,p.y,r*1.8,-spin,style.color,.7,.2);
    }
}

export function dimensionalBurst(g: Phaser.GameObjects.Graphics, x: number, y: number, skill: string, t: number, reduced: boolean) {
    const ultimate=skill==='heaven-split', fire=skill==='inferno', holy=skill==='blessing';
    const color=ultimate?0xffd474:fire?0xff733d:holy?0xc6a2ff:skill==='berserk'?0xff4c72:0x85dfff;
    const alpha=Math.sin(Math.PI*Math.min(.999,t)), spin=reduced?0:t*Math.PI*2;
    const radius=(ultimate?185:fire?145:holy?65:85)*(.25+Math.sqrt(t)*.75);
    // A luminous column with nested translucent volumes and a hot central core.
    const height=(ultimate?270:fire?180:100)*Math.sin(Math.PI*t);
    for(let layer=5;layer>=1;layer--){
        const w=(ultimate?13:9)*layer;
        g.fillStyle(color,alpha*.025*(6-layer));
        g.fillTriangle(x-w,y,x+w,y,x+w*.2,y-height);
        g.fillTriangle(x-w,y,x+w*.2,y-height,x-w*.2,y-height);
    }
    glow(g,x,y-12,radius*.65,color,alpha*.65);
    orbit(g,x,y+8,radius,spin,color,alpha,1.15,3);
    orbit(g,x,y+8,radius*.75,-spin,0xffefc4,alpha*.85,.75,2);
    if(ultimate){
        crystal(g,x,y-height*.45,18*alpha,Math.max(1,height*.5),spin*.15,0xffecb5,alpha);
        orbit(g,x,y-height*.55,radius*.42,-spin,0x95eaff,alpha,.8,2);
    }
    const count=reduced?4:ultimate?16:12;
    for(let i=0;i<count;i++){
        const a=i*Math.PI*2/count+spin*(fire?1.6:.35);
        const z=Math.sin(a)*radius*.5;
        const scale=420/(420+z);
        const px=x+Math.cos(a)*radius*scale;
        const py=y+z*.45-(fire?(i%4)*height/5:Math.sin(Math.PI*t)*(i%3)*14);
        const size=(ultimate?7:5)*scale*alpha;
        if(fire){glow(g,px,py,size*2.8,color,alpha);crystal(g,px,py,size,size*2,spin,0xffbd56,alpha);}
        else crystal(g,px,py,size,size*(holy?2:3.5),spin+i,color,alpha);
    }
}
