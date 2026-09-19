import { normalDiceDistribution, type UpgradeRoll } from './game/upgrades';
function rouletteFaces(roll: UpgradeRoll): number[] {
    const faces = Array.from({length: 20}, (_, i) => Number((roll.min + (roll.max - roll.min) * i / 19).toFixed(2)));
    const closest = faces.reduce((best, value, i) => Math.abs(value - roll.value) < Math.abs(faces[best]! - roll.value) ? i : best, 0);
    faces[closest] = roll.value;
    return faces;
}
function rouletteMarkup(roll: UpgradeRoll): string {
    const shown = rouletteFaces(roll);
    const count = shown.length;
    const slices = Array.from({ length: count }, (_, i) => {
        const angle = (i / count) * Math.PI * 2 - Math.PI / 2, half = Math.PI / count;
        const a = { x: 100 + 90 * Math.cos(angle - half), y: 100 + 90 * Math.sin(angle - half) }, b = { x: 100 + 90 * Math.cos(angle + half), y: 100 + 90 * Math.sin(angle + half) };
        return `<path d="M100 100 L${a.x} ${a.y} A90 90 0 0 1 ${b.x} ${b.y}Z" fill="${i % 2 ? '#24443f' : '#c4ac77'}" stroke="#e0cca0" stroke-width=".4"/><text x="${100 + 74 * Math.cos(angle)}" y="${104 + 74 * Math.sin(angle)}" text-anchor="middle" fill="${i % 2 ? '#e9d9ad' : '#1c3030'}" font-size="10" font-weight="700">${shown[i]}</text>`;
    }).join('');
    return `<div class="roulette-stage" aria-label="${roll.label} 강화 룰렛"><span class="roulette-pointer"></span><svg class="roulette-wheel" viewBox="0 0 200 200">${slices}<circle cx="100" cy="100" r="44" fill="#142830" stroke="#d9c18e" stroke-width="2"/></svg><span class="roulette-center">${roll.stat === 'haste' ? 'SPEED' : 'ATTACK'}<br><b>+${roll.min}~${roll.max}%</b></span></div><div class="dice-result" role="status" aria-live="polite"><small>강화 룰렛 회전 중</small><strong>빠르게 운명을 확인하세요</strong></div>`;
}
export function diceMarkup(roll: UpgradeRoll): string {
    if (roll.kind === 'tower')
        return rouletteMarkup(roll) + `<p class="dice-footnote">정규분포형 가중 룰렛 · 중간값이 더 자주 나옵니다</p>`;
    const distribution = normalDiceDistribution(roll.min, roll.max);
    const peak = Math.max(...distribution.map(d => d.probability));
    return `<div class="dice-stage" aria-label="강화 주사위"><div class="dice-orbit"><div class="d20-die is-rolling"><svg viewBox="0 0 180 200" fill="none" aria-hidden="true"><defs><linearGradient id="dice-metal" x1="20" y1="10" x2="150" y2="200" gradientUnits="userSpaceOnUse"><stop stop-color="#40665c"/><stop offset=".5" stop-color="#192f37"/><stop offset="1" stop-color="#0b1923"/></linearGradient></defs><path d="M90 5 171 52 171 146 90 195 9 146 9 52Z" fill="url(#dice-metal)" stroke="#cfb47a" stroke-width="2"/><path d="m90 5-40 61H130L90 5Zm-81 47 41 14-41 80m162-94-41 14 41 80M9 146l41-80 40 80 40-80 41 80H90l0 49-81-49Zm41-80L9 52m121 14 41-14M90 146l81 0M50 66h80" stroke="#d8bf825c" stroke-width="1.5"/><path d="m50 66 40 80 40-80Z" fill="#ccbc7910" stroke="#e2ce9170"/></svg><span class="dice-value" aria-hidden="true">?</span></div></div><div class="dice-result" role="status" aria-live="polite"><small>운명의 주사위를 굴리는 중</small><strong>결과를 기다려주세요</strong></div></div>
    <div class="dice-distribution" aria-label="${roll.min}에서 ${roll.max} 사이 정규분포형 확률: 중간값이 더 자주 나옵니다."><div class="dice-bars">${distribution.map(d => `<i data-face="${d.value}" style="--bar:${Math.round(d.probability / peak * 100)}%" title="${d.value}${roll.unit}: ${(d.probability * 100).toFixed(1)}%"></i>`).join('')}</div><div><span>${roll.min}${roll.unit}</span><span>중간값이 더 자주 나옵니다</span><span>${roll.max}${roll.unit}</span></div></div>`;
}
/** Animation never samples game RNG: the authoritative roll is already locked. */
export function animateDice(container: HTMLElement, roll: UpgradeRoll, onReady: () => void): () => void {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const duration = reduced ? 80 : roll.kind === 'tower' ? 450 : 650, start = performance.now();
    let frame = 0;
    const value = container.querySelector<HTMLElement>('.dice-value')!;
    const die = container.querySelector<HTMLElement>('.d20-die')!;
    const result = container.querySelector<HTMLElement>('.dice-result')!;
    const wheel = container.querySelector<SVGElement>('.roulette-wheel');
    const faces = rouletteFaces(roll);
    const index = faces.indexOf(roll.value);
    const endAngle = 1440 - index * 360 / faces.length;
    function tick(now: number) {
        if (!container.isConnected)
            return;
        const elapsed = now - start;
        if (elapsed < duration) {
            const steps = Math.floor(elapsed / (35 + elapsed * 0.075));
            if (wheel)
                wheel.style.transform = `rotate(${endAngle * (1 - Math.pow(1 - elapsed / duration, 3))}deg)`;
            else
                value.textContent = reduced ? '?' : String(roll.min + (steps * 7 + 3) % (roll.max - roll.min + 1));
            frame = requestAnimationFrame(tick);
            return;
        }
        if (wheel)
            wheel.style.transform = `rotate(${endAngle}deg)`;
        else {
            value.textContent = String(roll.value);
            die.classList.remove('is-rolling');
            die.classList.add('is-revealed');
        }
        result.innerHTML = `<small>${roll.title}</small><strong>${roll.label} <b>+${roll.value}${roll.unit}</b></strong>`;
        container.querySelector(`[data-face="${roll.value}"]`)?.classList.add('rolled-face');
        onReady();
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
}
