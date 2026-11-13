import { type Flag, type FlagShape } from '../game/flags.ts';
import { FLAG_CATALOG } from '../game/flagCatalog.ts';
import type { Language } from './i18n.ts';
import {useId} from 'react';
import {ClothFlag} from './ClothFlag.tsx';
import {FLAG_ART} from './flagArt.tsx';
export const PATTERN_NAMES={solid:['纯色','Solid'],horizontal:['横三色','Horizontal stripes'],vertical:['竖三色','Vertical stripes'],cross:['十字','Cross']} as const;
export function flagName(flag:Flag,language:Language){return flag.type==='preset'?FLAG_CATALOG[flag.id].names[language==='zh'?0:1]:language==='zh'?'自定义旗帜':'Custom flag';}
function Stripes({colors,vertical=false}:{colors:readonly string[];vertical?:boolean}){return <>{colors.map((fill,i)=><rect key={i} x={vertical?i*90/colors.length:0} y={vertical?0:i*60/colors.length} width={vertical?90/colors.length:90} height={vertical?60:60/colors.length} fill={fill}/>)}</>;}
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
 else art=FLAG_ART[flag.id](id);
 const content=<>{art}{flag.type==='custom'&&flag.shapes?.map((shape,i)=><FlagShapeArt key={i} shape={shape}/>)}</>;
 if(!cloth)return <svg className="player-flag" viewBox="0 0 90 60" role="img" aria-label={flagName(flag,language)}><title>{flagName(flag,language)}</title>{content}</svg>;
 return <ClothFlag id={id} name={flagName(flag,language)} artKey={JSON.stringify(flag)}>{content}</ClothFlag>;
}

export {FlagEditor} from './FlagEditor.tsx';
