import type { Rng } from './rng';
export type UpgradeStat = 'attack' | 'haste' | 'criticalChance' | 'criticalDamage' | 'range' | 'bossDamage' | 'armorPierce' | 'singleDamage' | 'areaDamage' | 'supportDamage' | 'splashRadius' | 'poisonDamage' | 'skillPower' | 'goldBonus' | 'waveGold' | 'interest' | 'summonDiscount' | 'upgradeDiscount' | 'maxHealth' | 'regeneration' | 'damageReduction' | 'frostDuration' | 'frostCooldown' | 'experience' | 'jackpotChance' | 'uniqueChance';
export interface RewardDefinition {
    id: UpgradeStat;
    stat: UpgradeStat;
    title: string;
    description: string;
    label: string;
    min: number;
    max: number;
    unit: string;
    cap: number;
    category: '공격' | '전술' | '경제' | '생존';
    icon: string;
}
export type ExpeditionUpgrades = Partial<Record<UpgradeStat, number>>;
export interface UpgradeRoll {
    kind: 'reward' | 'tower';
    title: string;
    label: string;
    stat: UpgradeStat;
    value: number;
    min: number;
    max: number;
    unit: string;
    towerId?: string;
    cost?: number;
}
/** Blessing rolls are this fraction of their declared range. */
const BLESSING_DIVISOR = 2;
function reward(stat: UpgradeStat, title: string, label: string, description: string, min: number, max: number, unit: string, cap: number, category: RewardDefinition['category'], icon: string): RewardDefinition {
    // Declared ranges are halved, not quartered: a blessing used to land at a
    // quarter of the number written beside it, which made every pick feel thin.
    return { id: stat, stat, title, label, description, min: stat === 'attack' ? 0.2 : min / BLESSING_DIVISOR, max: max / BLESSING_DIVISOR, unit, cap, category, icon };
}
export const REWARD_POOL: readonly RewardDefinition[] = [
    reward('attack', '달의 축복', '전체 공격력', '모든 수호자의 기본 공격을 강화합니다.', 1, 20, '%', 10000, '공격', 'swords'),
    reward('haste', '순풍의 맹세', '공격 속도', '모든 수호자의 공격 간격이 짧아집니다.', 1, 15, '%', 150, '공격', 'star'),
    reward('criticalChance', '매의 눈', '치명타 확률', '치명타 확률을 퍼센트포인트만큼 더합니다.', 1, 5, '%p', 40, '공격', 'diamond'),
    reward('criticalDamage', '치명적인 서약', '치명타 배율', '치명타 피해 배율에 수치를 더합니다.', 1, 20, '%p', 200, '공격', 'swords'),
    reward('range', '지평선의 눈', '사거리', '더 먼 곳의 적을 겨냥합니다.', 1, 12, '%', 80, '전술', 'star'),
    reward('bossDamage', '거인 사냥꾼', '보스 추가 피해', '보스와 진보스에게 주는 피해가 증가합니다.', 1, 20, '%', 200, '공격', 'swords'),
    reward('armorPierce', '균열의 창', '방어 관통', '공격할 때 적 방어력의 일부를 무시합니다.', 1, 10, '%', 75, '공격', 'diamond'),
    reward('singleDamage', '기사단의 맹약', '기사 공격력', '기사·궁수·광전사 계열의 공격력이 증가합니다.', 1, 20, '%', 200, '공격', 'swords'),
    reward('areaDamage', '비전의 서', '마법사 공격력', '광역 마법사 계열의 공격력이 증가합니다.', 1, 20, '%', 200, '공격', 'book'),
    reward('supportDamage', '성스러운 의지', '사제 공격력', '사제와 시간마도사의 공격력이 증가합니다.', 1, 20, '%', 200, '공격', 'moon'),
    reward('splashRadius', '공명의 파장', '광역 반경', '화염·독 마법의 타격 반경이 넓어집니다.', 1, 15, '%', 80, '전술', 'star'),
    reward('poisonDamage', '녹빛 연금술', '지속 독 피해', '독 상태가 주는 매 틱 피해가 증가합니다.', 1, 20, '%', 200, '전술', 'diamond'),
    reward('skillPower', '고대의 주문', '유니크 기술 위력', '기존 유니크 능력의 위력 보너스를 더합니다.', 1, 15, '%', 150, '전술', 'book'),
    reward('goldBonus', '사냥꾼의 현상금', '처치 골드', '적 처치 보상이 증가합니다.', 1, 20, '%', 200, '경제', 'coin'),
    reward('waveGold', '왕국의 연금', '매 웨이브 보급', '다음 웨이브부터 시작할 때 골드를 받습니다.', 3, 20, ' G', 500, '경제', 'coin'),
    reward('interest', '황금 금고', '웨이브 이자', '다음 웨이브 시작 시 보유 골드의 일정 비율을 받습니다. 매번 최대 100G.', 1, 5, '%', 20, '경제', 'coin'),
    reward('summonDiscount', '소환사의 계약', '소환 비용 할인', '수호자·고급·전설 소환 비용을 모두 낮춥니다. 기존 할인과 합산 최대 50%.', 1, 8, '%', 40, '경제', 'star'),
    reward('upgradeDiscount', '달빛 대장장이', '강화 비용 할인', '골드로 타워를 강화하는 비용을 낮춥니다.', 1, 8, '%', 50, '경제', 'diamond'),
    reward('maxHealth', '성채 증축', '최대 내구도', '최대 내구도와 현재 내구도가 함께 증가합니다.', 1, 5, ' HP', 100, '생존', 'shield'),
    reward('regeneration', '생명의 샘', '매 웨이브 회복', '다음 웨이브부터 시작할 때 성채를 회복합니다.', 1, 3, ' HP', 12, '생존', 'moon'),
    reward('damageReduction', '결계의 수호', '성채 피해 감소', '웨이브 종료 시 생존한 적의 피해를 줄입니다. 합산 최대 80%.', 1, 10, '%', 60, '생존', 'shield'),
    reward('frostDuration', '긴 겨울', '결계 지속시간', '직접 사용하는 달빛 결계의 빙결 시간이 늘어납니다.', 1, 15, '%', 150, '전술', 'snow'),
    reward('frostCooldown', '시간의 모래', '결계 재사용 감소', '달빛 결계를 더 자주 사용할 수 있습니다.', 1, 8, '%', 60, '전술', 'snow'),
    reward('experience', '별의 기억', '유니크 경험치', '유니크 수호자의 처치 경험치가 증가합니다.', 1, 20, '%', 200, '전술', 'book'),
    reward('jackpotChance', '행운의 문장', '잭팟 확률 보정', '기본 확률 보정에 더한 후 1/4 배율이 적용됩니다. 최종 확률 최대 7.5%.', 1, 3, '%p', 15, '경제', 'diamond'),
];
/** Discrete truncated Gaussian: integer faces, center=(min+max)/2, sigma=(max-min)/5. */
export function normalDiceDistribution(min: number, max: number): {
    value: number;
    probability: number;
}[] {
    if (!Number.isInteger(min) || !Number.isInteger(max)) {
        const scale = 100;
        return normalDiceDistribution(Math.round(min * scale), Math.round(max * scale)).map(d => ({value: d.value / scale, probability: d.probability}));
    }
    if (max < min)
        throw new Error('Invalid dice bounds');
    const mean = (min + max) / 2, sigma = Math.max(0.8, (max - min) / 5);
    const values = Array.from({ length: max - min + 1 }, (_, i) => ({ value: min + i, probability: Math.exp(-0.5 * ((min + i - mean) / sigma) ** 2) }));
    const total = values.reduce((sum, v) => sum + v.probability, 0);
    return values.map(v => ({ ...v, probability: v.probability / total }));
}
export function rollNormalInteger(rng: Pick<Rng, 'next'>, min: number, max: number): number {
    const distribution = normalDiceDistribution(min, max), roll = Math.max(0, Math.min(1 - Number.EPSILON, rng.next()));
    let accumulated = 0;
    for (const face of distribution) {
        accumulated += face.probability;
        if (roll < accumulated)
            return face.value;
    }
    return max;
}
export function sampleRewards(rng: Pick<Rng, 'next'>, upgrades: ExpeditionUpgrades): RewardDefinition[] {
    const eligible = REWARD_POOL.filter(r => r.stat !== 'uniqueChance' && (upgrades[r.stat] ?? 0) < r.cap);
    for (let i = eligible.length - 1; i > 0; i--) {
        const j = Math.max(0, Math.min(i, Math.floor(rng.next() * (i + 1))));
        [eligible[i], eligible[j]] = [eligible[j]!, eligible[i]!];
    }
    return eligible.slice(0, 3);
}
