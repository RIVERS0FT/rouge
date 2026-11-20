import {kernel,physicsCensus,packBattleUnits,commitBattleUnits,geometrySnapshot,type UnitCensus} from './groundKernel.ts';
import type {Unit,GameState} from './types.ts';
import type {UnitStats} from './content.ts';
import type {CombatLanes} from './talentEffects.ts';
import type {CollisionReport} from './collision.ts';

type Reply={type:'done';id:number;units:Float64Array;report:CollisionReport;times:{prepare:number;solve:number;total:number}};
type WorkerSlot={worker:Worker;generation:number;pathLength:number;buffer?:ArrayBuffer;ready:Promise<void>;rejectReady:(error:Error)=>void;timer?:ReturnType<typeof setTimeout>;pending?:{id:number;resolve:(value:Reply)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}};
type Dirty={all:boolean;units:Set<Unit>;owners:Set<number>};
const SCRATCH=48*1024*1024;
export class PhysicsPool {
 private cache={data:new Float64Array(0),rows:new WeakMap<Unit,number>(),pathEpoch:-1,ordered:[] as Unit[]};
 private slots:WorkerSlot[]=[];private jobId=0;private busy=false;private closed=false;
 failed=false;last:{prepare:number;total:number;jobs:({units:number}&Reply['times'])[]}|undefined;
 constructor(factory:string|(()=>Worker),count=8){
  if(!Number.isInteger(count)||count<1||count>8)throw Error('Invalid physics worker count');
  const geometry=geometrySnapshot();
  try{for(let i=0;i<count;i++){
   const worker=typeof factory==='string'?new Worker(factory,{type:'module'}):factory(),slot={} as WorkerSlot;
   slot.worker=worker;slot.generation=-1;slot.pathLength=0;
   slot.ready=new Promise((resolve,reject)=>{
    slot.rejectReady=reject;slot.timer=setTimeout(()=>this.fail(Error('Physics initialization timed out')),30000);
    worker.onmessage=({data})=>{
     if(this.closed)return;
     if(data.type==='ready'){clearTimeout(slot.timer);resolve();}
     else if(data.type==='error')this.fail(Error(data.error+'\n'+(data.stack??'')));
     else if(data.type==='done'){
      const pending=slot.pending;if(!pending||data.id!==pending.id){this.fail(Error('Unexpected physics reply'));return;}
      clearTimeout(pending.timer);slot.pending=undefined;pending.resolve(data);
     }
    };
    worker.onerror=event=>this.fail(Error(event.message||'Physics worker failed'));
    worker.onmessageerror=()=>this.fail(Error('Invalid physics worker message'));
   });
   void slot.ready.catch(()=>{});this.slots.push(slot);worker.postMessage({type:'init',geometry});
  }}catch(error){this.fail(error instanceof Error?error:Error(String(error)));throw error;}
 }
 private fail(error:Error):void{this.failed=true;this.dispose(error);}
 async ready():Promise<void>{if(this.closed)throw Error('Physics pool is closed');await Promise.all(this.slots.map(slot=>slot.ready));if(this.closed)throw Error('Physics pool is closed');}
 dispose(error=Error('Physics pool disposed')):void{
  if(this.closed)return;this.closed=true;
  for(const slot of this.slots){clearTimeout(slot.timer);slot.rejectReady(error);if(slot.pending){clearTimeout(slot.pending.timer);slot.pending.reject(error);slot.pending=undefined;}slot.worker.terminate();}
 }
 async run(active:readonly Unit[],statsFor:(owner:number,kind:Unit['kind'])=>UnitStats,state:GameState,dirty?:Dirty,lanes?:CombatLanes):Promise<{damage:Map<number,{amount:number;attacker:number}>;collision:CollisionReport;census:UnitCensus}>{
  if(this.busy)throw Error('Overlapping physics steps');this.busy=true;
  try{
   await this.ready();const started=performance.now(),n=active.length;
   if(!n||n>65536||!Number.isInteger(state.tick)||state.tick<0||state.tick>0xffffffff||active.some(u=>u.id<1||u.id>0x7fffffff))throw Error('Unsupported parallel army size or identifiers');
   for(let i=1;i<n;i++)if(active[i].id<=active[i-1].id)throw Error('Parallel physics requires ordered entity IDs');
   const p=packBattleUnits(active,statsFor,state,true,this.cache,dirty,lanes);kernel.partitionBattalions();
   const order=new Uint32Array(kernel.memory.buffer,kernel.assignPhysicsJobs(this.slots.length),n),offsets=new Uint32Array(kernel.memory.buffer,kernel.physicsJobOffsetsPointer(),this.slots.length+1);
   const jobs=this.slots.map((_,i)=>({count:offsets[i+1]-offsets[i]})),owners=Int32Array.from(state.provinces,province=>province.owner),partitioned=performance.now();
   const replies=await Promise.all(jobs.map(async(job,index)=>{
    if(this.closed)throw Error('Physics pool is closed');
    const slot=this.slots[index];if(!job.count)return null;
    kernel.packPhysicsJob(index,SCRATCH);
    const length=job.count*32,bytes=length*Float64Array.BYTES_PER_ELEMENT;
    const buffer=slot.buffer&&slot.buffer.byteLength>=bytes?slot.buffer:new ArrayBuffer(Math.ceil(bytes/65536)*65536);
    slot.buffer=undefined;
    const units=new Float64Array(buffer,0,length);
    units.set(new Float64Array(kernel.memory.buffer,SCRATCH,length));
    const pathStart=slot.generation===p.pathEpoch?slot.pathLength:0,pathDelta=pathStart<p.paths.length?p.paths.slice(pathStart):undefined;
    slot.generation=p.pathEpoch;slot.pathLength=p.paths.length;const id=++this.jobId;
    const reply=await new Promise<Reply>((resolve,reject)=>{
     const timer=setTimeout(()=>this.fail(Error('Physics step timed out')),10000);slot.pending={id,resolve,reject,timer};
     try{slot.worker.postMessage({type:'step',id,tick:state.tick,units,owners,pathStart,pathDelta},[units.buffer]);}
     catch(error){this.fail(error instanceof Error?error:Error(String(error)));}
    });
    if(!(reply.units instanceof Float64Array)||reply.units.length!==job.count*32)throw Error('Invalid physics reply size');
    slot.buffer=reply.units.buffer as ArrayBuffer;
    return {reply,job:index,count:job.count};
   }));
   const collision:CollisionReport={candidates:0,contacts:0,maxPenetration:0,limited:0,constraints:0,constraintLimited:0};
   for(const result of replies)if(result){const {reply}=result;new Float64Array(kernel.memory.buffer,SCRATCH,reply.units.length).set(reply.units);kernel.unpackPhysicsJob(result.job,SCRATCH);for(const field of ['candidates','contacts','limited','constraints','constraintLimited']as const)collision[field]+=reply.report[field];collision.maxPenetration=Math.max(collision.maxPenetration,reply.report.maxPenetration);}
   const census=physicsCensus(state.provinces.length,state.players.length);
   const damage=new Map<number,{amount:number;attacker:number}>();commitBattleUnits(active,p.data,damage,true);
   if(this.cache.data.length<p.data.length)this.cache.data=new Float64Array(Math.ceil(p.data.length/8192)*8192);
   this.cache.data.set(p.data);this.cache.pathEpoch=p.pathEpoch;this.cache.ordered=active.slice();
   this.last={prepare:partitioned-started,total:performance.now()-started,jobs:replies.filter(result=>result!==null).map(result=>({units:result.count,...result.reply.times}))};
   return {damage,collision,census};
  }catch(error){if(this.slots.some(slot=>slot.pending))this.fail(error instanceof Error?error:Error(String(error)));throw error;}
  finally{this.busy=false;}
 }
}
