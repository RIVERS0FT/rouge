import {factionColor} from '../game/factionColors.ts';

/** Measured against Shanhe Shapan's country labels (2026-11-14).
 * Canvas strokeText uses a centered stroke; the fill covers its inner half. */
export const COUNTRY_FONT_WEIGHT=700;
export const COUNTRY_INK_OPACITY=.88;
export const COUNTRY_OUTLINE='#faf4e4';
export const COUNTRY_OUTLINE_OPACITY=.4;
export function countryOutlineWidth(fontPixels:number):number{return Math.max(1.4,Math.min(4.2,.9+fontPixels*.05));}
export function countryInk(owner:number):string{
 const rgb=factionColor(owner).slice(1).match(/../g)!.map(value=>parseInt(value,16));
 return '#'+rgb.map((value,index)=>Math.floor(value*.42*.7+[24,18,14][index]*.3).toString(16).padStart(2,'0')).join('');
}
