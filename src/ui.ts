import type { GameScene } from "./game/GameScene";
import type { GameSimulation, SimulationEvent } from "./game/simulation";
import { getRarity } from "./game/rarities";
import { MAX_WAVES, purchaseSkill, skillTracks, skillTree } from "./game/systems";
import { saveMetaProgress } from "./game/storage";
import { formatUniqueAbilityStats } from "./game/uniqueAbilities";
import type { SkillBranch } from "./game/types";
import {
  getEffectiveUnitStats,
  getUniqueUnitExperience,
  getUniqueUnitExperienceRequirement,
  getUniqueUnitLevel,
  getUnitDefinition,
} from "./game/units";

export interface UiHandle {
  setScene(scene: GameScene): void;
  render(): void;
  showEvents(events: SimulationEvent[]): void;
  setSelectedSlot(slot: number | null): void;
  getSpeedMultiplier(): number;
}

const SPEED_MULTIPLIERS = [1, 2, 3, 5, 10, 20] as const;

export function createUi(simulation: GameSimulation): UiHandle {
  const app = document.querySelector<HTMLDivElement>("#app");
  if (!app) {
    throw new Error("Missing #app root.");
  }

  app.innerHTML = `
    <main class="shell">
      <section class="phone">
        <div id="game-root" class="game-root"></div>
        <div class="top-hud">
          <span id="wave-pill">Wave 0/${MAX_WAVES}</span>
          <span id="timer-pill">시간 0초</span>
          <span id="gold-pill">0G</span>
          <span id="heart-pill">HP 20</span>
        </div>
        <div class="field-intel">
          <span id="phase-chip">편성 단계</span>
          <span id="merge-chip">합성 없음</span>
        </div>
        <div id="toast" class="toast" aria-live="polite"></div>
        <section class="bottom-panel">
          <div class="status-row">
            <div class="selected-summary">
              <strong id="selected-name">유닛 선택 없음</strong>
              <span id="selected-detail">보드의 유닛을 탭하세요</span>
              <div id="selected-tags" class="selected-tags"></div>
            </div>
            <div class="status-tools">
              <button id="sort-button" class="compact-tool" type="button" title="유닛 종류별 자동정렬" aria-label="유닛 종류별 자동정렬"><b aria-hidden="true">↕</b><small>정렬</small></button>
              <button id="skill-toggle" class="icon-button" title="스킬 트리">✦</button>
            </div>
          </div>
          <div class="speed-row" aria-label="게임 속도">
            ${SPEED_MULTIPLIERS.map(
              (speed) =>
                `<button class="${speed >= 10 ? "operator-speed" : ""}" data-speed="${speed}" type="button">${speed}x</button>`,
            ).join("")}
          </div>
          <div class="action-grid">
            <button id="summon-button" class="primary-action">소환</button>
            <button id="advanced-summon-button" class="advanced-action">고급소환</button>
            <button id="merge-button">합성</button>
            <button id="bulk-merge-button">일괄합성</button>
            <button id="sell-button">판매</button>
            <button id="wave-button">웨이브</button>
          </div>
        </section>
        <section id="merge-modal" class="modal hidden">
          <div class="modal-card">
            <h2>합성 후보 선택</h2>
            <div id="merge-options" class="merge-options"></div>
            <button id="merge-cancel" class="quiet-button">취소</button>
          </div>
        </section>
        <section id="skill-panel" class="modal hidden">
          <div class="modal-card skill-card">
            <div class="modal-head">
              <h2>스킬 트리</h2>
              <button id="skill-close" class="icon-button" title="닫기">×</button>
            </div>
            <p id="shard-count" class="shard-count"></p>
            <div class="skill-branch-tabs" aria-label="스킬 계열">
              ${skillTracks.map(
                (track) => `<button type="button" data-skill-branch="${track.id}"></button>`,
              ).join("")}
            </div>
            <p id="skill-track-summary" class="skill-track-summary"></p>
            <div id="skill-list" class="skill-list"></div>
          </div>
        </section>
      </section>
    </main>
  `;

  let scene: GameScene | null = null;
  let selectedSlot: number | null = null;
  let lastSavedMeta = JSON.stringify(simulation.meta);
  let lastRenderedSkillMeta: string | null = null;
  let speedMultiplier = 1;
  let activeSkillBranch: SkillBranch = skillTracks[0]!.id;
  const toast = query("#toast");
  const mergeModal = query("#merge-modal");
  const mergeOptions = query("#merge-options");
  const skillPanel = query("#skill-panel");
  const speedButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-speed]"));
  const skillBranchButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-skill-branch]"));

  query<HTMLButtonElement>("#summon-button").addEventListener("click", () => {
    simulation.summonToFirstEmpty();
    flushEvents();
    render();
  });

  query<HTMLButtonElement>("#advanced-summon-button").addEventListener("click", () => {
    simulation.summonAdvanced();
    flushEvents();
    render();
  });

  query<HTMLButtonElement>("#wave-button").addEventListener("click", () => {
    if (simulation.state.status === "won" || simulation.state.status === "lost") {
      if (simulation.restartRun()) {
        scene?.clearSelection();
      }
    } else {
      simulation.startNextWave();
    }
    flushEvents();
    render();
  });

  query<HTMLButtonElement>("#sell-button").addEventListener("click", () => {
    if (selectedSlot !== null && simulation.sellUnit(selectedSlot)) {
      scene?.clearSelection();
    }
    flushEvents();
    render();
  });

  query<HTMLButtonElement>("#sort-button").addEventListener("click", () => {
    if (simulation.sortUnitsByType()) {
      scene?.clearSelection();
    }
    flushEvents();
    render();
  });

  query<HTMLButtonElement>("#merge-button").addEventListener("click", () => {
    const prompt = simulation.requestMerge(selectedSlot ?? undefined);
    flushEvents();
    renderMergePrompt();
    if (prompt) {
      mergeModal.classList.remove("hidden");
    }
  });

  query<HTMLButtonElement>("#bulk-merge-button").addEventListener("click", () => {
    simulation.bulkMergeAll();
    scene?.clearSelection();
    flushEvents();
    render();
  });

  query<HTMLButtonElement>("#merge-cancel").addEventListener("click", () => {
    simulation.cancelMerge();
    mergeModal.classList.add("hidden");
  });

  query<HTMLButtonElement>("#skill-toggle").addEventListener("click", () => {
    renderSkillsIfStale();
    skillPanel.classList.remove("hidden");
  });

  query<HTMLButtonElement>("#skill-close").addEventListener("click", () => {
    skillPanel.classList.add("hidden");
  });

  for (const button of speedButtons) {
    button.addEventListener("click", () => {
      speedMultiplier = Number(button.dataset.speed) || 1;
      renderSpeedButtons();
    });
  }

  for (const button of skillBranchButtons) {
    button.addEventListener("click", () => {
      activeSkillBranch = button.dataset.skillBranch as SkillBranch;
      renderSkills();
    });
  }

  function setScene(nextScene: GameScene): void {
    scene = nextScene;
  }

  function getSpeedMultiplier(): number {
    return speedMultiplier;
  }

  function setSelectedSlot(slot: number | null): void {
    selectedSlot = slot;
    render();
  }

  function render(): void {
    const state = simulation.state;
    const mergeGroups = simulation.getMergeableGroups().length;
    query<HTMLButtonElement>("#sort-button").disabled = state.board.length < 2;
    const phaseChip = query("#phase-chip");
    const mergeChip = query("#merge-chip");
    query("#wave-pill").textContent = `Wave ${state.wave}/${MAX_WAVES}`;
    query("#timer-pill").textContent =
      simulation.nextWaveDelayRemainingMs > 0
        ? `다음 ${Math.ceil(simulation.nextWaveDelayRemainingMs / 1000)}초`
        : `시간 ${Math.ceil(state.waveTimeRemainingMs / 1000)}초`;
    query("#gold-pill").textContent = `${state.gold}G · 무료 ${state.freeSummons}`;
    query("#heart-pill").textContent = `HP ${state.baseHealth}/${state.maxBaseHealth}`;
    phaseChip.textContent = getPhaseText();
    phaseChip.className = simulation.activeWaveDefinition?.isBoss || simulation.upcomingWaveDefinition?.isBoss ? "boss" : "";
    mergeChip.textContent = mergeGroups > 0 ? `합성 가능 ${mergeGroups}회` : "합성 대기";
    mergeChip.className = mergeGroups > 0 ? "ready" : "";

    const selected = selectedSlot === null ? null : state.board[selectedSlot];
    if (!selected) {
      query("#selected-name").textContent = "유닛 선택 없음";
      query("#selected-detail").textContent =
        `타워 ${state.board.length}개 · 일반 ${simulation.summonCost}G · 고급 ${simulation.advancedSummonCost}G · 조각 ${simulation.meta.growthShards}`;
      query("#selected-tags").innerHTML = `
        <span>처치 ${state.defeatedEnemies}</span>
        <span>${simulation.isWaveActive ? `전장 ${simulation.enemies.length}` : `보유 ${state.board.length}`}</span>
        <span>${mergeGroups > 0 ? "합성 준비" : simulation.isWaveActive ? getThreatLabel() : "소환 준비"}</span>
      `;
    } else {
      const definition = getUnitDefinition(selected.definitionId);
      const rarity = getRarity(definition.rarity);
      const uniqueLevel = getUniqueUnitLevel(simulation.meta, definition.id);
      const uniqueExperience = getUniqueUnitExperience(simulation.meta, definition.id);
      const uniqueExperienceRequirement = getUniqueUnitExperienceRequirement(uniqueLevel);
      const stats = getEffectiveUnitStats(definition, uniqueLevel);
      query("#selected-name").textContent = definition.uniqueAbility ? `${definition.name} Lv.${uniqueLevel}` : `${definition.name}`;
      query("#selected-detail").textContent =
        `${rarity.label} · ${definition.attackType} · 공격 ${stats.attack} · 속도 ${(1000 / stats.attackSpeed).toFixed(2)}/초 · 범위 ${stats.range} · 치명 ${(stats.criticalChance * 100).toFixed(1)}%`;
      query("#selected-tags").innerHTML = `
        <span>${definition.uniqueAbility ? `XP ${uniqueLevel >= 99 ? "MAX" : `${uniqueExperience}/${uniqueExperienceRequirement}`}` : `범위 ${stats.range}`}</span>
        <span>${definition.role === "single" ? "기사" : definition.role === "area" ? "마법" : "사제"}</span>
        <span style="--tag-color:${rarity.color}">${definition.uniqueAbility ? formatUniqueAbilityStats(definition.uniqueAbility, uniqueLevel) : rarity.label}</span>
      `;
    }

    const runEnded = state.status === "won" || state.status === "lost";
    const waveButton = query<HTMLButtonElement>("#wave-button");
    waveButton.disabled = runEnded ? false : !simulation.canStartWave;
    waveButton.textContent = runEnded ? "다시 시작" : "웨이브";
    query<HTMLButtonElement>("#summon-button").textContent =
      state.freeSummons > 0 ? `무료 소환 (${state.freeSummons})` : `소환 ${simulation.summonCost}G`;
    query<HTMLButtonElement>("#advanced-summon-button").textContent = `고급 ${simulation.advancedSummonCost}G`;

    if (!skillPanel.classList.contains("hidden")) {
      renderSkillsIfStale();
    }
    saveMetaIfChanged();
  }

  function renderMergePrompt(): void {
    mergeOptions.innerHTML = "";
    if (!simulation.pendingMerge) {
      return;
    }

    for (const candidate of simulation.pendingMerge.candidates) {
      const rarity = getRarity(candidate.rarity);
      const button = document.createElement("button");
      button.className = "merge-choice";
      button.innerHTML = `
        <span class="rarity-dot" style="background:${rarity.color}"></span>
        <strong>${candidate.name}</strong>
        <small>${rarity.label} · ${candidate.skill}</small>
      `;
      button.addEventListener("click", () => {
        simulation.chooseMergeCandidate(candidate.id);
        mergeModal.classList.add("hidden");
        scene?.clearSelection();
        flushEvents();
        render();
      });
      mergeOptions.append(button);
    }
  }

  function renderSkills(): void {
    lastRenderedSkillMeta = JSON.stringify(simulation.meta);
    query("#shard-count").textContent = `성장 조각 ${simulation.meta.growthShards}개 · 최고 웨이브 ${simulation.meta.highestWave}`;
    const list = query("#skill-list");
    list.innerHTML = "";

    for (const button of skillBranchButtons) {
      const track = skillTracks.find((entry) => entry.id === button.dataset.skillBranch)!;
      const unlockedCount = skillTree.filter(
        (node) => node.branch === track.id && simulation.meta.unlockedSkills.includes(node.id),
      ).length;
      button.classList.toggle("active", track.id === activeSkillBranch);
      button.innerHTML = `<span>${track.label}</span><small>${unlockedCount}/7</small>`;
    }

    const activeTrack = skillTracks.find((track) => track.id === activeSkillBranch)!;
    const activeNodes = skillTree.filter((entry) => entry.branch === activeSkillBranch);
    const activeUnlockedCount = activeNodes.filter((node) => simulation.meta.unlockedSkills.includes(node.id)).length;
    const nextNode = activeNodes[activeUnlockedCount];
    const currentEffect = activeNodes
      .filter((node) => simulation.meta.unlockedSkills.includes(node.id))
      .reduce((total, node) => total + node.effect.value, 0);
    query("#skill-track-summary").textContent =
      `${activeTrack.label} ${activeUnlockedCount}/7 · ${activeUnlockedCount > 0 ? `현재 ${activeTrack.describe(currentEffect)}` : "현재 미적용"} · ${nextNode ? `다음 ${nextNode.description}` : "최대 단계 완료"}`;

    for (const node of activeNodes) {
      const unlocked = simulation.meta.unlockedSkills.includes(node.id);
      const lockedByPrerequisite = node.prerequisite && !simulation.meta.unlockedSkills.includes(node.prerequisite);
      const affordable = simulation.meta.growthShards >= node.cost;
      const button = document.createElement("button");
      button.className = `skill-node ${unlocked ? "unlocked" : ""}`;
      button.disabled = unlocked || Boolean(lockedByPrerequisite) || !affordable;
      const stateLabel = unlocked
        ? "해금 완료"
        : lockedByPrerequisite
          ? "이전 단계 필요"
          : affordable
            ? `${node.cost}조각으로 해금`
            : `${node.cost}조각 필요`;
      button.setAttribute("aria-label", `${activeTrack.label} ${node.tier}단계, ${node.description}, ${stateLabel}`);
      button.innerHTML = `
        <span class="skill-tier">${node.tier}</span>
        <strong>${node.description}</strong>
        <small>${stateLabel}</small>
      `;
      button.addEventListener("click", () => {
        try {
          simulation.meta = purchaseSkill(simulation.meta, node.id);
          showToast(`${node.label} 해금!`);
          render();
        } catch (error) {
          showToast(error instanceof Error ? error.message : "스킬을 살 수 없어요.");
        }
      });
      list.append(button);
    }
  }

  function renderSkillsIfStale(): void {
    if (lastRenderedSkillMeta === JSON.stringify(simulation.meta)) {
      return;
    }

    renderSkills();
  }

  function renderSpeedButtons(): void {
    for (const button of speedButtons) {
      const active = Number(button.dataset.speed) === speedMultiplier;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    }
  }

  function getThreatLabel(): string {
    if (simulation.enemies.some((enemy) => Boolean(enemy.trueBossId))) {
      return "진보스";
    }
    if (simulation.enemies.some((enemy) => enemy.isBoss)) {
      return "보스";
    }
    return "교전 중";
  }

  function getPhaseText(): string {
    if (simulation.state.status === "won") {
      return "방어 성공";
    }
    if (simulation.state.status === "lost") {
      return "기지 함락";
    }

    const upcomingWave = simulation.upcomingWaveDefinition;
    if (simulation.nextWaveDelayRemainingMs > 0 && upcomingWave) {
      if (upcomingWave.isTrueBoss) {
        return `진보스 준비 W${upcomingWave.number}`;
      }
      return upcomingWave.isBoss ? `보스 준비 W${upcomingWave.number}` : `다음 웨이브 W${upcomingWave.number}`;
    }

    const activeWave = simulation.activeWaveDefinition;
    if (activeWave) {
      if (simulation.state.waveTimeRemainingMs <= simulation.activeWaveCleanupWindowMs) {
        return activeWave.isBoss ? "보스 처치 시간" : "정리 시간";
      }
      if (activeWave.isTrueBoss) {
        return `진보스 교전 W${activeWave.number}`;
      }
      return activeWave.isBoss ? `보스 교전 W${activeWave.number}` : `전투 중 W${activeWave.number}`;
    }

    return "편성 단계";
  }

  function showEvents(events: SimulationEvent[]): void {
    for (const event of events) {
      if (event.type === "jackpot" || event.type === "message") {
        showToast(event.text);
      }
      if (event.type === "waveComplete") {
        showToast(`${event.wave} 웨이브 클리어 · 성장 조각 +${event.growthShardsAwarded}`);
      }
      if (event.type === "unitExperience" && event.levelsGained > 0) {
        showToast(`${getUnitDefinition(event.definitionId).name} Lv.${event.level} 달성!`);
      }
      if (event.type === "runEnded") {
        showToast(
          event.status === "won"
            ? `승리! ${MAX_WAVES}웨이브 방어 성공 · 조각 +${event.growthShardsAwarded}`
            : `패배 성장 · 조각 +${event.failureShardsAwarded}`,
        );
      }
    }
    render();
  }

  function flushEvents(): void {
    showEvents(simulation.drainEvents());
  }

  let toastTimer: number | undefined;
  function showToast(text: string): void {
    toast.textContent = text;
    toast.classList.add("show");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("show"), 1800);
  }

  function saveMetaIfChanged(): void {
    const nextMeta = JSON.stringify(simulation.meta);
    if (nextMeta === lastSavedMeta) {
      return;
    }

    saveMetaProgress(simulation.meta);
    lastSavedMeta = nextMeta;
  }

  render();
  renderSpeedButtons();

  return {
    setScene,
    render,
    showEvents,
    setSelectedSlot,
    getSpeedMultiplier,
  };
}

function query<T extends HTMLElement = HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing element: ${selector}`);
  }
  return element;
}
