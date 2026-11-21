import {DT} from '../game/content.ts';
import type {GameState,Unit} from '../game/types.ts';

const SHOOT_MS=14*1000/24;
const WALK_HOLD_MS=180;
const TURN_MS=110;
interface MotionTrack {owner:number;kind:Unit['kind'];x:number;z:number;cooldown:number;heading:number;turnFrom:number;turnAt:number;walkStart:number;walkUntil:number;shotAt:number;}

export function modelHeading(t:MotionTrack,now:number):number {
  const elapsed=now-t.turnAt;
  if(elapsed>=TURN_MS)return t.heading;
  const f=Math.max(0,elapsed/TURN_MS),delta=t.heading-t.turnFrom;
  return t.turnFrom+Math.atan2(Math.sin(delta),Math.cos(delta))*f*f*(3-2*f);
}
function turnTo(t:MotionTrack,heading:number,now:number){
  if(t.heading===heading)return;
  t.turnFrom=modelHeading(t,now);t.turnAt=now;t.heading=heading;
}
/** Renderer-only history from authoritative snapshots; never changes unit state or saves. */
export class InfantryMotion {
  private readonly tracks=new Map<number,MotionTrack>();
  private campaign='';
  private tick=-1;
  private last=0;
  private readonly attackYawOffsets:Partial<Record<Unit['kind'],number>>;
  constructor(attackYawOffsets:Partial<Record<Unit['kind'],number>>={}){this.attackYawOffsets=attackYawOffsets;}
  update({campaign,tick,units}:Pick<GameState,'campaign'|'tick'|'units'>,now:number,visible?:ReadonlySet<number>,formationHeadings?:ReadonlyMap<number,number>){
    if(campaign!==this.campaign||tick<this.tick||now-this.last>500)this.tracks.clear();
    const advanced=campaign===this.campaign&&tick>this.tick,gap=tick-this.tick;
    this.campaign=campaign;this.tick=tick;this.last=now;
    const live=new Set<number>();
    let shot=false;
    for(const u of units){
      if(u.transport?.embarked)continue;
      live.add(u.id);
      let t=this.tracks.get(u.id);
      const formation=u.army===undefined?undefined:formationHeadings?.get(u.army);
      const aim=u.lastShotHeading===undefined?undefined:u.lastShotHeading+(this.attackYawOffsets[u.kind]??0);
      if(!t||t.owner!==u.owner||t.kind!==u.kind){
        const waypoint=u.travel?.points[u.travel.index];
        const routeHeading=waypoint&&(waypoint.x!==u.x||waypoint.z!==u.z)?Math.atan2(waypoint.x-u.x,waypoint.z-u.z):undefined;
        const heading=(u.cooldown>0?aim:undefined)??formation??routeHeading??(u.id%64)*.618;
        this.tracks.set(u.id,{owner:u.owner,kind:u.kind,x:u.x,z:u.z,cooldown:u.cooldown,heading,turnFrom:heading,turnAt:-Infinity,walkStart:now,walkUntil:-Infinity,shotAt:-Infinity});
        continue;
      }
      if(advanced){
        const dx=u.x-t.x,dz=u.z-t.z,d=(dx*dx+dz*dz);
        // The engine subtracts DT each tick and resets cooldown only on a hit.
        // Comparing against ordinary decay recovers a shot even when packets skip ticks.
        const fired=u.cooldown>Math.max(0,t.cooldown-gap*DT)+1e-6;
        const moving=d>.00001&&d<=Math.min(8,Math.max(2,gap))**2;
        if(moving){
          if(now>t.walkUntil)t.walkStart=now;
          t.walkUntil=now+WALK_HOLD_MS;
        }
        if(fired){
          if(aim!==undefined)turnTo(t,aim,now);
          // Keep the firing pose and its first recoil frame behind the turn.
          t.shotAt=aim===undefined?now:Math.max(now,t.turnAt+TURN_MS);
          shot ||= !visible||visible.has(u.id);
        }else if(now-t.shotAt<SHOOT_MS&&aim!==undefined)turnTo(t,aim,now);
        else if(u.armyStatus==='formed'&&formation!==undefined)turnTo(t,formation,now);
        else if(moving)turnTo(t,Math.atan2(dx,dz),now);
      }
      t.x=u.x;t.z=u.z;t.cooldown=u.cooldown;
    }
    for(const id of this.tracks.keys())if(!live.has(id))this.tracks.delete(id);
    return shot;
  }
  track(id:number){return this.tracks.get(id);}
  active(now:number,visible:ReadonlySet<number>){
    for(const id of visible){const t=this.tracks.get(id);if(t&&(now-t.shotAt<SHOOT_MS||now<t.walkUntil||now-t.turnAt<TURN_MS))return true;}
    return false;
  }
}
