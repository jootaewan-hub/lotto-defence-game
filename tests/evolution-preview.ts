import Phaser from 'phaser';
import { GameScene } from '../src/game/GameScene';
import { GameSimulation } from '../src/game/simulation';
import { createDefaultMetaProgress, createSeededRng } from '../src/game/systems';
import { RARITIES } from '../src/game/rarities';
import { getUnitDefinition } from '../src/game/units';
const sim = new GameSimulation(createDefaultMetaProgress(), createSeededRng(8));
function populate(crowd: boolean) {
  const roles = ['archer','single','area','support'];
  const types = ['archer','warrior','mage','priest'];
  sim.state.board = Array.from({length: crowd ? 200 : 40}, (_, i) => {
    const col = i % 10, row = Math.floor(i / 10) % 4;
    return { instanceId: `preview-${crowd}-${i}`, definitionId: col === 9 ? `super-${types[row]}` : `${RARITIES[col]!.id}-${roles[row]}`, x: 87 + col * 26, y: 143 + (crowd ? Math.floor(i / 10) * 8 : row * 58), cooldownMs: 0 };
  });
  document.querySelector('#status')!.textContent = `${sim.state.board.length}명 · ${sim.state.board.map(u => getUnitDefinition(u.definitionId).name).slice(0,10).join(' → ')}`;
}
populate(false);
document.querySelector('#crowd')!.addEventListener('click', () => populate(true));
document.querySelector('#normal')!.addEventListener('click', () => populate(false));
new Phaser.Game({ type:Phaser.AUTO, parent:'game-root', width:780, height:500,
  scene:new GameScene(sim, () => {}, () => {}, () => 1, () => {}) });

document.querySelectorAll<HTMLButtonElement>('[data-theme]').forEach(button => button.addEventListener('click', () => { sim.state.difficulty = button.dataset.theme as typeof sim.state.difficulty; }));
