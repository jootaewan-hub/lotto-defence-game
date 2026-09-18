from pathlib import Path
import random, math
out=Path('public/assets/backgrounds')
for name,base,ground,accent in [('nightmare','#100c20','#251c38','#956ce0'),('hell','#180c0a','#302019','#ff692b'),('insane','#090713','#211428','#f54292')]:
 r=random.Random(42)
 parts=[f'''<svg xmlns="http://www.w3.org/2000/svg" width="780" height="500" viewBox="0 0 780 500"><defs>
 <radialGradient id="ground"><stop stop-color="{ground}"/><stop offset="1" stop-color="{base}"/></radialGradient>
 <radialGradient id="glow"><stop stop-color="{accent}" stop-opacity=".48"/><stop offset="1" stop-color="{accent}" stop-opacity="0"/></radialGradient>
 <radialGradient id="shade"><stop offset=".5" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".65"/></radialGradient>
 <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".075" numOctaves="3" seed="12"/><feColorMatrix type="saturate" values="0"/><feBlend in="SourceGraphic" mode="soft-light"/></filter>
 </defs><rect width="780" height="500" fill="url(#ground)"/>
 <rect width="780" height="500" fill="{ground}" opacity=".22" filter="url(#grain)"/>''']
 # Fine stone strata remain low contrast through the deployment area.
 for i in range(190):
  x,y=r.randrange(780),r.randrange(500);w,h=r.randrange(10,48),r.randrange(4,18)
  parts.append(f'<path d="M{x} {y}l{w} -3 {w//4} {h} -{w} 4Z" fill="{base}" stroke="{accent}" stroke-opacity=".09" stroke-width=".6" opacity=".45"/>')
 if name=='nightmare':
  parts.append('<circle cx="648" cy="47" r="88" fill="url(#glow)"/><circle cx="648" cy="47" r="22" fill="#c3b9dd" opacity=".72"/><circle cx="658" cy="42" r="20" fill="#28213d"/>')
  for side in [0,1]:
   for i in range(8):
    x=(r.randrange(15,112) if side==0 else r.randrange(674,765));y=70+i*58
    d=f'M{x-12} {y+52} Q{x+9} {y+15} {x-2} {y-30} L{x-10} {y-70} L{x+5} {y-41} L{x+15} {y-82} L{x+12} {y-21} L{x+28} {y-37} L{x+44} {y-66} L{x+34} {y-19} L{x+11} {y+6} L{x+14} {y+43} L{x+35} {y+54}Z'
    parts.append(f'<path d="{d}" fill="#0b0b19" stroke="#695080" stroke-width="1.5"/><path d="M{x} {y+40}L{x+2} {y-24}" stroke="#8a64ab" opacity=".35"/>')
  for i in range(12):
   y=i*44
   parts.append(f'<path d="M-30 {y} Q180 {y-60} 360 {y}T820 {y-20}" fill="none" stroke="#9b78c9" stroke-opacity=".045" stroke-width="22"/>')
 elif name=='hell':
  for side in [0,1]:
   x=55 if side==0 else 724
   coords=[(x+r.randrange(-28,29),y) for y in range(-20,550,40)]
   d='M'+' L'.join(f'{px} {py}' for px,py in coords)
   parts.append(f'<path d="{d}" fill="none" stroke="#8c2415" stroke-width="48"/><path d="{d}" fill="none" stroke="#ec4c19" stroke-width="19"/><path d="{d}" fill="none" stroke="#ffb954" stroke-width="4"/>')
  for x in [130,290,480,660]:
   for y in [20,455]:
    parts.append(f'<ellipse cx="{x}" cy="{y+15}" rx="88" ry="40" fill="url(#glow)"/><path d="M{x-22} {y+40}L{x-18} {y-10}L{x-5} {y-22}L{x+5} {y-6}L{x+22} {y-16}L{x+19} {y+40}Z" fill="#141319" stroke="#654135" stroke-width="2"/><path d="M{x-10} {y-3}L{x-8} {y+34}M{x+10} {y}L{x+9} {y+32}" stroke="#b96b36" opacity=".4"/>')
 else:
  for cx,cy in [(60,55),(722,73),(48,445),(714,426)]:
   parts.append(f'<ellipse cx="{cx}" cy="{cy}" rx="170" ry="110" fill="url(#glow)"/>')
   for i in range(6):
    x=cx+r.randrange(-75,76);y=cy+r.randrange(-55,56)
    parts.append(f'<path d="M{x} {y-45}l17 36 -8 31 -19 -21Z" fill="#100e1e" stroke="#955496" stroke-opacity=".7"/><path d="M{x} {y-45}l2 43 7 24" stroke="#eb629e" fill="none" opacity=".6"/>')
  for side in [0,1]:
   x=96 if side==0 else 684
   d=f'M{x} -20l-30 64 18 32 -31 51 23 32 -22 66 33 40 -13 69 35 33 -27 74 18 72'
   parts.append(f'<path d="{d}" fill="none" stroke="#5e1857" stroke-width="21"/><path d="{d}" fill="none" stroke="#ed3283" stroke-width="5"/><path d="{d}" fill="none" stroke="#ffa0d4" stroke-width="1"/>')
 for i in range(80):
  x,y=r.randrange(780),r.randrange(500)
  if 130<x<650 and 85<y<414: continue
  parts.append(f'<circle cx="{x}" cy="{y}" r="{r.choice([.7,1,1.6])}" fill="{accent}" opacity="{r.uniform(.25,.8):.2f}"/>')
 parts.append('<rect width="780" height="500" fill="url(#shade)"/></svg>')
 (out/f'{name}.svg').write_text('\n'.join(parts),encoding='utf-8')
