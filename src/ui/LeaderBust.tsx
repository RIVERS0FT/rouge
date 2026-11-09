import { memo, useId } from 'react';
import type { Leader } from '../game/types.ts';

const PALETTES = {
  warden: { skin: '#c59b80', light: '#ecd1b2', shadow: '#735040', coat: '#243e4b', lapel: '#192b36', trim: '#b8a079', hair: '#aaa99d', hairShade: '#646961' },
  vanguard: { skin: '#c69270', light: '#f0c9a0', shadow: '#784732', coat: '#3a5149', lapel: '#1e3430', trim: '#bc9c62', hair: '#372c27', hairShade: '#201c1b' },
  steward: { skin: '#8d6349', light: '#c59974', shadow: '#483126', coat: '#514349', lapel: '#342d34', trim: '#b6a082', hair: '#59534e', hairShade: '#302d2b' },
} as const;

/** Original, self-contained vector busts. Fictional officers, not historical likenesses.
 * Rendered as SVG rather than a second WebGL canvas; no network or animation loop. */
export const LeaderBust = memo(function LeaderBust({ leader, label }: { leader: Leader; label: string }) {
  const id = useId().replace(/:/g, '');
  const p = PALETTES[leader], female = leader === 'vanguard', steward = leader === 'steward';
  const fill = (name: string) => `url(#${id}-${name})`;
  return <svg className="leader-bust" viewBox="0 0 360 400" role="img" aria-labelledby={`${id}-title`} focusable="false" data-testid="leader-bust" data-leader={leader}>
    <title id={`${id}-title`}>{label}</title>
    <defs>
      <linearGradient id={`${id}-coat`} x1="0" x2="1" y1="0" y2=".7"><stop stopColor={p.lapel}/><stop offset=".45" stopColor={p.coat}/><stop offset="1" stopColor={p.lapel}/></linearGradient>
      <linearGradient id={`${id}-skin`} x1="0" x2="1" y1=".3" y2=".6"><stop stopColor={p.shadow}/><stop offset=".35" stopColor={p.skin}/><stop offset=".62" stopColor={p.light}/><stop offset="1" stopColor={p.shadow}/></linearGradient>
      <linearGradient id={`${id}-neck`} x1="0" x2=".8" y1="0" y2="1"><stop stopColor={p.shadow}/><stop offset="1" stopColor={p.skin}/></linearGradient>
      <linearGradient id={`${id}-gold`} x1="0" x2="1" y1="0" y2="1"><stop stopColor="#efdab0"/><stop offset=".45" stopColor={p.trim}/><stop offset="1" stopColor="#71583a"/></linearGradient>
      <linearGradient id={`${id}-hair`} x1="0" x2="1" y1="0" y2="1"><stop stopColor={p.hair}/><stop offset="1" stopColor={p.hairShade}/></linearGradient>
      <radialGradient id={`${id}-halo`}><stop stopColor="#c8b284" stopOpacity=".24"/><stop offset="1" stopColor="#c8b284" stopOpacity="0"/></radialGradient>
    </defs>
    <ellipse cx="184" cy="160" rx="147" ry="171" fill={fill('halo')}/>
    <path d="M60 368V148a120 120 0 0 1 240 0v220M74 368V148a106 106 0 0 1 212 0v220" fill="none" stroke={p.trim} strokeOpacity=".18"/>
    <path d="M105 235 78 250Q51 260 43 297L20 400H340L318 292Q307 257 281 248L245 232Z" fill={fill('coat')} stroke="#102329" strokeWidth="2"/>
    {/* Neck, shirt and the torso extend down to the waist (not an avatar crop). */}
    <path d="M145 176 146 221 123 242 179 295 231 241 208 221 210 176Z" fill={fill('neck')}/>
    <path d="M142 221 177 242 210 221 224 239 193 316H164L130 239Z" fill="#d3c9af"/>
    <path d="M177 241 165 257 177 271 168 310 192 312 186 271 197 254Z" fill="#252d30"/>
    <path d="M144 215 176 241 160 261 128 238Z" fill="#e2dac3"/>
    <path d="M210 216 178 241 195 260 225 237Z" fill="#b9b3a1"/>
    <path d="M127 222 94 246 121 287 107 302 174 370 160 278Z" fill={p.lapel} stroke={p.trim} strokeOpacity=".42"/>
    <path d="M224 221 254 244 231 287 243 303 181 369 197 279Z" fill={p.lapel} stroke={p.trim} strokeOpacity=".42"/>
    <path d="M177 367V400M75 280 65 341 67 399M282 278 293 338 290 400" fill="none" stroke="#0b1c22" strokeOpacity=".7" strokeWidth="2"/>
    {/* Both shoulders and sleeves remain visible. */}
    <path d="M55 273 105 244 119 260 65 287Z" fill={fill('gold')}/>
    <path d="M246 245 296 269 285 284 234 262Z" fill={fill('gold')}/>
    {[0,1,2,3,4].map(i=><g key={i} stroke={p.trim} strokeWidth="2"><path d={`M${63+i*9} ${281-i*5}v13`}/><path d={`M${244+i*9} ${266+i*4}v12`}/></g>)}
    <path d="M94 332H142V337H94ZM221 332H266V337H221Z" fill={p.lapel} stroke={p.trim} strokeOpacity=".35"/>
    {[0,1,2].map(i=><circle key={i} cx="184" cy={333+i*28} r="4" fill={fill('gold')} stroke="#5d4b36"/>)}
    {steward ? <g>
      <path d="M81 351 162 321 205 399H93Z" fill="#4e372c" stroke={p.trim} strokeWidth="2"/>
      <path d="M91 354 161 331 196 400" fill="none" stroke="#b99c70" strokeWidth="2"/>
      <path d="M95 346q-7-17-15-14t-2 27l14 16 12-5Z" fill={fill('skin')}/>
      <path d="M235 285v25M233 285l-8 12 10 13 10-12Z" fill={fill('gold')}/>
    </g> : <g>
      <path d="M228 283h10v23l-5 8-5-8ZM242 283h10v23l-5 8-5-8Z" fill={female?'#715c3e':'#742f35'}/>
      <path d="M231 283h4v23h-4ZM245 283h4v23h-4Z" fill="#b6a67b"/>
      <circle cx="233" cy="312" r="7" fill={fill('gold')}/><path d="m247 306 2 5 6 1-4 4 1 6-5-3-5 3 1-6-4-4 6-1Z" fill={fill('gold')}/>
      <path d="M114 265q-30 50 5 68M119 266q-28 45 4 63" stroke={p.trim} fill="none" strokeWidth="2"/>
    </g>}
    {/* Ears and face: asymmetrical lighting and individual silhouettes. */}
    <path d="M133 116q-15-7-13 11l4 31q4 11 12 4M219 115q15-6 13 12l-5 28q-4 11-11 7" fill={p.skin} stroke={p.shadow} strokeWidth="2"/>
    <path d={female?'M133 85Q139 55 176 58Q216 60 222 93L216 157Q210 188 180 205Q150 193 140 165Z':'M132 88Q139 57 177 57Q218 58 224 92L216 160Q209 192 178 206Q145 193 135 159Z'} fill={fill('skin')} stroke={p.shadow} strokeWidth="1.5"/>
    <path d="M139 125q13-13 29-4M189 121q15-12 27 0" stroke={p.shadow} strokeWidth="6" strokeLinecap="round" fill="none"/>
    <path d="M140 131q12-8 26-1-13 8-26 1M191 130q13-9 24 0-12 7-24 0" fill="#d5c5ad"/>
    <ellipse cx="155" cy="130" rx="4" ry="4.5" fill="#344040"/><ellipse cx="203" cy="129" rx="4" ry="4.5" fill="#344040"/>
    <circle cx="156" cy="129" r="1.3" fill="#eee4ca"/><circle cx="204" cy="128" r="1.3" fill="#eee4ca"/>
    <path d="M140 130q12-8 26 0M191 129q13-8 24 1" fill="none" stroke={p.shadow} strokeWidth="2"/>
    <path d="M179 128 173 155 184 158" fill="none" stroke={p.shadow} strokeWidth="2.3" strokeLinecap="round"/>
    <path d="m185 133 4 20-5 2" fill="none" stroke={p.light} strokeWidth="2" strokeOpacity=".6"/>
    <path d="M163 174q15-8 31-1-15 13-31 1" fill={female?'#9b5c4c':p.shadow}/>
    <path d="M165 175q13 4 27-1M173 189q9 3 16-1" fill="none" stroke={p.light} strokeOpacity=".6"/>
    <path d="M141 146q8 9 18 5M197 150q11 1 18-8" fill="none" stroke={p.shadow} strokeOpacity=".32" strokeWidth="3"/>
    {leader==='warden'&&<g>
      <path d="M129 117Q122 82 143 63Q159 41 192 51Q221 54 227 87L219 118 209 90Q176 103 150 83L140 117Z" fill={fill('hair')}/>
      <path d="M141 79q23-25 60-14M143 87q29-21 60-15M143 70q19-19 49-14" fill="none" stroke="#d4d1bd" strokeOpacity=".5" strokeWidth="2"/>
      <path d="M138 154q10 22 25 22l15 11 14-12q19 2 25-24l-5 30q-12 27-33 33-24-9-35-32Z" fill={fill('hair')}/>
      <path d="M158 166q13-12 21-5 11-6 22 6l-6 8-17-5-17 5Z" fill="#bbb5a2"/>
      <path d="m155 190 14 13m8-14 2 16m18-15-9 13M150 108q18-4 27-1" stroke="#d9d3bd" strokeOpacity=".6" fill="none"/>
    </g>}
    {female&&<g>
      <path d="M130 123Q112 83 134 61Q161 39 192 51Q229 58 228 100l-8 28-9-38q-42 27-66 5l-4 35Z" fill={fill('hair')}/>
      <path d="M128 130q-12 36 3 68l15 11-8-44ZM220 130q13 37 2 65l-14 13 7-45Z" fill={p.hairShade}/>
      <path d="M135 82q26-26 68-17M138 89q31-22 67-17" fill="none" stroke="#8f7760" strokeOpacity=".55" strokeWidth="2"/>
      <path d="M117 65Q177 31 232 66L221 89Q173 72 128 91Z" fill={p.coat} stroke={p.lapel} strokeWidth="2"/>
      <path d="M126 85q48-20 96 0l-5 10q-45-11-87 5Z" fill="#182a2a" stroke={p.trim}/>
      <path d="m175 58 4 6 8 2-6 5v8l-6-4-7 4 1-8-6-5 8-2Z" fill={fill('gold')}/>
    </g>}
    {steward&&<g>
      <path d="M130 120Q123 78 145 62Q174 42 201 57q28 10 25 49l-8 18-9-38q-30-15-61 3l-8 32Z" fill={fill('hair')}/>
      <path d="M143 81q28-18 61-9M147 72q24-13 47-10" fill="none" stroke="#a49a89" strokeOpacity=".6" strokeWidth="2"/>
      <path d="M164 165q12-9 17-4 10-6 20 5l-5 9-15-6-16 6Z" fill={p.hairShade}/>
      <g fill="none" stroke="#c6b392" strokeWidth="2"><ellipse cx="153" cy="131" rx="18" ry="14"/><ellipse cx="204" cy="131" rx="18" ry="14"/><path d="M171 129q7-6 15 0M134 127l-8-5M223 126l5-4"/></g>
      <path d="M151 107q13-3 22 0M190 105q12-1 21 2" fill="none" stroke={p.shadow} strokeOpacity=".5"/>
    </g>}
  </svg>;
});
