import data from '../generated/world.json' with { type: 'json' };
import { project } from './geo.ts';
import type { Vec2, ProvinceDef } from './types.ts';
export const BOUNDS = { left: -1800, right: 1800, top: -1800, bottom: 1800 };
export const MAP_METADATA = { source: data.source, revision: data.sourceRevision, projection: data.projection, count: data.provinces.length };
export function contains(polygon: Vec2[], x: number, z: number): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a.z > z) !== (b.z > z) && x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}
export function containsPart(part: Vec2[][], x: number, z: number): boolean {
  return contains(part[0], x, z) && !part.slice(1).some(hole => contains(hole, x, z));
}
export function boundsOf(points: Vec2[]) {
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
  for (const p of points) { left = Math.min(left, p.x); right = Math.max(right, p.x); top = Math.min(top, p.z); bottom = Math.max(bottom, p.z); }
  return { left, right, top, bottom };
}
export const MAP: ProvinceDef[] = data.provinces.map((p, id) => {
  const parts = p.geometry.map(poly => poly.map(ring => ring.slice(0, -1).map(v => project(v[0], v[1]))));
  return { id, code: p.code, name: p.name as [string, string], country: p.country, countryName: p.countryName,
    center: project(p.center[0], p.center[1]), polygon: parts[0][0], parts, neighbors: p.neighbors,
    terrain: 'plain', playable: p.country !== 'ATA', bounds: boundsOf(parts[0][0]) };
});
export const PLAYABLE_COUNT = MAP.filter(p => p.playable).length;
// Component-aware spatial index: a province spanning the date line does not occupy an entire row.
const SIZE = 25, index = new Map<string, { id: number; part: Vec2[][]; bounds: ReturnType<typeof boundsOf> }[]>();
for (const p of MAP) for (const part of p.parts) {
  const bounds = boundsOf(part[0]), entry = { id: p.id, part, bounds };
  for (let x = Math.floor(bounds.left / SIZE); x <= Math.floor(bounds.right / SIZE); x++)
    for (let z = Math.floor(bounds.top / SIZE); z <= Math.floor(bounds.bottom / SIZE); z++) {
      const key = `${x}:${z}`, bucket = index.get(key) ?? []; bucket.push(entry); index.set(key, bucket);
    }
}
export function pointInProvince(id: number, x: number, z: number): boolean {
  return MAP[id]?.parts.some(part => containsPart(part, x, z)) ?? false;
}
export function provinceAt(x: number, z: number): number {
  for (const e of index.get(`${Math.floor(x / SIZE)}:${Math.floor(z / SIZE)}`) ?? []) {
    if (x >= e.bounds.left && x <= e.bounds.right && z >= e.bounds.top && z <= e.bounds.bottom && containsPart(e.part, x, z)) return e.id;
  }
  return -1;
}
// Procedural relief is only a visual placeholder, not measured elevation or a movement obstacle.
export function heightAt(x: number, z: number): number { return 0.16 + 0.32 * (1 + Math.sin(x * 0.18) * Math.cos(z * 0.22)); }
export function provinceByCode(code: string): number {
  const p = MAP.find(p => p.code === code); if (!p) throw new Error(`Unknown province ${code}`); return p.id;
}
// A compact, connected opening theatre on the actual world map. No fabricated sea links.
export const START_CODES = ['DEU-1574', 'DEU-1591', 'FRA-5328', 'POL-3144'];
export const STARTS = START_CODES.map((code, i) => {
  const exact = MAP.find(p => p.code === code);
  const fallback = MAP.filter(p => p.country === ['DEU','DEU','FRA','POL'][i] && p.neighbors.length >= 3)[i];
  const p = exact ?? fallback; if (!p) throw new Error('Missing start province'); return p.id;
});
