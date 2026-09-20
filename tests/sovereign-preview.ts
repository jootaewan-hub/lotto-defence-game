import Phaser from 'phaser';
import { GameScene } from '../src/game/GameScene';
import { GameSimulation } from '../src/game/simulation';
import { createDefaultMetaProgress, createSeededRng } from '../src/game/systems';
import { getBossEncounter } from '../src/game/waves';
import { getTrueBossDefinition } from '../src/game/enemyVariants';
import { CombatEffects } from '../src/game/CombatEffects';
import type { SimulationEvent } from '../src/game/simulation';
const sim = new GameSimulation(createDefaultMetaProgress(), createSeededRng(8));
sim.state.board = [{ instanceId: 'mugeuk-preview', definitionId: 'ultimate-mugeuk', x: 195, y: 239, cooldownMs: 1e12 }];
let awakened = false, frozen = false, speed = 1;
function populate() {
    sim.enemies.splice(0);
    [5, 10, 30, 50, 70, 120].forEach((wave, i) => {
        const stage = getBossEncounter(wave)!, id = stage.bossId ?? stage.trueBossId;
        const def = id ? getTrueBossDefinition(id) : null;
        sim.enemies.push({ id: `preview-${i}`, wave, variantId: def?.variantId ?? 'blade', variantLabel: def?.label ?? '오우거 족장', variantTint: def?.tint ?? 0xe0b580, variantTier: def?.tier ?? 1, trueBossId: stage.trueBossId ?? (awakened ? id : undefined), hp: 8e12, maxHp: 1e13, armor: 0, speed: 0, progress: [.06,.18,.36,.57,.69,.9][i]!, rewardGold: 0, isBoss: true, effects: frozen ? [{ kind: 'freeze', remainingMs: 999999, magnitude: 1 }] : [] });
    });
}
populate();
let demo = false, demoAge = 0, demoIndex = 0;
const skills = ['heaven-split', 'inferno', 'blessing', 'berserk', 'dragon-ring'] as const;
class PreviewScene extends GameScene {
    private demoEffects!: CombatEffects;
    create() { super.create(); this.demoEffects = new CombatEffects(this, window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
    update(time: number, delta: number) {
        super.update(time, delta);
        if (!this.demoEffects) return;
        if (demo) {
            demoAge += delta * speed;
            if (demoAge > 1350) {
                demoAge = 0;
                this.demoEffects.emit([{ type: 'superSkill', skill: skills[demoIndex++ % skills.length]!, sourceId: 'mugeuk-preview', at: { x: 195, y: 239 }, targets: [{x:140,y:200},{x:260,y:280}] }]);
                const abilities = ['multishot','poison','freeze','slow','berserk'] as const;
                this.demoEffects.emit(abilities.map((ability,i):SimulationEvent => ({type:'attack',attackId:`preview-${demoIndex}-${i}`,sourceId:'mugeuk-preview',unitLevel:30,target:{id:`effect-${i}`,isBoss:false,variantTier:1},from:{x:100,y:170+i*30},to:{x:290,y:170+i*30},critical:true,rarityTier:8,color:'#ffffff',role:'single',ability,superType:'mage'})));
            }
        }
        this.demoEffects.update(delta,speed,new Map());
    }
}
const scene = new PreviewScene(sim, () => {}, () => {}, () => speed, () => {});
new Phaser.Game({ type: Phaser.AUTO, parent: 'game-root', width: 780, height: 500, scene });
document.querySelector('#rank')!.addEventListener('click', () => { awakened = !awakened; populate(); });
document.querySelector('#freeze')!.addEventListener('click', () => { frozen = !frozen; populate(); });
document.querySelector('#pause')!.addEventListener('click', () => { speed = speed ? 0 : 1; });
const demoButton = document.createElement('button');
demoButton.textContent = '입체 스킬 시연';
document.querySelector('#pause')!.after(demoButton);
demoButton.addEventListener('click', () => { demo = !demo; demoAge = 1400; demoButton.textContent = demo ? '스킬 시연 끄기' : '입체 스킬 시연'; });
