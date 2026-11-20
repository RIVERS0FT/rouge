// Exercise the shipping worker protocol, including transfer/detachment, on Node.
import {Worker, parentPort} from 'node:worker_threads';
import {parseArgs} from 'node:util';
import {readFile, writeFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

if(parentPort){
 globalThis.self={postMessage:(message,transfer)=>parentPort.postMessage(message,transfer)};
 await import('../src/platform/physics.worker.ts');
 parentPort.on('message',data=>self.onmessage({data}));
}else{
 const {values}=parseArgs({options:{snapshot:{type:'string'},output:{type:'string'},steps:{type:'string',default:'1200'},workers:{type:'string',default:'8'}}});
 const steps=Number(values.steps),workers=Number(values.workers);
 if(!values.snapshot||!Number.isSafeInteger(steps)||steps<=0)throw Error('Provide --snapshot and a positive step count');
 const [{Engine},{PhysicsPool}]=await Promise.all([import('../src/game/engine.ts'),import('../src/game/physicsPool.ts')]);
 const bytes=await readFile(values.snapshot);
 const {state}=JSON.parse(bytes);
 const reference=new Engine(state),parallel=new Engine(state);
 parallel.prewarmNavigation();
 const pool=new PhysicsPool(()=>{
  const worker=new Worker(new URL(import.meta.url));
  const adapter={postMessage:(...args)=>worker.postMessage(...args),terminate:()=>worker.terminate()};
  worker.on('message',data=>adapter.onmessage({data}));
  worker.on('error',error=>adapter.onerror(error));
  return adapter;
 },workers);
 let jobs=0,failedJob;
 try{
  await pool.ready();
  const started=performance.now();
  for(let i=0;i<steps;i++){
   reference.step();
   await parallel.stepParallel(async(...args)=>{
    try{const result=await pool.run(...args);jobs++;return result;}catch(error){failedJob=error;throw error;}
   });
   if(failedJob)throw failedJob;
   assert.equal(parallel.state.tick,state.tick+i+1);
   assert.deepEqual(parallel.collision,reference.collision,'Collision report at '+parallel.state.tick);
   assert.deepEqual(parallel.state,reference.state,'Full game state at '+parallel.state.tick);
   if((i+1)%100===0)console.log('Verified '+(i+1)+' ticks');
  }
  assert.ok(jobs>0,'Replay must exercise the parallel kernel');
  const result={campaign:state.campaign,snapshotSha256:createHash('sha256').update(bytes).digest('hex'),initialTick:state.tick,endTick:parallel.state.tick,steps,workers,parallelSteps:jobs,synchronousSteps:steps-jobs,fullStateIdentical:true,collisionReportsIdentical:true,verificationMs:performance.now()-started};
  if(values.output)await writeFile(values.output,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result));
 }finally{pool.dispose();}
}
