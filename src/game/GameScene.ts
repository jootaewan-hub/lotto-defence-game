import Phaser from "phaser";
import { DESIGN_WIDTH, PATH_POINTS, TOWER_FIELD, TOWER_RADIUS, getPathPosition } from "./geometry";
import type { GameSimulation, SimulationEvent } from "./simulation";
import { getRarity, getRarityIndex } from "./rarities";
import { formatUniqueAbilityStats } from "./uniqueAbilities";
import {
  getEffectiveUnitStats,
  getUniqueUnitExperience,
  getUniqueUnitExperienceRequirement,
  getUniqueUnitLevel,
  getUnitDefinition,
} from "./units";
import type { EnemyState, TrueBossId, UnitAbilityKind, UnitDefinition, UnitRole } from "./types";

const TOWER_VISUAL_RADIUS = 12;
const TOWER_IMAGE_SIZE = 24;
const UNIQUE_TOWER_IMAGE_SIZE = 34;
const UNIQUE_TOWER_HIT_RADIUS = TOWER_RADIUS + 18;
const FANTASY_COMPONENTS_PATH = "assets/generated/fantasy-components";

export class GameScene extends Phaser.Scene {
  private readonly simulation: GameSimulation;
  private readonly onEvents: (events: SimulationEvent[]) => void;
  private readonly onSelectionChange: (slot: number | null) => void;
  private readonly getSpeedMultiplier: () => number;
  private readonly onHudRefresh: () => void;
  private boardGraphics!: Phaser.GameObjects.Graphics;
  private worldGraphics!: Phaser.GameObjects.Graphics;
  private enemyHudGraphics!: Phaser.GameObjects.Graphics;
  private hoverPanel!: Phaser.GameObjects.Container;
  private hoverPanelBg!: Phaser.GameObjects.Graphics;
  private hoverText!: Phaser.GameObjects.Text;
  private unitLabels = new Map<string, Phaser.GameObjects.Text>();
  private towerImages = new Map<string, Phaser.GameObjects.Image>();
  private enemyImages = new Map<string, Phaser.GameObjects.Image>();
  private trueBossNameText?: Phaser.GameObjects.Text;
  private trueBossHpText?: Phaser.GameObjects.Text;
  private displayedTrueBossHp: number | null = null;
  private displayedTrueBossEnemyId: string | null = null;
  private selectedSlot: number | null = null;
  private draggingSlot: number | null = null;
  private hudRefreshTimerMs = 0;
  private bossWarningWave = 0;

  constructor(
    simulation: GameSimulation,
    onEvents: (events: SimulationEvent[]) => void,
    onSelectionChange: (slot: number | null) => void,
    getSpeedMultiplier: () => number,
    onHudRefresh: () => void,
  ) {
    super("GameScene");
    this.simulation = simulation;
    this.onEvents = onEvents;
    this.onSelectionChange = onSelectionChange;
    this.getSpeedMultiplier = getSpeedMultiplier;
    this.onHudRefresh = onHudRefresh;
  }

  preload(): void {
    this.load.image("component-knight", `${FANTASY_COMPONENTS_PATH}/knight.png`);
    this.load.image("component-wizard", `${FANTASY_COMPONENTS_PATH}/wizard.png`);
    this.load.image("component-priest", `${FANTASY_COMPONENTS_PATH}/priest.png`);
    this.load.image("component-storm-archer", `${FANTASY_COMPONENTS_PATH}/storm-archer.png`);
    this.load.image("component-plague-warlock", `${FANTASY_COMPONENTS_PATH}/plague-warlock.png`);
    this.load.image("component-time-mage", `${FANTASY_COMPONENTS_PATH}/time-mage.png`);
    this.load.image("component-frost-witch", `${FANTASY_COMPONENTS_PATH}/frost-witch.png`);
    this.load.image("component-berserker", `${FANTASY_COMPONENTS_PATH}/berserker.png`);
    this.load.image("component-orc", `${FANTASY_COMPONENTS_PATH}/orc.png`);
    this.load.image("component-undead", `${FANTASY_COMPONENTS_PATH}/undead.png`);
    this.load.image("component-skeleton", `${FANTASY_COMPONENTS_PATH}/skeleton.png`);
    this.load.image("component-ogre", `${FANTASY_COMPONENTS_PATH}/ogre.png`);
  }

  create(): void {
    this.cameras.main.setBackgroundColor("#eef1df");
    this.createFantasyTextures();
    this.worldGraphics = this.add.graphics();
    this.enemyHudGraphics = this.add.graphics().setDepth(3);
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
    this.simulation.update(delta * this.getSpeedMultiplier());
    this.maybePlayBossWarning();
    this.drawWorld();
    this.drawBoard();

    const events = this.simulation.drainEvents();
    if (events.length > 0) {
      this.playCombatEffects(events);
      this.onEvents(events);
    }
    this.refreshHud(delta);
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
    this.enemyHudGraphics.clear();
    const seenEnemies = new Set<string>();
    const activeWave = this.simulation.activeWaveDefinition;
    const upcomingWave = this.simulation.upcomingWaveDefinition;
    const bossWarning = Boolean(activeWave?.isBoss || (this.simulation.nextWaveDelayRemainingMs > 0 && upcomingWave?.isBoss));
    const palette = getBattlefieldPalette(activeWave?.number ?? upcomingWave?.number ?? Math.max(1, this.simulation.state.wave), bossWarning);
    const pathColor = palette.path;
    const pathShadow = palette.pathShadow;

    this.worldGraphics.fillGradientStyle(palette.groundTopLeft, palette.groundTopRight, palette.groundBottomLeft, palette.groundBottomRight, 1);
    this.worldGraphics.fillRoundedRect(24, 66, DESIGN_WIDTH - 48, 356, 22);
    this.drawBattlefieldDetails(bossWarning);
    this.worldGraphics.lineStyle(31, pathShadow, bossWarning ? 0.24 : 0.22);
    this.worldGraphics.strokeRoundedRect(37, 81, 316, 316, 26);
    this.worldGraphics.lineStyle(28, bossWarning ? pathColor : 0xb9a372, 1);
    this.worldGraphics.beginPath();
    this.worldGraphics.moveTo(PATH_POINTS[0]!.x, PATH_POINTS[0]!.y);
    for (const point of PATH_POINTS.slice(1)) {
      this.worldGraphics.lineTo(point.x, point.y);
    }
    this.worldGraphics.strokePath();
    this.worldGraphics.lineStyle(4, 0xffffff, 0.82);
    this.worldGraphics.strokePath();

    this.drawPathDirectionMarkers(pathColor);

    this.worldGraphics.fillStyle(palette.field, 0.94);
    this.worldGraphics.fillRoundedRect(TOWER_FIELD.x - 8, TOWER_FIELD.y - 8, TOWER_FIELD.width + 16, TOWER_FIELD.height + 16, 28);
    this.worldGraphics.lineStyle(2, palette.fieldBorder, bossWarning ? 0.82 : 0.5);
    this.worldGraphics.strokeRoundedRect(TOWER_FIELD.x - 8, TOWER_FIELD.y - 8, TOWER_FIELD.width + 16, TOWER_FIELD.height + 16, 28);
    this.worldGraphics.lineStyle(1, palette.accent, 0.5);
    this.worldGraphics.strokeRoundedRect(TOWER_FIELD.x + 18, TOWER_FIELD.y + 18, TOWER_FIELD.width - 36, TOWER_FIELD.height - 36, 18);

    this.drawBattlefieldGates(palette, bossWarning);

    for (const enemy of this.simulation.enemies) {
      const position = getPathPosition(enemy.progress);
      const shadowWidth = enemy.trueBossId ? 46 : enemy.isBoss ? 32 : 20;
      this.worldGraphics.fillStyle(0x172033, enemy.trueBossId ? 0.24 : 0.16);
      this.worldGraphics.fillEllipse(position.x + 1, position.y + (enemy.trueBossId ? 13 : 8), shadowWidth, enemy.trueBossId ? 11 : 6);
      const textureKey = getEnemyTextureKey(enemy.wave, enemy.isBoss, enemy.trueBossId);
      if (this.textures.exists(textureKey)) {
        this.updateEnemyImage(enemy.id, position.x, position.y, textureKey, enemy.isBoss, enemy.variantTint, enemy.variantTier, enemy.trueBossId);
        seenEnemies.add(enemy.id);
      } else {
        this.drawEnemySprite(position.x, position.y, enemy.isBoss);
      }

      const radius = enemy.trueBossId ? 31 : enemy.isBoss ? 22 : 14;
      const hpWidth = enemy.trueBossId ? 60 : enemy.isBoss ? 44 : 28;
      const hpRatio = Math.max(0, enemy.hp / enemy.maxHp);
      this.enemyHudGraphics.fillStyle(0x223049, 0.25);
      this.enemyHudGraphics.fillRoundedRect(position.x - hpWidth / 2, position.y - radius - 10, hpWidth, 5, 2);
      this.enemyHudGraphics.fillStyle(0x22c55e, 1);
      this.enemyHudGraphics.fillRoundedRect(position.x - hpWidth / 2, position.y - radius - 10, hpWidth * hpRatio, 5, 2);
      this.drawEnemyEffectBadges(position.x, position.y + radius + 6, enemy.effects.map((effect) => effect.kind));
    }

    this.drawTrueBossTopBar(this.simulation.enemies.find((enemy) => Boolean(enemy.trueBossId)) ?? null);

    for (const [id, image] of this.enemyImages) {
      if (!seenEnemies.has(id)) {
        image.destroy();
        this.enemyImages.delete(id);
      }
    }
  }

  private drawBoard(): void {
    this.boardGraphics.clear();
    const seenLabels = new Set<string>();
    const seenTowerImages = new Set<string>();
    const mergeableSlots = this.simulation.getMergeableSlots();


    for (let index = 0; index < this.simulation.state.board.length; index += 1) {
      const unit = this.simulation.state.board[index];
      if (!unit) {
        continue;
      }

      const definition = getUnitDefinition(unit.definitionId);
      const isUnique = Boolean(definition.uniqueAbility);
      const uniqueLevel = getUniqueUnitLevel(this.simulation.meta, definition.id);
      const rarity = getRarity(definition.rarity);
      const rarityColor = Phaser.Display.Color.HexStringToColor(rarity.color).color;
      const rarityTier = getRarityIndex(definition.rarity);
      const radius = TOWER_VISUAL_RADIUS + Math.min(3, Math.floor(rarityTier / 3)) + (isUnique ? 5 : 0);

      if (rarityTier >= 4) {
        this.drawRaritySpark(unit.x, unit.y - 16, rarityColor, rarityTier);
        if (rarityTier >= 6) {
          this.drawRaritySpark(unit.x + 11, unit.y - 9, 0xffffff, rarityTier - 2);
        }
      }

      if (index === this.selectedSlot) {
        this.drawSelectionCorners(unit.x, unit.y, radius + 8, 0xf59e0b);
      }
      if (mergeableSlots.has(index)) {
        this.drawMergeMarker(unit.x, unit.y, radius + 8);
      }
      if (!this.updateTowerImage(unit.instanceId, unit.x, unit.y, getTowerTextureKey(definition), isUnique)) {
        this.drawTowerSprite(unit.x, unit.y, definition.role, rarityColor, rarityTier, radius);
      }
      seenTowerImages.add(unit.instanceId);

      const shouldShowLabel = index === this.selectedSlot || Boolean(definition.uniqueAbility);
      if (shouldShowLabel) {
        const label = this.getUnitLabel(unit.instanceId);
        seenLabels.add(unit.instanceId);
        label.setPosition(unit.x, unit.y + radius + 9);
        label.setText(index === this.selectedSlot ? `${definition.name}${definition.uniqueAbility ? ` Lv.${uniqueLevel}` : ""}` : `Lv.${uniqueLevel}`);
      }
    }

    for (const [id, label] of this.unitLabels) {
      if (!seenLabels.has(id)) {
        label.destroy();
        this.unitLabels.delete(id);
      }
    }
    for (const [id, image] of this.towerImages) {
      if (!seenTowerImages.has(id)) {
        image.destroy();
        this.towerImages.delete(id);
      }
    }
  }

  private updateHoverPanel(x: number, y: number): void {
    const slot = this.findTowerAt(x, y);
    if (slot !== null && this.simulation.state.board[slot]) {
      const unit = this.simulation.state.board[slot]!;
      const definition = getUnitDefinition(unit.definitionId);
      const uniqueLevel = getUniqueUnitLevel(this.simulation.meta, definition.id);
      const uniqueExperience = getUniqueUnitExperience(this.simulation.meta, definition.id);
      const uniqueExperienceRequirement = getUniqueUnitExperienceRequirement(uniqueLevel);
      const stats = getEffectiveUnitStats(definition, uniqueLevel);
      const rarity = getRarity(definition.rarity);
      this.showHoverText(
        x,
        y,
        [
          `${definition.name} (${rarity.label})`,
          definition.uniqueAbility ? `레벨 ${uniqueLevel}/99` : "",
          definition.uniqueAbility ? `경험치 ${uniqueLevel >= 99 ? "MAX" : `${uniqueExperience}/${uniqueExperienceRequirement}`}` : "",
          `공격력 ${stats.attack}`,
          `공격 타입 ${definition.attackType}`,
          definition.uniqueAbility ? `유니크 ${getAbilityLabel(definition.uniqueAbility)}` : "",
          definition.uniqueAbility ? formatUniqueAbilityStats(definition.uniqueAbility, uniqueLevel) : "",
          `공격속도 ${(1000 / stats.attackSpeed).toFixed(2)}/초`,
          `공격범위 ${stats.range}`,
          `크리티컬 ${(stats.criticalChance * 100).toFixed(1)}%`,
        ].filter(Boolean).join("\n"),
      );
      return;
    }

    const enemy = this.findEnemyAt(x, y);
    if (enemy) {
      const fantasyEnemy = enemy.trueBossId ? enemy.variantLabel : `${enemy.variantLabel} ${getEnemyDisplayName(enemy.wave, enemy.isBoss)}`;
      this.showHoverText(
        x,
        y,
        [
          `${fantasyEnemy} ${enemy.isBoss ? "보스" : "일반"}`,
          `HP ${Math.max(0, Math.ceil(enemy.hp))}/${enemy.maxHp}`,
          `방어력 ${enemy.armor}`,
          enemy.effects.length > 0 ? `상태 ${enemy.effects.map((effect) => getEnemyEffectLabel(effect.kind)).join(", ")}` : "",
        ].filter(Boolean).join("\n"),
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
    let uniqueSlot: number | null = null;
    let uniqueDistance = Number.POSITIVE_INFINITY;
    let regularSlot: number | null = null;
    let regularDistance = Number.POSITIVE_INFINITY;

    for (let index = 0; index < this.simulation.state.board.length; index += 1) {
      const unit = this.simulation.state.board[index]!;
      const distance = Math.hypot(unit.x - x, unit.y - y);
      const isUnique = Boolean(getUnitDefinition(unit.definitionId).uniqueAbility);
      if (isUnique && distance <= UNIQUE_TOWER_HIT_RADIUS && distance < uniqueDistance) {
        uniqueSlot = index;
        uniqueDistance = distance;
      } else if (!isUnique && distance <= TOWER_RADIUS + 8 && distance < regularDistance) {
        regularSlot = index;
        regularDistance = distance;
      }
    }
    return uniqueSlot ?? regularSlot;
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

  private drawEnemyEffectBadges(x: number, y: number, effects: Array<"slow" | "freeze" | "poison">): void {
    const uniqueEffects = [...new Set(effects)];
    uniqueEffects.forEach((effect, index) => {
      const color = effect === "poison" ? 0x22c55e : effect === "freeze" ? 0x38bdf8 : 0xa78bfa;
      this.enemyHudGraphics.fillStyle(0xffffff, 0.82);
      this.enemyHudGraphics.fillCircle(x - uniqueEffects.length * 4 + index * 8 + 4, y, 4);
      this.enemyHudGraphics.fillStyle(color, 1);
      this.enemyHudGraphics.fillCircle(x - uniqueEffects.length * 4 + index * 8 + 4, y, 2.5);
    });
  }

  private drawTrueBossTopBar(enemy: EnemyState | null): void {
    if (!enemy) {
      this.trueBossNameText?.setVisible(false);
      this.trueBossHpText?.setVisible(false);
      this.displayedTrueBossHp = null;
      this.displayedTrueBossEnemyId = null;
      return;
    }

    const barX = 82;
    const barY = 86;
    const barWidth = 266;
    const barHeight = 34;
    const displayedHp = this.getDisplayedTrueBossHp(enemy);
    const hpRatio = Phaser.Math.Clamp(displayedHp / enemy.maxHp, 0, 1);
    const hpPercent = Math.max(0, Math.ceil(hpRatio * 100));
    const tint = enemy.variantTint;
    const fillColor = hpRatio > 0.55 ? 0xdc2626 : hpRatio > 0.25 ? 0xf59e0b : 0x7f1d1d;

    this.enemyHudGraphics.fillStyle(0x1f1410, 0.86);
    this.enemyHudGraphics.fillRoundedRect(barX, barY, barWidth, barHeight, 9);
    this.enemyHudGraphics.lineStyle(2, 0xfacc15, 0.78);
    this.enemyHudGraphics.strokeRoundedRect(barX, barY, barWidth, barHeight, 9);
    this.enemyHudGraphics.lineStyle(1, tint, 0.7);
    this.enemyHudGraphics.strokeRoundedRect(barX + 4, barY + 4, barWidth - 8, barHeight - 8, 6);

    this.enemyHudGraphics.fillStyle(0x450a0a, 0.92);
    this.enemyHudGraphics.fillRoundedRect(barX + 10, barY + 20, barWidth - 20, 8, 4);
    this.enemyHudGraphics.fillStyle(fillColor, 0.96);
    this.enemyHudGraphics.fillRoundedRect(barX + 10, barY + 20, (barWidth - 20) * hpRatio, 8, 4);
    this.enemyHudGraphics.fillStyle(0xfff7ed, 0.28);
    this.enemyHudGraphics.fillRoundedRect(barX + 10, barY + 20, (barWidth - 20) * hpRatio, 3, 2);

    for (let index = 1; index < 10; index += 1) {
      const tickX = barX + 10 + ((barWidth - 20) * index) / 10;
      this.enemyHudGraphics.lineStyle(1, 0xfff7ed, 0.22);
      this.enemyHudGraphics.beginPath();
      this.enemyHudGraphics.moveTo(tickX, barY + 20);
      this.enemyHudGraphics.lineTo(tickX, barY + 28);
      this.enemyHudGraphics.strokePath();
    }

    const nameText = this.getTrueBossNameText();
    nameText.setText(enemy.variantLabel);
    nameText.setPosition(barX + 13, barY + 4);
    nameText.setVisible(true);

    const hpText = this.getTrueBossHpText();
    hpText.setText(`${Math.max(0, Math.ceil(displayedHp)).toLocaleString()} / ${enemy.maxHp.toLocaleString()}  (${hpPercent}%)`);
    hpText.setPosition(barX + barWidth - 13, barY + 5);
    hpText.setVisible(true);
  }

  private getDisplayedTrueBossHp(enemy: EnemyState): number {
    if (this.displayedTrueBossEnemyId !== enemy.id || this.displayedTrueBossHp === null) {
      this.displayedTrueBossEnemyId = enemy.id;
      this.displayedTrueBossHp = enemy.maxHp;
    }

    const targetHp = Math.max(0, enemy.hp);
    const gap = this.displayedTrueBossHp - targetHp;
    if (gap <= 0) {
      this.displayedTrueBossHp = targetHp;
      return this.displayedTrueBossHp;
    }

    const step = Math.max(1, gap * 0.18, enemy.maxHp * 0.003);
    this.displayedTrueBossHp = Math.max(targetHp, this.displayedTrueBossHp - step);
    return this.displayedTrueBossHp;
  }

  private getTrueBossNameText(): Phaser.GameObjects.Text {
    if (!this.trueBossNameText) {
      this.trueBossNameText = this.add
        .text(0, 0, "", {
          color: "#fef3c7",
          fontFamily: "Arial, sans-serif",
          fontSize: "13px",
          fontStyle: "900",
          stroke: "#451a03",
          strokeThickness: 4,
        })
        .setDepth(16)
        .setOrigin(0, 0);
    }
    return this.trueBossNameText;
  }

  private getTrueBossHpText(): Phaser.GameObjects.Text {
    if (!this.trueBossHpText) {
      this.trueBossHpText = this.add
        .text(0, 0, "", {
          color: "#fff7ed",
          fontFamily: "Arial, sans-serif",
          fontSize: "10px",
          fontStyle: "900",
          stroke: "#1f1410",
          strokeThickness: 3,
        })
        .setDepth(16)
        .setOrigin(1, 0);
    }
    return this.trueBossHpText;
  }

  private createFantasyTextures(): void {
    this.createDrawnTexture("fantasy-wizard", 40, 40, (ctx) => {
      ctx.fillStyle = "#581c87";
      ctx.fillRect(12, 7, 16, 7);
      ctx.fillRect(15, 5, 10, 4);
      ctx.fillStyle = "#a855f7";
      ctx.fillRect(13, 14, 14, 18);
      ctx.fillStyle = "#f8fafc";
      ctx.fillRect(16, 13, 8, 6);
      ctx.fillStyle = "#facc15";
      ctx.fillRect(10, 29, 20, 4);
      ctx.fillStyle = "#38bdf8";
      ctx.fillRect(28, 12, 3, 20);
      ctx.fillRect(26, 10, 7, 4);
    });
    this.createDrawnTexture("fantasy-orc", 40, 40, (ctx) => {
      ctx.fillStyle = "#14532d";
      ctx.fillRect(12, 9, 16, 21);
      ctx.fillStyle = "#22c55e";
      ctx.fillRect(10, 12, 20, 13);
      ctx.fillStyle = "#052e16";
      ctx.fillRect(13, 15, 5, 4);
      ctx.fillRect(23, 15, 5, 4);
      ctx.fillStyle = "#f8fafc";
      ctx.fillRect(14, 25, 4, 6);
      ctx.fillRect(24, 25, 4, 6);
      ctx.fillStyle = "#78350f";
      ctx.fillRect(7, 17, 6, 16);
      ctx.fillRect(29, 17, 4, 15);
    });
    this.createDrawnTexture("fantasy-undead", 40, 40, (ctx) => {
      ctx.fillStyle = "#334155";
      ctx.fillRect(13, 10, 15, 21);
      ctx.fillStyle = "#94a3b8";
      ctx.fillRect(11, 13, 19, 10);
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(14, 15, 4, 4);
      ctx.fillRect(23, 15, 4, 4);
      ctx.fillStyle = "#cbd5e1";
      ctx.fillRect(17, 25, 8, 3);
      ctx.fillStyle = "#7c2d12";
      ctx.fillRect(9, 22, 5, 11);
      ctx.fillStyle = "#475569";
      ctx.fillRect(27, 22, 5, 11);
    });
    this.createDrawnTexture("fantasy-skeleton", 40, 40, (ctx) => {
      ctx.fillStyle = "#f8fafc";
      ctx.fillRect(13, 8, 15, 13);
      ctx.fillRect(18, 21, 5, 12);
      ctx.fillRect(11, 24, 18, 4);
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(15, 12, 4, 4);
      ctx.fillRect(23, 12, 4, 4);
      ctx.fillStyle = "#cbd5e1";
      ctx.fillRect(11, 32, 6, 4);
      ctx.fillRect(25, 32, 6, 4);
      ctx.fillStyle = "#94a3b8";
      ctx.fillRect(8, 20, 5, 13);
      ctx.fillRect(29, 20, 5, 13);
    });
    this.createDrawnTexture("fantasy-knight", 40, 40, (ctx) => {
      ctx.fillStyle = "#1f2937";
      ctx.fillRect(14, 6, 12, 9);
      ctx.fillStyle = "#d1d5db";
      ctx.fillRect(11, 12, 18, 18);
      ctx.fillStyle = "#64748b";
      ctx.fillRect(9, 17, 22, 7);
      ctx.fillStyle = "#facc15";
      ctx.fillRect(18, 4, 4, 9);
      ctx.fillStyle = "#ef4444";
      ctx.fillRect(16, 16, 8, 13);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(15, 14, 10, 3);
      ctx.fillStyle = "#94a3b8";
      ctx.fillRect(28, 11, 4, 23);
      ctx.fillStyle = "#f8fafc";
      ctx.fillRect(28, 7, 4, 6);
    });
    this.createDrawnTexture("fantasy-priest", 40, 40, (ctx) => {
      ctx.fillStyle = "#312e81";
      ctx.fillRect(13, 6, 14, 14);
      ctx.fillStyle = "#c4b5fd";
      ctx.fillRect(10, 16, 20, 17);
      ctx.fillStyle = "#f8fafc";
      ctx.fillRect(16, 12, 8, 7);
      ctx.fillStyle = "#facc15";
      ctx.fillRect(18, 18, 4, 14);
      ctx.fillRect(14, 22, 12, 4);
      ctx.fillStyle = "#7c3aed";
      ctx.fillRect(7, 19, 5, 13);
      ctx.fillRect(28, 19, 5, 13);
    });
    this.createDrawnTexture("fantasy-ogre", 40, 40, (ctx) => {
      ctx.fillStyle = "#14532d";
      ctx.fillRect(9, 7, 22, 24);
      ctx.fillStyle = "#22c55e";
      ctx.fillRect(7, 13, 26, 15);
      ctx.fillStyle = "#052e16";
      ctx.fillRect(12, 15, 5, 4);
      ctx.fillRect(24, 15, 5, 4);
      ctx.fillStyle = "#f8fafc";
      ctx.fillRect(14, 27, 4, 7);
      ctx.fillRect(23, 27, 4, 7);
      ctx.fillStyle = "#7f1d1d";
      ctx.fillRect(16, 23, 9, 4);
      ctx.fillStyle = "#78350f";
      ctx.fillRect(4, 11, 6, 6);
      ctx.fillRect(31, 11, 6, 6);
    });
    this.createDrawnTexture("true-boss-dragon", 64, 64, (ctx) => {
      ctx.fillStyle = "#7f1d1d";
      ctx.fillRect(24, 14, 18, 28);
      ctx.fillStyle = "#ef4444";
      ctx.fillRect(20, 20, 26, 24);
      ctx.fillStyle = "#991b1b";
      ctx.fillRect(7, 18, 18, 16);
      ctx.fillRect(41, 18, 18, 16);
      ctx.fillStyle = "#f97316";
      ctx.fillRect(28, 8, 10, 8);
      ctx.fillRect(29, 42, 9, 10);
      ctx.fillStyle = "#fef3c7";
      ctx.fillRect(25, 24, 4, 4);
      ctx.fillRect(37, 24, 4, 4);
      ctx.fillStyle = "#fde68a";
      ctx.fillRect(30, 29, 8, 4);
      ctx.fillStyle = "#facc15";
      ctx.fillRect(17, 35, 5, 16);
      ctx.fillRect(43, 35, 5, 16);
      ctx.fillStyle = "#450a0a";
      ctx.fillRect(13, 21, 5, 9);
      ctx.fillRect(48, 21, 5, 9);
    });
    this.createDrawnTexture("true-boss-undead-lord", 64, 64, (ctx) => {
      ctx.fillStyle = "#312e81";
      ctx.fillRect(20, 11, 24, 36);
      ctx.fillStyle = "#c4b5fd";
      ctx.fillRect(24, 15, 16, 14);
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(26, 19, 4, 4);
      ctx.fillRect(36, 19, 4, 4);
      ctx.fillStyle = "#e0e7ff";
      ctx.fillRect(28, 29, 10, 4);
      ctx.fillStyle = "#a855f7";
      ctx.fillRect(16, 31, 8, 19);
      ctx.fillRect(40, 31, 8, 19);
      ctx.fillStyle = "#facc15";
      ctx.fillRect(21, 7, 22, 5);
      ctx.fillRect(28, 2, 8, 8);
      ctx.fillStyle = "#22d3ee";
      ctx.fillRect(31, 38, 4, 15);
      ctx.fillRect(25, 44, 16, 4);
    });
  }

  private createDrawnTexture(key: string, width: number, height: number, draw: (context: CanvasRenderingContext2D) => void): void {
    if (this.textures.exists(key)) {
      return;
    }

    const texture = this.textures.createCanvas(key, width, height);
    if (!texture) {
      return;
    }

    const canvas = texture.getSourceImage() as HTMLCanvasElement;
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, width, height);
    draw(context);
    texture.refresh();
  }

  private updateTowerImage(instanceId: string, x: number, y: number, textureKey: string, isUnique: boolean): boolean {
    if (!this.textures.exists(textureKey)) {
      return false;
    }

    const image = this.towerImages.get(instanceId) ?? this.add.image(x, y - 4, textureKey);
    image.setTexture(textureKey);
    image.setDepth(isUnique ? 4.5 : 4);
    if (!image.getData("attacking")) {
      image.setPosition(x, y - 6);
      const size = isUnique ? UNIQUE_TOWER_IMAGE_SIZE : TOWER_IMAGE_SIZE;
      image.setDisplaySize(size, size);
      image.setData("baseScaleX", image.scaleX);
      image.setData("baseScaleY", image.scaleY);
    }
    image.setAlpha(0.98);
    this.towerImages.set(instanceId, image);
    return true;
  }

  private updateEnemyImage(
    enemyId: string,
    x: number,
    y: number,
    textureKey: string,
    isBoss: boolean,
    tint: number,
    variantTier: number,
    trueBossId?: TrueBossId,
  ): void {
    const image = this.enemyImages.get(enemyId) ?? this.add.image(x, y, textureKey).setDepth(2);
    image.setTexture(textureKey);
    image.setPosition(x, y - (trueBossId ? 9 : isBoss ? 5 : 3));
    const sizeBoost = Math.min(8, Math.max(0, variantTier) * 1.5);
    const baseSize = trueBossId ? 50 : isBoss ? 34 : 24;
    const bossBoost = trueBossId ? Math.min(14, variantTier * 1.6) : sizeBoost;
    image.setDisplaySize(baseSize + bossBoost, baseSize + bossBoost);
    image.setTint(tint);
    image.setAlpha(0.98);
    this.enemyImages.set(enemyId, image);
  }

  private drawSelectionCorners(x: number, y: number, distance: number, color: number): void {
    const size = 6;
    this.boardGraphics.lineStyle(2, color, 0.95);
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        const cornerX = x + sx * distance;
        const cornerY = y + sy * distance;
        this.boardGraphics.beginPath();
        this.boardGraphics.moveTo(cornerX, cornerY + sy * size);
        this.boardGraphics.lineTo(cornerX, cornerY);
        this.boardGraphics.lineTo(cornerX + sx * size, cornerY);
        this.boardGraphics.strokePath();
      }
    }
  }

  private drawMergeMarker(x: number, y: number, distance: number): void {
    const ringRadius = distance - 2;
    this.boardGraphics.fillStyle(0x14b8a6, 0.07);
    this.boardGraphics.fillCircle(x, y, ringRadius);
    this.boardGraphics.lineStyle(2, 0x0f766e, 0.82);
    this.boardGraphics.strokeCircle(x, y, ringRadius);

    const badgeX = x + ringRadius * 0.72;
    const badgeY = y - ringRadius * 0.72;
    this.boardGraphics.fillStyle(0x115e59, 0.96);
    this.boardGraphics.fillRoundedRect(badgeX - 8, badgeY - 5, 16, 10, 4);
    this.boardGraphics.fillStyle(0xffffff, 0.95);
    for (const offset of [-4, 0, 4]) {
      this.boardGraphics.fillCircle(badgeX + offset, badgeY, 1.2);
    }
  }

  private drawRaritySpark(x: number, y: number, color: number, rarityTier: number): void {
    const length = 4 + Math.min(5, rarityTier);
    this.boardGraphics.lineStyle(2, color, 0.78);
    this.boardGraphics.beginPath();
    this.boardGraphics.moveTo(x, y - length);
    this.boardGraphics.lineTo(x, y + length);
    this.boardGraphics.moveTo(x - length, y);
    this.boardGraphics.lineTo(x + length, y);
    this.boardGraphics.strokePath();
  }


  private drawBattlefieldGates(palette: BattlefieldPalette, bossWarning: boolean): void {
    const gateColor = bossWarning ? 0x4c0519 : 0x172033;
    const gates = [
      { x: 41, y: 86, bannerX: 68, bannerY: 82, facing: 1 },
      { x: 313, y: 368, bannerX: 317, bannerY: 364, facing: -1 },
    ];

    for (const gate of gates) {
      this.worldGraphics.fillStyle(gateColor, 0.88);
      this.worldGraphics.fillRoundedRect(gate.x, gate.y, 36, 24, 6);
      this.worldGraphics.lineStyle(2, palette.accent, 0.72);
      this.worldGraphics.strokeRoundedRect(gate.x, gate.y, 36, 24, 6);
      this.worldGraphics.fillStyle(0x0f172a, 0.72);
      for (let index = 0; index < 3; index += 1) {
        this.worldGraphics.fillRect(gate.x + 5 + index * 10, gate.y - 4, 6, 7);
      }
      this.worldGraphics.fillStyle(palette.accent, 0.86);
      this.worldGraphics.fillTriangle(
        gate.bannerX,
        gate.bannerY,
        gate.bannerX + gate.facing * 13,
        gate.bannerY + 5,
        gate.bannerX,
        gate.bannerY + 11,
      );
      this.worldGraphics.lineStyle(2, 0xf8fafc, 0.52);
      this.worldGraphics.beginPath();
      this.worldGraphics.moveTo(gate.bannerX, gate.bannerY - 2);
      this.worldGraphics.lineTo(gate.bannerX, gate.bannerY + 14);
      this.worldGraphics.strokePath();
    }
  }

  private drawBattlefieldDetails(bossWarning: boolean): void {
    const stoneColor = bossWarning ? 0x7f1d1d : 0x6b6650;
    const grassColor = bossWarning ? 0x9f1239 : 0x476b3a;

    this.worldGraphics.fillStyle(stoneColor, bossWarning ? 0.12 : 0.16);
    for (let y = 104; y <= 378; y += 46) {
      for (let x = 42; x <= 338; x += 54) {
        const offset = ((x + y) / 10) % 2 === 0 ? 0 : 12;
        this.worldGraphics.fillRoundedRect(x + offset, y, 22, 10, 3);
      }
    }

    this.worldGraphics.lineStyle(1, grassColor, bossWarning ? 0.16 : 0.22);
    for (let index = 0; index < 18; index += 1) {
      const x = 44 + ((index * 53) % 300);
      const y = 94 + ((index * 37) % 292);
      this.worldGraphics.beginPath();
      this.worldGraphics.moveTo(x, y + 8);
      this.worldGraphics.lineTo(x + 3, y);
      this.worldGraphics.lineTo(x + 6, y + 8);
      this.worldGraphics.moveTo(x + 9, y + 7);
      this.worldGraphics.lineTo(x + 12, y + 1);
      this.worldGraphics.lineTo(x + 15, y + 7);
      this.worldGraphics.strokePath();
    }
  }

  private drawEnemySprite(x: number, y: number, isBoss: boolean): void {
    if (isBoss) {
      this.worldGraphics.fillStyle(0x881337, 0.2);
      this.worldGraphics.fillEllipse(x + 3, y + 7, 52, 26);
      this.worldGraphics.fillStyle(0x881337, 1);
      this.worldGraphics.fillTriangle(x - 25, y - 7, x - 12, y - 21, x - 6, y - 5);
      this.worldGraphics.fillTriangle(x + 25, y - 7, x + 12, y - 21, x + 6, y - 5);
      this.worldGraphics.fillStyle(0xbe123c, 1);
      this.worldGraphics.fillTriangle(x, y - 24, x + 24, y - 8, x + 18, y + 15);
      this.worldGraphics.fillTriangle(x, y - 24, x - 24, y - 8, x - 18, y + 15);
      this.worldGraphics.fillStyle(0xfb7185, 1);
      this.worldGraphics.fillTriangle(x - 18, y - 8, x, y - 20, x + 18, y - 8);
      this.worldGraphics.fillTriangle(x - 18, y + 14, x, y + 22, x + 18, y + 14);
      this.worldGraphics.fillStyle(0xfff1f2, 0.92);
      this.worldGraphics.fillRoundedRect(x - 12, y - 5, 24, 8, 3);
      this.worldGraphics.fillStyle(0x172033, 0.82);
      this.worldGraphics.fillRoundedRect(x - 8, y - 3, 16, 4, 2);
      this.worldGraphics.lineStyle(3, 0xfff1f2, 0.88);
      this.worldGraphics.strokeCircle(x, y, 22);
      return;
    }

    this.worldGraphics.fillStyle(0x1e293b, 0.18);
    this.worldGraphics.fillEllipse(x + 2, y + 6, 34, 17);
    this.worldGraphics.fillStyle(0x2563eb, 1);
    this.worldGraphics.fillTriangle(x, y - 15, x + 16, y - 2, x, y + 14);
    this.worldGraphics.fillTriangle(x, y - 15, x - 16, y - 2, x, y + 14);
    this.worldGraphics.fillStyle(0x60a5fa, 1);
    this.worldGraphics.fillTriangle(x - 10, y - 5, x, y - 13, x + 10, y - 5);
    this.worldGraphics.fillTriangle(x - 10, y + 7, x, y + 13, x + 10, y + 7);
    this.worldGraphics.fillStyle(0xffffff, 0.86);
    this.worldGraphics.fillRoundedRect(x - 7, y - 4, 14, 5, 2);
    this.worldGraphics.lineStyle(2, 0xdbeafe, 0.9);
    this.worldGraphics.beginPath();
    this.worldGraphics.moveTo(x, y - 15);
    this.worldGraphics.lineTo(x + 16, y - 2);
    this.worldGraphics.lineTo(x, y + 14);
    this.worldGraphics.lineTo(x - 16, y - 2);
    this.worldGraphics.closePath();
    this.worldGraphics.strokePath();
  }

  private drawTowerSprite(x: number, y: number, role: "single" | "area" | "support", color: number, rarityTier: number, radius: number): void {
    const darkColor = mixColor(color, 0x172033, 0.22);
    this.boardGraphics.lineStyle(2, 0xffffff, 0.82);
    this.boardGraphics.strokeCircle(x, y, radius + 1);

    if (role === "single") {
      this.boardGraphics.fillStyle(darkColor, 1);
      this.boardGraphics.fillRoundedRect(x - 10, y - 5, 34, 8, 3);
      this.boardGraphics.fillStyle(color, 1);
      this.boardGraphics.fillTriangle(x - 17, y + 13, x, y - 18, x + 17, y + 13);
      this.boardGraphics.fillStyle(0xffffff, 0.36);
      this.boardGraphics.fillTriangle(x - 8, y + 5, x, y - 13, x + 8, y + 5);
      this.boardGraphics.fillStyle(0x172033, 0.7);
      this.boardGraphics.fillRoundedRect(x - 13, y + 11, 26, 7, 3);
    } else if (role === "area") {
      this.boardGraphics.fillStyle(darkColor, 1);
      this.boardGraphics.fillRoundedRect(x - 10, y - 21, 20, 16, 5);
      this.boardGraphics.fillStyle(color, 1);
      this.boardGraphics.fillTriangle(x, y - 18, x + 19, y, x, y + 18);
      this.boardGraphics.fillTriangle(x, y - 18, x - 19, y, x, y + 18);
      this.boardGraphics.fillStyle(0xffffff, 0.42);
      this.boardGraphics.fillRoundedRect(x - 8, y - 6, 16, 13, 5);
      this.boardGraphics.fillStyle(0x172033, 0.7);
      this.boardGraphics.fillRoundedRect(x - 14, y + 13, 28, 7, 3);
    } else {
      this.boardGraphics.fillStyle(darkColor, 1);
      this.boardGraphics.fillRoundedRect(x - 3, y - 21, 6, 34, 3);
      this.boardGraphics.fillStyle(color, 1);
      this.boardGraphics.fillTriangle(x, y - 24, x + 15, y - 2, x, y + 20);
      this.boardGraphics.fillTriangle(x, y - 24, x - 15, y - 2, x, y + 20);
      this.boardGraphics.fillStyle(0xffffff, 0.48);
      this.boardGraphics.fillCircle(x, y - 5, 6);
      this.boardGraphics.lineStyle(2, color, 0.55);
      this.boardGraphics.strokeCircle(x, y - 5, 15 + rarityTier);
      this.boardGraphics.fillStyle(0x172033, 0.7);
      this.boardGraphics.fillRoundedRect(x - 12, y + 14, 24, 7, 3);
    }
  }

  private maybePlayBossWarning(): void {
    const wave = this.simulation.activeWaveDefinition;
    if (!wave?.isBoss || this.bossWarningWave === wave.number) {
      return;
    }

    this.bossWarningWave = wave.number;
    this.cameras.main.flash(wave.isTrueBoss ? 420 : 260, wave.isTrueBoss ? 239 : 251, wave.isTrueBoss ? 68 : 113, wave.isTrueBoss ? 68 : 133, false);
    const trueBossName = wave.trueBossId ? getTrueBossName(wave.trueBossId) : null;
    const warning = this.add
      .text(DESIGN_WIDTH / 2, 112, trueBossName ? `TRUE BOSS ${wave.number}` : `BOSS WAVE ${wave.number}`, {
        align: "center",
        color: trueBossName ? "#fef3c7" : "#fff1f2",
        fontFamily: "Arial, sans-serif",
        fontSize: trueBossName ? "30px" : "28px",
        fontStyle: "900",
        stroke: trueBossName ? "#7f1d1d" : "#881337",
        strokeThickness: trueBossName ? 8 : 7,
      })
      .setOrigin(0.5)
      .setDepth(30)
      .setScale(0.85);
    const subline = this.add
      .text(DESIGN_WIDTH / 2, 144, trueBossName ? `${trueBossName} 강림` : "방어력 5배 보스 접근", {
        align: "center",
        color: trueBossName ? "#7f1d1d" : "#881337",
        fontFamily: "Arial, sans-serif",
        fontSize: trueBossName ? "15px" : "13px",
        fontStyle: "900",
        stroke: "#ffffff",
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(30);
    this.tweens.add({
      targets: [warning, subline],
      scaleX: 1.08,
      scaleY: 1.08,
      alpha: 0,
      duration: 1300,
      ease: "Cubic.easeOut",
      onComplete: () => {
        warning.destroy();
        subline.destroy();
      },
    });
  }

  private drawPathDirectionMarkers(color: number): void {
    for (const progress of [0.1, 0.35, 0.6, 0.85]) {
      const position = getPathPosition(progress);
      const next = getPathPosition(progress + 0.01);
      const angle = Math.atan2(next.y - position.y, next.x - position.x);
      const front = { x: position.x + Math.cos(angle) * 8, y: position.y + Math.sin(angle) * 8 };
      const left = { x: position.x + Math.cos(angle + 2.45) * 8, y: position.y + Math.sin(angle + 2.45) * 8 };
      const right = { x: position.x + Math.cos(angle - 2.45) * 8, y: position.y + Math.sin(angle - 2.45) * 8 };
      this.worldGraphics.fillStyle(color, 0.82);
      this.worldGraphics.fillTriangle(front.x, front.y, left.x, left.y, right.x, right.y);
    }
  }

  private refreshHud(delta: number): void {
    this.hudRefreshTimerMs -= delta;
    if (this.hudRefreshTimerMs > 0) {
      return;
    }

    this.hudRefreshTimerMs = 200;
    this.onHudRefresh();
  }

  private playCombatEffects(events: SimulationEvent[]): void {
    const budget = getCombatEffectBudget(this.getSpeedMultiplier());
    const attackEvents = events.filter((event): event is Extract<SimulationEvent, { type: "attack" }> => event.type === "attack");
    const damageEvents = events.filter((event): event is Extract<SimulationEvent, { type: "damage" }> => event.type === "damage");
    const goldEvents = events.filter((event): event is Extract<SimulationEvent, { type: "goldReward" }> => event.type === "goldReward");
    const experienceEvents = events.filter(
      (event): event is Extract<SimulationEvent, { type: "unitExperience" }> => event.type === "unitExperience",
    );
    const visibleAttacks = pickVisualEvents(attackEvents, budget.attacks, (event) => event.critical || event.rarityTier >= 6);
    const visibleDamage = pickVisualEvents(damageEvents, budget.damageNumbers, (event) => event.critical || event.rarityTier >= 6);
    const visibleGold = pickVisualEvents(goldEvents, budget.goldRewards, (event) => event.tier === "epic" || event.tier === "legendary");
    const visibleExperience = pickVisualEvents(experienceEvents, budget.experienceRewards, (event) => event.levelsGained > 0);
    const animatedTowers = new Set<string>();

    for (const event of events) {
      if (event.type === "attack" && visibleAttacks.has(event)) {
        const towerKey = `${Math.round(event.from.x)}:${Math.round(event.from.y)}`;
        if (!animatedTowers.has(towerKey)) {
          animatedTowers.add(towerKey);
          this.playTowerAttackMotion(event.from, event.to, event.role, event.ability);
        }
        this.playAttackLine(event.from, event.to, event.critical, event.rarityTier, event.color, event.role, event.ability);
      }
      if (event.type === "damage" && visibleDamage.has(event)) {
        this.playDamageNumber(event.at, event.amount, event.critical, event.rarityTier);
      }
      if (event.type === "goldReward" && visibleGold.has(event)) {
        this.playGoldReward(event.at, event.amount, event.tier);
      }
      if (event.type === "unitExperience" && visibleExperience.has(event)) {
        this.playExperienceReward(event.at, event.amount, event.levelsGained > 0);
      }
    }
  }

  private playAttackLine(
    from: { x: number; y: number },
    to: { x: number; y: number },
    critical: boolean,
    rarityTier: number,
    color: string,
    role: UnitRole,
    ability?: UnitAbilityKind,
  ): void {
    const palette = getAttackPalette(role, ability, color, critical);
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    const tierScale = 1 + rarityTier * 0.06 + (critical ? 0.16 : 0);
    const trail = this.add.graphics().setDepth(12);
    trail.lineStyle(Math.min(4, 1 + Math.floor(rarityTier / 3)), palette.trail, critical ? 0.46 : 0.28);
    for (let index = 0; index < 3 + Math.floor(rarityTier / 3); index += 1) {
      const start = 0.12 + index * 0.16;
      const end = Math.min(0.92, start + 0.09 + rarityTier * 0.006);
      trail.beginPath();
      trail.moveTo(Phaser.Math.Linear(from.x, to.x, start), Phaser.Math.Linear(from.y, to.y, start) - 2);
      trail.lineTo(Phaser.Math.Linear(from.x, to.x, end), Phaser.Math.Linear(from.y, to.y, end) - 2);
      trail.strokePath();
    }

    const projectile = this.add.container(from.x, from.y - 2).setDepth(13).setRotation(angle).setScale(tierScale);
    const projectileGraphics = this.add.graphics();
    projectile.add(projectileGraphics);
    this.drawProjectileShape(projectileGraphics, role, ability, palette, rarityTier, critical);
    this.tweens.add({
      targets: projectile,
      x: to.x,
      y: to.y - 2,
      alpha: 0.32,
      duration: 125,
      ease: "Quad.easeOut",
      onComplete: () => projectile.destroy(),
    });

    this.playMedievalImpact(to, angle, role, ability, palette, rarityTier, critical);
    this.tweens.add({
      targets: trail,
      alpha: 0,
      duration: 180 + rarityTier * 18,
      onComplete: () => trail.destroy(),
    });
  }

  private drawProjectileShape(
    graphics: Phaser.GameObjects.Graphics,
    role: UnitRole,
    ability: UnitAbilityKind | undefined,
    palette: AttackPalette,
    rarityTier: number,
    critical: boolean,
  ): void {
    const bodyLength = 16 + rarityTier * 1.2;
    const thick = critical ? 3 : 2;

    if (ability === "poison") {
      graphics.fillStyle(palette.fill, 0.9);
      graphics.fillCircle(4, 0, 5);
      graphics.fillCircle(12, -3, 3);
      graphics.fillStyle(0x143d1f, 0.9);
      graphics.fillCircle(1, -1, 2);
      graphics.lineStyle(2, palette.edge, 0.75);
      graphics.strokeCircle(5, 0, 7 + rarityTier * 0.4);
      return;
    }

    if (ability === "freeze") {
      graphics.fillStyle(palette.fill, 0.92);
      graphics.fillTriangle(-6, 0, 8, -7, bodyLength, 0);
      graphics.fillTriangle(-6, 0, 8, 7, bodyLength, 0);
      graphics.lineStyle(2, 0xffffff, 0.8);
      graphics.beginPath();
      graphics.moveTo(-4, 0);
      graphics.lineTo(bodyLength, 0);
      graphics.moveTo(5, -5);
      graphics.lineTo(9, 5);
      graphics.strokePath();
      return;
    }

    if (ability === "slow") {
      graphics.lineStyle(2, palette.edge, 0.9);
      graphics.strokeCircle(7, 0, 6 + rarityTier * 0.35);
      graphics.beginPath();
      graphics.moveTo(7, 0);
      graphics.lineTo(7, -5);
      graphics.moveTo(7, 0);
      graphics.lineTo(12, 2);
      graphics.strokePath();
      graphics.fillStyle(palette.fill, 0.9);
      graphics.fillCircle(bodyLength, 0, 3);
      return;
    }

    if (ability === "berserk") {
      graphics.lineStyle(4, palette.fill, 0.9);
      graphics.beginPath();
      graphics.arc(6, 0, 11 + rarityTier * 0.5, -0.8, 0.8);
      graphics.strokePath();
      graphics.fillStyle(palette.edge, 0.95);
      graphics.fillTriangle(bodyLength, 0, bodyLength - 7, -5, bodyLength - 5, 5);
      return;
    }

    if (role === "single" || ability === "multishot") {
      graphics.lineStyle(thick, 0x7c4a21, 0.95);
      graphics.beginPath();
      graphics.moveTo(-10, 0);
      graphics.lineTo(bodyLength, 0);
      graphics.strokePath();
      graphics.fillStyle(palette.edge, 0.98);
      graphics.fillTriangle(bodyLength + 7, 0, bodyLength - 2, -5, bodyLength - 2, 5);
      graphics.fillStyle(0xf8fafc, 0.84);
      graphics.fillTriangle(-10, 0, -17, -4, -14, 0);
      graphics.fillTriangle(-10, 0, -17, 4, -14, 0);
      return;
    }

    if (role === "support") {
      graphics.lineStyle(2, palette.edge, 0.85);
      graphics.beginPath();
      graphics.moveTo(-3, 0);
      graphics.lineTo(bodyLength, 0);
      graphics.moveTo(7, -7);
      graphics.lineTo(7, 7);
      graphics.strokePath();
      graphics.fillStyle(palette.fill, 0.9);
      graphics.fillCircle(bodyLength + 1, 0, 4 + rarityTier * 0.25);
      return;
    }

    graphics.lineStyle(2, palette.edge, 0.88);
    graphics.strokeCircle(4, 0, 6 + rarityTier * 0.3);
    graphics.fillStyle(palette.fill, 0.88);
    graphics.fillTriangle(4, -7, 12, 0, 4, 7);
    graphics.fillCircle(bodyLength, 0, 3 + rarityTier * 0.2);
  }

  private playMedievalImpact(
    to: { x: number; y: number },
    angle: number,
    role: UnitRole,
    ability: UnitAbilityKind | undefined,
    palette: AttackPalette,
    rarityTier: number,
    critical: boolean,
  ): void {
    const impact = this.add.graphics().setDepth(13);
    const radius = 9 + rarityTier * 2 + (critical ? 5 : 0);
    const sparkCount = 4 + Math.min(10, rarityTier);

    impact.lineStyle(2 + Math.min(3, Math.floor(rarityTier / 3)), palette.edge, 0.86);
    if (role === "single" || ability === "multishot" || ability === "berserk") {
      impact.beginPath();
      impact.moveTo(to.x - radius * 0.7, to.y - radius * 0.35);
      impact.lineTo(to.x + radius * 0.7, to.y + radius * 0.35);
      impact.moveTo(to.x - radius * 0.45, to.y + radius * 0.55);
      impact.lineTo(to.x + radius * 0.45, to.y - radius * 0.55);
      impact.strokePath();
    } else if (role === "support") {
      impact.beginPath();
      impact.moveTo(to.x - radius, to.y);
      impact.lineTo(to.x + radius, to.y);
      impact.moveTo(to.x, to.y - radius);
      impact.lineTo(to.x, to.y + radius);
      impact.strokePath();
      impact.strokeCircle(to.x, to.y, radius * 0.62);
    } else {
      impact.strokeCircle(to.x, to.y, radius);
      impact.strokeCircle(to.x, to.y, radius * 0.48);
    }

    if (ability === "poison") {
      impact.fillStyle(palette.fill, 0.28);
      impact.fillCircle(to.x, to.y, radius + 5);
    }
    if (ability === "freeze") {
      impact.lineStyle(2, 0xffffff, 0.82);
      for (let index = 0; index < 6; index += 1) {
        const ray = (Math.PI * 2 * index) / 6;
        impact.beginPath();
        impact.moveTo(to.x, to.y);
        impact.lineTo(to.x + Math.cos(ray) * (radius + 5), to.y + Math.sin(ray) * (radius + 5));
        impact.strokePath();
      }
    }

    impact.lineStyle(2, palette.fill, 0.75);
    for (let index = 0; index < sparkCount; index += 1) {
      const sparkAngle = angle + Math.PI + (index - (sparkCount - 1) / 2) * 0.24;
      impact.beginPath();
      impact.moveTo(to.x, to.y);
      impact.lineTo(to.x + Math.cos(sparkAngle) * (radius + 7), to.y + Math.sin(sparkAngle) * (radius + 7));
      impact.strokePath();
    }

    if (rarityTier >= 4) {
      impact.lineStyle(2, palette.edge, 0.5);
      impact.strokeCircle(to.x, to.y, radius + 7);
    }
    if (rarityTier >= 6) {
      impact.lineStyle(2, palette.fill, 0.55);
      for (let index = 0; index < 4; index += 1) {
        const runeAngle = (Math.PI * 2 * index) / 4 + Math.PI / 4;
        const x = to.x + Math.cos(runeAngle) * (radius + 10);
        const y = to.y + Math.sin(runeAngle) * (radius + 10);
        impact.beginPath();
        impact.moveTo(x, y - 4);
        impact.lineTo(x + 4, y);
        impact.lineTo(x, y + 4);
        impact.lineTo(x - 4, y);
        impact.closePath();
        impact.strokePath();
      }
    }
    if (rarityTier >= 8 || critical) {
      impact.lineStyle(3, critical ? 0xf43f5e : palette.edge, 0.42);
      impact.strokeCircle(to.x, to.y, radius + 15);
    }

    this.tweens.add({
      targets: impact,
      alpha: 0,
      scaleX: 1.22 + rarityTier * 0.025,
      scaleY: 1.22 + rarityTier * 0.025,
      duration: 300 + rarityTier * 25,
      ease: "Cubic.easeOut",
      onComplete: () => impact.destroy(),
    });
  }

  private playTowerAttackMotion(
    from: { x: number; y: number },
    to: { x: number; y: number },
    role: UnitRole,
    ability?: UnitAbilityKind,
  ): void {
    const image = this.findTowerImageAt(from);
    if (!image) {
      return;
    }

    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    const directionX = Math.cos(angle);
    const directionY = Math.sin(angle);
    const baseX = from.x;
    const baseY = from.y - 6;
    const storedScaleX = image.getData("baseScaleX") as number | undefined;
    const storedScaleY = image.getData("baseScaleY") as number | undefined;
    const baseScaleX = storedScaleX ?? image.scaleX;
    const baseScaleY = storedScaleY ?? image.scaleY;
    const isMelee = role === "single" && ability !== "multishot";
    const power = ability === "berserk" ? 1.35 : 1;

    image.setData("baseScaleX", baseScaleX);
    image.setData("baseScaleY", baseScaleY);
    image.setData("attacking", true);
    this.tweens.killTweensOf(image);
    image.setPosition(baseX, baseY);
    image.setScale(baseScaleX, baseScaleY);
    image.setRotation(0);
    image.setFlipX(to.x < from.x);

    this.tweens.add({
      targets: image,
      x: baseX - directionX * (isMelee ? 2.5 : 1.5),
      y: baseY - directionY + (isMelee ? 1 : 2.5),
      scaleX: baseScaleX * (isMelee ? 0.95 : 0.98),
      scaleY: baseScaleY * 1.06,
      rotation: directionX * (isMelee ? -0.06 : 0.04),
      duration: 55,
      ease: "Quad.easeIn",
      onComplete: () => {
        if (!image.active) {
          return;
        }

        const travel = (isMelee ? 8 : 3.5) * power;
        this.tweens.add({
          targets: image,
          x: baseX + directionX * travel,
          y: baseY + directionY * travel - (isMelee ? 0 : 4),
          scaleX: baseScaleX * (isMelee ? 1.13 : 1.08),
          scaleY: baseScaleY * (isMelee ? 0.92 : 1.13),
          rotation: directionX * (isMelee ? 0.12 : -0.08),
          duration: 70,
          ease: "Cubic.easeOut",
          onComplete: () => {
            if (!image.active) {
              return;
            }

            this.tweens.add({
              targets: image,
              x: baseX,
              y: baseY,
              scaleX: baseScaleX,
              scaleY: baseScaleY,
              rotation: 0,
              duration: 115,
              ease: "Back.easeOut",
              onComplete: () => {
                if (!image.active) {
                  return;
                }
                image.setData("attacking", false);
                image.setPosition(baseX, baseY);
                image.setScale(baseScaleX, baseScaleY);
                image.setRotation(0);
              },
            });
          },
        });
      },
    });
  }

  private findTowerImageAt(position: { x: number; y: number }): Phaser.GameObjects.Image | null {
    for (const image of this.towerImages.values()) {
      if (Math.hypot(image.x - position.x, image.y - (position.y - 6)) <= 3) {
        return image;
      }
    }
    return null;
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

  private playExperienceReward(at: { x: number; y: number }, amount: number, leveledUp: boolean): void {
    const text = this.add
      .text(at.x, at.y - 14, leveledUp ? `LEVEL UP! +${amount} XP` : `+${amount} XP`, {
        color: leveledUp ? "#fef08a" : "#67e8f9",
        fontFamily: "Arial, sans-serif",
        fontSize: leveledUp ? "16px" : "11px",
        fontStyle: "900",
        stroke: "#17324d",
        strokeThickness: leveledUp ? 4 : 3,
      })
      .setOrigin(0.5)
      .setDepth(16);

    this.tweens.add({
      targets: text,
      y: text.y - (leveledUp ? 48 : 30),
      scaleX: leveledUp ? 1.18 : 1,
      scaleY: leveledUp ? 1.18 : 1,
      alpha: 0,
      duration: leveledUp ? 1_050 : 700,
      ease: "Cubic.easeOut",
      onComplete: () => text.destroy(),
    });
  }
}

function mixColor(from: number, to: number, amount: number): number {
  const fromRed = (from >> 16) & 255;
  const fromGreen = (from >> 8) & 255;
  const fromBlue = from & 255;
  const toRed = (to >> 16) & 255;
  const toGreen = (to >> 8) & 255;
  const toBlue = to & 255;

  return (
    (Math.round(fromRed + (toRed - fromRed) * amount) << 16) |
    (Math.round(fromGreen + (toGreen - fromGreen) * amount) << 8) |
    Math.round(fromBlue + (toBlue - fromBlue) * amount)
  );
}

interface BattlefieldPalette {
  groundTopLeft: number;
  groundTopRight: number;
  groundBottomLeft: number;
  groundBottomRight: number;
  field: number;
  fieldBorder: number;
  path: number;
  pathShadow: number;
  accent: number;
}

function getBattlefieldPalette(wave: number, bossWarning: boolean): BattlefieldPalette {
  const palettes: BattlefieldPalette[] = [
    {
      groundTopLeft: 0xd9c79a,
      groundTopRight: 0xf8fafc,
      groundBottomLeft: 0x7fa765,
      groundBottomRight: 0xb38b5d,
      field: 0xd9f2c7,
      fieldBorder: 0x4d7c0f,
      path: 0xb9a372,
      pathShadow: 0x334155,
      accent: 0x93c5fd,
    },
    {
      groundTopLeft: 0xe9c46a,
      groundTopRight: 0xfef3c7,
      groundBottomLeft: 0x90a955,
      groundBottomRight: 0xc77945,
      field: 0xe4f0b1,
      fieldBorder: 0x6b7f2c,
      path: 0xb97942,
      pathShadow: 0x4a3428,
      accent: 0xf59e0b,
    },
    {
      groundTopLeft: 0xcbd5e1,
      groundTopRight: 0xf8fafc,
      groundBottomLeft: 0xa5f3fc,
      groundBottomRight: 0x94a3b8,
      field: 0xdff7f5,
      fieldBorder: 0x0e7490,
      path: 0xb6c5d4,
      pathShadow: 0x334155,
      accent: 0x67e8f9,
    },
    {
      groundTopLeft: 0xc4b5fd,
      groundTopRight: 0xf5f3ff,
      groundBottomLeft: 0x86efac,
      groundBottomRight: 0x6d28d9,
      field: 0xe9d5ff,
      fieldBorder: 0x7e22ce,
      path: 0x8b5cf6,
      pathShadow: 0x312e81,
      accent: 0x22c55e,
    },
    {
      groundTopLeft: 0xfca5a5,
      groundTopRight: 0xffedd5,
      groundBottomLeft: 0x78716c,
      groundBottomRight: 0x7f1d1d,
      field: 0xfed7aa,
      fieldBorder: 0x9a3412,
      path: 0x92400e,
      pathShadow: 0x292524,
      accent: 0xf97316,
    },
    {
      groundTopLeft: 0xbfdbfe,
      groundTopRight: 0xfefce8,
      groundBottomLeft: 0xc4b5fd,
      groundBottomRight: 0x475569,
      field: 0xe0e7ff,
      fieldBorder: 0x4338ca,
      path: 0x64748b,
      pathShadow: 0x1e293b,
      accent: 0xfacc15,
    },
  ];
  const base = palettes[Math.min(palettes.length - 1, Math.floor((Math.max(1, wave) - 1) / 10))]!;
  if (!bossWarning) {
    return base;
  }

  return {
    ...base,
    groundTopLeft: mixColor(base.groundTopLeft, 0xffe4e6, 0.45),
    groundBottomRight: mixColor(base.groundBottomRight, 0x881337, 0.35),
    field: mixColor(base.field, 0xfff1f2, 0.35),
    fieldBorder: 0xfb7185,
    path: 0xfb7185,
    pathShadow: 0x881337,
    accent: 0xfda4af,
  };
}

interface CombatEffectBudget {
  attacks: number;
  damageNumbers: number;
  goldRewards: number;
  experienceRewards: number;
}

function getCombatEffectBudget(speed: number): CombatEffectBudget {
  if (speed >= 20) {
    return { attacks: 5, damageNumbers: 6, goldRewards: 3, experienceRewards: 2 };
  }
  if (speed >= 10) {
    return { attacks: 8, damageNumbers: 10, goldRewards: 4, experienceRewards: 3 };
  }
  if (speed >= 5) {
    return { attacks: 12, damageNumbers: 14, goldRewards: 6, experienceRewards: 4 };
  }
  return { attacks: 18, damageNumbers: 20, goldRewards: 8, experienceRewards: 6 };
}

function pickVisualEvents<T>(events: T[], budget: number, isPriority: (event: T) => boolean): Set<T> {
  if (events.length <= budget) {
    return new Set(events);
  }

  const selected = new Set<T>();
  for (const event of events) {
    if (isPriority(event)) {
      selected.add(event);
      if (selected.size >= budget) {
        return selected;
      }
    }
  }

  const candidates = events.filter((event) => !selected.has(event));
  const remaining = budget - selected.size;
  for (let index = 0; index < remaining; index += 1) {
    const candidateIndex = Math.min(candidates.length - 1, Math.floor(((index + 0.5) * candidates.length) / remaining));
    const candidate = candidates[candidateIndex];
    if (candidate) {
      selected.add(candidate);
    }
  }
  return selected;
}

interface AttackPalette {
  fill: number;
  edge: number;
  trail: number;
}

function getAttackPalette(role: UnitRole, ability: UnitAbilityKind | undefined, color: string, critical: boolean): AttackPalette {
  if (critical) {
    return { fill: 0xf43f5e, edge: 0xfff1f2, trail: 0xbe123c };
  }
  if (ability === "poison") {
    return { fill: 0x22c55e, edge: 0x14532d, trail: 0x86efac };
  }
  if (ability === "freeze") {
    return { fill: 0x67e8f9, edge: 0xe0f2fe, trail: 0x38bdf8 };
  }
  if (ability === "slow") {
    return { fill: 0xa78bfa, edge: 0xfef3c7, trail: 0x7c3aed };
  }
  if (ability === "berserk") {
    return { fill: 0xdc2626, edge: 0xfbbf24, trail: 0x7f1d1d };
  }
  if (role === "single" || ability === "multishot") {
    return { fill: 0xd6a85a, edge: 0xf8fafc, trail: 0x7c4a21 };
  }
  if (role === "support") {
    return { fill: 0xfacc15, edge: 0xfffbeb, trail: 0xf59e0b };
  }
  const rarityColor = Phaser.Display.Color.HexStringToColor(color).color;
  return { fill: rarityColor, edge: 0xf8fafc, trail: mixColor(rarityColor, 0x312e81, 0.42) };
}

function getTowerTextureKey(definition: UnitDefinition): string {
  if (definition.id === "mythic-ranger") {
    return "component-storm-archer";
  }
  if (definition.id === "mythic-plague-warlock") {
    return "component-plague-warlock";
  }
  if (definition.id === "transcendent-time-mage") {
    return "component-time-mage";
  }
  if (definition.id === "transcendent-frost-witch") {
    return "component-frost-witch";
  }
  if (definition.id === "immortal-berserker") {
    return "component-berserker";
  }
  if (definition.role === "single") {
    return "component-knight";
  }
  if (definition.role === "area") {
    return "component-wizard";
  }
  return "component-priest";
}

function getEnemyTextureKey(wave: number, isBoss: boolean, trueBossId?: TrueBossId): string {
  if (trueBossId === "orc-emperor") {
    return "component-orc";
  }
  if (trueBossId === "ogre-king") {
    return "component-ogre";
  }
  if (trueBossId === "ancient-dragon") {
    return "true-boss-dragon";
  }
  if (trueBossId === "undead-demon-king") {
    return "true-boss-undead-lord";
  }
  if (isBoss) {
    return "component-ogre";
  }
  if (wave % 3 === 1) {
    return "component-orc";
  }
  if (wave % 3 === 2) {
    return "component-undead";
  }
  return "component-skeleton";
}

function getTrueBossName(id: TrueBossId): string {
  if (id === "orc-emperor") {
    return "오크 황제";
  }
  if (id === "ogre-king") {
    return "오우거 대왕";
  }
  if (id === "ancient-dragon") {
    return "고대 드래곤";
  }
  return "언데드 마왕";
}

function getEnemyDisplayName(wave: number, isBoss: boolean): string {
  if (isBoss) {
    return "오우거 족장";
  }
  if (wave % 3 === 1) {
    return "오크 전사";
  }
  if (wave % 3 === 2) {
    return "언데드";
  }
  return "해골 병사";
}

function getAbilityLabel(ability: "multishot" | "slow" | "poison" | "freeze" | "berserk"): string {
  if (ability === "multishot") {
    return "멀티샷";
  }
  if (ability === "slow") {
    return "둔화";
  }
  if (ability === "poison") {
    return "독 DOT";
  }
  if (ability === "freeze") {
    return "빙결";
  }
  return "광폭화";
}

function getEnemyEffectLabel(effect: "slow" | "freeze" | "poison"): string {
  if (effect === "slow") {
    return "둔화";
  }
  if (effect === "freeze") {
    return "빙결";
  }
  return "독";
}
