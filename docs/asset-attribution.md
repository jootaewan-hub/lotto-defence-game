# Asset Attribution

This project keeps local copies of small fantasy sprite sheets as visual reference material. Current in-game tower and enemy sprites use the existing generated fantasy component PNGs. The environment combines a generated forest illustration with a procedural stone route and combat overlays.

## OpenGameArt CC0 Sources

- `public/assets/fantasy/mini_fantasy_sprites_oga_ver.png`
  - Source: https://opengameart.org/content/mini-fantasy-sprites
  - Author: GrafxKid
  - License: CC0
  - Used as a visual reference for the fantasy pixel-art direction.

- `public/assets/fantasy/8x8_character_sprite_sheet.png`
  - Source: https://opengameart.org/content/8x8-character-and-sprite-sheet
  - Author: Glacialan
  - License: CC0
  - Used as a visual reference for compact undead and skeleton silhouettes.

Credit is not required for CC0, but keeping this file makes the asset lineage clear.

## Moonwood environment (2026-09-16)

- `public/assets/moonwood.png`: newly generated moonlit forest environment for this project using OpenAI image generation.
- The road, deployment guides, projectiles, selection indicators, frost pulse, and health bars are drawn by the game renderer.
- Existing fantasy character components remain in use, with updated scale and presentation.

### 2026-09-18 진화 외형
- `public/assets/generated/super-unique-atlas.png`: Image Gen으로 새로 생성한 슈퍼유니크 4종, 2×2 투명 스프라이트 아틀라스.
- `public/assets/generated/tower-evolution-atlas.png`: Image Gen으로 새로 생성한 유형별 정예형·초월형 8종, 4×2 투명 스프라이트 아틀라스.
- 게임과 도감은 아틀라스의 각 프레임을 공유하며, 원본을 확대해 슈퍼유니크로 재사용하지 않습니다.

### 난이도별 배경
`public/assets/backgrounds/nightmare.svg`, `hell.svg`, `insane.svg`는 프로젝트용으로 직접 작성한 SVG 배경입니다. 재현 가능한 생성 소스는 `generate-backgrounds.py`입니다.

### 무극신
`public/assets/generated/ultimate-mugeuk.svg`는 태극 광륜·흑백 도포·부유 검을 표현하도록 프로젝트용으로 직접 제작한 궁극 유닛 벡터 이미지입니다.
