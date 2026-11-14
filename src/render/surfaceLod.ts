import {WORLD_BOUNDS,WORLD_WIDTH,wrapX} from '../game/geo.ts';
export const SURFACE_TILE=512,SURFACE_GUTTER=2,SURFACE_TILE_PIXELS=516;
export interface SurfaceLevel {width:number;height:number;columns:number;rows:number}
export interface SurfaceView {left:number;right:number;top:number;bottom:number}
/** One texel per display pixel, with hysteresis to prevent wheel/pinch thrashing. */
export function surfaceLevel(projectedWorldPixels:number,base:number,maximum:number,current=base):number{
 if(current>=base&&current<=maximum&&projectedWorldPixels>=current*.55&&projectedWorldPixels<=current*1.35)return current;
 return Math.min(maximum,Math.max(base,base*2**Math.ceil(Math.log2(Math.max(1,projectedWorldPixels*.9/base)))));
}
export function surfaceTiles(level:SurfaceLevel,view:SurfaceView,padding=1):{x:number;y:number;key:string}[]{
 const scale=level.width/WORLD_WIDTH,left=Math.floor((view.left-WORLD_BOUNDS.left)*scale/SURFACE_TILE)-padding,right=Math.floor((view.right-WORLD_BOUNDS.left)*scale/SURFACE_TILE)+padding;
 const top=Math.max(0,Math.floor((view.top-WORLD_BOUNDS.top)*scale/SURFACE_TILE)-padding),bottom=Math.min(level.rows-1,Math.floor((view.bottom-WORLD_BOUNDS.top)*scale/SURFACE_TILE)+padding);
 const result=new Map<string,{x:number;y:number;key:string}>();
 for(let y=top;y<=bottom;y++)for(let col=left;col<=Math.min(right,left+level.columns-1);col++){
  const x=((col%level.columns)+level.columns)%level.columns,key=`${level.width}-${x}-${y}`;result.set(key,{x,y,key});
 }
 const centerX=wrapX((view.left+view.right)/2),centerY=(view.top+view.bottom)/2;
 return [...result.values()].sort((a,b)=>{
  const distance=(tile:{x:number;y:number})=>{const x=WORLD_BOUNDS.left+(tile.x+.5)*SURFACE_TILE/scale,dx=Math.abs(x-centerX),z=WORLD_BOUNDS.top+(tile.y+.5)*SURFACE_TILE/scale;return Math.min(dx,WORLD_WIDTH-dx)**2+(z-centerY)**2;};
  return distance(a)-distance(b);
 });
}
