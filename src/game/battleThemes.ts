import type { RunState } from './types';

export const BATTLE_THEMES: Record<RunState['difficulty'], {
    texture: string; title: string; subtitle: string; accent: string;
}> = {
    normal: { texture: 'forest', title: '잊혀진 숲의 성채', subtitle: '끝없는 어둠 속, 마지막 달빛을 지켜주세요.', accent: '#b8cda0' },
    nightmare: { texture: 'nightmare-background', title: '악몽에 잠긴 안개 숲', subtitle: '보랏빛 안개 너머, 뒤틀린 숲이 깨어납니다.', accent: '#c49aff' },
    hell: { texture: 'hell-background', title: '불타는 지옥의 성채', subtitle: '용암과 잿더미 위에서 마지막 방어선을 지키세요.', accent: '#ffab68' },
    insane: { texture: 'insane-background', title: '붕괴하는 공허의 왕좌', subtitle: '붉은 균열 너머, 끝없는 광기가 밀려옵니다.', accent: '#ff79b5' },
};
