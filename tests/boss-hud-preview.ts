import Phaser from 'phaser';
import { GameScene } from '../src/game/GameScene';
import { GameSimulation } from '../src/game/simulation';
import { createDefaultMetaProgress, createSeededRng } from '../src/game/systems';
import { DESIGN_HEIGHT, DESIGN_WIDTH } from '../src/game/geometry';
import { createUi } from '../src/ui';
import '../src/styles.css';

const simulation = new GameSimulation(createDefaultMetaProgress(), createSeededRng(12));
const ui = createUi(simulation, false);
simulation.state.board = [{instanceId:'hud-tower', definitionId:'rare-single', x:195, y:148, cooldownMs:0}];
simulation.state.wave = new URLSearchParams(location.search).get('boss') === 'true' ? 29 : 4;
simulation.state.difficulty = 'insane';
simulation.state.baseHealth = simulation.state.maxBaseHealth = 100;
simulation.startNextWave();
simulation.update(1);
for (const enemy of simulation.enemies) {
  enemy.speed = 0;
  enemy.progress = .1;
  enemy.armor = 0;
  enemy.hp = enemy.maxHp = 5000;
}
const scene = new GameScene(simulation, ui.showEvents, ui.setSelectedSlot, ui.getSpeedMultiplier, ui.render);
ui.setScene(scene);
new Phaser.Game({type:Phaser.AUTO, parent:'game-root', width:DESIGN_WIDTH, height:DESIGN_HEIGHT, scene,
  scale:{mode:Phaser.Scale.FIT,autoCenter:Phaser.Scale.CENTER_BOTH,width:DESIGN_WIDTH,height:DESIGN_HEIGHT}});
