import Phaser from 'phaser';
import { GameScene } from '../src/game/GameScene';
import { DESIGN_HEIGHT, DESIGN_WIDTH } from '../src/game/geometry';
import { GameSimulation } from '../src/game/simulation';
import { createDefaultMetaProgress, createSeededRng } from '../src/game/systems';
import { createUi } from '../src/ui';
import '../src/styles.css';

// Uses the real controls and combat scene without touching saved player progress.
const simulation = new GameSimulation(createDefaultMetaProgress(), createSeededRng(20260928));
const ui = createUi(simulation, false);
const scene = new GameScene(simulation, ui.showEvents, ui.setSelectedSlot, ui.getSpeedMultiplier, ui.render);
ui.setScene(scene);

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game-root',
  backgroundColor: '#10242a',
  width: DESIGN_WIDTH,
  height: DESIGN_HEIGHT,
  scene,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: DESIGN_WIDTH, height: DESIGN_HEIGHT },
});
