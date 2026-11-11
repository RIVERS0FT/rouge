import type {GameState,Unit,Vec2} from '../game/types.ts';

/** Presentation trails the 100ms snapshot stream by one update. No prediction,
 * simulation mutation or frame-rate-dependent exponential chasing. */
export const UNIT_INTERPOLATION_DELAY=100;
const STALE_GAP=500;
type Sample=Vec2&{time:number};
interface Track {samples:Sample[];owner:number;kind:Unit['kind'];embarked:boolean}
export type MotionSegment=(from:Vec2,to:Vec2,unit:Unit)=>boolean;
export class UnitMotion {
  private tracks=new Map<number,Track>();
  private campaign='';private tick=-1;private received=-Infinity;
  private legal:MotionSegment;
  constructor(legal:MotionSegment=()=>true){this.legal=legal;}
  update(state:Pick<GameState,'campaign'|'tick'|'units'>,now:number):void {
    const reset=state.campaign!==this.campaign||state.tick<this.tick||now-this.received>STALE_GAP;
    if(reset)this.tracks.clear();
    const advanced=state.tick>this.tick,steps=Math.max(1,state.tick-this.tick),live=new Set<number>();
    for(const unit of state.units){
      live.add(unit.id);let track=this.tracks.get(unit.id);const previous=track?.samples.at(-1);
      const changed=previous&&(previous.x!==unit.x||previous.z!==unit.z);
      const discontinuity=!track||track.owner!==unit.owner||track.kind!==unit.kind||track.embarked!==!!unit.transport?.embarked||
        (changed&&(!advanced||now<=previous.time||Math.hypot(unit.x-previous.x,unit.z-previous.z)>Math.min(8,Math.max(2,steps))||!this.legal(previous,unit,unit)));
      if(discontinuity){
        track={samples:[{x:unit.x,z:unit.z,time:now}],owner:unit.owner,kind:unit.kind,embarked:!!unit.transport?.embarked};this.tracks.set(unit.id,track);
      }else if(advanced){
        // After a late packet the last position has already been displayed.
        // Start there now instead of jumping partway through a retroactive leg.
        if(previous!.time<now-UNIT_INTERPOLATION_DELAY)previous!.time=now-UNIT_INTERPOLATION_DELAY;
        track!.samples.push({x:unit.x,z:unit.z,time:now});
        // Retain the sample before the delayed clock, including short/batched
        // command updates. Prune on receipt, even when the map is hidden.
        const samples=track!.samples,cutoff=now-UNIT_INTERPOLATION_DELAY;
        while(samples.length>2&&samples[1].time<=cutoff)samples.shift();
        if(samples.length>16)samples.splice(0,samples.length-16);
      }
    }
    for(const id of this.tracks.keys())if(!live.has(id))this.tracks.delete(id);
    this.campaign=state.campaign;this.tick=state.tick;this.received=now;
  }
  position(unit:Pick<Unit,'id'|'x'|'z'>,now:number):Vec2 {
    const samples=this.tracks.get(unit.id)?.samples;if(!samples?.length)return unit;
    const time=now-UNIT_INTERPOLATION_DELAY;
    if(time<=samples[0].time)return samples[0];
    for(let i=1;i<samples.length;i++)if(time<samples[i].time){
      const a=samples[i-1],b=samples[i],t=(time-a.time)/(b.time-a.time);
      return{x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t};
    }
    return samples.at(-1)!;
  }
  /** Remaining buffered motion, in map units/ms. Stationary snapshots do not
   * keep the map awake; the caller draws one final frame when active becomes false. */
  activity(now:number,visibleIds?:ReadonlySet<number>):{active:boolean;speed:number} {
    const time=now-UNIT_INTERPOLATION_DELAY;let speed=0;
    for(const [id,{samples}] of this.tracks){if(visibleIds&&!visibleIds.has(id))continue;for(let i=1;i<samples.length;i++){
      const a=samples[i-1],b=samples[i];
      if(b.time>time&&b.time>a.time)speed=Math.max(speed,Math.hypot(b.x-a.x,b.z-a.z)/(b.time-a.time));
    }}
    return{active:speed>0,speed};
  }
}

/** Aim for at most a quarter CSS pixel per frame, up to 60fps. The world view
 * stays economical when movements are subpixel; zoomed 2D and 3D both animate. */
export function unitMotionFrameInterval(speed:number,distance:number,height:number):number {
  const pixelsPerMs=speed*Math.max(1,height)/(2*Math.max(1,distance)*Math.tan(Math.PI/9));
  return Math.max(1000/60,Math.min(100,.25/Math.max(1e-9,pixelsPerMs)));
}
