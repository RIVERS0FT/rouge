import type {Kind, Vec2} from './types.ts';

/** One ground footprint per battalion, not three colliders for its cosmetic soldiers. */
export const UNIT_RADIUS:Record<Kind,number>={infantry:.46,skirmisher:.46,engineer:.46,grenadier:.5,cavalry:.56,heavyCavalry:.6,artillery:.62,horseArtillery:.62};
export const COLLISION_PASSES=4;
export const COLLISION_MAX_PUSH=.6;
export const COLLISION_CANDIDATES=96;
export const COLLISION_CONSTRAINTS=12;
export const COLLISION_CELL=1.24; // Maximum diameter: a 3 × 3 neighborhood is enough.
export interface CircleBody extends Vec2 {id:number;radius:number;mobility?:number}
export interface CollisionReport {candidates:number;contacts:number;maxPenetration:number;limited:number;constraints:number;constraintLimited:number}
const directions=[[1,0],[Math.SQRT1_2,Math.SQRT1_2],[0,1],[-Math.SQRT1_2,Math.SQRT1_2],[-1,0],[-Math.SQRT1_2,-Math.SQRT1_2],[0,-1],[Math.SQRT1_2,-Math.SQRT1_2]];

/** Fixed-budget position projection. Neither RNG nor array order influences contacts.
 * Rebuild each pass because corrections can move a body into another bucket.
 * Overloaded buckets use rotating, deterministic sampling instead of quadratic work.
 * Dense/impossible packing can retain penetration; never teleport through a wall. */
class CircleSolver {
 bodies:readonly CircleBody[]=[];
 canMove:(body:CircleBody,to:Vec2)=>boolean=()=>false;
 report:CollisionReport={candidates:0,contacts:0,maxPenetration:0,limited:0,constraints:0,constraintLimited:0};
 count=0;mask=0;
 dense=false;grid=new Uint32Array(0);epoch=0;unique=0;gridMinX=0;gridMinZ=0;gridCols=0;
 prepareDense(){
  this.dense=false;if(!this.count||this.count>=1048575)return;
  let minX=Infinity,minZ=Infinity,maxX=-Infinity,maxZ=-Infinity;
  for(let i=0;i<this.count;i++){const x=Math.floor(this.xs[i]/COLLISION_CELL),z=Math.floor(this.zs[i]/COLLISION_CELL);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minZ=Math.min(minZ,z);maxZ=Math.max(maxZ,z);}
  minX-=2;minZ-=2;maxX+=2;maxZ+=2;const cols=maxX-minX+1,cells=cols*(maxZ-minZ+1);
  if(!Number.isSafeInteger(cells)||cells>4000000)return;
  if(this.grid.length<cells)this.grid=new Uint32Array(cells);
  this.gridMinX=minX;this.gridMinZ=minZ;this.gridCols=cols;this.dense=true;
 }
 remaining=new Float64Array(0);attempts=new Uint8Array(0);
 xs=new Float64Array(0);zs=new Float64Array(0);radii=new Float64Array(0);ids=new Float64Array(0);mobility=new Float64Array(0);
 cellX=new Float64Array(0);cellZ=new Float64Array(0);sizes=new Uint32Array(0);offsets=new Uint32Array(0);cursor=new Uint32Array(0);slots=new Uint32Array(0);members=new Uint32Array(0);
 prepare(count:number){
  if(this.remaining.length>=count&&this.sizes.length)return;
  let n=16;while(n<count)n*=2;const capacity=n*2;this.mask=capacity-1;
  this.remaining=new Float64Array(n);this.attempts=new Uint8Array(n);this.xs=new Float64Array(n);this.zs=new Float64Array(n);this.radii=new Float64Array(n);this.ids=new Float64Array(n);this.mobility=new Float64Array(n);
  this.cellX=new Float64Array(capacity);this.cellZ=new Float64Array(capacity);this.sizes=new Uint32Array(capacity);this.offsets=new Uint32Array(capacity+1);this.cursor=new Uint32Array(capacity);this.slots=new Uint32Array(n);this.members=new Uint32Array(n);
 }
 lookup(x:number,z:number,create=false):number{
  if(this.dense){const cell=(z-this.gridMinZ)*this.gridCols+x-this.gridMinX,entry=this.grid[cell];if(entry>>>20===this.epoch)return (entry&1048575)-1;if(!create)return -1;const slot=this.unique++;this.grid[cell]=(this.epoch<<20)|(slot+1);return slot;}
  const sizes=this.sizes;let slot=(Math.imul(x,73856093)^Math.imul(z,19349663))&this.mask;
  while(sizes[slot]&&(this.cellX[slot]!==x||this.cellZ[slot]!==z))slot=(slot+1)&this.mask;return slot;
 }
 push(index:number,x:number,z:number,amount:number):number {
  const remaining=this.remaining,attempts=this.attempts;amount=Math.min(amount,remaining[index]);if(amount<1e-7)return 0;
  const b=this.bodies[index];
  for(let fraction=1;fraction>=.125;fraction*=.5){
   const tried=attempts[index];if(tried>=COLLISION_CONSTRAINTS)return 0;
   attempts[index]=tried+1;this.report.constraints++;
   const d=amount*fraction,to={x:b.x+x*d,z:b.z+z*d};
   if(this.canMove(b,to)){b.x=this.xs[index]=to.x;b.z=this.zs[index]=to.z;remaining[index]-=d;return d;}
  }
  return 0;
 }
 pass(pass:number,tick:number){
  const {count,xs,zs,radii,ids,mobility,sizes,offsets,cursor,slots,members,cellX,cellZ,remaining,attempts,report}=this;
  sizes.fill(0);this.unique=0;if(++this.epoch>=4096){this.grid.fill(0);this.epoch=1;}
  for(let i=0;i<count;i++){
   const x=Math.floor(xs[i]/COLLISION_CELL),z=Math.floor(zs[i]/COLLISION_CELL),slot=this.lookup(x,z,true);
   if(!sizes[slot]){cellX[slot]=x;cellZ[slot]=z;}sizes[slot]++;slots[i]=slot;
  }
  offsets[0]=0;for(let i=0,limit=this.dense?this.unique:sizes.length;i<limit;i++){offsets[i+1]=offsets[i]+sizes[i];cursor[i]=offsets[i];}
  for(let i=0;i<count;i++)members[cursor[slots[i]]++]=i;
  for(let ai=0;ai<count;ai++){
   const aid=ids[ai],bx=Math.floor(xs[ai]/COLLISION_CELL),bz=Math.floor(zs[ai]/COLLISION_CELL);let visited=0;
   const rotation=(aid+tick+pass)%9;
   for(let n=0;n<9;n++){
    const cell=(n+rotation)%9,slot=this.lookup(bx+cell%3-1,bz+Math.floor(cell/3)-1),length=slot<0?0:sizes[slot];if(!length)continue;
    const start=(Math.imul(aid,31)+tick+pass)>>>0,offset=offsets[slot];let position=start%length;
    for(let k=0;k<length;k++){
     if(visited++>=COLLISION_CANDIDATES){report.limited++;break;}
     const bi=members[offset+position];if(++position===length)position=0;report.candidates++;const bid=ids[bi];if(aid>=bid)continue;
     const dx=xs[bi]-xs[ai],dz=zs[bi]-zs[ai],min=radii[ai]+radii[bi],d2=dx*dx+dz*dz;if(d2>=min*min)continue;
     const d=Math.sqrt(d2),overlap=min-d;if(overlap<1e-5)continue;
     report.contacts++;report.maxPenetration=Math.max(report.maxPenetration,overlap);
     if((remaining[ai]<1e-7||attempts[ai]>=COLLISION_CONSTRAINTS)&&(remaining[bi]<1e-7||attempts[bi]>=COLLISION_CONSTRAINTS))continue;
     let x:number,z:number;
     if(d>1e-9){x=dx/d;z=dz/d;}else{const fallback=directions[(Math.imul(aid,73856093)^Math.imul(bid,19349663))>>>0&7];x=fallback[0];z=fallback[1];}
     const mobilityA=mobility[ai],mobilityB=mobility[bi],share=mobilityA/(mobilityA+mobilityB||1);
     const movedA=this.push(ai,-x,-z,overlap*share),movedB=this.push(bi,x,z,overlap-movedA);
     if(movedB<overlap-movedA-1e-6)this.push(ai,-x,-z,overlap-movedA-movedB);
    }
    if(visited>=COLLISION_CANDIDATES)break;
   }
  }
 }
 solve(input:readonly CircleBody[],canMove:(body:CircleBody,to:Vec2)=>boolean,tick:number):CollisionReport{
  let bodies=input;for(let i=1;i<input.length;i++)if(input[i].id<input[i-1].id){bodies=[...input].sort((a,b)=>a.id-b.id);break;}
  const count=input.length;this.prepare(count);this.count=count;this.bodies=bodies;this.canMove=canMove;
  this.remaining.fill(COLLISION_MAX_PUSH,0,count);this.attempts.fill(0,0,count);
  this.report={candidates:0,contacts:0,maxPenetration:0,limited:0,constraints:0,constraintLimited:0};
  for(let i=0;i<count;i++){const b=bodies[i];this.xs[i]=b.x;this.zs[i]=b.z;this.radii[i]=b.radius;this.ids[i]=b.id;this.mobility[i]=b.mobility??1;}
  this.prepareDense();for(let pass=0;pass<COLLISION_PASSES;pass++)this.pass(pass,tick);
  for(let i=0;i<count;i++)if(this.attempts[i]>=COLLISION_CONSTRAINTS)this.report.constraintLimited++;
  return this.report;
 }
}
const solver=new CircleSolver();let busy=false;
export function separateCircles<T extends CircleBody>(input:readonly T[],canMove:(body:T,to:Vec2)=>boolean,tick=0):CollisionReport{
 const borrowed=!busy;if(borrowed)busy=true;
 try{return (borrowed?solver:new CircleSolver()).solve(input,canMove as (body:CircleBody,to:Vec2)=>boolean,tick);}
 finally{if(borrowed){busy=false;solver.bodies=[];solver.canMove=()=>false;}}
}
