import {FLAG_PRESET_IDS,type FlagPresetId} from './flagCatalog.ts';
/** Cosmetic only: never determines ownership, spawn position or combat rules.
 * Presets are real national flags (see flagCatalog.ts); the first eight keep their old ids. */
export const FLAG_PRESETS:readonly FlagPresetId[]=FLAG_PRESET_IDS;
export type {FlagPresetId};
export const FLAG_PATTERNS=['solid','horizontal','vertical','cross'] as const;
export const FLAG_SHAPES=['circle','rect','triangle','star'] as const;
export const MAX_FLAG_SHAPES=24;
export interface FlagShape {kind:typeof FLAG_SHAPES[number];x:number;y:number;width:number;height:number;color:string}
export type Flag = {type:'preset';id:FlagPresetId} | {type:'custom';pattern:typeof FLAG_PATTERNS[number];colors:[string,string,string];shapes?:FlagShape[]};
const color=(v:unknown):v is string=>typeof v==='string'&&/^#[0-9a-fA-F]{6}$/.test(v);
const coordinate=(v:unknown,min:number,max:number):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max&&Math.abs(v*100-Math.round(v*100))<1e-7;
export function validFlagShape(value:unknown):value is FlagShape {
 if(!value||typeof value!=='object')return false;
 const s=value as FlagShape;
 return Object.keys(s).length===6&&FLAG_SHAPES.includes(s.kind)&&color(s.color)&&coordinate(s.x,0,89)&&coordinate(s.y,0,59)&&coordinate(s.width,1,90)&&coordinate(s.height,1,60)&&s.x+s.width<=90+1e-9&&s.y+s.height<=60+1e-9&&(s.kind!=='circle'||s.width===s.height);
}
/** Pointer drag to safe normalized geometry; clicks and sub-unit strokes do not create marks. */
export function flagShapeFromDrag(kind:FlagShape['kind'],color:string,start:{x:number;y:number},end:{x:number;y:number}):FlagShape|null {
 const round=(n:number)=>Math.round(n*100)/100,clamp=(n:number,max:number)=>Math.min(max,Math.max(0,n));
 const a={x:clamp(start.x,90),y:clamp(start.y,60)},b={x:clamp(end.x,90),y:clamp(end.y,60)};
 let width=round(Math.abs(b.x-a.x)),height=round(Math.abs(b.y-a.y));
 if(kind==='circle')width=height=Math.min(width,height);
 const shape={kind,color,x:round(b.x<a.x?a.x-width:a.x),y:round(b.y<a.y?a.y-height:a.y),width,height};
 return validFlagShape(shape)?shape:null;
}
export function validFlag(value:unknown):value is Flag {
 if(!value||typeof value!=='object')return false;
 const f=value as Record<string,unknown>;
 if(f.type==='preset')return Object.keys(f).length===2&&FLAG_PRESETS.includes(f.id as FlagPresetId);
 if(f.type!=='custom'||!Object.keys(f).every(k=>['type','pattern','colors','shapes'].includes(k))||!FLAG_PATTERNS.includes(f.pattern as typeof FLAG_PATTERNS[number])||!Array.isArray(f.colors)||f.colors.length!==3||!f.colors.every(color))return false;
 if(Object.hasOwn(f,'shapes')&&(!Array.isArray(f.shapes)||f.shapes.length>MAX_FLAG_SHAPES||!f.shapes.every(validFlagShape)))return false;
 // A full setup including 24 shapes remains comfortably below the LAN 8 KiB request limit.
 return JSON.stringify(f).length<=4096;
}
