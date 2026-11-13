import { type Flag, type FlagShape } from '../game/flags.ts';
import type { Language } from './i18n.ts';
import {useId,type CSSProperties} from 'react';
import {clothStrips,CLOTH_PERIOD,CLOTH_SEAM,CLOTH_STRIP_WIDTH,CLOTH_WAVELENGTH,CREASE_STOPS} from './flagCloth.ts';
export const FLAG_NAMES={cn:['中国','China'],fr:['法国','France'],de:['德国','Germany'],it:['意大利','Italy'],jp:['日本','Japan'],gb:['英国','United Kingdom'],us:['美国','United States'],ch:['瑞士','Switzerland']} as const;
export const PATTERN_NAMES={solid:['纯色','Solid'],horizontal:['横三色','Horizontal stripes'],vertical:['竖三色','Vertical stripes'],cross:['十字','Cross']} as const;
export function flagName(flag:Flag,language:Language){return flag.type==='preset'?FLAG_NAMES[flag.id][language==='zh'?0:1]:language==='zh'?'自定义旗帜':'Custom flag';}
function Stripes({colors,vertical=false}:{colors:readonly string[];vertical?:boolean}){return <>{colors.map((fill,i)=><rect key={i} x={vertical?i*90/colors.length:0} y={vertical?0:i*60/colors.length} width={vertical?90/colors.length:90} height={vertical?60:60/colors.length} fill={fill}/>)}</>;}
function Star({x,y,r=7,angle=0}:{x:number;y:number;r?:number;angle?:number}){return <polygon fill="#ffde00" transform={`rotate(${angle} ${x} ${y})`} points={Array.from({length:10},(_,i)=>{const a=i*Math.PI/5-Math.PI/2,d=i%2?r*.382:r;return `${x+Math.cos(a)*d},${y+Math.sin(a)*d}`;}).join(' ')}/>;}
export function FlagShapeArt({shape:s}:{shape:FlagShape}){
 if(s.kind==='rect')return <rect x={s.x} y={s.y} width={s.width} height={s.height} fill={s.color}/>;
 if(s.kind==='circle')return <circle cx={s.x+s.width/2} cy={s.y+s.height/2} r={s.width/2} fill={s.color}/>;
 const points=s.kind==='triangle'?`${s.x+s.width/2},${s.y} ${s.x+s.width},${s.y+s.height} ${s.x},${s.y+s.height}`:Array.from({length:10},(_,i)=>{const a=i*Math.PI/5-Math.PI/2,r=i%2?.382:1;return `${s.x+s.width/2+Math.cos(a)*s.width/2*r},${s.y+s.height/2+Math.sin(a)*s.height/2*r}`;}).join(' ');
 return <polygon points={points} fill={s.color}/>;
}
export function FlagImage({flag,language,cloth=true}:{flag:Flag;language:Language;cloth?:boolean}){
 const id=`flag-${useId().replace(/:/g,'')}`;
 let art;
 if(flag.type==='custom'){const c=flag.colors;art=flag.pattern==='solid'?<rect width="90" height="60" fill={c[0]}/>:flag.pattern==='cross'?<><rect width="90" height="60" fill={c[0]}/><path d="M0 30H90M32 0V60" stroke={c[1]} strokeWidth="18"/><path d="M0 30H90M32 0V60" stroke={c[2]} strokeWidth="9"/></>:<Stripes colors={c} vertical={flag.pattern==='vertical'}/>;}
 else switch(flag.id){
 case 'fr':art=<Stripes colors={['#002654','#ffffff','#ed2939']} vertical/>;break;
 case 'it':art=<Stripes colors={['#009246','#ffffff','#ce2b37']} vertical/>;break;
 case 'de':art=<Stripes colors={['#000000','#dd0000','#ffce00']}/>;break;
 case 'jp':art=<><rect width="90" height="60" fill="#ffffff"/><circle cx="45" cy="30" r="18" fill="#bc002d"/></>;break;
 case 'cn':art=<><rect width="90" height="60" fill="#de2910"/><Star x={15} y={15} r={9}/>{[[30,6,23],[36,12,46],[36,21,70],[30,27,23]].map(([x,y,angle])=><Star key={y} x={x} y={y} r={3} angle={angle}/>)}</>;break;
 case 'ch':art=<><rect width="90" height="60" fill="#da291c"/><path d="M45 12V48M27 30H63" stroke="white" strokeWidth="12"/></>;break;
 case 'gb':art=<><rect width="90" height="60" fill="#012169"/><path d="M0 0L90 60M90 0L0 60" stroke="white" strokeWidth="12"/><path d="M0 0L90 60M90 0L0 60" stroke="#c8102e" strokeWidth="5"/><path d="M45 0V60M0 30H90" stroke="white" strokeWidth="20"/><path d="M45 0V60M0 30H90" stroke="#c8102e" strokeWidth="12"/></>;break;
 case 'us':art=<><Stripes colors={Array.from({length:13},(_,i)=>i%2?'#ffffff':'#b22234')}/><rect width="36" height={60*7/13} fill="#3c3b6e"/>{Array.from({length:9},(_,row)=>Array.from({length:row%2?5:6},(_,col)=><text key={`${row}-${col}`} x={row%2?6+col*6:3+col*6} y={3.5+row*3.5} fontSize="4" textAnchor="middle" fill="white">★</text>))}</>;break;
 }
 const content=<>{art}{flag.type==='custom'&&flag.shapes?.map((shape,i)=><FlagShapeArt key={i} shape={shape}/>)}</>;
 if(!cloth)return <svg className="player-flag" viewBox="0 0 90 60" role="img" aria-label={flagName(flag,language)}><title>{flagName(flag,language)}</title>{content}</svg>;
 return <svg className="player-flag is-cloth" viewBox="-4 -7 99 74" role="img" aria-label={flagName(flag,language)}><title>{flagName(flag,language)}</title>
  <defs>
   {/* The flat artwork is drawn once and reused by every cloth strip. */}
   <g id={`${id}-art`}>
    <g clipPath={`url(#${id}-clip)`}>{content}</g>
    <rect width="90" height="60" fill={`url(#${id}-fold)`}/>
    <rect x=".3" y=".3" width="89.4" height="59.4" fill="none" stroke="#fff" strokeOpacity=".14" strokeWidth=".6"/>
   </g>
   <clipPath id={`${id}-clip`}><rect width="90" height="60"/></clipPath>
   <linearGradient id={`${id}-fold`} x1="0" y1="0" x2="0" y2="60" gradientUnits="userSpaceOnUse">
    <stop offset="0" stopColor="#fff" stopOpacity=".16"/><stop offset=".22" stopColor="#fff" stopOpacity="0"/>
    <stop offset=".78" stopColor="#000" stopOpacity="0"/><stop offset="1" stopColor="#000" stopOpacity=".24"/>
   </linearGradient>
   {CLOTH_STRIPS.map(strip=><clipPath key={strip.index} id={`${id}-strip-${strip.index}`}><rect x={strip.x-CLOTH_SEAM} y="-12" width={CLOTH_STRIP_WIDTH+CLOTH_SEAM*2} height="84"/></clipPath>)}
   {/* Shading uses exact, non-overlapping columns so seams are never shaded twice. */}
   {CLOTH_STRIPS.map(strip=><clipPath key={strip.index} id={`${id}-column-${strip.index}`}><rect x={strip.x} y="-12" width={CLOTH_STRIP_WIDTH} height="84"/></clipPath>)}
   {/* One continuous crease pattern, one wavelength per repeat: dark on the slopes facing away from the light, a glint on the crests. */}
   <linearGradient id={`${id}-creases`} x1="0" y1="0" x2={CLOTH_WAVELENGTH} y2="0" gradientUnits="userSpaceOnUse" spreadMethod="repeat">
    {CREASE_STOPS.map(([offset,color,opacity])=><stop key={offset} offset={offset} stopColor={color} stopOpacity={opacity}/>)}
   </linearGradient>
   {/* A hair of blur closes strip seams and softens the stepped edge. */}
   <filter id={`${id}-weave`} x="-5" y="-8" width="100" height="76" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
    <feGaussianBlur in="SourceGraphic" stdDeviation=".16"/>
   </filter>
  </defs>
  <g className="flag-cloth" filter={`url(#${id}-weave)`}>
   {CLOTH_STRIPS.map(strip=><g key={strip.index} clipPath={`url(#${id}-strip-${strip.index})`}>
    <g className="flag-strip" style={strip.style}>
     <use href={`#${id}-art`}/>
     <g clipPath={`url(#${id}-column-${strip.index})`}><rect className="flag-creases" x={-CLOTH_WAVELENGTH} y="0" width={90+CLOTH_WAVELENGTH*2} height="60" fill={`url(#${id}-creases)`}/></g>
    </g>
   </g>)}
  </g>
  <path className="flag-hoist" d="M.4 -.6V60.6"/>
 </svg>;
}

// Strip geometry and the wave model live in flagCloth.ts (unit-tested).
const CLOTH_STRIPS=clothStrips().map(strip=>({...strip,style:{'--wave':`${strip.amplitude.toFixed(3)}px`,'--rest':`${strip.rest.toFixed(3)}px`,'--period':`${CLOTH_PERIOD}s`,'--travel':`${CLOTH_WAVELENGTH}px`,animationDelay:`${strip.delay.toFixed(3)}s`} as CSSProperties}));

export {FlagEditor} from './FlagEditor.tsx';
