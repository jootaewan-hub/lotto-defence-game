import Phaser from "phaser";
import { GameScene } from "./game/GameScene";
import { DESIGN_HEIGHT, DESIGN_WIDTH } from "./game/geometry";
import { GameSimulation } from "./game/simulation";
import { loadMetaProgress } from "./game/storage";
import { createUi } from "./ui";
import "./styles.css";

const simulation = new GameSimulation(loadMetaProgress());
const ui = createUi(simulation);
const scene = new GameScene(simulation, ui.showEvents, ui.setSelectedSlot, ui.getSpeedMultiplier, ui.render);
ui.setScene(scene);

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game-root",
  backgroundColor: "#10242a",
  width: DESIGN_WIDTH,
  height: DESIGN_HEIGHT,
  scene,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: DESIGN_WIDTH,
    height: DESIGN_HEIGHT,
  },
});
