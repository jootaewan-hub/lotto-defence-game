# 보스·무극신 그래픽 (2026-09-20)

Built-in image_gen으로 생성한 투명 PNG를 사용합니다. 선택한 결과만 public/assets/generated에 복사했습니다.

- bosses/: chieftain, orc-emperor, ogre-king, ancient-dragon, undead-demon-king, eclipse-sovereign.
- ultimate-mugeuk-v2.png: 무극신 본체 및 UI 초상화.
- 진보스는 동일 인물의 확대 외형과 각성 후광을 사용합니다.
- 스킬은 Phaser Graphics 위에 원근 투영한 3D 결정체, 깊이별 명암, 입체 궤도와 다층 발광을 합성합니다. 별도 3D 엔진이나 스켈레탈 애니메이션은 사용하지 않습니다.
- 보스 움직임은 이미지의 호흡·기울기·부유 변형입니다.
- 입체 투사체는 프레임당 최대 40개이며 초과 시 기존 표현을 사용합니다.

## 최종 프롬프트

### 보스 공통
Single isolated full body game sprite of SUBJECT. Transparent background PNG cutout with true alpha like an inventory character icon. Absolutely no background, no gradients or background glow, no ground, no text. Hand-painted pixel fantasy tower defense miniature, sculpted highlights and dark outlines, chunky powerful proportions. Centered complete full body in a square image, generous 15% empty transparent margins all sides, entire weapon and all limbs inside canvas, feet at 84% height. A SINGLE CHARACTER only.

### SUBJECT
- chieftain: grey-green muscular ogre chieftain, iron horned shoulder armor, spiked wooden club
- orc-emperor: green orc emperor, golden crown, black gold armor, axe, red cape
- ogre-king: two headed ogre king with golden crowns, bronze belly plate, massive iron hammer
- ancient-dragon: red ancient dragon, folded angular wings, curled tail, molten chest, black horns
- undead-demon-king: skeletal undead demon king with purple crown, jagged dark armor and violet robes, soul staff
- eclipse-sovereign: eclipse sovereign, faceless black and silver armored god, crescent scythe, segmented floating armor, small black sun halo behind head

### 무극신
Create a production transparent PNG full-body sprite for a Korean fantasy tower defense game's ultimate god 'Mugeuk', no text. Single male celestial sword deity, imposing ornate black and ivory armor with intricately engraved gold edges, flowing white long hair, luminous eyes, golden horn-like diadem, powerful broad shoulder silhouette, floating white silk cape with deep teal shadows, enormous radiant divine blade held diagonally, six small levitating swords fanned behind shoulders, thin concentric golden halo behind head. Painterly pixel-art fantasy RPG miniature with crisp dark outlines, rich sculpted light/shadow, readable at 125px, magnificent and powerful rather than cute. Three-quarter front view, full body head to feet centered, fits within 80% square canvas, feet at 84% height, transparent empty background with actual alpha, no floor no checkerboard no scenery no labels. Gold and white bright core with restrained electric cyan accent; keep outer effects compact because animated aura will be rendered by game code. Not photorealistic, not a poster.

## 확인
로컬 Vite 서버의 /lotto-defence-game/tests/sovereign-preview.html에서 보스 등급, 빙결, 정지 및 스킬 시연을 볼 수 있습니다. 저장 데이터를 사용하지 않습니다.

