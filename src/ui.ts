import type { GameScene } from "./game/GameScene";
import type { GameSimulation, SimulationEvent } from "./game/simulation";
import { getRarity } from "./game/rarities";
import { purchaseSkill, skillTree } from "./game/systems";
import { saveMetaProgress } from "./game/storage";
import { getUnitDefinition } from "./game/units";

export interface UiHandle {
  setScene(scene: GameScene): void;
  render(): void;
  showEvents(events: SimulationEvent[]): void;
  setSelectedSlot(slot: number | null): void;
}

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
          <span id="wave-pill">Wave 0/30</span>
          <span id="timer-pill">시간 0초</span>
          <span id="gold-pill">0G</span>
          <span id="heart-pill">HP 20</span>
        </div>
        <div id="toast" class="toast" aria-live="polite"></div>
        <section class="bottom-panel">
          <div class="status-row">
            <div>
              <strong id="selected-name">유닛 선택 없음</strong>
              <span id="selected-detail">보드의 유닛을 탭하세요</span>
            </div>
            <button id="skill-toggle" class="icon-button" title="스킬 트리">✦</button>
          </div>
          <div class="action-grid">
            <button id="summon-button" class="primary-action">소환</button>
            <button id="merge-button">합성</button>
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
            <div id="skill-list" class="skill-list"></div>
          </div>
        </section>
      </section>
    </main>
  `;

  let scene: GameScene | null = null;
  let selectedSlot: number | null = null;
  const toast = query("#toast");
  const mergeModal = query("#merge-modal");
  const mergeOptions = query("#merge-options");
  const skillPanel = query("#skill-panel");

  query<HTMLButtonElement>("#summon-button").addEventListener("click", () => {
    simulation.summonToFirstEmpty();
    flushEvents();
    render();
  });

  query<HTMLButtonElement>("#wave-button").addEventListener("click", () => {
    simulation.startNextWave();
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

  query<HTMLButtonElement>("#merge-button").addEventListener("click", () => {
    const prompt = simulation.requestMerge(selectedSlot ?? undefined);
    flushEvents();
    renderMergePrompt();
    if (prompt) {
      mergeModal.classList.remove("hidden");
    }
  });

  query<HTMLButtonElement>("#merge-cancel").addEventListener("click", () => {
    simulation.cancelMerge();
    mergeModal.classList.add("hidden");
  });

  query<HTMLButtonElement>("#skill-toggle").addEventListener("click", () => {
    renderSkills();
    skillPanel.classList.remove("hidden");
  });

  query<HTMLButtonElement>("#skill-close").addEventListener("click", () => {
    skillPanel.classList.add("hidden");
  });

  function setScene(nextScene: GameScene): void {
    scene = nextScene;
  }

  function setSelectedSlot(slot: number | null): void {
    selectedSlot = slot;
    render();
  }

  function render(): void {
    const state = simulation.state;
    query("#wave-pill").textContent = `Wave ${state.wave}/30`;
    query("#timer-pill").textContent = `시간 ${Math.ceil(state.waveTimeRemainingMs / 1000)}초`;
    query("#gold-pill").textContent = `${state.gold}G · 무료 ${state.freeSummons}`;
    query("#heart-pill").textContent = `HP ${state.baseHealth}/${state.maxBaseHealth}`;

    const selected = selectedSlot === null ? null : state.board[selectedSlot];
    if (!selected) {
      query("#selected-name").textContent = "유닛 선택 없음";
      query("#selected-detail").textContent = `소환 ${simulation.summonCost}G · 조각 ${simulation.meta.growthShards}`;
    } else {
      const definition = getUnitDefinition(selected.definitionId);
      const rarity = getRarity(definition.rarity);
      query("#selected-name").textContent = `${definition.name}`;
      query("#selected-detail").textContent =
        `${rarity.label} · ${definition.attackType} · 공격 ${definition.attack} · 속도 ${(1000 / definition.attackSpeed).toFixed(2)}/초 · 치명 ${(definition.criticalChance * 100).toFixed(1)}%`;
    }

    query<HTMLButtonElement>("#wave-button").disabled = !simulation.canStartWave;
    query<HTMLButtonElement>("#summon-button").textContent =
      state.freeSummons > 0 ? `무료 소환 (${state.freeSummons})` : `소환 ${simulation.summonCost}G`;
    renderSkills();
    saveMetaProgress(simulation.meta);
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
    query("#shard-count").textContent = `성장 조각 ${simulation.meta.growthShards}개 · 최고 웨이브 ${simulation.meta.highestWave}`;
    const list = query("#skill-list");
    list.innerHTML = "";

    for (const node of skillTree) {
      const unlocked = simulation.meta.unlockedSkills.includes(node.id);
      const lockedByPrerequisite = node.prerequisite && !simulation.meta.unlockedSkills.includes(node.prerequisite);
      const affordable = simulation.meta.growthShards >= node.cost;
      const button = document.createElement("button");
      button.className = `skill-node ${unlocked ? "unlocked" : ""}`;
      button.disabled = unlocked || Boolean(lockedByPrerequisite) || !affordable;
      button.innerHTML = `
        <span>${node.branch.toUpperCase()} ${node.tier}</span>
        <strong>${node.label}</strong>
        <small>${node.description} · ${node.cost}조각</small>
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

  function showEvents(events: SimulationEvent[]): void {
    for (const event of events) {
      if (event.type === "jackpot" || event.type === "message") {
        showToast(event.text);
      }
      if (event.type === "waveComplete") {
        showToast(`${event.wave} 웨이브 클리어!`);
      }
      if (event.type === "runEnded") {
        showToast(event.status === "won" ? "승리! 30웨이브 방어 성공" : "패배! 다시 도전해요");
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

  render();

  return {
    setScene,
    render,
    showEvents,
    setSelectedSlot,
  };
}

function query<T extends HTMLElement = HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing element: ${selector}`);
  }
  return element;
}
