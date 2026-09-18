import Phaser from 'phaser';
import { GameSimulation } from '../src/game/simulation';
import { GameScene } from '../src/game/GameScene';
import { createDefaultMetaProgress, createSeededRng } from '../src/game/systems';
import { superForgeMarkup } from '../src/superUi';
const sim = new GameSimulation(createDefaultMetaProgress(),createSeededRng(7));
sim.state.gold=20000;
sim.state.board=['archer','warrior','mage','priest'].map((type,i)=>({instanceId:`s${i}`,definitionId:`super-${type}`,x:150+i*35,y:190,cooldownMs:0}));
const forge=document.querySelector('#forge')!;
forge.innerHTML=superForgeMarkup(sim);
let skillCount=0;
function status(){document.querySelector('#status')!.textContent=`골드 ${sim.state.gold} · 타워 ${sim.state.board.map(u=>u.definitionId).join(', ')} · 천지개벽 ${skillCount}회`;}
status();
forge.addEventListener('click',e=>{if((e.target as HTMLElement).closest('[data-craft-ultimate]')){sim.craftUltimate();forge.innerHTML=superForgeMarkup(sim);status();}});
document.querySelector('#battle')!.addEventListener('click',()=>sim.startNextWave());
new Phaser.Game({type:Phaser.AUTO,parent:'game-root',width:780,height:500,scene:new GameScene(sim,events=>{skillCount+=events.filter(e=>e.type==='superSkill'&&e.skill==='heaven-split'&&e.targets?.length).length;status();},()=>{},()=>1,status)});
