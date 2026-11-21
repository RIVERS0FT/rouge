import type {Army,GameState,Unit,Vec2} from '../game/types.ts';

/** Presentation trails the 100ms snapshot stream by one update. No prediction,
 * simulation mutation or frame-rate-dependent exponential chasing. */
export const UNIT_INTERPOLATION_DELAY=100;
const STALE_GAP=500;
type Sample=Vec2&{time:number};
interface Track {samples:Sample[];owner:number;identity:string|number}
function trackSpeed({samples}:Track,time:number):number{
  let speed=0;for(let i=1;i<samples.length;i++){const a=samples[i-1],b=samples[i];
    if(b.time>time&&b.time>a.time)speed=Math.max(speed,Math.hypot(b.x-a.x,b.z-a.z)/(b.time-a.time));
  }return speed;
}
export type MotionSegment=(from:Vec2,to:Vec2,unit:Unit)=>boolean;
class SnapshotMotion<T extends {id:number;owner:number}> {
  private tracks=new Map<number,Track>();
  private campaign='';private tick=-1;private received=-Infinity;
  private point:(entity:T)=>Vec2|undefined;
  private identity:(entity:T)=>string|number;
  private legal:(from:Vec2,to:Vec2,entity:T)=>boolean;
  constructor(point:(entity:T)=>Vec2|undefined,identity:(entity:T)=>string|number,legal:(from:Vec2,to:Vec2,entity:T)=>boolean=()=>true){
    this.point=point;this.identity=identity;this.legal=legal;
  }
  protected updateTracks({campaign,tick}:Pick<GameState,'campaign'|'tick'>,entities:readonly T[],now:number):void {
    const reset=campaign!==this.campaign||tick<this.tick||now-this.received>STALE_GAP;
    if(reset)this.tracks.clear();
    const advanced=tick>this.tick,steps=Math.max(1,tick-this.tick),live=new Set<number>();
    for(const entity of entities){
      const point=this.point(entity);if(!point)continue;
      const {x,z}=point,identity=this.identity(entity);
      live.add(entity.id);let track=this.tracks.get(entity.id);const previous=track?.samples.at(-1);
      const changed=previous&&(previous.x!==x||previous.z!==z);
      const discontinuity=!track||track.owner!==entity.owner||track.identity!==identity||
        (changed&&(!advanced||now<=previous.time||Math.hypot(x-previous.x,z-previous.z)>Math.min(8,Math.max(2,steps))||!this.legal(previous,point,entity)));
      if(discontinuity){
        track={samples:[{x,z,time:now}],owner:entity.owner,identity};this.tracks.set(entity.id,track);
      }else if(advanced){
        // After a late packet the last position has already been displayed.
        // Start there now instead of jumping partway through a retroactive leg.
        if(previous!.time<now-UNIT_INTERPOLATION_DELAY)previous!.time=now-UNIT_INTERPOLATION_DELAY;
        track!.samples.push({x,z,time:now});
        // Retain the sample before the delayed clock, including short/batched
        // command updates. Prune on receipt, even when the map is hidden.
        const samples=track!.samples,cutoff=now-UNIT_INTERPOLATION_DELAY;
        while(samples.length>2&&samples[1].time<=cutoff)samples.shift();
        if(samples.length>16)samples.splice(0,samples.length-16);
      }
    }
    for(const id of this.tracks.keys())if(!live.has(id))this.tracks.delete(id);
    this.campaign=campaign;this.tick=tick;this.received=now;
  }
  sample(id:number,fallback:Vec2,now:number):Vec2 {
    const samples=this.tracks.get(id)?.samples;if(!samples?.length)return fallback;
    const time=now-UNIT_INTERPOLATION_DELAY;
    if(time<=samples[0].time)return samples[0];
    for(let i=1;i<samples.length;i++)if(time<samples[i].time){
      const a=samples[i-1],b=samples[i],t=(time-a.time)/(b.time-a.time);
      return{x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t};
    }
    return samples.at(-1)!;
  }
  moving(id:number,now:number):boolean {
    const track=this.tracks.get(id);
    return !!track&&trackSpeed(track,now-UNIT_INTERPOLATION_DELAY)>0;
  }
  /** Remaining buffered motion, in map units/ms. Stationary snapshots do not
   * keep the map awake; the caller draws one final frame when active becomes false. */
  activity(now:number,visibleIds?:ReadonlySet<number>):{active:boolean;speed:number} {
    const time=now-UNIT_INTERPOLATION_DELAY;let speed=0;
    // A stationary viewport usually contains a small subset of the campaign.
    // Values iteration also avoids allocating a [key,value] pair per army on
    // every camera frame when the whole motion set is needed.
    if(visibleIds){for(const id of visibleIds){const track=this.tracks.get(id);if(track)speed=Math.max(speed,trackSpeed(track,time));}}
    else for(const track of this.tracks.values())speed=Math.max(speed,trackSpeed(track,time));
    return{active:speed>0,speed};
  }
}

export class UnitMotion extends SnapshotMotion<Unit> {
  constructor(legal?:MotionSegment){
    super(unit=>unit,unit=>unit.transport?.embarked?'embarked-'+unit.kind:unit.kind,legal);
  }
  update(state:Pick<GameState,'campaign'|'tick'|'units'>,now:number){this.updateTracks(state,state.units,now);}
  position(unit:Pick<Unit,'id'|'x'|'z'>,now:number){return this.sample(unit.id,unit,now);}
}

/** Land marches follow the formation center, independently of which battalion leads. */
export class FormationMotion extends SnapshotMotion<Army> {
  constructor(){super(army=>army.formation?.phase==='march'?army.formation.position:undefined,army=>army.formed);}
  update(state:Pick<GameState,'campaign'|'tick'|'armies'>,now:number){this.updateTracks(state,state.armies,now);}
}

/** Aim for at most a quarter CSS pixel per frame, up to 60fps. The world view
 * stays economical when movements are subpixel; zoomed 2D and 3D both animate. */
export function unitMotionFrameInterval(speed:number,distance:number,height:number):number {
  const pixelsPerMs=speed*Math.max(1,height)/(2*Math.max(1,distance)*Math.tan(Math.PI/9));
  return Math.max(1000/60,Math.min(100,.25/Math.max(1e-9,pixelsPerMs)));
}
