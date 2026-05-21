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
  private hoverPanel!: Phaser.GameObjects.Container;
  private hoverPanelBg!: Phaser.GameObjects.Graphics;
  private hoverText!: Phaser.GameObjects.Text;
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
    this.hoverPanelBg = this.add.graphics();
    this.hoverText = this.add.text(8, 8, "", {
      color: "#172033",
      fontFamily: "Arial, sans-serif",
      fontSize: "12px",
      fontStyle: "700",
      lineSpacing: 3,
    });
    this.hoverPanel = this.add.container(0, 0, [this.hoverPanelBg, this.hoverText]).setDepth(20).setVisible(false);

    for (let index = 0; index < BOARD.columns * BOARD.rows; index += 1) {
      const center = getBoardSlotCenter(index);
      const label = this.add
        .text(center.x, center.y, "", {
          align: "center",
          color: "#1f2a44",
          fontFamily: "Arial, sans-serif",
          fontSize: "10px",
          fontStyle: "700",
        })
        .setOrigin(0.5)
        .setDepth(5);
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

    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      this.updateHoverPanel(pointer.x, pointer.y);
    });

    this.input.on("pointerout", () => {
      this.hoverPanel.setVisible(false);
    });
  }

  update(_time: number, delta: number): void {
    this.simulation.update(delta);
    this.drawWorld();
    this.drawBoard();

    const events = this.simulation.drainEvents();
    if (events.length > 0) {
      this.playCombatEffects(events);
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
    this.worldGraphics.fillRoundedRect(28, 70, DESIGN_WIDTH - 56, 344, 22);
    this.worldGraphics.lineStyle(28, 0xfbd38d, 1);
    this.worldGraphics.beginPath();
    this.worldGraphics.moveTo(PATH_POINTS[0]!.x, PATH_POINTS[0]!.y);
    for (const point of PATH_POINTS.slice(1)) {
      this.worldGraphics.lineTo(point.x, point.y);
    }
    this.worldGraphics.strokePath();
    this.worldGraphics.lineStyle(4, 0xffffff, 0.82);
    this.worldGraphics.strokePath();

    this.worldGraphics.fillStyle(0xb7f0df, 0.86);
    this.worldGraphics.fillRoundedRect(88, 132, 214, 214, 24);
    this.worldGraphics.lineStyle(2, 0x7dd3fc, 0.55);
    this.worldGraphics.strokeRoundedRect(88, 132, 214, 214, 24);

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
    this.boardGraphics.fillStyle(0xeefcff, 0.72);
    this.boardGraphics.fillRoundedRect(96, 140, 198, 198, 20);

    for (let index = 0; index < BOARD.columns * BOARD.rows; index += 1) {
      const center = getBoardSlotCenter(index);
      const x = center.x - BOARD.cell / 2;
      const y = center.y - BOARD.cell / 2;
      const unit = this.simulation.state.board[index];

      this.boardGraphics.lineStyle(index === this.selectedSlot ? 3 : 1, index === this.selectedSlot ? 0xf59e0b : 0xcbd5e1, 1);
      this.boardGraphics.fillStyle(0xffffff, 0.94);
      this.boardGraphics.fillRoundedRect(x, y, BOARD.cell, BOARD.cell, 10);
      this.boardGraphics.strokeRoundedRect(x, y, BOARD.cell, BOARD.cell, 10);

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
      this.boardGraphics.fillCircle(center.x, center.y - 5, 15);
      this.boardGraphics.fillStyle(0xffffff, 0.72);
      this.boardGraphics.fillCircle(center.x - 5, center.y - 10, 4);
      label.setText(`${roleIcon}\n${rarity.label}`);
    }
  }

  private updateHoverPanel(x: number, y: number): void {
    const slot = getBoardSlotAt({ x, y });
    if (slot !== null && this.simulation.state.board[slot]) {
      const unit = this.simulation.state.board[slot]!;
      const definition = getUnitDefinition(unit.definitionId);
      const rarity = getRarity(definition.rarity);
      this.showHoverText(
        x,
        y,
        [
          `${definition.name} (${rarity.label})`,
          `공격력 ${definition.attack}`,
          `공격 타입 ${definition.attackType}`,
          `공격속도 ${(1000 / definition.attackSpeed).toFixed(2)}/초`,
          `크리티컬 ${(definition.criticalChance * 100).toFixed(1)}%`,
        ].join("\n"),
      );
      return;
    }

    const enemy = this.findEnemyAt(x, y);
    if (enemy) {
      this.showHoverText(
        x,
        y,
        [`몬스터 ${enemy.isBoss ? "보스" : "일반"}`, `HP ${Math.max(0, Math.ceil(enemy.hp))}/${enemy.maxHp}`].join("\n"),
      );
      return;
    }

    this.hoverPanel.setVisible(false);
  }

  private showHoverText(x: number, y: number, text: string): void {
    this.hoverText.setText(text);
    const width = Math.max(148, this.hoverText.width + 18);
    const height = this.hoverText.height + 18;
    const panelX = Math.min(DESIGN_WIDTH - width - 8, Math.max(8, x + 14));
    const panelY = Math.min(666 - height, Math.max(54, y + 14));

    this.hoverPanelBg.clear();
    this.hoverPanelBg.fillStyle(0xffffff, 0.94);
    this.hoverPanelBg.fillRoundedRect(0, 0, width, height, 10);
    this.hoverPanelBg.lineStyle(1, 0x94a3b8, 0.75);
    this.hoverPanelBg.strokeRoundedRect(0, 0, width, height, 10);
    this.hoverPanel.setPosition(panelX, panelY).setVisible(true);
  }

  private findEnemyAt(x: number, y: number) {
    return (
      this.simulation.enemies.find((enemy) => {
        const position = getPathPosition(enemy.progress);
        const radius = enemy.isBoss ? 21 : 14;
        return Math.hypot(position.x - x, position.y - y) <= radius;
      }) ?? null
    );
  }

  private playCombatEffects(events: SimulationEvent[]): void {
    for (const event of events) {
      if (event.type === "attack") {
        this.playAttackLine(event.from, event.to, event.critical);
      }
      if (event.type === "damage") {
        this.playDamageNumber(event.at, event.amount, event.critical);
      }
    }
  }

  private playAttackLine(from: { x: number; y: number }, to: { x: number; y: number }, critical: boolean): void {
    const line = this.add.graphics().setDepth(12);
    line.lineStyle(critical ? 4 : 2, critical ? 0xf43f5e : 0x38bdf8, critical ? 0.95 : 0.75);
    line.beginPath();
    line.moveTo(from.x, from.y);
    line.lineTo(to.x, to.y);
    line.strokePath();
    this.tweens.add({
      targets: line,
      alpha: 0,
      duration: 180,
      onComplete: () => line.destroy(),
    });
  }

  private playDamageNumber(at: { x: number; y: number }, amount: number, critical: boolean): void {
    const text = this.add
      .text(at.x, at.y - 18, `${critical ? "CRIT " : ""}${amount}`, {
        color: critical ? "#f43f5e" : "#172033",
        fontFamily: "Arial, sans-serif",
        fontSize: critical ? "15px" : "12px",
        fontStyle: "900",
        stroke: "#ffffff",
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(14);
    this.tweens.add({
      targets: text,
      y: text.y - 26,
      alpha: 0,
      duration: 620,
      ease: "Cubic.easeOut",
      onComplete: () => text.destroy(),
    });
  }
}
