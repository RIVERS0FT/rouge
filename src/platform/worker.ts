import {Engine,PARALLEL_MIN_UNITS} from '../game/engine.ts';
import {validateState} from '../game/save.ts';
import {encodeLocalFrame,type LocalBase} from './localFrames.ts';
import {PhysicsPool} from '../game/physicsPool.ts';

let engine:Engine|null=null,pool:PhysicsPool|undefined,paused=false,speed=1,base:LocalBase|undefined;
let running=false,timer:ReturnType<typeof setTimeout>|undefined,deadline=0,poolAttempted=false;
const messages:{type:string;[key:string]:any}[]=[];
const send=(message:unknown,transfer:Transferable[]=[])=>{(self as unknown as Worker).postMessage(message,transfer);};
const publish=()=>{if(!engine)return;const next=encodeLocalFrame(engine.state,base);send(next.frame,next.transfer);base=next.base;};
function stopPool():void{pool?.dispose();pool=undefined;}
async function startPool():Promise<void>{
 if(!engine||poolAttempted||typeof Worker!=='function'||engine.state.units.length<PARALLEL_MIN_UNITS)return;
 poolAttempted=true;
 try{
  const memory=(navigator as Navigator&{deviceMemory?:number}).deviceMemory??4,count=Math.min(8,Math.max(1,(navigator.hardwareConcurrency??2)-2),memory>=8?8:memory>=4?4:2);
  pool=new PhysicsPool(()=>new Worker(new URL('./physics.worker.ts',import.meta.url),{type:'module'}),count);
  engine.prewarmNavigation();await pool.ready();
 }catch(error){console.warn('Parallel simulation unavailable; using the synchronous engine',error);stopPool();}
}
function schedule():void {
 clearTimeout(timer);timer=undefined;
 if(!engine||paused||engine.state.winner!==null){deadline=0;return;}
 if(!deadline)deadline=performance.now()+50;
 timer=setTimeout(()=>{timer=undefined;messages.push({type:'advance'});void drain();},Math.max(0,deadline-performance.now()));
}
async function handle(m:{type:string;[key:string]:any}):Promise<void>{
 if(m.type==='init'){
  clearTimeout(timer);timer=undefined;deadline=0;stopPool();poolAttempted=false;
  if(!validateState(m.state)){engine=null;base=undefined;send({type:'error',error:'invalidSave'});return;}
  engine=new Engine(m.state);base=undefined;paused=false;publish();
  await startPool();
 }else if(m.type==='command'&&engine){const result=engine.command(0,m.command);send({type:'result',result});publish();}
 else if(m.type==='pause'){paused=Boolean(m.value);deadline=0;}
 else if(m.type==='speed'){speed=m.value===2?2:1;}
 else if(m.type==='advance'&&engine&&!paused&&engine.state.winner===null){
  await startPool();
  if(pool&&!pool.failed)await engine.stepParallel((...args)=>pool!.run(...args),speed);else engine.step(speed);
  if(pool?.failed)stopPool();if(!base||engine.state.tick-base.tick>=2||engine.state.winner!==null)publish();if(engine.state.winner!==null)stopPool();
  deadline+=50;
  // At most five ticks of catch-up; pauses and new campaigns start a fresh clock.
  if(deadline<performance.now()-250)deadline=performance.now();
 }
}
async function drain():Promise<void>{
 if(running)return;running=true;
 try{while(messages.length)await handle(messages.shift()!);}
 catch(error){console.error(error);engine=null;base=undefined;stopPool();send({type:'error',error:'workerFailed'});}
 finally{running=false;schedule();}
}
self.onmessage=({data}:MessageEvent)=>{messages.push(data);void drain();};
send({type:'ready'});
