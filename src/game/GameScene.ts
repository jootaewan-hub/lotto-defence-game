import Phaser from "phaser";
import { BOARD, DESIGN_WIDTH, PATH_POINTS, getBoardSlotAt, getBoardSlotCenter, getPathPosition } from "./geometry";
import type { GameSimulation, SimulationEvent } from "./simulation";
import { getRarity } from "./rarities";
import { getUnitDefinition } from "./units";

export class GameScene extends Phaser.Scene {
  private readonly simulation: GameSimulation;
  private readonly onEvents: (events: SimulationEvent[]) => void;
  private readonly onSelectionChange: (slot: number | null) => void;
  private boardGraphics!: Phaser.GameObjects.Graphics;
  private worldGraphics!: Phaser.GameObjects.Graphics;
  private unitLabels: Phaser.GameObjects.Text[] = [];
  private selectedSlot: number | null = null;

  constructor(
    simulation: GameSimulation,
    onEvents: (events: SimulationEvent[]) => void,
    onSelectionChange: (slot: number | null) => void,
  ) {
    super("GameScene");
    this.simulation = simulation;
    this.onEvents = onEvents;
    this.onSelectionChange = onSelectionChange;
  }

  create(): void {
    this.cameras.main.setBackgroundColor("#f7fbff");
    this.worldGraphics = this.add.graphics();
    this.boardGraphics = this.add.graphics();

    for (let index = 0; index < BOARD.columns * BOARD.rows; index += 1) {
      const center = getBoardSlotCenter(index);
      const label = this.add
        .text(center.x, center.y, "", {
          align: "center",
          color: "#1f2a44",
          fontFamily: "Arial, sans-serif",
          fontSize: "12px",
          fontStyle: "700",
        })
        .setOrigin(0.5);
      this.unitLabels.push(label);
    }

    this.add
      .text(DESIGN_WIDTH / 2, 38, "운빨 디펜스", {
        color: "#26324f",
        fontFamily: "Arial, sans-serif",
        fontSize: "24px",
        fontStyle: "900",
      })
      .setOrigin(0.5);

    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      const slot = getBoardSlotAt({ x: pointer.x, y: pointer.y });
      if (slot === null) {
        return;
      }
      this.handleBoardTap(slot);
    });
  }

  update(_time: number, delta: number): void {
    this.simulation.update(delta);
    this.drawWorld();
    this.drawBoard();

    const events = this.simulation.drainEvents();
    if (events.length > 0) {
      this.onEvents(events);
    }
  }

  clearSelection(): void {
    this.selectedSlot = null;
    this.onSelectionChange(null);
  }

  getSelectedSlot(): number | null {
    return this.selectedSlot;
  }

  private handleBoardTap(slot: number): void {
    const selectedUnit = this.selectedSlot === null ? null : this.simulation.state.board[this.selectedSlot];
    const targetUnit = this.simulation.state.board[slot];

    if (this.selectedSlot !== null && selectedUnit && !targetUnit) {
      this.simulation.moveUnit(this.selectedSlot, slot);
      this.selectedSlot = slot;
    } else {
      this.selectedSlot = targetUnit ? slot : null;
    }

    this.onSelectionChange(this.selectedSlot);
  }

  private drawWorld(): void {
    this.worldGraphics.clear();

    this.worldGraphics.fillStyle(0xdff7f0, 1);
    this.worldGraphics.fillRoundedRect(18, 72, DESIGN_WIDTH - 36, 324, 22);
    this.worldGraphics.lineStyle(30, 0xfbd38d, 1);
    this.worldGraphics.beginPath();
    this.worldGraphics.moveTo(PATH_POINTS[0]!.x, PATH_POINTS[0]!.y);
    for (const point of PATH_POINTS.slice(1)) {
      this.worldGraphics.lineTo(point.x, point.y);
    }
    this.worldGraphics.strokePath();
    this.worldGraphics.lineStyle(4, 0xffffff, 0.82);
    this.worldGraphics.strokePath();

    this.worldGraphics.fillStyle(0xfff7ed, 1);
    this.worldGraphics.fillRoundedRect(288, 330, 82, 54, 14);
    this.worldGraphics.fillStyle(0xf97316, 1);
    this.worldGraphics.fillCircle(330, 356, 18);

    for (const enemy of this.simulation.enemies) {
      const position = getPathPosition(enemy.progress);
      const radius = enemy.isBoss ? 19 : 12;
      this.worldGraphics.fillStyle(enemy.isBoss ? 0xfb7185 : 0x60a5fa, 1);
      this.worldGraphics.fillCircle(position.x, position.y, radius);
      this.worldGraphics.fillStyle(0xffffff, 0.8);
      this.worldGraphics.fillCircle(position.x - radius * 0.25, position.y - radius * 0.25, radius * 0.28);

      const hpWidth = enemy.isBoss ? 44 : 28;
      const hpRatio = Math.max(0, enemy.hp / enemy.maxHp);
      this.worldGraphics.fillStyle(0x223049, 0.25);
      this.worldGraphics.fillRoundedRect(position.x - hpWidth / 2, position.y - radius - 10, hpWidth, 5, 2);
      this.worldGraphics.fillStyle(0x22c55e, 1);
      this.worldGraphics.fillRoundedRect(position.x - hpWidth / 2, position.y - radius - 10, hpWidth * hpRatio, 5, 2);
    }
  }

  private drawBoard(): void {
    this.boardGraphics.clear();
    this.boardGraphics.fillStyle(0xeff6ff, 1);
    this.boardGraphics.fillRoundedRect(18, 410, DESIGN_WIDTH - 36, 356, 22);

    for (let index = 0; index < BOARD.columns * BOARD.rows; index += 1) {
      const center = getBoardSlotCenter(index);
      const x = center.x - BOARD.cell / 2;
      const y = center.y - BOARD.cell / 2;
      const unit = this.simulation.state.board[index];

      this.boardGraphics.lineStyle(index === this.selectedSlot ? 4 : 2, index === this.selectedSlot ? 0xf59e0b : 0xcbd5e1, 1);
      this.boardGraphics.fillStyle(0xffffff, 0.94);
      this.boardGraphics.fillRoundedRect(x, y, BOARD.cell, BOARD.cell, 16);
      this.boardGraphics.strokeRoundedRect(x, y, BOARD.cell, BOARD.cell, 16);

      const label = this.unitLabels[index]!;
      if (!unit) {
        label.setText("");
        continue;
      }

      const definition = getUnitDefinition(unit.definitionId);
      const rarity = getRarity(definition.rarity);
      const roleIcon = definition.role === "single" ? "S" : definition.role === "area" ? "A" : "B";
      const rarityColor = Phaser.Display.Color.HexStringToColor(rarity.color).color;

      this.boardGraphics.fillStyle(rarityColor, 1);
      this.boardGraphics.fillCircle(center.x, center.y - 8, 22);
      this.boardGraphics.fillStyle(0xffffff, 0.72);
      this.boardGraphics.fillCircle(center.x - 7, center.y - 15, 7);
      label.setText(`${roleIcon}\n${rarity.label}`);
    }
  }
}
