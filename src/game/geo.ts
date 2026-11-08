import type { Vec2 } from './types.ts';

/** Spherical Miller cylindrical. Geographic source data stays in longitude/latitude.
 * North is negative Z; both axes use the same equatorial scale (no image stretching).
 * Formula: https://proj.org/en/stable/operations/projections/mill.html
 */
export const PROJECTION_ID = 'miller-cylindrical' as const;
export const MAX_LATITUDE = 90;
export const WORLD_SCALE = 10;
const RAD = Math.PI / 180;
const FACTOR = 0.8;

export function project(lon: number, lat: number): Vec2 {
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) throw new Error('invalidCoordinate');
  const phi = Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, lat)) * RAD;
  // asinh(tan(theta)) == log(tan(pi/4 + theta/2)); stable and exactly zero at the equator.
  return { x: lon * WORLD_SCALE, z: -Math.asinh(Math.tan(FACTOR * phi)) / (FACTOR * RAD) * WORLD_SCALE };
}

export const PROJECTION_BOUNDS = Object.freeze({
  left: -180 * WORLD_SCALE, right: 180 * WORLD_SCALE,
  top: project(0, MAX_LATITUDE).z, bottom: project(0, -MAX_LATITUDE).z,
});

export function unproject(x: number, z: number): { lon: number; lat: number } {
  if (!Number.isFinite(x) || !Number.isFinite(z)) throw new Error('invalidCoordinate');
  const boundedZ = Math.max(PROJECTION_BOUNDS.top, Math.min(PROJECTION_BOUNDS.bottom, z));
  return { lon: x / WORLD_SCALE, lat: Math.atan(Math.sinh(-boundedZ * RAD * FACTOR / WORLD_SCALE)) / (FACTOR * RAD) };
}

/** An approximate Victoria-style framing, NOT Paradox's official georeferencing.
 * Keep true Miller coordinates; crop geometry instead of rescaling its vertical axis.
 * South is derived from the selected north edge and reference aspect ratio.
 */
export const CROP_ID = 'miller-74n-reference-aspect-v1' as const;
export const NORTH_LATITUDE = 74;
export const MAP_ASPECT = 16384 / 7232;
export const WORLD_WIDTH = PROJECTION_BOUNDS.right - PROJECTION_BOUNDS.left;
export const WORLD_BOUNDS = Object.freeze({
  left: PROJECTION_BOUNDS.left, right: PROJECTION_BOUNDS.right,
  top: project(0, NORTH_LATITUDE).z,
  bottom: project(0, NORTH_LATITUDE).z + WORLD_WIDTH / MAP_ASPECT,
});
export const SOUTH_LATITUDE = unproject(0, WORLD_BOUNDS.bottom).lat;
export const WORLD_CENTER = Object.freeze({x:0,z:(WORLD_BOUNDS.top+WORLD_BOUNDS.bottom)/2});
export function wrapX(x:number):number {
  if(!Number.isFinite(x))throw new Error('invalidCoordinate');
  return ((x-WORLD_BOUNDS.left)%WORLD_WIDTH+WORLD_WIDTH)%WORLD_WIDTH+WORLD_BOUNDS.left;
}
/** Global framing draws one atlas; its exterior must stay unpickable.
 * Free panning draws repeated copies, so only that mode normalizes longitude.
 */
export function viewPickX(x:number,globalView:boolean):number {
  return globalView?x:wrapX(x);
}
/** Nearest visual copy of a canonical longitude. Simulation positions stay canonical. */
export function nearestWorldX(x:number,focusX:number):number {
  return x+Math.round((focusX-x)/WORLD_WIDTH)*WORLD_WIDTH;
}

/** Miller is not conformal: an isotropic Mercator cos(latitude) correction is wrong.
 * Factors convert infinitesimal projected offsets to equatorial ground units.
 * Simulation speed/range remain abstract map units; these factors are not applied to combat.
 */
export function groundMetric(z: number): { eastWest: number; northSouth: number } {
  const phi = unproject(0, z).lat * RAD;
  return { eastWest: Math.max(0, Math.cos(phi)), northSouth: Math.cos(FACTOR * phi) };
}

/** Fit the entire finite atlas in a perspective camera's north-up plane, including HUD margins. */
export function worldViewDistance(aspect: number, verticalFovDegrees = 40, usableFraction = 0.8): number {
  if (!Number.isFinite(aspect) || aspect <= 0 || !Number.isFinite(verticalFovDegrees)
    || verticalFovDegrees <= 0 || verticalFovDegrees >= 180 || !Number.isFinite(usableFraction)
    || usableFraction <= 0 || usableFraction > 1) throw new Error('invalidViewport');
  const width = WORLD_BOUNDS.right - WORLD_BOUNDS.left, height = WORLD_BOUNDS.bottom - WORLD_BOUNDS.top;
  return Math.max(height, width / aspect) / (2 * Math.tan(verticalFovDegrees * RAD / 2) * usableFraction);
}

/** Cover the window without stretching or letterboxing. Some longitude/latitude can
 * fall outside the view on a different aspect ratio; it remains available by panning.
 * This is a camera choice, not another geographic crop or a simulation change.
 */
export function worldCoverDistance(aspect:number, verticalFovDegrees=40):number {
  // Reuse validation, but not the padded fit calculation.
  worldViewDistance(aspect,verticalFovDegrees,1);
  const height=WORLD_BOUNDS.bottom-WORLD_BOUNDS.top;
  return Math.min(height,WORLD_WIDTH/aspect)*0.998/(2*Math.tan(verticalFovDegrees*RAD/2));
}

/** Ground-plane footprint of a north-facing perspective camera. */
export function cameraGroundSpan(distance:number, tilt:number, verticalFovDegrees=40):{north:number;south:number} {
  const half=verticalFovDegrees*RAD/2;
  if(!Number.isFinite(distance)||distance<=0||!Number.isFinite(tilt)||tilt<0
    || !Number.isFinite(half)||half<=0||tilt+half>=Math.PI/2)throw new Error('invalidViewport');
  const height=distance*Math.cos(tilt),offset=distance*Math.sin(tilt);
  return {north:height*Math.tan(tilt+half)-offset,south:offset-height*Math.tan(tilt-half)};
}

/** Keep the visible ground inside the north/south crop even during pan/zoom. */
export function clampViewZ(z:number,distance:number,tilt:number):number {
  if(!Number.isFinite(z))throw new Error('invalidViewport');
  const span=cameraGroundSpan(distance,tilt);
  const min=WORLD_BOUNDS.top+span.north,max=WORLD_BOUNDS.bottom-span.south;
  return min>max?WORLD_CENTER.z:Math.max(min,Math.min(max,z));
}
