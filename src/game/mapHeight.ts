/** Render datum only: terrain detail is shaded color, never geometric elevation. */
export const LAND_Y=0.16;
/** Retain the coordinate-based API for callers without changing game topology. */
export function heightAt(_x:number,_z:number):number {return LAND_Y;}
