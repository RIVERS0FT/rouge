import {DT} from '../game/content.ts';
import type {GameState} from '../game/types.ts';

const SHOOT_MS=14*1000/24;
const WALK_HOLD_MS=180;
interface MotionTrack {owner:number;x:number;z:number;cooldown:number;heading:number;walkStart:number;walkUntil:number;shotAt:number;}
/** Renderer-only history from authoritative snapshots; never changes unit state or saves. */
export class InfantryMotion {
  private readonly tracks=new Map<number,MotionTrack>();
  private campaign='';
  private tick=-1;
  private last=0;
  update({campaign,tick,units}:Pick<GameState,'campaign'|'tick'|'units'>,now:number,visible?:ReadonlySet<number>){
    if(campaign!==this.campaign||tick<this.tick||now-this.last>500)this.tracks.clear();
    const advanced=campaign===this.campaign&&tick>this.tick,gap=tick-this.tick;
    this.campaign=campaign;this.tick=tick;this.last=now;
    const live=new Set<number>();
    let shot=false;
    for(const u of units){
      if(u.transport?.embarked)continue;
      live.add(u.id);
      let t=this.tracks.get(u.id);
      if(!t||t.owner!==u.owner){
        this.tracks.set(u.id,{owner:u.owner,x:u.x,z:u.z,cooldown:u.cooldown,heading:(u.id%64)*.618,walkStart:now,walkUntil:-Infinity,shotAt:-Infinity});
        continue;
      }
      if(advanced){
        const dx=u.x-t.x,dz=u.z-t.z,d=(dx*dx+dz*dz);
        if(d>.00001&&d<=Math.min(8,Math.max(2,gap))**2){
          if(now>t.walkUntil)t.walkStart=now;
          t.walkUntil=now+WALK_HOLD_MS;t.heading=Math.atan2(dx,dz);
        }
        // The engine subtracts DT each tick and resets cooldown only on a hit.
        // Comparing against ordinary decay recovers a shot even when packets skip ticks.
        if(u.cooldown>Math.max(0,t.cooldown-gap*DT)+1e-6){
          t.shotAt=now;shot ||= !visible||visible.has(u.id);
        }
      }
      t.x=u.x;t.z=u.z;t.cooldown=u.cooldown;
    }
    for(const id of this.tracks.keys())if(!live.has(id))this.tracks.delete(id);
    return shot;
  }
  track(id:number){return this.tracks.get(id);}
  active(now:number,visible:ReadonlySet<number>){
    for(const id of visible){const t=this.tracks.get(id);if(t&&(now-t.shotAt<SHOOT_MS||now<t.walkUntil))return true;}
    return false;
  }
}
