import type { Vec2 } from './types.ts';
/** EPSG:3857 spherical Mercator, scaled to game units; north is negative Z. */
export const MAX_LATITUDE = 85.0511287798066;
export const WORLD_SCALE = 10;
const RAD = Math.PI / 180;
export function project(lon: number, lat: number): Vec2 {
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) throw new Error('invalidCoordinate');
  const phi = Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, lat)) * RAD;
  return { x: lon * WORLD_SCALE, z: -Math.log(Math.tan(Math.PI / 4 + phi / 2)) / RAD * WORLD_SCALE };
}
export function unproject(x: number, z: number): { lon: number; lat: number } {
  if (!Number.isFinite(x) || !Number.isFinite(z)) throw new Error('invalidCoordinate');
  return { lon: x / WORLD_SCALE, lat: Math.atan(Math.sinh(-z / WORLD_SCALE * RAD)) / RAD };
}
/** Mercator is not equal-area. This local factor converts map distance to ground distance. */
export function groundScale(z: number): number { return 1 / Math.cosh(z / WORLD_SCALE * RAD); }
