import Phaser from "phaser";
import { DESIGN_WIDTH, PATH_POINTS, TOWER_FIELD, TOWER_RADIUS, getPathPosition } from "./geometry";
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
  private unitLabels = new Map<string, Phaser.GameObjects.Text>();
  private selectedSlot: number | null = null;
  private draggingSlot: number | null = null;

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

    this.add
      .text(DESIGN_WIDTH / 2, 38, "운빨 디펜스", {
        color: "#26324f",
        fontFamily: "Arial, sans-serif",
        fontSize: "24px",
        fontStyle: "900",
      })
      .setOrigin(0.5);

    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      const slot = this.findTowerAt(pointer.x, pointer.y);
      if (slot === null) {
        this.selectedSlot = null;
        this.onSelectionChange(null);
        return;
      }
      this.selectedSlot = slot;
      this.draggingSlot = slot;
      this.onSelectionChange(slot);
    });

    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (this.draggingSlot !== null) {
        this.simulation.moveUnitTo(this.draggingSlot, pointer.x, pointer.y);
      }
      this.updateHoverPanel(pointer.x, pointer.y);
    });

    this.input.on("pointerup", () => {
      this.draggingSlot = null;
    });

    this.input.on("pointerout", () => {
      this.draggingSlot = null;
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

  private drawWorld(): void {
    this.worldGraphics.clear();

    this.worldGraphics.fillGradientStyle(0xdff7f0, 0xf8fafc, 0xdbeafe, 0xfef3c7, 1);
    this.worldGraphics.fillRoundedRect(24, 66, DESIGN_WIDTH - 48, 356, 22);
    this.worldGraphics.lineStyle(31, 0x334155, 0.18);
    this.worldGraphics.strokeRoundedRect(37, 81, 316, 316, 26);
    this.worldGraphics.lineStyle(28, 0xf9c56d, 1);
    this.worldGraphics.beginPath();
    this.worldGraphics.moveTo(PATH_POINTS[0]!.x, PATH_POINTS[0]!.y);
    for (const point of PATH_POINTS.slice(1)) {
      this.worldGraphics.lineTo(point.x, point.y);
    }
    this.worldGraphics.strokePath();
    this.worldGraphics.lineStyle(4, 0xffffff, 0.82);
    this.worldGraphics.strokePath();

    this.worldGraphics.fillStyle(0xe0fbf1, 0.94);
    this.worldGraphics.fillRoundedRect(TOWER_FIELD.x - 8, TOWER_FIELD.y - 8, TOWER_FIELD.width + 16, TOWER_FIELD.height + 16, 28);
    this.worldGraphics.lineStyle(2, 0x7dd3fc, 0.55);
    this.worldGraphics.strokeRoundedRect(TOWER_FIELD.x - 8, TOWER_FIELD.y - 8, TOWER_FIELD.width + 16, TOWER_FIELD.height + 16, 28);

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
    const seenLabels = new Set<string>();

    for (let index = 0; index < this.simulation.state.board.length; index += 1) {
      const unit = this.simulation.state.board[index];
      if (!unit) {
        continue;
      }

      const definition = getUnitDefinition(unit.definitionId);
      const rarity = getRarity(definition.rarity);
      const roleIcon = definition.role === "single" ? "S" : definition.role === "area" ? "A" : "B";
      const rarityColor = Phaser.Display.Color.HexStringToColor(rarity.color).color;
      const radius = TOWER_RADIUS + Math.min(4, Math.floor(index / 8));

      if (index === this.selectedSlot) {
        this.boardGraphics.lineStyle(3, 0xf59e0b, 0.95);
        this.boardGraphics.strokeCircle(unit.x, unit.y, radius + 6);
      }
      this.boardGraphics.fillStyle(0xffffff, 0.76);
      this.boardGraphics.fillCircle(unit.x + 1, unit.y + 3, radius + 4);
      this.boardGraphics.fillStyle(rarityColor, 1);
      this.boardGraphics.fillCircle(unit.x, unit.y, radius);
      this.boardGraphics.fillStyle(0xffffff, 0.72);
      this.boardGraphics.fillCircle(unit.x - radius * 0.34, unit.y - radius * 0.36, radius * 0.28);

      const label = this.getUnitLabel(unit.instanceId);
      seenLabels.add(unit.instanceId);
      label.setPosition(unit.x, unit.y + 1);
      label.setText(`${roleIcon}\n${rarity.label}`);
    }

    for (const [id, label] of this.unitLabels) {
      if (!seenLabels.has(id)) {
        label.destroy();
        this.unitLabels.delete(id);
      }
    }
  }

  private updateHoverPanel(x: number, y: number): void {
    const slot = this.findTowerAt(x, y);
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

  private findTowerAt(x: number, y: number): number | null {
    for (let index = this.simulation.state.board.length - 1; index >= 0; index -= 1) {
      const unit = this.simulation.state.board[index]!;
      if (Math.hypot(unit.x - x, unit.y - y) <= TOWER_RADIUS + 8) {
        return index;
      }
    }
    return null;
  }

  private getUnitLabel(instanceId: string): Phaser.GameObjects.Text {
    const existing = this.unitLabels.get(instanceId);
    if (existing) {
      return existing;
    }
    const label = this.add
      .text(0, 0, "", {
        align: "center",
        color: "#172033",
        fontFamily: "Arial, sans-serif",
        fontSize: "9px",
        fontStyle: "900",
        stroke: "#ffffff",
        strokeThickness: 2,
      })
      .setOrigin(0.5)
      .setDepth(5);
    this.unitLabels.set(instanceId, label);
    return label;
  }

  private playCombatEffects(events: SimulationEvent[]): void {
    for (const event of events) {
      if (event.type === "attack") {
        this.playAttackLine(event.from, event.to, event.critical, event.rarityTier, event.color);
      }
      if (event.type === "damage") {
        this.playDamageNumber(event.at, event.amount, event.critical, event.rarityTier);
      }
      if (event.type === "goldReward") {
        this.playGoldReward(event.at, event.amount, event.tier);
      }
    }
  }

  private playAttackLine(
    from: { x: number; y: number },
    to: { x: number; y: number },
    critical: boolean,
    rarityTier: number,
    color: string,
  ): void {
    const line = this.add.graphics().setDepth(12);
    const lineColor = critical ? 0xf43f5e : Phaser.Display.Color.HexStringToColor(color).color;
    line.lineStyle(Math.min(7, 2 + Math.floor(rarityTier / 2) + (critical ? 1 : 0)), lineColor, critical ? 0.98 : 0.78);
    line.beginPath();
    line.moveTo(from.x, from.y);
    line.lineTo(to.x, to.y);
    line.strokePath();
    if (rarityTier >= 4) {
      const burst = this.add.graphics().setDepth(13);
      burst.lineStyle(2, lineColor, 0.72);
      burst.strokeCircle(to.x, to.y, 12 + rarityTier * 3);
      burst.strokeCircle(to.x, to.y, 5 + rarityTier);
      this.tweens.add({
        targets: burst,
        alpha: 0,
        scaleX: 1.35,
        scaleY: 1.35,
        duration: 320 + rarityTier * 25,
        ease: "Cubic.easeOut",
        onComplete: () => burst.destroy(),
      });
    }
    if (rarityTier >= 6) {
      for (let index = 0; index < 5; index += 1) {
        const spark = this.add.circle(to.x, to.y, 2 + rarityTier * 0.25, lineColor, 0.82).setDepth(13);
        const angle = (Math.PI * 2 * index) / 5;
        this.tweens.add({
          targets: spark,
          x: to.x + Math.cos(angle) * (24 + rarityTier * 4),
          y: to.y + Math.sin(angle) * (24 + rarityTier * 4),
          alpha: 0,
          duration: 360,
          ease: "Cubic.easeOut",
          onComplete: () => spark.destroy(),
        });
      }
    }
    this.tweens.add({
      targets: line,
      alpha: 0,
      duration: 180 + rarityTier * 18,
      onComplete: () => line.destroy(),
    });
  }

  private playDamageNumber(at: { x: number; y: number }, amount: number, critical: boolean, rarityTier: number): void {
    const text = this.add
      .text(at.x, at.y - 18, `${critical ? "CRIT " : ""}${amount}`, {
        color: critical ? "#f43f5e" : "#172033",
        fontFamily: "Arial, sans-serif",
        fontSize: `${critical ? 15 + Math.floor(rarityTier / 2) : 12 + Math.floor(rarityTier / 3)}px`,
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

  private playGoldReward(at: { x: number; y: number }, amount: number, tier: "small" | "good" | "great" | "epic" | "legendary"): void {
    const tierScale = {
      small: { size: 12, color: "#f59e0b", lift: 22, burst: 0 },
      good: { size: 14, color: "#eab308", lift: 28, burst: 10 },
      great: { size: 17, color: "#f97316", lift: 34, burst: 16 },
      epic: { size: 20, color: "#ec4899", lift: 42, burst: 24 },
      legendary: { size: 24, color: "#f43f5e", lift: 52, burst: 34 },
    }[tier];
    const text = this.add
      .text(at.x, at.y - 30, `+${amount}G`, {
        color: tierScale.color,
        fontFamily: "Arial, sans-serif",
        fontSize: `${tierScale.size}px`,
        fontStyle: "900",
        stroke: "#ffffff",
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(15);

    if (tierScale.burst > 0) {
      const burst = this.add.graphics().setDepth(14);
      burst.lineStyle(tier === "legendary" ? 4 : 2, Phaser.Display.Color.HexStringToColor(tierScale.color).color, 0.8);
      burst.strokeCircle(at.x, at.y - 22, tierScale.burst);
      this.tweens.add({
        targets: burst,
        alpha: 0,
        scaleX: 1.5,
        scaleY: 1.5,
        duration: 480,
        ease: "Cubic.easeOut",
        onComplete: () => burst.destroy(),
      });
    }

    this.tweens.add({
      targets: text,
      y: text.y - tierScale.lift,
      scaleX: tier === "legendary" ? 1.25 : 1,
      scaleY: tier === "legendary" ? 1.25 : 1,
      alpha: 0,
      duration: 780,
      ease: "Cubic.easeOut",
      onComplete: () => text.destroy(),
    });
  }
}
