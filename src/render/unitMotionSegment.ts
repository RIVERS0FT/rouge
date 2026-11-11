import {buildingSegment} from '../game/buildings.ts';
import {UNIT_RADIUS} from '../game/collision.ts';
import {terrainLocalSegment,terrainSegment} from '../game/terrain-navigation.ts';
import type {Unit,Vec2} from '../game/types.ts';

/** Certify the entire snapshot chord once, not each rendered substep. Safe
 * endpoints do not guarantee a safe chord around a house, inlet or island. */
export function unitMotionSegment(from:Vec2,to:Vec2,unit:Unit):boolean {
  return unit.transport?.embarked?terrainSegment(from,to,true):
    buildingSegment(from,to,UNIT_RADIUS[unit.kind])&&terrainLocalSegment(from,to);
}
