import type {ReactNode} from 'react';
import type {FlagPresetId} from '../game/flagCatalog.ts';

/** Hand-drawn 90×60 renditions of real national flags. Fields, bands and
 * charges follow each flag's official construction where a 3:2 field allows;
 * coats of arms are simplified so they still read at banner size. `uid` keeps
 * clip-path ids unique for every flag on the page. */
const W = 90, H = 60;
const DIAG = Math.atan2(H, W) * 180 / Math.PI;
const ARABIC = "'Noto Naskh Arabic','Noto Sans Arabic','Segoe UI','Tahoma','Geeza Pro','DejaVu Sans','Arial',sans-serif";
type Art = (uid: string) => ReactNode;
const f = (n: number) => Math.round(n * 100) / 100;
const pts = (list: readonly (readonly number[])[]) => list.map(([x, y]) => `${f(x)},${f(y)}`).join(' ');

/** Bands painted front to back, each reaching the far edge, so neighbours overlap instead of leaving seams. */
function bands(colors: readonly string[], weights: readonly number[] | undefined, vertical: boolean): ReactNode {
 const w = weights ?? colors.map(() => 1), total = w.reduce((a, b) => a + b, 0);
 let start = 0;
 return colors.map((fill, i) => {
  const at = start / total;
  start += w[i];
  return vertical
   ? <rect key={i} x={f(at * W)} width={f(W - at * W)} height={H} fill={fill}/>
   : <rect key={i} y={f(at * H)} width={W} height={f(H - at * H)} fill={fill}/>;
 });
}
const hBands = (colors: readonly string[], weights?: readonly number[]) => bands(colors, weights, false);
const vBands = (colors: readonly string[], weights?: readonly number[]) => bands(colors, weights, true);
const field = (fill: string) => <rect width={W} height={H} fill={fill}/>;

/** Regular star outline; `rotate` in degrees, 0 = a point straight up. */
function starPoints(cx: number, cy: number, r: number, points = 5, inner = .382, rotate = 0): string {
 return pts(Array.from({length: points * 2}, (_, i) => {
  const a = (i * 180 / points - 90 + rotate) * Math.PI / 180, d = i % 2 ? r * inner : r;
  return [cx + Math.cos(a) * d, cy + Math.sin(a) * d];
 }));
}
function Star({x, y, r, fill, points = 5, inner, rotate = 0, stroke}: {x: number; y: number; r: number; fill: string; points?: number; inner?: number; rotate?: number; stroke?: string}) {
 return <polygon points={starPoints(x, y, r, points, inner ?? (points === 5 ? .382 : .5), rotate)} fill={fill} stroke={stroke} strokeWidth={stroke ? .5 : undefined}/>;
}
/** Rotation that turns one point of a 5-pointed star toward (tx, ty). */
const aim = (x: number, y: number, tx: number, ty: number) => f(Math.atan2(ty - y, tx - x) * 180 / Math.PI + 90);

/** A disc of radius R minus a disc of radius r whose centre lies d further toward
 * `angle` (degrees, 0 = toward the fly): the crescent opens toward `angle`. */
function Crescent({x, y, R, r, d, angle = 0, fill}: {x: number; y: number; R: number; r: number; d: number; angle?: number; fill: string}) {
 const ix = (d * d + R * R - r * r) / (2 * d), iy = Math.sqrt(Math.max(0, R * R - ix * ix));
 const path = `M${f(ix)} ${f(-iy)}A${R} ${R} 0 ${ix > 0 ? 1 : 0} 0 ${f(ix)} ${f(iy)}A${r} ${r} 0 ${ix - d > 0 ? 1 : 0} 1 ${f(ix)} ${f(-iy)}Z`;
 return <path d={path} fill={fill} transform={`translate(${x} ${y})${angle ? ` rotate(${angle})` : ''}`}/>;
}
function Pentagram({x, y, r, stroke, width}: {x: number; y: number; r: number; stroke: string; width: number}) {
 const v = [0, 2, 4, 1, 3].map(i => {const a = (i * 72 - 90) * Math.PI / 180; return `${f(x + Math.cos(a) * r)} ${f(y + Math.sin(a) * r)}`;});
 return <path d={`M${v.join('L')}Z`} fill="none" stroke={stroke} strokeWidth={width} strokeLinejoin="miter"/>;
}
/** Rays alternating long and short around a disc, as on suns of May. */
function Sun({x, y, r, long, short, rays, fill, stroke}: {x: number; y: number; r: number; long: number; short: number; rays: number; fill: string; stroke?: string}) {
 const outline = pts(Array.from({length: rays * 2}, (_, i) => {
  const a = (i * 180 / rays - 90) * Math.PI / 180, d = i % 2 ? r * 1.06 : i % 4 ? short : long;
  return [x + Math.cos(a) * d, y + Math.sin(a) * d];
 }));
 return <g fill={fill} stroke={stroke} strokeWidth={stroke ? .25 : undefined}><polygon points={outline}/><circle cx={x} cy={y} r={r}/></g>;
}
/** Heater shield outline with its top edge at y. */
function shieldPath(cx: number, y: number, w: number, h: number) {
 const l = cx - w / 2, r = cx + w / 2;
 return `M${f(l)} ${f(y)}H${f(r)}V${f(y + h * .55)}Q${f(r)} ${f(y + h * .9)} ${f(cx)} ${f(y + h)}Q${f(l)} ${f(y + h * .9)} ${f(l)} ${f(y + h * .55)}Z`;
}
/** Cross pattée centred on (cx, cy). */
function pattee(cx: number, cy: number, R: number, a: number, b: number) {
 return pts([[-a, -a], [-b, -R], [b, -R], [a, -a], [R, -b], [R, b], [a, a], [b, R], [-b, R], [-a, a], [-R, b], [-R, -b]].map(([x, y]) => [cx + x, cy + y]));
}

// Eagle silhouettes in a 40×40 box centred on the origin.
const EAGLE_DOUBLE_HALF = [[0, -9], [2, -12], [3.5, -15.5], [6, -17], [8.5, -16], [9, -14.5], [7, -14.2], [5.5, -13], [4, -10], [5, -9], [9, -13], [13, -17], [17, -19], [18, -16], [16, -14.5], [19.5, -13], [16.5, -11], [19, -9], [15.5, -7.5], [17.5, -5], [13.5, -4], [15, -1], [11, -1], [12, 2], [8, 1.5], [5, 4], [6, 8], [8, 10], [5.5, 10.5], [4, 8.5], [3.5, 12], [5, 17], [2.5, 15.5], [1.5, 19], [0, 17]];
const EAGLE_DOUBLE = [...EAGLE_DOUBLE_HALF, ...EAGLE_DOUBLE_HALF.slice(1, -1).reverse().map(([x, y]) => [-x, y])];
const EAGLE = [[-1, -15], [-4, -14.5], [-6, -13], [-3.5, -12.5], [-2, -11], [-5, -9], [-10, -13], [-16, -16], [-15, -12], [-18, -10], [-14.5, -7.5], [-17, -4], [-13, -3], [-14, 1], [-9, 0], [-5, 4], [-4, 10], [-6, 12], [-3, 12], [-2, 14], [-3, 19], [0, 17], [3, 19], [2, 14], [3, 12], [6, 12], [4, 10], [5, 4], [9, 0], [14, 1], [13, -3], [17, -4], [14.5, -7.5], [18, -10], [15, -12], [16, -16], [10, -13], [5, -9], [2, -11], [2, -14], [0, -15.5]];
function Eagle({x, y, scale, fill, double = false, stroke}: {x: number; y: number; scale: number; fill: string; double?: boolean; stroke?: string}) {
 return <polygon points={pts((double ? EAGLE_DOUBLE : EAGLE).map(([px, py]) => [x + px * scale, y + py * scale]))} fill={fill}
  stroke={stroke} strokeWidth={stroke ? .35 : undefined} strokeLinejoin="round"/>;
}

/** The Union Flag in a w×h box; its own viewport clips it. The red saltire is
 * counterchanged: in each quarter it lies on the clockwise side of the diagonal. */
function UnionJack({w = W, h = H}: {w?: number; h?: number}) {
 const cx = w / 2, cy = h / 2, length = Math.hypot(cx, cy), ux = cx / length, uy = cy / length, red = h / 15;
 const strip = (kx: number, ky: number, nx: number, ny: number) => pts([[cx, cy], [kx, ky], [kx + nx * red, ky + ny * red], [cx + nx * red, cy + ny * red]]);
 return <svg x={0} y={0} width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
  <rect width={w} height={h} fill="#012169"/>
  <path d={`M0 0L${w} ${h}M${w} 0L0 ${h}`} stroke="#FFFFFF" strokeWidth={f(h / 5)}/>
  <g fill="#C8102E">
   <polygon points={strip(0, 0, -uy, ux)}/><polygon points={strip(w, 0, -uy, -ux)}/>
   <polygon points={strip(w, h, uy, -ux)}/><polygon points={strip(0, h, uy, ux)}/>
  </g>
  <path d={`M${cx} 0V${h}M0 ${cy}H${w}`} stroke="#FFFFFF" strokeWidth={f(h / 3)}/>
  <path d={`M${cx} 0V${h}M0 ${cy}H${w}`} stroke="#C8102E" strokeWidth={f(h / 5)}/>
 </svg>;
}
function Nordic({fill, cross, inner, x, width, innerWidth = 0}: {fill: string; cross: string; inner?: string; x: number; width: number; innerWidth?: number}) {
 const d = `M${x} 0V${H}M0 30H${W}`;
 return <>{field(fill)}<path d={d} stroke={cross} strokeWidth={width}/>{inner && <path d={d} stroke={inner} strokeWidth={innerWidth}/>}</>;
}
/** One Korean trigram, bars running across the diagonal at `angle`; true = an unbroken bar. */
function Trigram({angle, bars}: {angle: number; bars: readonly boolean[]}) {
 return <g transform={`translate(45 30) rotate(${f(angle)})`} fill="#000000">
  {bars.map((solid, i) => {
   const x = 22.5 + i * 3.75;
   return solid ? <rect key={i} x={x} y={-7.5} width={2.5} height={15}/>
    : <g key={i}><rect x={x} y={-7.5} width={2.5} height={6.875}/><rect x={x} y={.625} width={2.5} height={6.875}/></g>;
  })}
 </g>;
}

// Canada's eleven-point maple leaf (left half, stem to tip; mirrored for the right).
const MAPLE_HALF = [[-90, 2030], [-45, 1167], [-156, 1069], [-1015, 1220], [-899, 900], [-919, 827], [-1860, 65], [-1648, -34], [-1614, -113], [-1800, -685], [-1258, -570], [-1185, -608], [-1080, -855], [-657, -401], [-546, -458], [-750, -1510], [-423, -1321], [-332, -1348], [0, -2000]];
const MAPLE = pts([...MAPLE_HALF, ...MAPLE_HALF.slice(0, -1).reverse().map(([x, y]) => [-x, y])].map(([x, y]) => [45 + x * .0101, 29.8 + y * .0101]));

function SpainArms({uid}: {uid: string}) {
 const shield = shieldPath(30, 21, 11, 15), clip = `${uid}-es`;
 return <>
  {[22.3, 37.7].map(x => <g key={x}>
   <rect x={x - 1.3} y={22.5} width={2.6} height={16} fill="#EDEDED"/>
   <rect x={x - 2} y={21} width={4} height={1.6} fill="#C9A227"/><rect x={x - 2} y={38.2} width={4} height={1.6} fill="#C9A227"/>
   <rect x={x - 2.2} y={30} width={4.4} height={1.8} fill="#AA151B"/>
   <path d={`M${f(x - 1.8)} 21V18.6L${f(x - .9)} 19.6L${x} 18.2L${f(x + .9)} 19.6L${f(x + 1.8)} 18.6V21Z`} fill="#C9A227"/>
  </g>)}
  <clipPath id={clip}><path d={shield}/></clipPath>
  <g clipPath={`url(#${clip})`}>
   <rect x={24.5} y={21} width={5.5} height={7.5} fill="#C8102E"/><rect x={30} y={21} width={5.5} height={7.5} fill="#F5F5F5"/>
   <rect x={24.5} y={28.5} width={5.5} height={8} fill="#F1BF00"/>
   {[25.3, 26.9, 28.5].map(x => <rect key={x} x={x} y={28.5} width={.8} height={8} fill="#C8102E"/>)}
   <rect x={30} y={28.5} width={5.5} height={8} fill="#C8102E"/>
   <path d="M30.6 29.3L34.9 35.2M34.9 29.3L30.6 35.2M32.75 28.8V35.8M30.3 32.25H35.2" stroke="#F1BF00" strokeWidth={.5}/>
   <path d="M25.9 26.7V23.3H26.5V22.4H27V23H27.5V22.4H28V23H28.6V26.7Z" fill="#F1BF00"/>
   <circle cx={32.75} cy={24.8} r={1.5} fill="#7B2A8C"/>
  </g>
  <path d={shield} fill="none" stroke="#8A6A16" strokeWidth={.35}/>
  <ellipse cx={30} cy={28.5} rx={1.5} ry={1.8} fill="#1F3E9C" stroke="#C9A227" strokeWidth={.3}/>
  <path d="M25.2 20.6L25.6 17L27.6 18.8L30 16L32.4 18.8L34.4 17L34.8 20.6Z" fill="#C9A227"/>
 </>;
}
function PortugalArms() {
 const gold = '#FFE900';
 return <>
  <circle cx={36} cy={30} r={10.5} fill="none" stroke={gold} strokeWidth={1.5}/>
  <path d="M25.8 27.4Q36 23.8 46.2 27.4M25.8 32.6Q36 36.2 46.2 32.6M36 19.5V40.5" stroke={gold} strokeWidth={.9} fill="none"/>
  <path d={shieldPath(36, 23, 10, 13)} fill="#DA291C" stroke="#FFFFFF" strokeWidth={.4}/>
  <path d={shieldPath(36, 25, 6.6, 9)} fill="#FFFFFF"/>
  {[[36, 27.2], [33.7, 29.6], [36, 29.6], [38.3, 29.6], [36, 32]].map(([x, y]) => <rect key={`${x}-${y}`} x={x - .8} y={y - 1} width={1.6} height={2} rx={.4} fill="#003399"/>)}
  {[[32.3, 24], [36, 24], [39.7, 24], [31.85, 28], [40.15, 28], [31.85, 31.5], [40.15, 31.5]].map(([x, y]) => <rect key={`${x}-${y}`} x={x - .55} y={y - .55} width={1.1} height={1.1} fill={gold}/>)}
 </>;
}
function SlovakArms({uid}: {uid: string}) {
 const inner = shieldPath(30, 15.5, 18.5, 29), clip = `${uid}-sk`;
 return <>
  <path d={shieldPath(30, 14.5, 20.5, 31)} fill="#FFFFFF"/>
  <path d={inner} fill="#EE1C25"/>
  <clipPath id={clip}><path d={inner}/></clipPath>
  <g clipPath={`url(#${clip})`}><path d="M18 46C20 38 24 37 26 39C27 35 33 35 34 39C36 37 40 38 42 46Z" fill="#0B4EA2"/></g>
  <path d="M28.9 19H31.1V37H28.9ZM24.5 23H35.5V25.2H24.5ZM23 28H37V30.4H23Z" fill="#FFFFFF"/>
 </>;
}
function CroatianArms({uid}: {uid: string}) {
 const shield = 'M37.5 19H52.5V30.5Q52.5 38.5 45 41Q37.5 38.5 37.5 30.5Z', clip = `${uid}-hr`;
 return <>
  <path d={shield} fill="#FFFFFF"/>
  <clipPath id={clip}><path d={shield}/></clipPath>
  <g clipPath={`url(#${clip})`} fill="#FF0000">
   {Array.from({length: 35}, (_, i) => {const col = i % 5, row = Math.floor(i / 5); return (col + row) % 2 ? null : <rect key={i} x={37.5 + col * 3} y={f(19 + row * 3.2)} width={3} height={3.2}/>;})}
  </g>
  <path d={shield} fill="none" stroke="#FF0000" strokeWidth={.5}/>
  {[0, 1, 2, 3, 4].map(i => <path key={i} d={`M${f(37.6 + i * 3)} 18.6V15.4Q${f(39.1 + i * 3)} ${i === 2 ? 13.2 : 14} ${f(40.6 + i * 3)} 15.4V18.6Z`}
   fill={i % 2 ? '#171796' : '#0093DD'} stroke="#FF0000" strokeWidth={.3}/>)}
 </>;
}
function Soyombo({x}: {x: number}) {
 const gold = '#F9CF02';
 return <g fill={gold}>
  <path d={`M${x} 6.5C${x + 2.2} 9 ${x + 1.4} 11.4 ${x} 12.2C${x - 1.4} 11.4 ${x - 2.2} 9 ${x} 6.5Z`}/>
  {[-1, 1].map(s => <path key={s} d={`M${x + 2.6 * s} 9.5C${x + 1.4 * s} 10.6 ${x + 1.6 * s} 12 ${x + 2.4 * s} 12.4C${x + 3.4 * s} 11.8 ${x + 3.3 * s} 10.4 ${x + 2.6 * s} 9.5Z`}/>)}
  <circle cx={x} cy={16} r={2.6}/>
  <path d={`M${x - 3.6} 19.4A3.6 3.6 0 0 0 ${x + 3.6} 19.4A3.6 2.4 0 0 1 ${x - 3.6} 19.4Z`}/>
  <polygon points={`${x - 4},25 ${x + 4},25 ${x},28.4`}/>
  <rect x={x - 4} y={29.4} width={8} height={1.4}/>
  <circle cx={x} cy={36} r={4}/>
  <path d={`M${x} 32A2 2 0 0 1 ${x} 36A2 2 0 0 0 ${x} 40A4 4 0 0 1 ${x} 32Z`} fill="#C4272F"/>
  <circle cx={x} cy={34} r={.7} fill="#C4272F"/><circle cx={x} cy={38} r={.7}/>
  <rect x={x - 4} y={41.2} width={8} height={1.4}/>
  <polygon points={`${x - 4},43.6 ${x + 4},43.6 ${x},47`}/>
  <rect x={x - 7} y={25} width={1.6} height={22}/><rect x={x + 5.4} y={25} width={1.6} height={22}/>
 </g>;
}
type Point = readonly [number, number];
/** Point, unit tangent and the unit normal on the tangent's left of a cubic Bézier. */
function bezier([a, b, c, d]: readonly [Point, Point, Point, Point], t: number) {
 const u = 1 - t, at = (i: 0 | 1) => u * u * u * a[i] + 3 * u * u * t * b[i] + 3 * u * t * t * c[i] + t * t * t * d[i];
 const slope = (i: 0 | 1) => 3 * u * u * (b[i] - a[i]) + 6 * u * t * (c[i] - b[i]) + 3 * t * t * (d[i] - c[i]);
 const dx = slope(0), dy = slope(1), length = Math.hypot(dx, dy) || 1;
 return {x: at(0), y: at(1), tx: dx / length, ty: dy / length, nx: dy / length, ny: -dx / length};
}
/** The thunder dragon: an S-shaped white body along the diagonal with dorsal spines,
 * four legs clutching jewels, a curled tail and a maned head facing the fly. */
const DRAGON_BODY: readonly (readonly [Point, Point, Point, Point])[] = [[[20, 45], [28, 36], [35, 46], [43.5, 38]], [[43.5, 38], [52, 30], [56, 27.4], [63, 23.6]]];
function Dragon() {
 const line = '#6B5A4A', white = '#FFFFFF';
 const body = 'M20 45C28 36 35 46 43.5 38C52 30 56 27.4 63 23.6', tail = 'M21 44.2C16 48.6 11.4 47.4 11.6 43.4C11.8 40.6 15 40.2 15.8 42.2';
 const spines = ([[0, .35], [0, .65], [0, .9], [1, .15], [1, .4], [1, .65], [1, .9]] as const).map(([segment, t]) => {
  const p = bezier(DRAGON_BODY[segment], t);
  return `M${f(p.x + p.nx * 3.2 - p.tx * 1.5)} ${f(p.y + p.ny * 3.2 - p.ty * 1.5)}L${f(p.x + p.nx * 6.4 - p.tx * 1.2)} ${f(p.y + p.ny * 6.4 - p.ty * 1.2)}L${f(p.x + p.nx * 3.2 + p.tx * 1.5)} ${f(p.y + p.ny * 3.2 + p.ty * 1.5)}Z`;
 }).join('');
 const legs = ([[0, .55, 1], [0, .55, -1], [1, .6, 1], [1, .6, -1]] as const).map(([segment, t, side]) => {
  const p = bezier(DRAGON_BODY[segment], t);
  return {x1: f(p.x), y1: f(p.y), x2: f(p.x + p.nx * 8 * side - p.tx * 1.4), y2: f(p.y + p.ny * 8 * side - p.ty * 1.4)};
 });
 return <g strokeLinecap="round" strokeLinejoin="round">
  <path d={spines} fill={white} stroke={line} strokeWidth={.5}/>
  {legs.map(leg => <path key={`o${leg.x2}`} d={`M${leg.x1} ${leg.y1}L${leg.x2} ${leg.y2}`} stroke={line} strokeWidth={3}/>)}
  <path d={tail} fill="none" stroke={line} strokeWidth={4.6}/>
  <path d={body} fill="none" stroke={line} strokeWidth={7.6}/>
  {legs.map(leg => <path key={`w${leg.x2}`} d={`M${leg.x1} ${leg.y1}L${leg.x2} ${leg.y2}`} stroke={white} strokeWidth={1.8}/>)}
  <path d={tail} fill="none" stroke={white} strokeWidth={3}/>
  <path d={body} fill="none" stroke={white} strokeWidth={6}/>
  {legs.map(leg => <circle key={`j${leg.x2}`} cx={leg.x2} cy={leg.y2} r={1.6} fill={white} stroke={line} strokeWidth={.5}/>)}
  <path d="M66.2 17.6Q63.2 14 64.8 10.2Q65.8 13.2 67.6 14Q67.6 10.4 70.4 8.6Q70 11.8 71.2 13.6Z" fill={white} stroke={line} strokeWidth={.5}/>
  <path d="M61.6 22.6Q65.6 15.4 72.4 14.4Q76 13.8 78.4 14.6L81.4 13.4L80 16.2L81.8 18L78.2 18.2Q76.4 20.4 72.6 20.8Q68.6 21.8 65.2 25.6Z" fill={white} stroke={line} strokeWidth={.6}/>
  <circle cx={74.2} cy={16.6} r={.7} fill={line}/>
  <path d="M79 18.4Q82.4 21 84.6 19.6M26 41.6Q29.4 37.4 33.6 39.8M45.4 35.4Q50.2 30.2 55.6 29.6" fill="none" stroke={line} strokeWidth={.45}/>
 </g>;
}
function IranEmblem() {
 return <g fill="none" stroke="#DA0000" strokeLinecap="round">
  <path d="M45 23.5V37" strokeWidth={1.3}/>
  <path d="M42.8 25.2C39.6 27.5 39.6 33.6 43.4 36.2M47.2 25.2C50.4 27.5 50.4 33.6 46.6 36.2" strokeWidth={1.1}/>
  <path d="M41.2 23.6C36.4 26.6 36.6 34.8 42.6 37.6M48.8 23.6C53.6 26.6 53.4 34.8 47.4 37.6" strokeWidth={1.1}/>
  <path d="M43.6 23.4L45 22L46.4 23.4" strokeWidth={.9}/>
 </g>;
}
function AngkorWat() {
 return <g fill="#FFFFFF" stroke="#000000" strokeWidth={.45} strokeLinejoin="round">
  <path d="M27 34V29.5H28L29.5 25L31 29.5H32V34ZM58 34V29.5H59L60.5 25L62 29.5H63V34Z"/>
  <path d="M33.5 34V27H34.8L36.5 21.5L38.2 27H39.5V34ZM50.5 34V27H51.8L53.5 21.5L55.2 27H56.5V34Z"/>
  <path d="M41 34V25H42.4L45 18.5L47.6 25H49V34Z"/>
  <path d="M26.5 38.2V34H63.5V38.2Z"/>
  <path d="M23 42H67V40.2H64.5V38.2H25.5V40.2H23Z"/>
  <path d="M43.6 38.2V35.4H46.4V38.2M29.5 36H33M57 36H60.5" fill="none"/>
 </g>;
}
function KazakhOrnament() {
 return <g fill="none" stroke="#FEC50C" strokeWidth={.9}>
  {Array.from({length: 6}, (_, i) => {
   const y = 5 + i * 10;
   return <path key={i} d={`M6.5 ${y - 3.8}C10 ${y - 3.8} 10 ${y} 6.5 ${y}C3 ${y} 3 ${y + 3.8} 6.5 ${y + 3.8}M3.7 ${f(y - 1.9)}H9.3`}/>;
  })}
 </g>;
}
function Gul({x, y}: {x: number; y: number}) {
 const diamond = (r: number, h: number) => `${x},${f(y - h)} ${f(x + r)},${y} ${x},${f(y + h)} ${f(x - r)},${y}`;
 return <g>
  <polygon points={diamond(5.6, 5)} fill="#F2E3C6"/><polygon points={diamond(4, 3.6)} fill="#00843D"/>
  <polygon points={diamond(2.4, 2.1)} fill="#F5A623"/><circle cx={x} cy={y} r={.8} fill="#D22630"/>
 </g>;
}
function PhilippineSun() {
 const cx = 17.3, cy = 30, gold = '#FCD116';
 const rays = Array.from({length: 8}, (_, k) => [-9, 0, 9].map(o => {
  const a = (k * 45 + o - 90) * Math.PI / 180, len = o ? 9.6 : 11.2, w = o ? .7 : 1.05, b = a + Math.PI / 2;
  const x1 = cx + Math.cos(a) * 5.6, y1 = cy + Math.sin(a) * 5.6;
  return `M${f(x1 + Math.cos(b) * w)} ${f(y1 + Math.sin(b) * w)}L${f(cx + Math.cos(a) * len)} ${f(cy + Math.sin(a) * len)}L${f(x1 - Math.cos(b) * w)} ${f(y1 - Math.sin(b) * w)}Z`;
 }).join('')).join('');
 return <g fill={gold}>
  <path d={rays}/><circle cx={cx} cy={cy} r={5.6}/>
  {[[5.6, 6.6], [5.6, 53.8], [44, 30.4]].map(([x, y]) => <Star key={y} x={x} y={y} r={2.6} fill={gold}/>)}
 </g>;
}
function EritreaWreath() {
 const gold = '#FFC726';
 return <g fill="none" stroke={gold} strokeLinecap="round">
  <path d="M17.6 20.6A10 10 0 1 0 24.4 20.6" strokeWidth={1.4}/>
  <path d="M21 39.4V22.4" strokeWidth={1.1}/>
  <path d="M21 26.4L18.4 24.2M21 26.4L23.6 24.2M21 30.4L18 28.2M21 30.4L24 28.2M21 34.4L18.2 32.4M21 34.4L23.8 32.4" strokeWidth={.8}/>
  <circle cx={21} cy={30} r={11.6} strokeWidth={1.1} strokeDasharray="1.4 1.2" strokeDashoffset={-4}/>
 </g>;
}
function MaasaiShield() {
 return <>
  <path d="M35.5 11.5L54.5 48.5M54.5 11.5L35.5 48.5" stroke="#FFFFFF" strokeWidth={1.1}/>
  {[[35.5, 11.5, -27], [54.5, 11.5, 27]].map(([x, y, a]) => <ellipse key={x} cx={x} cy={y} rx={1.2} ry={3.1} transform={`rotate(${a} ${x} ${y})`} fill="#FFFFFF"/>)}
  <ellipse cx={45} cy={30} rx={7.6} ry={17} fill="#000000"/>
  <ellipse cx={45} cy={30} rx={5.4} ry={17} fill="#BB0000"/>
  <path d="M45 15.5C47.4 21 47.4 39 45 44.5C42.6 39 42.6 21 45 15.5Z" fill="#000000"/>
  <ellipse cx={45} cy={30} rx={1.4} ry={2.4} fill="#FFFFFF"/>
  <path d="M43.2 22.5Q45 24 46.8 22.5M43.2 37.5Q45 36 46.8 37.5" stroke="#FFFFFF" strokeWidth={.6} fill="none"/>
 </>;
}
function Crane() {
 return <g>
  <path d="M46.6 33.4L47.8 39.4M44.8 33.6L42.6 36.8L44.8 38.4" stroke="#4A4A4A" strokeWidth={.7} fill="none"/>
  <ellipse cx={46} cy={30.5} rx={3.6} ry={3.2} fill="#9CA69C"/>
  <path d="M48.6 29Q50.8 31.6 49.6 34.8L47 33Z" fill="#E6E6E6"/>
  <path d="M44.2 29.2Q42.4 26 43.6 23" stroke="#9CA69C" strokeWidth={1.5} fill="none" strokeLinecap="round"/>
  <circle cx={43.6} cy={22.6} r={1.3} fill="#000000"/>
  <path d="M42.5 22.4L40.2 23.4L42.6 23.3Z" fill="#4A4A4A"/>
  <path d="M43.4 21.4L42.4 18.8M43.8 21.3L44 18.6M44.2 21.4L45.4 19" stroke="#FCDC04" strokeWidth={.6}/>
  <circle cx={43.2} cy={24.2} r={.55} fill="#D90000"/>
 </g>;
}
function AngolaEmblem() {
 const gold = '#FFCB00';
 const teeth = Array.from({length: 11}, (_, i) => {
  const a = 40 + i * 20, rad = a * Math.PI / 180, x = 45 + Math.cos(rad) * 11.4, y = 31 + Math.sin(rad) * 11.4;
  return <rect key={a} x={f(x - 1)} y={f(y - 1)} width={2} height={2} transform={`rotate(${a} ${f(x)} ${f(y)})`}/>;
 });
 return <g fill={gold}>
  <path d="M53.66 36A10 10 0 1 1 41.58 21.6" fill="none" stroke={gold} strokeWidth={2.8}/>
  {teeth}
  <path d="M40 40.2Q49 33 55.6 21.4Q53.6 30.4 41.6 41.8Z"/>
  <path d="M37.6 42.6L40.8 39.8" stroke={gold} strokeWidth={2.2} strokeLinecap="round"/>
  <Star x={43} y={28.4} r={3.4} fill={gold}/>
 </g>;
}
function MexicoArms() {
 return <>
  <path d="M37.4 31.5Q37.8 40.5 45 41.4Q52.2 40.5 52.6 31.5" fill="none" stroke="#2E7D32" strokeWidth={1.6} strokeLinecap="round"/>
  <path d="M43 41.4Q45 40.2 47 41.4" fill="none" stroke="#CE1126" strokeWidth={.9}/>
  <ellipse cx={45} cy={37.4} rx={4.6} ry={1.2} fill="#5B8BC4"/>
  <path d="M43.2 36.8V33.4Q43.2 32.4 44.2 32.4V31.4Q44.2 30.6 45 30.6Q45.8 30.6 45.8 31.4V32.4Q46.8 32.4 46.8 33.4V36.8Z" fill="#4E8A2E"/>
  <Eagle x={45} y={27.4} scale={.36} fill="#7A4A1E"/>
  <path d="M41.4 30Q44 32.6 48.4 29.8" stroke="#3E7D2E" strokeWidth={.6} fill="none"/>
 </>;
}
function GuatemalaArms() {
 return <>
  <path d="M38.6 25.6Q36.4 36.4 45 38.8Q53.6 36.4 51.4 25.6" fill="none" stroke="#4E8A2E" strokeWidth={1.4} strokeLinecap="round"/>
  <path d="M38.5 36.5L51.5 24.5M51.5 36.5L38.5 24.5" stroke="#8C8C8C" strokeWidth={.8}/>
  <path d="M41.2 26.2H48.8V33.6H41.2Z" fill="#F4ECD0" stroke="#B59A5B" strokeWidth={.35}/>
  <path d="M43.4 26.4Q45.4 22.6 48 24.2L47.2 25.4Q46 25 44.8 26.4Z" fill="#2E8B3C"/>
  <path d="M43.6 26.2Q41 28 39.2 32" stroke="#2E8B3C" strokeWidth={.8} fill="none"/>
  <circle cx={47.4} cy={24.2} r={.9} fill="#2E8B3C"/>
  <path d="M46 25.6L46.6 26.6" stroke="#D52B1E" strokeWidth={.9}/>
 </>;
}
function BelizeArms() {
 return <>
  <circle cx={45} cy={30} r={17} fill="#FFFFFF"/>
  <circle cx={45} cy={30} r={15} fill="none" stroke="#3E8E41" strokeWidth={2.2} strokeDasharray="2.2 1"/>
  <path d={shieldPath(45, 25, 9, 10)} fill="#F2E3C6" stroke="#6B4E2E" strokeWidth={.35}/>
  <path d="M40.5 28H49.5M45 25V28" stroke="#6B4E2E" strokeWidth={.3}/>
  <path d="M41.2 31Q45 33.6 48.8 31" fill="none" stroke="#2F6FB5" strokeWidth={.8}/>
  <path d="M45 15.6L48.2 20.8H41.8Z" fill="#2E7D32"/><rect x={44.6} y={20.6} width={.8} height={4.4} fill="#6B4E2E"/>
  <circle cx={38.4} cy={29.6} r={1.5} fill="#8D5524"/><circle cx={51.6} cy={29.6} r={1.5} fill="#3B2414"/>
 </>;
}
function EcuadorArms() {
 return <>
  {[['#FFDD00', -1.2], ['#034EA2', 0], ['#ED1C24', 1.2]].map(([color, o]) => <path key={color as string}
   d={`M${f(38.4 + (o as number))} 23Q${f(36 + (o as number))} 31 ${f(39.6 + (o as number))} 38.6M${f(51.6 - (o as number))} 23Q${f(54 - (o as number))} 31 ${f(50.4 - (o as number))} 38.6`}
   fill="none" stroke={color as string} strokeWidth={1.2}/>)}
  <ellipse cx={45} cy={31} rx={5.2} ry={6.6} fill="#8FC8EE" stroke="#C9A227" strokeWidth={.6}/>
  <path d="M40.2 33.6L43.6 28.4L45.4 30.6L47 28.8L49.8 33.6Q45 37.4 40.2 33.6Z" fill="#4E8A2E"/>
  <path d="M42.6 30L43.6 28.4L44.4 29.6Z" fill="#FFFFFF"/>
  <circle cx={45} cy={26.4} r={1.3} fill="#F6B40E"/>
  <path d="M36.4 22.4Q40.4 18.4 45 21.8Q49.6 18.4 53.6 22.4Q49.6 20.8 45 24Q40.4 20.8 36.4 22.4Z" fill="#3B3B3B"/>
  <circle cx={45} cy={20.6} r={1} fill="#3B3B3B"/>
 </>;
}
function BrazilGlobe({uid}: {uid: string}) {
 const clip = `${uid}-br`;
 const stars = [[37.5, 37.6, .7], [41, 41.5, .8], [44.6, 38.6, .7], [45, 43.8, .9], [42.6, 40.8, .5], [47.4, 40.4, .6], [50.4, 38.4, .6], [53.6, 41.6, .7], [48.6, 46.4, .6], [40, 45.2, .5], [56.8, 37.8, .5], [51.2, 27.6, .8]];
 return <>
  <circle cx={45} cy={30} r={14.6} fill="#002776"/>
  <clipPath id={clip}><circle cx={45} cy={30} r={14.6}/></clipPath>
  <g clipPath={`url(#${clip})`}>
   <circle cx={52} cy={78} r={47} fill="none" stroke="#FFFFFF" strokeWidth={2.7}/>
   <circle cx={52} cy={78} r={47} fill="none" stroke="#009C3B" strokeWidth={.6} strokeDasharray=".9 .5"/>
   {stars.map(([x, y, r]) => <circle key={`${x}-${y}`} cx={x} cy={y} r={r} fill="#FFFFFF"/>)}
  </g>
 </>;
}

export const FLAG_ART: Readonly<Record<FlagPresetId, Art>> = {
 // The original eight
 cn: () => <>{field('#DE2910')}<Star x={15} y={15} r={9} fill="#FFDE00"/>
  {[[30, 6], [36, 12], [36, 21], [30, 27]].map(([x, y]) => <Star key={y} x={x} y={y} r={3} fill="#FFDE00" rotate={aim(x, y, 15, 15)}/>)}</>,
 fr: () => vBands(['#002654', '#FFFFFF', '#ED2939']),
 de: () => hBands(['#000000', '#DD0000', '#FFCE00']),
 it: () => vBands(['#009246', '#FFFFFF', '#CE2B37']),
 jp: () => <>{field('#FFFFFF')}<circle cx={45} cy={30} r={18} fill="#BC002D"/></>,
 gb: () => <UnionJack/>,
 us: () => <>{hBands(Array.from({length: 13}, (_, i) => i % 2 ? '#FFFFFF' : '#B22234'))}
  <rect width={36} height={f(H * 7 / 13)} fill="#3C3B6E"/>
  {Array.from({length: 9}, (_, row) => Array.from({length: row % 2 ? 5 : 6}, (_, col) =>
   <Star key={`${row}-${col}`} x={3 * (row % 2 ? 2 + col * 2 : 1 + col * 2)} y={f(H * 7 / 130 * (row + 1))} r={1.85} fill="#FFFFFF"/>))}</>,
 ch: () => <>{field('#DA291C')}<path d="M45 12V48M27 30H63" stroke="#FFFFFF" strokeWidth={12}/></>,
 // Europe
 es: uid => <>{hBands(['#AA151B', '#F1BF00', '#AA151B'], [1, 2, 1])}<SpainArms uid={uid}/></>,
 pt: () => <>{vBands(['#046A38', '#DA291C'], [2, 3])}<PortugalArms/></>,
 nl: () => hBands(['#AE1C28', '#FFFFFF', '#21468B']),
 be: () => vBands(['#000000', '#FAE042', '#ED2939']),
 lu: () => hBands(['#EF3340', '#FFFFFF', '#00A3E0']),
 at: () => hBands(['#C8102E', '#FFFFFF', '#C8102E']),
 ie: () => vBands(['#169B62', '#FFFFFF', '#FF883E']),
 pl: () => hBands(['#FFFFFF', '#DC143C']),
 cz: () => <>{hBands(['#FFFFFF', '#D7141A'])}<polygon points="0,0 45,30 0,60" fill="#11457E"/></>,
 sk: uid => <>{hBands(['#FFFFFF', '#0B4EA2', '#EE1C25'])}<SlovakArms uid={uid}/></>,
 hu: () => hBands(['#CE2939', '#FFFFFF', '#477050']),
 ro: () => vBands(['#002B7F', '#FCD116', '#CE1126']),
 bg: () => hBands(['#FFFFFF', '#00966E', '#D62612']),
 gr: () => <>{hBands(Array.from({length: 9}, (_, i) => i % 2 ? '#FFFFFF' : '#0D5EAF'))}
  <rect width={f(H * 5 / 9)} height={f(H * 5 / 9)} fill="#0D5EAF"/>
  <path d={`M${f(H * 5 / 18)} 0V${f(H * 5 / 9)}M0 ${f(H * 5 / 18)}H${f(H * 5 / 9)}`} stroke="#FFFFFF" strokeWidth={f(H / 9)}/></>,
 hr: uid => <>{hBands(['#FF0000', '#FFFFFF', '#171796'])}<CroatianArms uid={uid}/></>,
 rs: () => <>{hBands(['#C6363C', '#0C4076', '#FFFFFF'])}
  <Eagle double x={32} y={31} scale={.72} fill="#FFFFFF" stroke="#8A6A16"/>
  <path d={shieldPath(32, 26, 8.5, 11)} fill="#C6363C" stroke="#F0C34E" strokeWidth={.4}/>
  <path d="M32 27V36M28.5 30.5H35.5" stroke="#FFFFFF" strokeWidth={1.2}/>
  <path d="M27 15.6L27.6 12.4L29.8 14L32 11.6L34.2 14L36.4 12.4L37 15.6Z" fill="#F0C34E"/></>,
 ba: () => <>{field('#002395')}<polygon points="15,0 75,0 75,60" fill="#FECB00"/>
  {Array.from({length: 9}, (_, i) => <Star key={i} x={f(7 + i * 7.5)} y={f(i * 7.5)} r={4} fill="#FFFFFF"/>)}</>,
 me: () => <>{field('#D3AE3B')}<rect x={3} y={3} width={84} height={54} fill="#C40308"/>
  <Eagle double x={45} y={32.5} scale={1.05} fill="#D3AE3B"/>
  <path d="M39.6 11.8L40.2 8.6L42.6 10.2L45 7.6L47.4 10.2L49.8 8.6L50.4 11.8Z" fill="#D3AE3B"/>
  <path d={shieldPath(45, 27, 8.6, 11)} fill="#1D5E91" stroke="#D3AE3B" strokeWidth={.6}/>
  <path d="M41.6 33.4H48.4" stroke="#2E7D32" strokeWidth={1.4}/><path d="M42.4 32.4Q45 28.6 47.6 32.4Z" fill="#D3AE3B"/></>,
 al: () => <>{field('#E41E20')}<Eagle double x={45} y={30} scale={1.2} fill="#000000"/></>,
 mk: () => <>{field('#D20000')}
  <path d="M45 30L0 24V36ZM45 30L90 24V36ZM45 30L39 0H51ZM45 30L39 60H51ZM45 30L13 0H0V8ZM45 30L77 0H90V8ZM45 30L13 60H0V52ZM45 30L77 60H90V52Z" fill="#FFE600"/>
  <circle cx={45} cy={30} r={10} fill="#D20000"/><circle cx={45} cy={30} r={8.4} fill="#FFE600"/></>,
 md: () => <>{vBands(['#0046AE', '#FFD200', '#CC092F'])}
  <Eagle x={45} y={29} scale={.62} fill="#B07E3E"/>
  <path d={shieldPath(45, 26, 7.4, 9.5)} fill="#CC092F"/>
  <path d="M41.3 31.22H48.7Q48.7 34.55 45 35.5Q41.3 34.55 41.3 31.22Z" fill="#0046AE"/>
  <circle cx={45} cy={29.4} r={1.5} fill="#FFD200"/></>,
 ua: () => hBands(['#0057B7', '#FFD700']),
 by: () => <>{hBands(['#C8313E', '#4AA657'], [2, 1])}<rect width={10} height={H} fill="#FFFFFF"/>
  {Array.from({length: 6}, (_, i) => <polygon key={i} points={`5,${2 + i * 10} 9,${7 + i * 10} 5,${12 + i * 10} 1,${7 + i * 10}`} fill="#C8313E"/>)}
  {Array.from({length: 6}, (_, i) => <polygon key={`w${i}`} points={`5,${f(4.6 + i * 10)} 7,${7 + i * 10} 5,${f(9.4 + i * 10)} 3,${7 + i * 10}`} fill="#FFFFFF"/>)}</>,
 lt: () => hBands(['#FDB913', '#006A44', '#C1272D']),
 lv: () => hBands(['#9E3039', '#FFFFFF', '#9E3039'], [2, 1, 2]),
 ee: () => hBands(['#0072CE', '#000000', '#FFFFFF']),
 fi: () => <Nordic fill="#FFFFFF" cross="#002F6C" x={32} width={16}/>,
 se: () => <Nordic fill="#006AA7" cross="#FECC00" x={34} width={12}/>,
 no: () => <Nordic fill="#BA0C2F" cross="#FFFFFF" inner="#00205B" x={32.5} width={15} innerWidth={7.5}/>,
 dk: () => <Nordic fill="#C8102E" cross="#FFFFFF" x={31.5} width={8.6}/>,
 is: () => <Nordic fill="#02529C" cross="#FFFFFF" inner="#DC1E35" x={32.4} width={13.3} innerWidth={6.7}/>,
 ru: () => hBands(['#FFFFFF', '#0039A6', '#D52B1E']),
 // Asia
 kr: () => <>{field('#FFFFFF')}
  <g transform={`translate(45 30) rotate(${f(DIAG)})`}>
   <circle r={15} fill="#0047A0"/>
   <path d="M-15 0A15 15 0 0 1 15 0A7.5 7.5 0 0 0 0 0A7.5 7.5 0 0 1-15 0Z" fill="#CD2E3A"/>
  </g>
  <Trigram angle={180 + DIAG} bars={[true, true, true]}/><Trigram angle={-DIAG} bars={[false, true, false]}/>
  <Trigram angle={DIAG} bars={[false, false, false]}/><Trigram angle={180 - DIAG} bars={[true, false, true]}/></>,
 kp: () => <>{hBands(['#024FA2', '#FFFFFF', '#ED1C27', '#FFFFFF', '#024FA2'], [6, 1, 22, 1, 6])}
  <circle cx={30} cy={30} r={11} fill="#FFFFFF"/><Star x={30} y={30.8} r={10.5} fill="#ED1C27"/></>,
 mn: () => <>{vBands(['#C4272F', '#015197', '#C4272F'])}<Soyombo x={15}/></>,
 in: () => <>{hBands(['#FF9933', '#FFFFFF', '#138808'])}
  <circle cx={45} cy={30} r={7.4} fill="none" stroke="#000080" strokeWidth={1.1}/><circle cx={45} cy={30} r={1.4} fill="#000080"/>
  <path d={Array.from({length: 24}, (_, i) => {const a = i * Math.PI / 12; return `M45 30L${f(45 + Math.cos(a) * 7)} ${f(30 + Math.sin(a) * 7)}`;}).join('')} stroke="#000080" strokeWidth={.45}/></>,
 pk: () => <>{field('#01411C')}<rect width={22.5} height={H} fill="#FFFFFF"/>
  <Crescent x={57} y={31} R={16} r={14} d={5} angle={-45} fill="#FFFFFF"/>
  <Star x={65.5} y={22.5} r={5.5} rotate={45} fill="#FFFFFF"/></>,
 bd: () => <>{field('#006A4E')}<circle cx={40.5} cy={30} r={19} fill="#F42A41"/></>,
 bt: () => <>{field('#FF4E12')}<polygon points="0,0 90,0 0,60" fill="#FFD520"/><Dragon/></>,
 ir: () => <>{hBands(['#239F40', '#FFFFFF', '#DA0000'])}
  <path d="M0 18.9H90M0 41.1H90" stroke="#FFFFFF" strokeWidth={1.1} strokeDasharray="2.4 1.6" strokeOpacity={.85}/><IranEmblem/></>,
 iq: () => <>{hBands(['#CE1126', '#FFFFFF', '#000000'])}
  <text x={45} y={34} textAnchor="middle" fontSize={11} fontWeight={700} fill="#007A3D" fontFamily={ARABIC} direction="rtl">الله أكبر</text></>,
 sa: () => <>{field('#006C35')}
  <text x={45} y={28} textAnchor="middle" fontSize={9} fontWeight={700} fill="#FFFFFF" fontFamily={ARABIC} direction="rtl" textLength={58} lengthAdjust="spacingAndGlyphs">لا إله إلا الله محمد رسول الله</text>
  <path d="M20 40.6Q40 39.2 61 39.4V41.2Q40 41.2 20 40.6Z" fill="#FFFFFF"/>
  <rect x={61} y={37.8} width={1.4} height={4.8} fill="#FFFFFF"/><rect x={62.4} y={39.5} width={5.6} height={1.6} rx={.6} fill="#FFFFFF"/></>,
 jo: () => <>{hBands(['#000000', '#FFFFFF', '#007A3D'])}<polygon points="0,0 45,30 0,60" fill="#CE1126"/>
  <Star x={15} y={30} r={4.6} points={7} fill="#FFFFFF"/></>,
 sy: () => <>{hBands(['#007A3D', '#FFFFFF', '#000000'])}
  {[22.5, 45, 67.5].map(x => <Star key={x} x={x} y={30.5} r={5.6} fill="#CE1126"/>)}</>,
 lb: () => <>{hBands(['#ED1C24', '#FFFFFF', '#ED1C24'], [1, 2, 1])}
  <polygon points="45,16.5 49.5,22 47.4,22 53.5,28 50.6,28 57.5,34 53.6,34 60.5,39.5 46.6,39.5 46.6,43.2 43.4,43.2 43.4,39.5 29.5,39.5 36.4,34 32.5,34 39.4,28 36.5,28 42.6,22 40.5,22" fill="#00A651"/></>,
 ae: () => <>{hBands(['#00732F', '#FFFFFF', '#000000'])}<rect width={22.5} height={H} fill="#FF0000"/></>,
 tr: () => <>{field('#E30A17')}<Crescent x={30} y={30} R={15} r={12} d={3.75} fill="#FFFFFF"/>
  <Star x={50.6} y={30} r={7.5} rotate={-90} fill="#FFFFFF"/></>,
 am: () => hBands(['#D90012', '#0033A0', '#F2A800']),
 az: () => <>{hBands(['#00B5E2', '#EF3340', '#509E2F'])}<Crescent x={42.5} y={30} R={7.5} r={6.2} d={1.9} fill="#FFFFFF"/>
  <Star x={49} y={30} r={3.6} points={8} inner={.55} fill="#FFFFFF"/></>,
 ge: () => <>{field('#FFFFFF')}<path d="M45 0V60M0 30H90" stroke="#FF0000" strokeWidth={12}/>
  {[[19.5, 12], [70.5, 12], [19.5, 48], [70.5, 48]].map(([x, y]) => <polygon key={`${x}-${y}`} points={pattee(x, y, 6.4, 1.2, 2.8)} fill="#FF0000"/>)}</>,
 kz: () => <>{field('#00AFCA')}<polygon points={starPoints(48, 24, 12, 32, .72)} fill="#FEC50C"/>
  <circle cx={48} cy={24} r={8.2} fill="#00AFCA"/><circle cx={48} cy={24} r={7.2} fill="#FEC50C"/>
  <path d="M31 42Q39 32.5 48 38Q57 32.5 65 42Q57 37.6 48 41.6Q39 37.6 31 42Z" fill="#FEC50C"/><KazakhOrnament/></>,
 kg: () => <>{field('#E8112D')}<polygon points={starPoints(45, 30, 15.5, 40, .66)} fill="#FFEF00"/>
  <circle cx={45} cy={30} r={9.2} fill="#FFEF00"/><circle cx={45} cy={30} r={6.6} fill="none" stroke="#E8112D" strokeWidth={1.3}/>
  <path d="M41.5 25.2Q45 30 41.5 34.8M48.5 25.2Q45 30 48.5 34.8M39.2 28.2Q45 31.4 50.8 28.2M39.2 31.8Q45 28.6 50.8 31.8" fill="none" stroke="#E8112D" strokeWidth={1}/></>,
 tm: () => <>{field('#00843D')}<rect x={9} width={14} height={H} fill="#D22630"/>
  {Array.from({length: 5}, (_, i) => <Gul key={i} x={16} y={7 + i * 11.5}/>)}
  <Crescent x={32} y={12} R={6} r={5.2} d={2.1} angle={-20} fill="#FFFFFF"/>
  {[[38, 6.8], [41.6, 9.4], [42.6, 13.6], [37.6, 11.6], [38.8, 16.2]].map(([x, y]) => <Star key={`${x}-${y}`} x={x} y={y} r={1.5} fill="#FFFFFF"/>)}</>,
 uz: () => <>{hBands(['#0099B5', '#CE1126', '#FFFFFF', '#CE1126', '#1EB53A'], [19, 1, 18, 1, 19])}
  <Crescent x={15} y={10} R={6.3} r={5.4} d={2.3} fill="#FFFFFF"/>
  {[[3, 5], [4, 9.6], [5, 14.2]].flatMap(([count, y]) => Array.from({length: count}, (_, i) => <Star key={`${y}-${i}`} x={f(38 - i * 4.4)} y={y} r={1.35} fill="#FFFFFF"/>))}</>,
 vn: () => <>{field('#DA251D')}<Star x={45} y={31.5} r={18} fill="#FFFF00"/></>,
 th: () => hBands(['#A51931', '#F4F5F8', '#2D2A4A', '#F4F5F8', '#A51931'], [1, 1, 2, 1, 1]),
 mm: () => <>{hBands(['#FECB00', '#34B233', '#EA2839'])}<Star x={45} y={32} r={20} fill="#FFFFFF"/></>,
 kh: () => <>{hBands(['#032EA1', '#E00025', '#032EA1'], [1, 2, 1])}<AngkorWat/></>,
 la: () => <>{hBands(['#CE1126', '#002868', '#CE1126'], [1, 2, 1])}<circle cx={45} cy={30} r={12} fill="#FFFFFF"/></>,
 my: () => <>{hBands(Array.from({length: 14}, (_, i) => i % 2 ? '#FFFFFF' : '#CC0001'))}
  <rect width={45} height={f(H * 8 / 14)} fill="#010066"/>
  <Crescent x={14.5} y={17.1} R={11} r={9.2} d={3.4} fill="#FFCC00"/>
  <Star x={31} y={17.1} r={9.5} points={14} inner={.48} fill="#FFCC00"/></>,
 sg: () => <>{hBands(['#EF3340', '#FFFFFF'])}<Crescent x={15} y={15} R={10} r={9.2} d={3.8} fill="#FFFFFF"/>
  {[0, 1, 2, 3, 4].map(i => {const a = (i * 72 - 90) * Math.PI / 180; return <Star key={i} x={f(25.5 + Math.cos(a) * 5)} y={f(15.5 + Math.sin(a) * 5)} r={1.9} fill="#FFFFFF"/>;})}</>,
 id: () => hBands(['#FF0000', '#FFFFFF']),
 ph: () => <>{hBands(['#0038A8', '#CE1126'])}<polygon points="0,0 51.96,30 0,60" fill="#FFFFFF"/><PhilippineSun/></>,
 // Africa
 eg: () => <>{hBands(['#CE1126', '#FFFFFF', '#000000'])}<Eagle x={45} y={30} scale={.48} fill="#C09300"/>
  <rect x={43.5} y={28.2} width={3} height={3.4} fill="#FFFFFF" stroke="#C09300" strokeWidth={.3}/></>,
 ly: () => <>{hBands(['#E70013', '#000000', '#239E46'], [1, 2, 1])}<Crescent x={42.5} y={30} R={7.5} r={6} d={2.6} fill="#FFFFFF"/>
  <Star x={50.5} y={30} r={3.9} rotate={-90} fill="#FFFFFF"/></>,
 dz: () => <>{vBands(['#006233', '#FFFFFF'])}<Crescent x={45} y={30} R={15} r={12.5} d={4} fill="#D21034"/>
  <Star x={52.5} y={30} r={7.5} rotate={-90} fill="#D21034"/></>,
 ma: () => <>{field('#C1272D')}<Pentagram x={45} y={31} r={14} stroke="#006233" width={2.2}/></>,
 tn: () => <>{field('#E70013')}<circle cx={45} cy={30} r={15} fill="#FFFFFF"/>
  <Crescent x={43} y={30} R={11.2} r={9.1} d={3.1} fill="#E70013"/><Star x={48.6} y={30} r={6.6} rotate={-90} fill="#E70013"/></>,
 sd: () => <>{hBands(['#D21034', '#FFFFFF', '#000000'])}<polygon points="0,0 30,30 0,60" fill="#007229"/></>,
 et: () => <>{hBands(['#078930', '#FCDD09', '#DA121A'])}<circle cx={45} cy={30} r={13.5} fill="#0F47AF"/>
  <Pentagram x={45} y={30.6} r={10} stroke="#FCDD09" width={1.25}/>
  <path d={Array.from({length: 5}, (_, i) => {const a = (i * 72 + 90) * Math.PI / 180; return `M${f(45 + Math.cos(a) * 4.6)} ${f(30.6 + Math.sin(a) * 4.6)}L${f(45 + Math.cos(a) * 11)} ${f(30.6 + Math.sin(a) * 11)}`;}).join('')} stroke="#FCDD09" strokeWidth={.8}/></>,
 er: () => <><polygon points="0,0 90,0 90,30" fill="#12AD2B"/><polygon points="0,60 90,60 90,30" fill="#4189DD"/>
  <polygon points="0,0 90,30 0,60" fill="#EA0437"/><EritreaWreath/></>,
 dj: () => <>{hBands(['#6AB2E7', '#12AD2B'])}<polygon points="0,0 40,30 0,60" fill="#FFFFFF"/><Star x={13.5} y={30.5} r={5.2} fill="#D7141A"/></>,
 so: () => <>{field('#4189DD')}<Star x={45} y={31} r={13} fill="#FFFFFF"/></>,
 ke: () => <>{hBands(['#000000', '#FFFFFF', '#BB0000', '#FFFFFF', '#006600'], [6, 1, 6, 1, 6])}<MaasaiShield/></>,
 ug: () => <>{hBands(['#000000', '#FCDC04', '#D90000', '#000000', '#FCDC04', '#D90000'])}<circle cx={45} cy={30} r={10.5} fill="#FFFFFF"/><Crane/></>,
 tz: () => <>{field('#1EB53A')}<polygon points="0,60 90,0 90,60" fill="#00A3DD"/>
  <path d="M0 60L90 0" stroke="#FCD116" strokeWidth={19}/><path d="M0 60L90 0" stroke="#000000" strokeWidth={13}/></>,
 bi: () => <>{field('#CE1126')}<polygon points="0,0 45,30 0,60" fill="#1EB53A"/><polygon points="90,0 45,30 90,60" fill="#1EB53A"/>
  <path d="M0 0L90 60M90 0L0 60" stroke="#FFFFFF" strokeWidth={8}/><circle cx={45} cy={30} r={13.5} fill="#FFFFFF"/>
  {[[45, 24.2], [40, 33.2], [50, 33.2]].map(([x, y]) => <Star key={`${x}-${y}`} x={x} y={y} r={4.2} points={6} inner={.55} fill="#CE1126" stroke="#1EB53A"/>)}</>,
 cd: () => <>{field('#007FFF')}<path d="M0 60L90 0" stroke="#F7D618" strokeWidth={19}/><path d="M0 60L90 0" stroke="#CE1021" strokeWidth={13}/>
  <Star x={14} y={13} r={9} fill="#F7D618"/></>,
 cg: () => <>{field('#FBDE4A')}<polygon points="0,0 60,0 0,60" fill="#009543"/><polygon points="90,0 90,60 30,60" fill="#DC241F"/></>,
 cm: () => <>{vBands(['#007A5E', '#CE1126', '#FCD116'])}<Star x={45} y={30.6} r={8} fill="#FCD116"/></>,
 cf: () => <>{hBands(['#003082', '#FFFFFF', '#289728', '#FFCE00'])}<rect x={37.5} width={15} height={H} fill="#D21034"/>
  <Star x={13.5} y={7.6} r={5.2} fill="#FFCE00"/></>,
 ng: () => vBands(['#008751', '#FFFFFF', '#008751']),
 ne: () => <>{hBands(['#E05206', '#FFFFFF', '#0DB02B'])}<circle cx={45} cy={30} r={8} fill="#E05206"/></>,
 ml: () => vBands(['#14B53A', '#FCD116', '#CE1126']),
 mr: () => <>{hBands(['#D01C1F', '#00A95C', '#D01C1F'], [3, 14, 3])}<Crescent x={45} y={31} R={15} r={14.5} d={6.5} angle={-90} fill="#FFD700"/>
  <Star x={45} y={23} r={6.4} fill="#FFD700"/></>,
 sn: () => <>{vBands(['#00853F', '#FDEF42', '#E31B23'])}<Star x={45} y={30.8} r={8.5} fill="#00853F"/></>,
 gn: () => vBands(['#CE1126', '#FCD116', '#009460']),
 ci: () => vBands(['#F77F00', '#FFFFFF', '#009E60']),
 gh: () => <>{hBands(['#CE1126', '#FCD116', '#006B3F'])}<Star x={45} y={30.9} r={9.6} fill="#000000"/></>,
 bf: () => <>{hBands(['#EF2B2D', '#009E49'])}<Star x={45} y={30.9} r={9} fill="#FCD116"/></>,
 bj: () => <>{hBands(['#FCD116', '#E8112D'])}<rect width={36} height={H} fill="#008751"/></>,
 lr: () => <>{hBands(Array.from({length: 11}, (_, i) => i % 2 ? '#FFFFFF' : '#BF0A30'))}
  <rect width={f(H * 5 / 11)} height={f(H * 5 / 11)} fill="#002868"/><Star x={f(H * 5 / 22)} y={f(H * 5 / 22 + .6)} r={8.4} fill="#FFFFFF"/></>,
 ao: () => <>{hBands(['#CC092F', '#000000'])}<AngolaEmblem/></>,
 na: () => <>{field('#009543')}<polygon points="0,0 90,0 0,60" fill="#003580"/>
  <path d="M0 60L90 0" stroke="#FFFFFF" strokeWidth={19}/><path d="M0 60L90 0" stroke="#D21034" strokeWidth={14}/>
  <polygon points={starPoints(15.5, 13.5, 8, 12, .6)} fill="#FFCE00"/><circle cx={15.5} cy={13.5} r={4.5} fill="#003580"/><circle cx={15.5} cy={13.5} r={3.8} fill="#FFCE00"/></>,
 bw: () => <>{field('#6DA9D2')}<rect y={22.5} width={W} height={15} fill="#FFFFFF"/><rect y={25} width={W} height={10} fill="#000000"/></>,
 za: () => <>{hBands(['#E03C31', '#001489'])}
  <path d="M0 0L33 30L0 60M33 30H90" fill="none" stroke="#FFFFFF" strokeWidth={20}/>
  <path d="M0 0L33 30L0 60M33 30H90" fill="none" stroke="#007749" strokeWidth={12}/>
  <polygon points="0,8.1 24.1,30 0,51.9" fill="#FFB81C"/><polygon points="0,13.5 18.1,30 0,46.5" fill="#000000"/></>,
 ls: () => <>{hBands(['#00209F', '#FFFFFF', '#009543'], [3, 4, 3])}
  <path d="M45 20.6L46.4 22.6L50.6 31.2Q53.8 33.2 54.6 36.4Q45 34.6 35.4 36.4Q36.2 33.2 39.4 31.2L43.6 22.6Z" fill="#000000"/>
  <circle cx={45} cy={20.4} r={1.2} fill="#000000"/></>,
 mz: () => <>{hBands(['#007168', '#FFFFFF', '#000000', '#FFFFFF', '#FCE100'], [5, .5, 5, .5, 5])}
  <polygon points="0,0 36,30 0,60" fill="#D21034"/><Star x={13.5} y={30.5} r={9.4} fill="#FCE100"/>
  <path d="M8.6 32.2H18.4V35.8H8.6Z" fill="#FFFFFF" stroke="#000000" strokeWidth={.35}/><path d="M13.5 32.2V35.8" stroke="#000000" strokeWidth={.3}/>
  <path d="M8.5 37.2L18.6 25.4M18.5 37.2L8.4 25.4" stroke="#000000" strokeWidth={.9}/><path d="M7.4 24.6L9.8 23.6L9.4 26.4Z" fill="#000000"/></>,
 mw: () => <>{field('#000000')}<polygon points={starPoints(45, 20, 13.5, 62, .62)} fill="#CE1126"/><circle cx={45} cy={20} r={8} fill="#CE1126"/>
  <rect y={20} width={W} height={40} fill="#CE1126"/><rect y={40} width={W} height={20} fill="#339E35"/></>,
 // Americas
 ca: () => <>{vBands(['#D80621', '#FFFFFF', '#D80621'], [1, 2, 1])}<polygon points={MAPLE} fill="#D80621"/></>,
 mx: () => <>{vBands(['#006847', '#FFFFFF', '#CE1126'])}<MexicoArms/></>,
 gt: () => <>{vBands(['#4997D0', '#FFFFFF', '#4997D0'])}<GuatemalaArms/></>,
 bz: () => <>{field('#CE1126')}<rect y={6} width={W} height={48} fill="#003F87"/><BelizeArms/></>,
 hn: () => <>{hBands(['#0073CF', '#FFFFFF', '#0073CF'])}
  {[[45, 30], [36, 26], [36, 34], [54, 26], [54, 34]].map(([x, y]) => <Star key={`${x}-${y}`} x={x} y={y + .3} r={2.8} fill="#0073CF"/>)}</>,
 cr: () => <>{hBands(['#002B7F', '#FFFFFF', '#CE1126', '#FFFFFF', '#002B7F'], [1, 1, 2, 1, 1])}
  <ellipse cx={30} cy={30} rx={6} ry={7.4} fill="#FFFFFF" stroke="#F2B90C" strokeWidth={.6}/>
  <path d="M24.6 31.5L27.4 27.5L30 30L32.6 26.5L35.4 31.5Z" fill="#2E7D32"/><path d="M24.4 31.5H35.6V33.4Q30 37.2 24.4 33.4Z" fill="#2F6FB5"/></>,
 pa: () => <>{field('#FFFFFF')}<rect x={45} width={45} height={30} fill="#D21034"/><rect y={30} width={45} height={30} fill="#005293"/>
  <Star x={22.5} y={15.6} r={7} fill="#005293"/><Star x={67.5} y={45.6} r={7} fill="#D21034"/></>,
 cu: () => <>{hBands(['#002A8F', '#FFFFFF', '#002A8F', '#FFFFFF', '#002A8F'])}<polygon points="0,0 51.96,30 0,60" fill="#CF142B"/>
  <Star x={17.3} y={30.8} r={8.6} fill="#FFFFFF"/></>,
 jm: () => <>{field('#009B3A')}<polygon points="0,0 45,30 0,60" fill="#000000"/><polygon points="90,0 45,30 90,60" fill="#000000"/>
  <path d="M0 0L90 60M90 0L0 60" stroke="#FED100" strokeWidth={9}/></>,
 co: () => hBands(['#FCD116', '#003893', '#CE1126'], [2, 1, 1]),
 ve: () => <>{hBands(['#FFCC00', '#00247D', '#CF142B'])}
  {Array.from({length: 8}, (_, k) => {const a = (-160 + k * 20) * Math.PI / 180; return <Star key={k} x={f(45 + Math.cos(a) * 16)} y={f(38 + Math.sin(a) * 16)} r={2.1} fill="#FFFFFF"/>;})}</>,
 gy: () => <>{field('#009E49')}<polygon points="0,0 90,30 0,60" fill="#FFFFFF"/><polygon points="0,2.4 84.5,30 0,57.6" fill="#FCD116"/>
  <polygon points="0,0 45,30 0,60" fill="#000000"/><polygon points="0,2.6 41,30 0,57.4" fill="#CE1126"/></>,
 ec: () => <>{hBands(['#FFDD00', '#034EA2', '#ED1C24'], [2, 1, 1])}<EcuadorArms/></>,
 pe: () => vBands(['#D91023', '#FFFFFF', '#D91023']),
 bo: () => hBands(['#D52B1E', '#F9E300', '#007934']),
 br: uid => <>{field('#009C3B')}<polygon points="7.7,30 45,7.3 82.3,30 45,52.7" fill="#FFDF00"/><BrazilGlobe uid={uid}/></>,
 ar: () => <>{hBands(['#74ACDF', '#FFFFFF', '#74ACDF'])}<Sun x={45} y={30} r={4.4} long={8.6} short={7.2} rays={32} fill="#F6B40E" stroke="#85340A"/></>,
 cl: () => <>{hBands(['#FFFFFF', '#D52B1E'])}<rect width={30} height={30} fill="#0039A6"/><Star x={15} y={15.6} r={7} fill="#FFFFFF"/></>,
 uy: () => <>{hBands(Array.from({length: 9}, (_, i) => i % 2 ? '#0038A8' : '#FFFFFF'))}<rect width={f(H * 5 / 9)} height={f(H * 5 / 9)} fill="#FFFFFF"/>
  <Sun x={f(H * 5 / 18)} y={f(H * 5 / 18)} r={5} long={11} short={9.4} rays={32} fill="#FCD116" stroke="#7B3F00"/></>,
 // Oceania
 au: () => <>{field('#012169')}<UnionJack w={45} h={30}/><Star x={22.5} y={45} r={9} points={7} inner={.44} fill="#FFFFFF"/>
  {[[67.5, 50], [56.2, 27], [67.5, 10], [76.5, 22]].map(([x, y]) => <Star key={`${x}-${y}`} x={x} y={y} r={4.3} points={7} inner={.44} fill="#FFFFFF"/>)}
  <Star x={73} y={33.5} r={2.5} inner={.42} fill="#FFFFFF"/></>,
 nz: () => <>{field('#012169')}<UnionJack w={45} h={30}/>
  {[[67.5, 48, 4.6], [57.4, 28.5, 4.2], [67.5, 13, 3.9], [77, 25, 3.4]].map(([x, y, r]) => <g key={`${x}-${y}`}>
   <Star x={x} y={y} r={r + 1.1} fill="#FFFFFF"/><Star x={x} y={y} r={r} fill="#C8102E"/></g>)}</>,
};
