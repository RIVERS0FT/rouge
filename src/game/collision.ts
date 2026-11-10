import type {Kind, Vec2} from './types.ts';

/** One ground footprint per battalion, not three colliders for its cosmetic soldiers. */
export const UNIT_RADIUS:Record<Kind,number>={infantry:.46,skirmisher:.46,engineer:.46,grenadier:.5,cavalry:.56,heavyCavalry:.6,artillery:.62,horseArtillery:.62};
export const COLLISION_PASSES=4;
export const COLLISION_MAX_PUSH=.6;
export const COLLISION_CANDIDATES=96;
export const COLLISION_CONSTRAINTS=12;
export const COLLISION_CELL=1.24; // Maximum diameter: a 3 × 3 neighborhood is enough.
export interface CircleBody extends Vec2 {id:number;radius:number}
export interface CollisionReport {candidates:number;contacts:number;maxPenetration:number;limited:number;constraints:number;constraintLimited:number}
const key=(x:number,z:number)=>`${x}:${z}`;
const directions=[[1,0],[Math.SQRT1_2,Math.SQRT1_2],[0,1],[-Math.SQRT1_2,Math.SQRT1_2],[-1,0],[-Math.SQRT1_2,-Math.SQRT1_2],[0,-1],[Math.SQRT1_2,-Math.SQRT1_2]];

/** Fixed-budget position projection. Neither RNG nor array order influences contacts.
 * Rebuild each pass because corrections can move a body into another bucket.
 * Overloaded buckets use rotating, deterministic sampling instead of quadratic work.
 * Dense/impossible packing can retain penetration; never teleport through a wall. */
export function separateCircles<T extends CircleBody>(input:readonly T[],canMove:(body:T,to:Vec2)=>boolean,tick=0):CollisionReport {
  const bodies=[...input].sort((a,b)=>a.id-b.id),remaining=new Map(bodies.map(b=>[b.id,COLLISION_MAX_PUSH])),attempts=new Map<number,number>();
  const report:CollisionReport={candidates:0,contacts:0,maxPenetration:0,limited:0,constraints:0,constraintLimited:0};
  function push(b:T,x:number,z:number,amount:number):number {
    amount=Math.min(amount,remaining.get(b.id)!);if(amount<1e-7)return 0;
    for(const fraction of [1,.5,.25,.125]){
      const tried=attempts.get(b.id)??0;if(tried>=COLLISION_CONSTRAINTS)return 0;
      attempts.set(b.id,tried+1);report.constraints++;
      const d=amount*fraction,to={x:b.x+x*d,z:b.z+z*d};
      if(canMove(b,to)){b.x=to.x;b.z=to.z;remaining.set(b.id,remaining.get(b.id)!-d);return d;}
    }
    return 0;
  }
  for(let pass=0;pass<COLLISION_PASSES;pass++){
    const buckets=new Map<string,T[]>();
    for(const b of bodies){const k=key(Math.floor(b.x/COLLISION_CELL),Math.floor(b.z/COLLISION_CELL)),list=buckets.get(k)??[];list.push(b);buckets.set(k,list);}
    for(const a of bodies){
      const bx=Math.floor(a.x/COLLISION_CELL),bz=Math.floor(a.z/COLLISION_CELL);let visited=0;
      const rotation=(a.id+tick+pass)%9;
      for(let n=0;n<9;n++){
        const cell=(n+rotation)%9,list=buckets.get(key(bx+cell%3-1,bz+Math.floor(cell/3)-1));if(!list)continue;
        const start=(Math.imul(a.id,31)+tick+pass)>>>0;
        for(let k=0;k<list.length;k++){
          if(visited++>=COLLISION_CANDIDATES){report.limited++;break;}
          const b=list[(start+k)%list.length];report.candidates++;if(a.id>=b.id)continue;
          const dx=b.x-a.x,dz=b.z-a.z,min=a.radius+b.radius,d2=dx*dx+dz*dz;if(d2>=min*min)continue;
          const d=Math.sqrt(d2),overlap=min-d;if(overlap<1e-5)continue;
          report.contacts++;report.maxPenetration=Math.max(report.maxPenetration,overlap);
          const fallback=directions[(Math.imul(a.id,73856093)^Math.imul(b.id,19349663))>>>0&7];
          const x=d>1e-9?dx/d:fallback[0],z=d>1e-9?dz/d:fallback[1];
          const movedA=push(a,-x,-z,overlap*.5),movedB=push(b,x,z,overlap-movedA);
          // If B hit a wall, A takes the unfulfilled share when space permits.
          if(movedB<overlap-movedA-1e-6)push(a,-x,-z,overlap-movedA-movedB);
        }
        if(visited>=COLLISION_CANDIDATES)break;
      }
    }
  }
  report.constraintLimited=bodies.filter(b=>(attempts.get(b.id)??0)>=COLLISION_CONSTRAINTS).length;
  return report;
}
