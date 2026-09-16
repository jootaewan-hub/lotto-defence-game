import type { GameScene } from './game/GameScene';
import type { GameSimulation, SimulationEvent } from './game/simulation';
import { getRarity } from './game/rarities';
import { MAX_WAVES, purchaseSkill, skillTracks, skillTree } from './game/systems';
import { saveMetaProgress } from './game/storage';
import { getEffectiveUnitStats, getUniqueUnitLevel, getUnitDefinition } from './game/units';
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
function portrait(id: string) { const d = getUnitDefinition(id); return d.uniqueAbility ? ({ 'multishot': 'storm-archer', 'poison': 'plague-warlock', 'slow': 'time-mage', 'freeze': 'frost-witch', 'berserk': 'berserker' }[d.uniqueAbility]) : d.role === 'single' ? 'knight' : d.role === 'area' ? 'wizard' : 'priest'; }
export function createUi(sim: GameSimulation): UiHandle {
    const app = document.querySelector<HTMLDivElement>('#app')!;
    app.innerHTML = `<main class="shell">
  <header class="masthead"><a class="brand" href="./" aria-label="달빛 수호대 홈"><span class="brand-sigil">${icon('moon')}</span><span><b>달빛 수호대</b><small>운명을 뽑고, 성채를 지켜라</small></span></a><div class="header-tools"><span class="best-record" id="best-record"></span><button class="icon-button" id="sound-button" aria-label="소리 켜기" title="소리 켜기">${icon('sound')}</button><button id="help-button" class="quiet-button">${icon('book')} 플레이 가이드</button></div></header>
  <section class="campaign-heading"><div><span class="chapter-label"><i></i> 첫 번째 원정</span><h1>잊혀진 숲의 성채</h1><p>끝없는 어둠 속, 마지막 달빛을 지켜주세요.</p></div><div class="chapter-mark">I<span>Moonwood</span></div></section>
  <section class="game-layout">
   <div class="battle-column"><div class="battle-hud"><div class="wave-stat"><span class="stat-label">현재 웨이브</span><strong><span id="wave-count">00</span><small> / ${MAX_WAVES}</small></strong></div><div class="health-stat"><div><span>${icon('shield')} 성채 내구도</span><b id="hp-count"></b></div><div class="health-track"><i id="hp-bar"></i></div></div><div class="gold-stat">${icon('coin')}<div><span class="stat-label">보유 골드</span><strong id="gold-count"></strong></div></div></div>
    <div class="arena-wrap"><div id="game-root"></div><div class="arena-topline"><span id="phase-chip" class="phase-chip"></span><span id="timer-chip"></span></div><div class="arena-caption"><span class="live-dot"></span> 달빛의 정원 <small>방어 구역</small></div><div id="toast" class="toast" role="status" aria-live="polite"></div><div id="pause-overlay" class="pause-overlay hidden"><span>${icon('pause')}</span><h2>잠시, 숨 고르기</h2><p>계속하려면 일시정지 버튼 또는 Space</p></div></div>
    <div class="battle-toolbar"><div class="speed-controls"><button id="pause-button" class="icon-button" aria-label="일시정지">${icon('pause')}</button><span class="divider"></span>${[1, 2, 3, 5, 10].map(s => `<button data-speed="${s}" class="speed-button ${s === 1 ? 'active' : ''} ${s === 10 ? 'operator-speed' : ''}" aria-label="${s}배속${s === 10 ? ' 운영자용' : ''}" title="${s === 10 ? '운영자용 고속 테스트' : `${s}배속`}">${s}×${s === 10 ? '<small>운영자</small>' : ''}</button>`).join('')}</div><span class="kill-count">처치 <b id="kill-count">0</b></span><button id="wave-button" class="wave-button">${icon('play')} 원정 시작</button></div>
    <div class="journey-strip"><span>원정의 이정표</span><div id="milestones">${[1, 10, 20, 30, 40, 50, 60].map(n => `<span data-milestone="${n}"><i>${n === 1 ? '·' : icon('diamond')}</i><small>${n}</small></span>`).join('')}</div><b>60<br><small>최종 방어</small></b></div>
   </div>
   <aside class="command-panel"><div class="panel-heading"><h2>수호대 편성</h2><span id="unit-count">0 / 30</span></div>
    <p class="panel-description">소환은 운으로, 승리는 전략으로.</p>
    <div class="summon-actions"><button id="summon-button" class="summon-button"><span class="summon-symbol">${icon('star')}</span><span><b>수호자 소환</b><small>일반 ~ 전설 등급</small></span><span class="summon-price" id="summon-price"></span><kbd>Q</kbd></button><button id="advanced-summon-button" class="advanced-button"><span>${icon('diamond')} 고급 소환</span><b id="advanced-price"></b><kbd>W</kbd></button></div>
    <div class="section-title"><h3>편성 시너지</h3><span id="synergy-status"></span></div><div id="synergies" class="synergies"></div><p class="synergy-caption">세 역할을 모두 편성하면 공격력 +15%</p>
    <div class="selected-unit" id="selected-unit"></div>
    <div class="unit-actions"><button id="merge-button">${icon('diamond')} 선택 합성</button><button id="sell-button">판매</button></div>
    <div class="section-title"><h3>전술 스킬</h3><span>직접 사용</span></div><button id="frost-button" class="frost-button"><span class="frost-icon">${icon('snow')}</span><span><b>달빛 결계</b><small>모든 적을 3초간 빙결</small></span><span id="frost-status">준비</span><kbd>E</kbd></button>
    <button id="skill-toggle" class="growth-button"><span>${icon('moon')} 영구 성장</span><span id="shard-count"></span></button>
   </aside>
  </section>
  <section class="roster-panel"><div class="roster-heading"><div><h2>나의 수호자</h2><span id="roster-hint">같은 수호자 3명을 모아 상위 등급으로 합성하세요.</span></div><div class="roster-tools"><button id="sort-button" class="quiet-button">자동 배치</button><button id="bulk-merge-button" class="quiet-button">일괄 합성 <span id="merge-count">0</span></button></div></div><div id="roster" class="roster"></div></section>
  <footer><span>${icon('moon')} 달빛 수호대</span><p>Q 소환 <i>·</i> W 고급 소환 <i>·</i> E 결계 <i>·</i> Space 일시정지</p><span>성장 기록 자동 저장</span></footer>
 </main><dialog id="game-dialog" aria-labelledby="dialog-title"><div id="dialog-content"></div></dialog>`;
    let scene: GameScene | null = null, selected: number | null = null, speed = 1, paused = false, muted = true, dialogKind = '', rosterKey = '', saved = JSON.stringify(sim.meta), toastTimer = 0;
    let audio: AudioContext | undefined;
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
    function open(kind: string, html: string) { dialogKind = kind; q('dialog-content').innerHTML = html; if (!dialog.open)
        dialog.showModal(); }
    function close() { dialog.close(); dialogKind = ''; }
    function heading(label: string, title: string, desc: string) { return `<span class="dialog-eyebrow">${label}</span><h2 id="dialog-title">${title}</h2><p class="dialog-description">${desc}</p>`; }
    function toast(text: string) { q('toast').textContent = text; q('toast').classList.add('show'); window.clearTimeout(toastTimer); toastTimer = window.setTimeout(() => q('toast').classList.remove('show'), 2600); }
    function starter() { for (let i = 0; i < 3; i++)
        sim.summonToFirstEmpty(); sim.sortUnitsByType(); sim.drainEvents(); }
    starter();
    button('summon-button', () => sim.summonToFirstEmpty());
    button('advanced-summon-button', () => sim.summonAdvanced());
    button('sort-button', () => { sim.sortUnitsByType(); scene?.clearSelection(); });
    button('bulk-merge-button', () => { sim.bulkMergeAll(); scene?.clearSelection(); });
    button('sell-button', () => { if (selected !== null)
        sim.sellUnit(selected); scene?.clearSelection(); });
    button('merge-button', () => {
        const prompt = sim.requestMerge(selected ?? undefined);
        if (!prompt)
            return;
        open('merge', heading('수호자의 각성', '다음 수호자를 선택하세요', '같은 수호자 3명이 한 단계 높은 수호자로 다시 태어납니다.') + `<div class="choice-grid">${prompt.candidates.map(d => `<button data-merge="${d.id}" class="choice"><img src="${art}${portrait(d.id)}.png" alt=""><small style="color:${getRarity(d.rarity).color}">${getRarity(d.rarity).label}</small><h3>${d.name}</h3><p>${d.skill}</p></button>`).join('')}</div><button data-close class="quiet-button">돌아가기</button>`);
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
    button('help-button', () => open('help', heading('플레이 가이드', '운명은 뽑고, 전술은 고르세요', '소환 · 배치 · 합성, 세 가지로 시작하는 달빛의 전투') + `<div class="guide-list"><article><b>01</b><div><h3>수호자를 모으세요</h3><p>시작 수호자 3명이 배치되어 있습니다. 골드로 동료를 소환하고 원정 시작을 누르세요.</p></div></article><article><b>02</b><div><h3>길목을 지키세요</h3><p>수호자를 드래그해 이동합니다. 클릭하면 사거리가 보입니다. 기사·마법사·사제를 함께 편성하면 공격력 +15%.</p></div></article><article><b>03</b><div><h3>합성하고, 결계를 펼치세요</h3><p>같은 수호자 3명을 합성하면 상위 등급을 직접 고릅니다. 달빛 결계는 현재 적을 3초간 얼립니다. 재사용 24초.</p></div></article><article><b>04</b><div><h3>60웨이브를 버티세요</h3><p>적은 순환 경로를 돌고, 제한시간 종료 시 생존한 일반 적 6명당 체력 1, 보스당 5를 잃습니다. 5웨이브마다 보스, 3웨이브마다 보상 선택. 실패해도 성장 조각은 남습니다.</p></div></article></div><button data-close class="dialog-primary">이제 지킬 준비가 됐어요</button>`));
    let branch = skillTracks[0]!.id;
    function showSkills() {
        open('skills', heading('성장 조각은 원정이 끝나도 유지됩니다', '수호대의 유산', `보유 조각 ${sim.meta.growthShards} · 최고 기록 ${sim.meta.highestWave}웨이브`) + `<div class="skill-tabs">${skillTracks.map(t => `<button data-branch="${t.id}" class="${branch === t.id ? 'active' : ''}">${t.label}</button>`).join('')}</div><div class="skill-list">${skillTree.filter(n => n.branch === branch).map(n => { const owned = sim.meta.unlockedSkills.includes(n.id), locked = !!n.prerequisite && !sim.meta.unlockedSkills.includes(n.prerequisite); return `<button data-skill="${n.id}" ${owned || locked || sim.meta.growthShards < n.cost ? 'disabled' : ''}><b>${n.tier}</b><span>${n.description}</span><small>${owned ? '해금 완료' : `${n.cost} 조각`}</small></button>`; }).join('')}</div><button data-close class="dialog-primary">전장으로 돌아가기</button>`);
    }
    button('skill-toggle', showSkills);
    dialog.addEventListener('cancel', e => { if (dialogKind === 'reward' || dialogKind === 'result')
        e.preventDefault();
    else {
        sim.cancelMerge();
        dialogKind = '';
    } });
    dialog.addEventListener('click', e => {
        const el = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
        if (!el || el.disabled)
            return;
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
            sim.chooseReward(el.dataset.reward as 'power' | 'supply' | 'repair');
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
        const keys: Record<string, string> = { q: 'summon-button', w: 'advanced-summon-button', e: 'frost-button' };
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
        q('wave-count').textContent = String(s.wave).padStart(2, '0');
        q('hp-count').textContent = `${s.baseHealth} / ${s.maxBaseHealth}`;
        q('hp-bar').style.width = `${100 * s.baseHealth / s.maxBaseHealth}%`;
        q('hp-bar').classList.toggle('danger', s.baseHealth < 6);
        q('gold-count').textContent = s.gold.toLocaleString();
        q('unit-count').textContent = `${s.board.length} / 30`;
        q('kill-count').textContent = String(s.defeatedEnemies);
        q('best-record').textContent = `최고 기록 ${sim.meta.highestWave} 웨이브`;
        q('phase-chip').textContent = ended ? (s.status === 'won' ? '방어 성공' : '성채 함락') : sim.isWaveActive ? (sim.activeWaveDefinition?.isBoss ? '보스 습격' : '전투 진행 중') : s.wave ? '다음 습격 준비' : '수호대 배치 중';
        q('phase-chip').classList.toggle('boss', !!sim.activeWaveDefinition?.isBoss);
        q('timer-chip').textContent = sim.isWaveActive ? `${Math.ceil(s.waveTimeRemainingMs / 1000)}초 · 적 ${sim.enemies.length}` : sim.nextWaveDelayRemainingMs > 0 ? `다음 웨이브까지 ${Math.ceil(sim.nextWaveDelayRemainingMs / 1000)}초` : '준비되면 원정을 시작하세요';
        q('summon-price').textContent = s.freeSummons > 0 ? `무료 ${s.freeSummons}` : `${sim.summonCost} G`;
        q('advanced-price').textContent = `${sim.advancedSummonCost} G`;
        q<HTMLButtonElement>('summon-button').disabled = ended || s.board.length >= 30 || (s.gold < sim.summonCost && s.freeSummons === 0);
        q<HTMLButtonElement>('advanced-summon-button').disabled = ended || s.board.length >= 30 || s.gold < sim.advancedSummonCost;
        q<HTMLButtonElement>('wave-button').disabled = !ended && (!sim.canStartWave || s.board.length === 0);
        q('wave-button').innerHTML = icon('play') + (ended ? '다시 도전' : s.wave === 0 ? '원정 시작' : sim.isWaveActive ? '방어 진행 중' : '다음 웨이브');
        q('pause-overlay').classList.toggle('hidden', !paused);
        q('pause-button').innerHTML = icon(paused ? 'play' : 'pause');
        q('pause-button').setAttribute('aria-label', paused ? '계속하기' : '일시정지');
        document.querySelectorAll<HTMLElement>('[data-speed]').forEach(b => { b.classList.toggle('active', Number(b.dataset.speed) === speed); b.setAttribute('aria-pressed', String(Number(b.dataset.speed) === speed)); });
        const counts = { single: 0, area: 0, support: 0 };
        s.board.forEach(u => counts[getUnitDefinition(u.definitionId).role]++);
        q('synergies').innerHTML = Object.entries(counts).map(([role, n]) => `<div class="${n ? 'present' : ''}"><img src="${art}${role === 'single' ? 'knight' : role === 'area' ? 'wizard' : 'priest'}.png" alt=""><span>${role === 'single' ? '기사' : role === 'area' ? '마법사' : '사제'}</span><b>${n}</b></div>`).join('');
        q('synergy-status').textContent = sim.formationBonus ? '공격력 +15% 활성' : '조합 대기';
        q('synergy-status').className = sim.formationBonus ? 'text-mint' : '';
        const unit = selected === null ? null : s.board[selected];
        if (unit) {
            const d = getUnitDefinition(unit.definitionId), r = getRarity(d.rarity), stats = getEffectiveUnitStats(d, getUniqueUnitLevel(sim.meta, d.id));
            q('selected-unit').innerHTML = `<img src="${art}${portrait(d.id)}.png" alt=""><div><small style="color:${r.color}">${r.label} 수호자</small><h3>${d.name}${d.uniqueAbility ? ` Lv.${getUniqueUnitLevel(sim.meta, d.id)}` : ''}</h3><p>공격 ${stats.attack} · 사거리 ${stats.range}</p><p>${d.role === 'single' ? '선두 적 집중 공격' : d.role === 'area' ? '주변 적 광역 공격' : '아군 공격속도 보조'}</p></div>`;
        }
        else
            q('selected-unit').innerHTML = `<span class="empty-emblem">${icon('shield')}</span><div><small>수호자 정보</small><h3>함께할 수호자를 선택하세요</h3><p>전장 또는 아래 카드를 클릭하세요.</p></div>`;
        const groups = sim.getMergeableGroups();
        q<HTMLButtonElement>('merge-button').disabled = ended || (selected === null ? groups.length === 0 : !groups.some(g => g.includes(selected!)));
        q<HTMLButtonElement>('sell-button').disabled = ended || !unit;
        q<HTMLButtonElement>('bulk-merge-button').disabled = ended || groups.length === 0;
        q<HTMLButtonElement>('sort-button').disabled = ended || s.board.length < 2;
        q('merge-count').textContent = String(groups.length);
        q<HTMLButtonElement>('frost-button').disabled = ended || !sim.isWaveActive || sim.frostCooldownMs > 0 || paused;
        q('frost-status').textContent = sim.frostCooldownMs > 0 ? `${Math.ceil(sim.frostCooldownMs / 1000)}초` : '준비';
        q('shard-count').textContent = `${sim.meta.growthShards} 조각`;
        const key = s.board.map(u => u.instanceId + ':' + getUniqueUnitLevel(sim.meta, u.definitionId)).join(',') + ':' + selected;
        if (key !== rosterKey) {
            rosterKey = key;
            const mergeable = sim.getMergeableSlots();
            q('roster').innerHTML = s.board.length ? s.board.map((u, i) => { const d = getUnitDefinition(u.definitionId), r = getRarity(d.rarity); return `<button data-unit="${i}" class="unit-card ${selected === i ? 'selected' : ''}" style="--rarity:${r.color}" aria-label="${d.name} 선택" aria-pressed="${selected === i}"><span class="unit-rarity">${r.label}${d.uniqueAbility ? ` · Lv.${getUniqueUnitLevel(sim.meta, d.id)}` : ''}</span><img src="${art}${portrait(d.id)}.png" alt=""><b>${d.name.replace(r.label + ' ', '')}</b><small>${mergeable.has(i) ? '합성 가능' : d.role === 'single' ? '집중 공격' : d.role === 'area' ? '광역 공격' : '공격 보조'}</small></button>`; }).join('') : `<p class="empty-roster">수호자를 소환해 방어선을 만드세요.</p>`;
        }
        document.querySelectorAll<HTMLElement>('[data-milestone]').forEach(el => el.classList.toggle('reached', s.wave >= Number(el.dataset.milestone)));
        const next = JSON.stringify(sim.meta);
        if (next !== saved) {
            saveMetaProgress(sim.meta);
            saved = next;
        }
        if (sim.pendingReward && !dialog.open)
            open('reward', heading(`${s.wave}웨이브 생존 보상`, '다음 전투를 위한 선택', '한 가지 축복을 고르세요. 선택하는 동안 전투는 멈춥니다.') + `<div class="choice-grid"><button class="choice" data-reward="power">${icon('swords')}<small>이번 원정에 영구 적용</small><h3>달의 축복</h3><strong>공격력 +12%</strong><p>모든 수호자가 더 강해집니다.<br>현재 강화 +${Math.round(sim.expeditionAttackBonus * 100)}%</p></button><button class="choice" data-reward="supply">${icon('coin')}<small>즉시 지급</small><h3>왕국의 보급</h3><strong>골드 +60</strong><p>더 많은 동료를 소환하고<br>강력한 조합을 완성하세요.</p></button><button class="choice" data-reward="repair">${icon('shield')}<small>최대 체력까지 회복</small><h3>성채 복구</h3><strong>내구도 +5</strong><p>무너진 방어선을 복구합니다.<br>현재 ${s.baseHealth} / ${s.maxBaseHealth}</p></button></div>`);
    }
    function showEvents(events: SimulationEvent[]) {
        for (const e of events) {
            if (e.type === 'message' || e.type === 'jackpot')
                toast(e.text);
            if (e.type === 'waveComplete') {
                toast(`${e.wave}웨이브 방어 완료 · 성장 조각 +${e.growthShardsAwarded}`);
                tone(true);
            }
            if (e.type === 'runEnded') {
                open('result', heading(e.status === 'won' ? '새벽이 밝았습니다' : '아직, 이야기는 끝나지 않았습니다', e.status === 'won' ? '성채를 지켜냈습니다' : '다시 일어설 시간', `도달 웨이브 ${sim.state.wave} · 처치 ${sim.state.defeatedEnemies} · 획득 조각 ${e.growthShardsAwarded}`) + `<div class="result-sigil">${icon('moon')}</div><p class="dialog-description">성장 조각으로 수호대를 강화하고, 더 먼 곳으로 나아가세요.</p><button data-restart class="dialog-primary">새로운 원정 준비</button>`);
            }
        }
        render();
    }
    function flush() { showEvents(sim.drainEvents()); }
    render();
    return { setScene(s) { scene = s; }, render, showEvents, setSelectedSlot(slot) { selected = slot; render(); }, getSpeedMultiplier() { return paused || dialog.open ? 0 : speed; } };
}
