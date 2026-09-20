import { BATTLE_THEMES } from './game/battleThemes';
import { unitArtMarkup, evolutionPathMarkup, evolutionGalleryMarkup } from './evolutionUi';
import { getEvolutionVisual } from './game/evolutionVisuals';
import { superForgeMarkup, dragonShopMarkup } from './superUi';
import { MAX_TOWERS, TOWER_TYPES, TOWER_LABELS, SUPER_COST, SUPER_INGREDIENT_COUNT } from './game/superUnits';
import type { TowerType, DragonItemKind } from './game/types';
import { animateDice, diceMarkup } from './dice';
import { REWARD_POOL, type UpgradeRoll } from './game/upgrades';
import type { GameScene } from './game/GameScene';
import type { GameSimulation, SimulationEvent } from './game/simulation';
import { RARITIES, getRarity } from './game/rarities';
import { IMMORTAL_MERGE_COUNT, MAX_WAVES, UNIQUES_PER_TOWER_TYPE, purchaseSkill, skillTracks, skillTree } from './game/systems';
import { saveMetaProgress } from './game/storage';
import { getUniqueUnitLevel, getUnitDefinition, getTowerType, isUniqueUnit } from './game/units';
export interface UiHandle {
    setScene(scene: GameScene): void;
    render(): void;
    showEvents(events: SimulationEvent[]): void;
    setSelectedSlot(slot: number | null): void;
    getSpeedMultiplier(): number;
}
const art = `${import.meta.env.BASE_URL}assets/generated/fantasy-components/`;
const icon = (name: string) => {
    const paths: Record<string, string> = { moon: 'M20 15.2A8.7 8.7 0 0 1 8.8 4a8.7 8.7 0 1 0 11.2 11.2Z', shield: 'M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6Z', diamond: 'm12 3 8 9-8 9-8-9Z', swords: 'm4 3 16 17m0-17L4 20M3 15l6 6m6-18 6 6', snow: 'M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M9 4l3 3 3-3M9 20l3-3 3 3', star: 'm12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5Z', play: 'm8 4 12 8-12 8Z', pause: 'M8 5v14M16 5v14', sound: 'm4 9 4 0 5-4v14l-5-4H4ZM17 8c3 2 3 6 0 8', book: 'M12 5C8 2 3 4 3 4v15s5-2 9 1c4-3 9-1 9-1V4s-5-2-9 1Zm0 0v15', coin: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4v10m-3-8h5c3 0 3 3 0 3h-4c-3 0-3 3 0 3h5' };
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${(paths[name] || paths.star).split('~').map(d => `<path d="${d}"/>`).join('')}</svg>`;
};
export function createUi(sim: GameSimulation, persistProgress = true): UiHandle {
    const app = document.querySelector<HTMLDivElement>('#app')!;
    app.innerHTML = `<main class="shell">
  <header class="masthead"><a class="brand" href="./" aria-label="달빛 수호대 홈"><span class="brand-sigil">${icon('moon')}</span><span><b>달빛 수호대</b><small>운명을 뽑고, 성채를 지켜라</small></span></a><div class="header-tools"><span class="best-record" id="best-record"></span><button class="icon-button" id="sound-button" aria-label="소리 켜기" title="소리 켜기">${icon('sound')}</button><button id="evolution-button" class="quiet-button">${icon('star')} 진화 도감</button><button id="help-button" class="quiet-button">${icon('book')} 플레이 가이드</button></div></header>
  <section class="campaign-heading"><div><span class="chapter-label"><i></i> 첫 번째 원정</span><h1 id="battle-title">잊혀진 숲의 성채</h1><p id="battle-subtitle">끝없는 어둠 속, 마지막 달빛을 지켜주세요.</p></div><div class="chapter-mark">I<span>Moonwood</span></div></section>
  <section class="game-layout">
   <div class="battle-column"><div class="battle-hud"><div class="wave-stat"><span id="difficulty-label" class="stat-label">보통 · 현재 웨이브</span><strong><span id="wave-count">00</span><small> / ${MAX_WAVES}</small></strong></div><div class="health-stat"><div><span>${icon('shield')} 성채 내구도</span><b id="hp-count"></b></div><div class="health-track"><i id="hp-bar"></i></div></div><div class="gold-stat">${icon('coin')}<div><span class="stat-label">보유 골드</span><strong id="gold-count"></strong></div></div></div>
    <div id="boss-hud" class="boss-hud" hidden></div><div class="arena-wrap"><div id="game-root"></div><div class="arena-topline"><span id="phase-chip" class="phase-chip"></span><span id="timer-chip"></span></div><div class="arena-caption"><span class="live-dot"></span> 달빛의 정원 <small>방어 구역</small></div><div id="toast" class="toast" role="status" aria-live="polite"></div><div id="pause-overlay" class="pause-overlay hidden"><span>${icon('pause')}</span><h2>잠시, 숨 고르기</h2><p>계속하려면 일시정지 버튼 또는 Space</p></div></div>
    <div class="battle-toolbar"><div class="speed-controls"><button id="pause-button" class="icon-button" aria-label="일시정지">${icon('pause')}</button><span class="divider"></span>${[1, 2, 3, 5, 10, ...(import.meta.env.DEV ? [20] : [])].map(s => `<button data-speed="${s}" class="speed-button ${s === 1 ? 'active' : ''} ${s >= 10 ? 'operator-speed' : ''}" aria-label="${s}배속${s >= 10 ? ' 운영자용' : ''}" title="${s >= 10 ? '운영자용 고속 테스트' : `${s}배속`}">${s}×${s >= 10 ? '<small>운영자</small>' : ''}</button>`).join('')}</div><div class="auto-toggles"><span class="auto-label">자동</span><button id="auto-progress" class="auto-toggle" aria-pressed="false" title="웨이브 시작과 축복 선택을 자동으로 합니다.">진행</button><button id="auto-summon" class="auto-toggle" aria-pressed="false" title="수호대가 자리를 잡을 때까지 수호자 소환으로 머릿수를 채우고, 이후 고급·전설 소환 값을 모아 상위 소환만 삽니다. 합성으로 슬롯도 회수합니다.">소환</button><button id="auto-upgrade" class="auto-toggle" aria-pressed="false" title="가장 싼 타워로 값을 치러 수호대 전체 공격력·공격속도 룰렛을 돌립니다.">강화</button><button id="auto-arrange" class="auto-toggle" aria-pressed="false" title="수호대가 늘거나 줄 때마다 같은 종류끼리 다시 정렬합니다.">배치</button><button id="auto-craft" class="auto-toggle" aria-pressed="false" title="각성 재료를 합성하지 않고 남겨두고, 제작비를 모아 슈퍼유니크·무극신을 직접 각성합니다.">제작</button></div><span class="kill-count">처치 <b id="kill-count">0</b></span><button id="wave-button" class="wave-button">${icon('play')} 원정 시작</button></div>
    <div class="journey-strip"><span>원정의 이정표</span><div id="milestones">${[1, 20, 40, 60, 80, 100, 120].map(n => `<span data-milestone="${n}"><i>${n === 1 ? '·' : icon('diamond')}</i><small>${n}</small></span>`).join('')}</div><b>${MAX_WAVES}<br><small>최종 방어</small></b></div>
   </div>
   <aside class="command-panel"><div class="panel-heading"><h2>수호대 편성</h2><span id="unit-count">0 / ${MAX_TOWERS}</span></div>
    <p class="panel-description">소환은 운으로, 승리는 전략으로.</p>
    <div class="summon-actions"><button id="summon-button" class="summon-button tier-guardian"><span><b>수호자 소환</b><small>일반 ~ 영웅</small></span><span class="summon-price" id="summon-price"></span><kbd>Q</kbd></button><button id="advanced-summon-button" class="summon-button tier-advanced"><span class="summon-symbol">${icon('diamond')}</span><span><b>고급 소환</b><small>고급 ~ 신화</small></span><span class="summon-price" id="advanced-price"></span><kbd>W</kbd></button><button id="legendary-summon-button" class="summon-button tier-legendary"><span class="summon-symbol">${icon('star')}</span><span><b>전설 소환</b><small>에픽 ~ 불멸 · 유니크</small></span><span class="summon-price" id="legendary-price"></span><kbd>A</kbd></button></div>
    <div class="section-title"><h3>편성 시너지</h3><span id="synergy-status"></span></div><div id="synergies" class="synergies"></div><p class="synergy-caption">세 역할을 모두 편성하면 공격력 +15%</p>
    <div class="selected-unit" id="selected-unit"></div>
    <button id="upgrade-button" class="forge-button"><span>${icon('swords')} 공격력 룰렛 강화</span><b id="upgrade-price"></b></button><button id="speed-upgrade-button" class="forge-button speed-forge"><span>${icon('star')} 공격속도 룰렛 강화</span><b id="speed-upgrade-price"></b></button><p id="upgrade-hint" class="upgrade-hint"></p><div class="unit-actions"><button id="merge-button">${icon('diamond')} 선택 합성</button><button id="sell-button">판매</button></div>
    <div class="section-title"><h3>전술 스킬</h3><span>직접 사용</span></div><button id="frost-button" class="frost-button"><span class="frost-icon">${icon('snow')}</span><span><b>달빛 결계</b><small>모든 적을 3초간 빙결</small></span><span id="frost-status">준비</span><kbd>E</kbd></button>
    <div class="super-access"><button id="super-forge-button">${icon('diamond')} 슈퍼유니크 각성</button><button id="dragon-shop-button">${icon('swords')} 드래곤 상점</button></div><button id="blessings-button" class="blessings-button"><span>${icon('book')} 원정 축복</span><b id="blessings-count">0개</b></button><button id="skill-toggle" class="growth-button"><span>${icon('moon')} 영구 성장</span><span id="shard-count"></span></button>
   </aside>
  </section>
  <section class="roster-panel"><div class="roster-heading"><div><h2>나의 수호자</h2><span id="roster-hint">불멸 ${IMMORTAL_MERGE_COUNT}개 → 같은 유형 유니크 · 유니크 동시 보유 최대 2명</span></div><div class="roster-tools"><button id="sort-button" class="quiet-button">지금 정렬</button><select id="merge-rarity" aria-label="합성할 타워 등급">${RARITIES.filter(r=>r.id!=='unique').map(r=>`<option value="${r.id}">${r.label}</option>`).join('')}</select><button id="stage-merge-button" class="quiet-button">단계별 합성</button><button id="bulk-merge-button" class="quiet-button">일괄 합성 <span id="merge-count">0</span></button></div></div><div id="roster" class="roster"></div></section>
  <footer><span>${icon('moon')} 달빛 수호대</span><p>Q 소환 <i>·</i> W 고급 <i>·</i> A 전설 <i>·</i> E 결계 <i>·</i> Space 일시정지</p><span>성장 기록 자동 저장</span></footer>
 </main><dialog id="game-dialog" aria-labelledby="dialog-title"><div id="dialog-content"></div></dialog>`;
    let scene: GameScene | null = null, selected: number | null = null, speed = 1, paused = false, muted = true, dialogKind = '', rosterKey = '', saved = JSON.stringify(sim.meta), toastTimer = 0;
    let audio: AudioContext | undefined;
    let stopDice: (() => void) | undefined;
    let autoCloseTimer: number | undefined;
    let shopSlot: number | null = null;
    const q = <T extends HTMLElement = HTMLElement>(id: string) => document.querySelector<T>(`#${id}`)!;
    const dialog = q<HTMLDialogElement>('game-dialog');
    const button = (id: string, fn: () => void) => q(id).addEventListener('click', () => { fn(); tone(); flush(); render(); });
    function tone(high = false) { if (muted)
        return; try {
        audio ??= new AudioContext();
        void audio.resume();
        const o = audio.createOscillator(), g = audio.createGain();
        o.connect(g);
        g.connect(audio.destination);
        o.type = 'sine';
        o.frequency.setValueAtTime(high ? 660 : 390, audio.currentTime);
        o.frequency.exponentialRampToValueAtTime(high ? 880 : 520, audio.currentTime + 0.1);
        g.gain.setValueAtTime(0.035, audio.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.2);
        o.start();
        o.stop(audio.currentTime + 0.21);
    }
    catch { /* Audio is optional. */ } }
    function open(kind: string, html: string) { dialogKind = kind; q('dialog-content').innerHTML = html; dialog.scrollTop = 0; if (!dialog.open)
        dialog.showModal(); dialog.scrollTop = 0; }
    function close() { window.clearTimeout(autoCloseTimer); stopDice?.(); stopDice = undefined; dialog.close(); dialogKind = ''; }
    function heading(label: string, title: string, desc: string) { return `<span class="dialog-eyebrow">${label}</span><h2 id="dialog-title">${title}</h2><p class="dialog-description">${desc}</p>`; }
    function toast(text: string) { q('toast').textContent = text; q('toast').classList.add('show'); window.clearTimeout(toastTimer); toastTimer = window.setTimeout(() => q('toast').classList.remove('show'), 2600); }
    function starter() { for (let i = 0; i < 3; i++)
        sim.summonToFirstEmpty(); sim.sortUnitsByType(); sim.drainEvents(); }
    starter();
    button('summon-button', () => sim.summonToFirstEmpty());
    button('advanced-summon-button', () => sim.summonAdvanced());
    button('legendary-summon-button', () => sim.summonLegendary());
    function showDice(roll: UpgradeRoll) {
        stopDice?.();
        const tower=roll.kind==='tower';
        open('dice', heading(tower?`강화 비용 ${roll.cost}G 결제 완료`:`${sim.state.wave}웨이브 축복`, tower?(roll.stat==='attack'?'공격력 강화 룰렛':'공격속도 강화 룰렛'):'이번 원정의 운명을 굴립니다', `${roll.label} +${roll.min}~${roll.max}${roll.unit} · 결과는 한 번만 확정됩니다.`) + diceMarkup(roll) + `<p class="dice-footnote">${tower?'약 0.65초 후 자동 적용 · 합성 시 계승':'이번 원정 동안 누적 유지'}</p>`);
        const container=q('dialog-content');
        stopDice=animateDice(container,roll,()=>{
            tone(true);
            sim.resolveUpgradeRoll();
            autoCloseTimer=window.setTimeout(()=>{close();flush();render();},window.matchMedia('(prefers-reduced-motion: reduce)').matches?80:200);
        });
    }
    button('upgrade-button', () => { if(selected===null)return;const roll=sim.rollTowerUpgrade(selected);if(roll)showDice(roll); });
    button('speed-upgrade-button', () => {if(selected===null)return;const roll=sim.rollTowerUpgrade(selected,'haste');if(roll)showDice(roll);});
    button('super-forge-button',()=>open('super-forge',superForgeMarkup(sim)));
    button('dragon-shop-button',()=>{shopSlot=selected;open('shop',dragonShopMarkup(sim,shopSlot));});
    button('blessings-button', () => {
        const owned=REWARD_POOL.filter(r=>sim.getUpgradeValue(r.stat)>0);
        open('blessings',heading('이번 원정에 누적 적용','수호대가 모은 축복',`${sim.rewardHistory.length}번의 선택 · ${owned.length}종 효과 활성`) + `<div class="blessing-list">${owned.length?owned.map(r=>`<article><span>${icon(r.icon)}</span><div><b>${r.title}</b><small>${r.description}</small></div><strong>+${sim.getUpgradeValue(r.stat)}${r.unit}</strong></article>`).join(''):'<p class="dialog-description">10웨이브를 클리어하면 무작위 축복 3개 중 하나를 선택할 수 있습니다.</p>'}</div><button data-close class="dialog-primary">전장으로 돌아가기</button>`);
    });
    button('sort-button', () => { sim.sortUnitsByType(); scene?.clearSelection(); });
    button('auto-progress', () => { sim.autoProgress = !sim.autoProgress; });
    button('auto-summon', () => { sim.autoSummon = !sim.autoSummon; });
    button('auto-upgrade', () => { sim.autoUpgrade = !sim.autoUpgrade; });
    button('auto-arrange', () => { sim.autoArrange = !sim.autoArrange; });
    button('auto-craft', () => { sim.autoCraft = !sim.autoCraft; });
    button('stage-merge-button', () => { sim.bulkMergeAll(q<HTMLSelectElement>('merge-rarity').value as typeof RARITIES[number]['id']); scene?.clearSelection(); });
    button('bulk-merge-button', () => { sim.bulkMergeAll(); scene?.clearSelection(); });
    button('sell-button', () => { if (selected !== null)
        sim.sellUnit(selected); scene?.clearSelection(); });
    button('merge-button', () => {
        const prompt = sim.requestMerge(selected ?? undefined);
        if (!prompt)
            return;
        open('merge', heading('수호자의 각성', '다음 수호자를 선택하세요', `같은 수호자 ${prompt.sourceSlots.length}명이 한 단계 높은 수호자로 다시 태어납니다.`) + `<div class="choice-grid">${prompt.candidates.map(d => `<button data-merge="${d.id}" class="choice">${unitArtMarkup(d)}<small style="color:${getRarity(d.rarity).color}">${getEvolutionVisual(d).label} · ${getRarity(d.rarity).label}</small><h3>${d.name.replace(getRarity(d.rarity).label + ' ', '')}</h3><p>${d.skill}</p></button>`).join('')}</div><button data-close class="quiet-button">돌아가기</button>`);
    });
    button('frost-button', () => { if (sim.castFrost())
        scene?.pulseFrost(); });
    button('wave-button', () => {
        if (sim.state.status === 'lost' || sim.state.status === 'won') {
            sim.restartRun();
            starter();
            scene?.clearSelection();
            paused = false;
        }
        else
            sim.startNextWave();
    });
    button('pause-button', () => paused = !paused);
    button('sound-button', () => { muted = !muted; q('sound-button').classList.toggle('enabled', !muted); q('sound-button').setAttribute('aria-label', muted ? '소리 켜기' : '소리 끄기'); q('sound-button').title = muted ? '소리 켜기' : '소리 끄기'; });
    button('evolution-button', () => open('evolution', evolutionGalleryMarkup()));
    button('help-button', () => open('help', heading('플레이 가이드', '운명은 뽑고, 전술은 고르세요', '소환 · 배치 · 합성, 세 가지로 시작하는 달빛의 전투') + `<div class="guide-list"><article><b>01</b><div><h3>수호자를 모으세요</h3><p>시작 수호자 3명이 배치되어 있습니다. 소환은 세 종류입니다. 수호자 소환은 일반~영웅, 고급 소환은 고급~신화, 전설 소환은 에픽~불멸에 더해 유니크가 드물게 나옵니다. 위로 갈수록 비쌉니다.</p></div></article><article><b>02</b><div><h3>길목을 지키세요</h3><p>수호자를 드래그해 이동합니다. 클릭하면 사거리가 보입니다. 기사·마법사·사제를 함께 편성하면 공격력 +15%.</p></div></article><article><b>03</b><div><h3>합성하고, 결계를 펼치세요</h3><p>같은 수호자 3명을 합성하면 상위 등급을 직접 고릅니다. 불멸만 2명으로 합성되며, 나온 유니크는 재료와 같은 유형입니다. 유니크는 <b>유형마다 ${UNIQUES_PER_TOWER_TYPE}명까지</b> 보유합니다. 달빛 결계는 현재 적을 3초간 얼립니다. 기본 재사용 24초. 골드로 공격력 룰렛 또는 공격속도 룰렛(+0.2~5%)을 돌리면 <b>수호대 전체</b>에 적용됩니다. 어느 등급으로 지불하든 효과는 같습니다. 슈퍼유니크 각성에는 같은 유형 유니크 1명·전설/신화/초월/불멸 각 ${SUPER_INGREDIENT_COUNT}명과 ${SUPER_COST.toLocaleString()}G가 필요합니다.</p></div></article><article><b>04</b><div><h3>네 난이도의 120웨이브와 보스를 돌파하세요</h3><p>보통 → 나이트메어 → 헬 → Insane 순서로 각각 120웨이브를 진행합니다. 난이도 전환 시 수호대와 강화가 유지됩니다. 각 난이도는 <b>이전 난이도의 마지막 웨이브에서 이어집니다</b> — 새 난이도 1웨이브가 직전 난이도 120웨이브의 약 1.5배입니다. 이동속도는 난이도마다 1.15배씩만 올라가고, Insane은 등장 수가 2배입니다. 최대 수호대는 200명입니다. 적은 순환 경로를 돌고, 제한시간 종료 시 생존한 일반 적 6명당 체력 1, 보스당 5를 잃습니다. 보스는 웨이브가 아니라 <b>웨이브 사이의 별도 단계</b>입니다. 120웨이브는 전부 일반 웨이브이고, 5웨이브를 마칠 때마다 중간보스, 10웨이브마다 보스, 20웨이브마다 진보스가 이어서 등장하며 마지막 120웨이브 뒤에 최종보스가 강림합니다. 보스 단계는 웨이브 번호를 올리지 않습니다. 공략 제한시간은 각각 60초·95초·115초·135초이고, 50웨이브를 넘어서면 중간보스·보스·진보스가 20초씩 더 받습니다. 10웨이브마다 25종 중 무작위 축복 3개를 제시하며, 하나를 골라 주사위로 강화량을 정합니다. 실패해도 성장 조각은 남습니다.</p></div></article></div><button data-close class="dialog-primary">이제 지킬 준비가 됐어요</button>`));
    let branch = skillTracks[0]!.id;
    function showSkills() {
        open('skills', heading('성장 조각은 원정이 끝나도 유지됩니다', '수호대의 유산', `보유 조각 ${sim.meta.growthShards} · 최고 기록 ${sim.meta.highestWave}웨이브`) + `<div class="skill-tabs">${skillTracks.map(t => `<button data-branch="${t.id}" class="${branch === t.id ? 'active' : ''}">${t.label}</button>`).join('')}</div><div class="skill-list">${skillTree.filter(n => n.branch === branch).map(n => { const owned = sim.meta.unlockedSkills.includes(n.id), locked = !!n.prerequisite && !sim.meta.unlockedSkills.includes(n.prerequisite); return `<button data-skill="${n.id}" ${owned || locked || sim.meta.growthShards < n.cost ? 'disabled' : ''}><b>${n.tier}</b><span>${n.description}</span><small>${owned ? '해금 완료' : `${n.cost} 조각`}</small></button>`; }).join('')}</div><button data-close class="dialog-primary">전장으로 돌아가기</button>`);
    }
    button('skill-toggle', showSkills);
    dialog.addEventListener('cancel', e => { if (dialogKind === 'reward' || dialogKind === 'result' || dialogKind === 'dice')
        e.preventDefault();
    else {
        sim.cancelMerge();
        dialogKind = '';
    } });
    dialog.addEventListener('click', e => {
        const el = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
        if (!el || el.disabled)
            return;
        if(el.hasAttribute('data-craft-ultimate')){if(sim.craftUltimate()){close();scene?.selectSlot(sim.state.board.length-1);}else open('super-forge',superForgeMarkup(sim));}
        if(el.dataset.craftSuper){if(sim.craftSuper(el.dataset.craftSuper as TowerType)){close();scene?.selectSlot(sim.state.board.length-1);}else open('super-forge',superForgeMarkup(sim));}
        if(el.dataset.shopSelect!==undefined){shopSlot=Number(el.dataset.shopSelect);open('shop',dragonShopMarkup(sim,shopSlot));}
        if(el.dataset.itemBuy){shopSlot=Number(el.dataset.shopSlot);const ok=sim.buyDragonItem(shopSlot,el.dataset.itemBuy as DragonItemKind);open('shop',dragonShopMarkup(sim,shopSlot,ok?'장착 완료 · 자동 효과 활성':'구매 조건을 확인하세요.'));}
        if(el.dataset.itemUpgrade){shopSlot=Number(el.dataset.shopSlot);const outcome=sim.upgradeDragonItem(shopSlot,el.dataset.itemUpgrade as DragonItemKind);open('shop',dragonShopMarkup(sim,shopSlot,outcome?outcome.success?`+${outcome.level} 강화 성공 · 추가 효과 +${outcome.gain}`:`강화 실패 · ${outcome.cost.toLocaleString()}G 사용, 기존 +${outcome.level} 유지`:'골드 또는 강화 한도를 확인하세요.'));}
        if (el.hasAttribute('data-close')) {
            sim.cancelMerge();
            close();
        }
        if (el.dataset.merge) {
            sim.chooseMergeCandidate(el.dataset.merge);
            close();
            scene?.clearSelection();
        }
        if (el.dataset.reward) {
            const roll=sim.rollReward(el.dataset.reward);
            if(roll)showDice(roll);
        }
        if (el.hasAttribute('data-confirm-roll')) {
            sim.resolveUpgradeRoll();
            close();
        }
        if (el.dataset.branch) {
            branch = el.dataset.branch as typeof branch;
            showSkills();
        }
        if (el.dataset.skill) {
            try {
                sim.meta = purchaseSkill(sim.meta, el.dataset.skill);
                showSkills();
            }
            catch {
                toast('성장 조각이 부족합니다.');
            }
        }
        if (el.hasAttribute('data-restart')) {
            close();
            sim.restartRun();
            starter();
            scene?.clearSelection();
            paused = false;
        }
        tone(true);
        flush();
        render();
    });
    document.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach(b => b.addEventListener('click', () => { speed = Number(b.dataset.speed); render(); }));
    q('roster').addEventListener('click', e => { const el = (e.target as HTMLElement).closest<HTMLElement>('[data-unit]'); if (el)
        scene?.selectSlot(Number(el.dataset.unit)); });
    document.addEventListener('keydown', e => {
        if (e.repeat || dialog.open || /INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName))
            return;
        const keys: Record<string, string> = { q: 'summon-button', w: 'advanced-summon-button', a: 'legendary-summon-button', e: 'frost-button', r:'upgrade-button', t:'speed-upgrade-button' };
        if (e.code === 'Space' && (e.target as HTMLElement).tagName !== 'BUTTON') {
            e.preventDefault();
            q('pause-button').click();
        }
        if (keys[e.key.toLowerCase()])
            q<HTMLButtonElement>(keys[e.key.toLowerCase()]!).click();
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden && sim.isWaveActive) {
        paused = true;
        render();
    } });
    function render() {
        const s = sim.state, ended = s.status === 'won' || s.status === 'lost';
        const theme = BATTLE_THEMES[s.difficulty];
        q('battle-title').textContent = theme.title;
        q('battle-title').style.color = theme.accent;
        q('battle-subtitle').textContent = theme.subtitle;
        q('difficulty-label').textContent = `${sim.difficulty.label} · 현재 웨이브`;
        for (const [id, on] of [['auto-progress', sim.autoProgress], ['auto-summon', sim.autoSummon], ['auto-upgrade', sim.autoUpgrade], ['auto-arrange', sim.autoArrange], ['auto-craft', sim.autoCraft]] as const)
            q(id).setAttribute('aria-pressed', String(on));
        const bosses = sim.enemies.filter(e => e.isBoss && e.hp > 0);
        const bossHud = q('boss-hud');
        bossHud.hidden = bosses.length === 0;
        const bossBars = bosses.slice(0, 2).map(e => ({label: `${e.trueBossId === 'eclipse-sovereign' ? '최종보스' : e.trueBossId ? '진보스' : e.wave % 10 === 0 ? '보스' : '중간보스'} · ${e.variantLabel}`, hp: Math.max(0, e.hp), maxHp: e.maxHp}));
        if (bosses.length > 2) bossBars.push({label: `추가 보스 ${bosses.length - 2}기 · 합산 체력`, hp: bosses.slice(2).reduce((sum,e)=>sum+Math.max(0,e.hp),0), maxHp: bosses.slice(2).reduce((sum,e)=>sum+e.maxHp,0)});
        bossHud.innerHTML = bossBars.map(e => `<div class="boss-health"><div><b>${e.label}</b><span>${Math.ceil(e.hp).toLocaleString()} / ${Math.ceil(e.maxHp).toLocaleString()}</span></div><progress aria-label="${e.label} 체력" max="${e.maxHp}" value="${e.hp}"></progress></div>`).join('');
        q('wave-count').textContent = String(s.wave).padStart(2, '0');
        q('hp-count').textContent = `${s.baseHealth} / ${s.maxBaseHealth}`;
        q('hp-bar').style.width = `${100 * s.baseHealth / s.maxBaseHealth}%`;
        q('hp-bar').classList.toggle('danger', s.baseHealth < 6);
        q('gold-count').textContent = s.gold.toLocaleString();
        q('unit-count').textContent = `${s.board.length} / ${MAX_TOWERS}`;
        q('kill-count').textContent = String(s.defeatedEnemies);
        q('best-record').textContent = `최고 기록 ${sim.meta.highestWave} 웨이브`;
        q('phase-chip').textContent = ended ? (s.status === 'won' ? '방어 성공' : '성채 함락') : sim.isWaveActive ? (sim.activeWaveDefinition?.isFinalBoss ? '최종보스 강림' : sim.activeWaveDefinition?.isTrueBoss ? '진보스 습격' : sim.activeWaveDefinition?.isBoss ? '보스 습격' : '전투 진행 중') : s.wave ? '다음 습격 준비' : '수호대 배치 중';
        q('phase-chip').classList.toggle('boss', !!sim.activeWaveDefinition?.isBoss);
        q('timer-chip').textContent = sim.isWaveActive ? `${Math.ceil(s.waveTimeRemainingMs / 1000)}초 · 적 ${sim.enemies.length}` : sim.nextWaveDelayRemainingMs > 0 ? `다음 웨이브까지 ${Math.ceil(sim.nextWaveDelayRemainingMs / 1000)}초` : '준비되면 원정을 시작하세요';
        q('summon-price').textContent = s.freeSummons >= 1 ? `무료 ${s.freeSummons}` : `${sim.summonCost} G`;
        q('advanced-price').textContent = `${sim.advancedSummonCost} G`;
        q('legendary-price').textContent = `${sim.legendarySummonCost} G`;
        q<HTMLButtonElement>('summon-button').disabled = ended || s.board.length >= MAX_TOWERS || (s.gold < sim.summonCost && s.freeSummons < 1);
        q<HTMLButtonElement>('advanced-summon-button').disabled = ended || s.board.length >= MAX_TOWERS || s.gold < sim.advancedSummonCost;
        q<HTMLButtonElement>('legendary-summon-button').disabled = ended || s.board.length >= MAX_TOWERS || s.gold < sim.legendarySummonCost;
        q<HTMLButtonElement>('wave-button').disabled = !ended && (!sim.canStartWave || s.board.length === 0);
        q('wave-button').innerHTML = icon('play') + (ended ? '다시 도전' : s.wave === 0 ? '원정 시작' : sim.isWaveActive ? '방어 진행 중' : '다음 웨이브');
        q('pause-overlay').classList.toggle('hidden', !paused);
        q('pause-button').innerHTML = icon(paused ? 'play' : 'pause');
        q('pause-button').setAttribute('aria-label', paused ? '계속하기' : '일시정지');
        document.querySelectorAll<HTMLElement>('[data-speed]').forEach(b => { b.classList.toggle('active', Number(b.dataset.speed) === speed); b.setAttribute('aria-pressed', String(Number(b.dataset.speed) === speed)); });
        const counts:Record<TowerType,number>={archer:0,warrior:0,mage:0,priest:0};s.board.forEach(u=>counts[getTowerType(getUnitDefinition(u.definitionId))]++);
        q('synergies').innerHTML=TOWER_TYPES.map(type=>`<div class="${counts[type]?'present':''}"><img src="${art}${({archer:'storm-archer',warrior:'knight',mage:'wizard',priest:'priest'})[type]}.png" alt=""><span>${TOWER_LABELS[type]}</span><b>${counts[type]}</b></div>`).join('');
        q('synergy-status').textContent = sim.formationBonus ? '공격력 +15% 활성' : '조합 대기';
        q('synergy-status').className = sim.formationBonus ? 'text-mint' : '';
        const unit = selected === null ? null : s.board[selected];
        if (unit) {
            const d = getUnitDefinition(unit.definitionId), r = getRarity(d.rarity), stats = sim.getTowerCombatStats(selected!)!;
            q('selected-unit').innerHTML = `${unitArtMarkup(d)}<div><small style="color:${d.superUnique?'#ebd49e':r.color}">${getEvolutionVisual(d).label} · ${d.ultimate?'궁극 무극신':d.superUnique?'유일슈퍼유니크':r.label} 수호자</small><h3>${d.name}${isUniqueUnit(d) ? ` Lv.${getUniqueUnitLevel(sim.meta, d.id)}` : ''}</h3><p class="evolution-level">${isUniqueUnit(d) ? `스킬 진화 ${getEvolutionVisual(d, getUniqueUnitLevel(sim.meta, d.id)).skillStage}단계 · 5레벨마다 성장` : `다음 진화: ${getEvolutionVisual(d).stage < 9 ? `${getEvolutionVisual(d).stage + 1}단계` : '최고 등급'}`}</p><p>공격 ${stats.baseAttack} <em class="stat-gain">(+${(stats.attack-stats.baseAttack).toFixed(1)})</em> = ${stats.attack.toFixed(1)}</p><p>공속 ${(1000/stats.attackSpeed).toFixed(2)}/초 · ${d.superUnique?`장비 ${unit.items?.length??0}/3`: `사거리 ${Math.round(stats.range)}`}</p><p>${d.superUnique?(sim.isSuperBerserk(unit)?`광폭화 활성 · 공격/공속 ${d.ultimate?2:1.25}배`:'광폭화 대기 · 자동 시전'):d.role === 'single' ? '선두 적 집중 공격' : d.role === 'area' ? '주변 적 광역 공격' : '아군 공격속도 보조'}</p>${evolutionPathMarkup(d)}</div>`;
        }
        else
            q('selected-unit').innerHTML = `<span class="empty-emblem">${icon('shield')}</span><div><small>수호자 정보</small><h3>함께할 수호자를 선택하세요</h3><p>전장 또는 아래 카드를 클릭하세요.</p></div>`;
        const forge=q<HTMLButtonElement>('upgrade-button');
        const forgeCost=selected===null?0:sim.getTowerUpgradeCost(selected);
        forge.disabled=ended||!unit||s.gold<forgeCost||!!sim.pendingRoll||sim.pendingReward;
        q<HTMLButtonElement>('speed-upgrade-button').disabled=forge.disabled;
        q('speed-upgrade-price').textContent=unit?`${forgeCost} G`:'선택 필요';
        q('upgrade-price').textContent=unit?`${forgeCost} G`:'선택 필요';
        q('upgrade-hint').textContent=`수호대 전체 강화 · 공격 +${sim.towerAttackUpgradePercent}% / 공속 +${sim.towerSpeedUpgradePercent}%${unit?` · 이 수호자 ${unit.upgradeCount??0}회 지불`:''}`;
        q('blessings-count').textContent=`${sim.rewardHistory.length}개`;
        q('roster-hint').textContent=s.board.length>=MAX_TOWERS?'정원이 가득 찼습니다. 타워를 선택해 골드 강화하거나 합성하세요.':`불멸 ${IMMORTAL_MERGE_COUNT}개 → 같은 유형 유니크 · 유니크 동시 보유 최대 2명`;
        const groups = sim.getMergeableGroups();
        q<HTMLButtonElement>('merge-button').disabled = ended || (selected === null ? groups.length === 0 : !groups.some(g => g.includes(selected!)));
        q<HTMLButtonElement>('sell-button').disabled = ended || !unit;
        q<HTMLButtonElement>('bulk-merge-button').disabled = ended || groups.length === 0;
        q<HTMLButtonElement>('stage-merge-button').disabled = ended || groups.length === 0;
        q<HTMLButtonElement>('sort-button').disabled = ended || s.board.length < 2;
        q('merge-count').textContent = String(groups.length);
        q<HTMLButtonElement>('frost-button').disabled = ended || !sim.isWaveActive || sim.frostCooldownMs > 0 || paused;
        q('frost-status').textContent = sim.frostCooldownMs > 0 ? `${Math.ceil(sim.frostCooldownMs / 1000)}초` : '준비';
        q('shard-count').textContent = `${sim.meta.growthShards} 조각`;
        const key = s.board.map(u => u.instanceId + ':' + getUniqueUnitLevel(sim.meta, u.definitionId) + ':' + (u.attackUpgradePercent??0) + ':' + (u.speedUpgradePercent??0) + ':' + (u.items??[]).map(item=>item.kind+item.level+item.bonus).join(',') + ':' + sim.isSuperBerserk(u) + ':' + (u.definitionId==='super-priest'?(u.superElapsedMs??0)%15000<10000:false)).join(',') + ':' + selected + ':' + sim.towerAttackUpgradePercent + ':' + sim.towerSpeedUpgradePercent + ':' + JSON.stringify(sim.upgrades);
        if (key !== rosterKey) {
            rosterKey = key;
            const mergeable = sim.getMergeableSlots();
            q('roster').innerHTML = s.board.length ? s.board.map((u, i) => { const d = getUnitDefinition(u.definitionId), r = getRarity(d.rarity), cardStats=sim.getTowerCombatStats(i)!; return `<button data-unit="${i}" class="unit-card ${d.superUnique?'super-card':''} ${selected === i ? 'selected' : ''}" style="--rarity:${r.color}" aria-label="${d.name} 선택" aria-pressed="${selected === i}"><span class="unit-rarity">${d.ultimate?'∞ 궁극 각성':d.superUnique?'★ 최종 각성':`${getEvolutionVisual(d).stage}단계 · ${r.label}`}${isUniqueUnit(d) ? ` · Lv.${getUniqueUnitLevel(sim.meta, d.id)}` : ''}</span>${unitArtMarkup(d)}<b>${d.name.replace(r.label + ' ', '')}</b><small class="card-attack">공격 ${cardStats.baseAttack} <em>(+${(cardStats.attack-cardStats.baseAttack).toFixed(1)})</em></small><small>${sim.towerAttackUpgradePercent ? `전체 강화 +${sim.towerAttackUpgradePercent}%` : mergeable.has(i) ? '합성 가능' : d.role === 'single' ? '집중 공격' : d.role === 'area' ? '광역 공격' : '공격 보조'}</small></button>`; }).join('') : `<p class="empty-roster">수호자를 소환해 방어선을 만드세요.</p>`;
        }
        document.querySelectorAll<HTMLElement>('[data-milestone]').forEach(el => el.classList.toggle('reached', s.wave >= Number(el.dataset.milestone)));
        const next = JSON.stringify(sim.meta);
        if (next !== saved) {
            if (persistProgress) saveMetaProgress(sim.meta);
            saved = next;
        }
        if (sim.pendingReward && !sim.autoProgress && !sim.pendingRoll && !dialog.open) {
            open('reward', heading(`${s.wave}웨이브 생존 보상`, '어떤 축복에 운명을 맡길까요?', '25종 중 무작위로 등장한 3개 · 하나를 골라 주사위를 굴리세요.') + `<div class="choice-grid">${sim.rewardChoices.map(r=>{const max=Math.min(r.max,r.cap-sim.getUpgradeValue(r.stat)),min=Math.min(r.min,max);return `<button class="choice" data-reward="${r.id}">${icon(r.icon)}<small>${r.category} · 이번 원정 누적</small><h3>${r.title}</h3><strong>${r.label}<br>+${min}~${max}${r.unit}</strong><p>${r.description}</p><span class="reward-current">현재 +${sim.getUpgradeValue(r.stat)}${r.unit}</span><span class="roll-cta">선택하고 주사위 굴리기</span></button>`;}).join('')}</div><p class="dice-footnote">정규분포형 주사위: 낮거나 높은 극단값보다 중간값이 자주 나옵니다.</p>`);
        }
    }
    function showEvents(events: SimulationEvent[]) {
        for (const e of events) {
            if (e.type === 'message' || e.type === 'jackpot')
                toast(e.text);
            if (e.type === 'waveComplete') {
                toast(e.bossLabel
                    ? `${e.wave}웨이브 ${e.bossLabel} 격파 · 성장 조각 +${e.growthShardsAwarded}`
                    : `${e.wave}웨이브 방어 완료 · 성장 조각 +${e.growthShardsAwarded}`);
                tone(true);
            }
            if (e.type === 'runEnded') {
                open('result', heading(e.status === 'won' ? '새벽이 밝았습니다' : '아직, 이야기는 끝나지 않았습니다', e.status === 'won' ? '성채를 지켜냈습니다' : '다시 일어설 시간', `도달 ${sim.difficulty.label} ${sim.state.wave}웨이브 · 처치 ${sim.state.defeatedEnemies} · 획득 조각 ${e.growthShardsAwarded}`) + `<div class="result-sigil">${icon('moon')}</div><p class="dialog-description">성장 조각으로 수호대를 강화하고, 더 먼 곳으로 나아가세요.</p><button data-restart class="dialog-primary">새로운 원정 준비</button>`);
            }
        }
        render();
    }
    function flush() { const events=sim.drainEvents();scene?.playEvents(events);showEvents(events); }
    render();
    return { setScene(s) { scene = s; }, render, showEvents, setSelectedSlot(slot) { selected = slot; render(); }, getSpeedMultiplier() { return paused || dialog.open ? 0 : speed; } };
}
