import {WORLD_BOUNDS} from '../game/geo.ts';

/** Visual-only tone: keep the NE II luminance centered on a pale atlas ground.
 * Multiply all political RGB channels equally, retaining their hue and identity. */
export const RELIEF_MIDPOINT=206/255;
export const RELIEF_STRENGTH=.85;
export const OCEAN_FALLBACK='#103e48';

/** Land relief is already inverse-Miller resampled to this exact map crop. */
export function surfaceUv(x:number,z:number):{u:number;v:number}{
  return {u:(x-WORLD_BOUNDS.left)/(WORLD_BOUNDS.right-WORLD_BOUNDS.left),v:(WORLD_BOUNDS.bottom-z)/(WORLD_BOUNDS.bottom-WORLD_BOUNDS.top)};
}
export function reliefMultiplier(value:number):number{return Math.max(.65,Math.min(1.15,1+(value-RELIEF_MIDPOINT)*RELIEF_STRENGTH));}

/** A compact atlas for touch/short screens, limited GPUs and low-memory devices.
 * Choosing once avoids repeat downloads during orientation changes. */
export function compactSurface(viewportShortSide:number,coarsePointer:boolean,maxTextureSize:number,deviceMemory?:number):boolean{
  return coarsePointer||viewportShortSide<700||maxTextureSize<4096||(deviceMemory!==undefined&&deviceMemory<=4);
}
