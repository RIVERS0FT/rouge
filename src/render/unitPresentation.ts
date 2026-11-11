import type {Kind,Unit} from '../game/types.ts';

/** The existing map switches its UI mode at this same relief threshold. */
export function unitRenderMode(relief:number):'2d'|'3d' { return relief>0.5?'3d':'2d'; }
export const UNIT_GLYPHS:readonly (Kind|'transport')[]=[
  'infantry','cavalry','artillery','engineer','skirmisher','grenadier','heavyCavalry','horseArtillery','transport',
];
export function unitGlyph(kind:Kind,embarked=false):number {
  return UNIT_GLYPHS.indexOf(embarked?'transport':kind);
}
/** CSS-pixel sizing keeps distant counters visible on desktop and touch screens.
 * It changes presentation only: coordinates, collision radii and counts stay intact. */
export function unitSpritePixels(distance:number):number {
  return Math.max(7,Math.min(16,2400/Math.max(1,distance)));
}
export function unitSpriteWorldSize(depth:number,viewportHeight:number,pixels:number):number {
  return 2*Math.max(0.05,depth)*Math.tan(20*Math.PI/180)*pixels/Math.max(1,viewportHeight);
}

/** Whole-map redraws are expensive on software/mobile GPUs. A new simulation
 * tick alone is not a visual change; accumulate subpixel motion against the last
 * rendered snapshot so slow units still advance, without redrawing unchanged land. */
export function unitPresentationChanged(previous:readonly Unit[],current:readonly Unit[],distance:number,viewportHeight:number):boolean {
  if(previous.length!==current.length)return true;
  const threshold=unitSpriteWorldSize(distance,viewportHeight,.5);
  for(let i=0;i<current.length;i++){
    const a=previous[i],b=current[i];
    if(a.id!==b.id||a.owner!==b.owner||a.kind!==b.kind||!!a.transport?.embarked!==!!b.transport?.embarked||Math.abs(a.x-b.x)>threshold||Math.abs(a.z-b.z)>threshold)return true;
  }
  return false;
}
