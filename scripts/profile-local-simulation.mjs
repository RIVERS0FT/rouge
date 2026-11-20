import {build} from 'esbuild';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {resolve,dirname,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {cpus,totalmem} from 'node:os';
import {chromium} from 'playwright';

const options=Object.fromEntries(process.argv.slice(2).map(arg=>{const [key,...rest]=arg.replace(/^--/,'').split('=');return[key,rest.join('=')];}));
if(!options.snapshot)throw Error('Use --snapshot=<JSON with state> [--seconds=30] [--warmup=5] [--output=<report.json>]');
const seconds=Number(options.seconds??30),warmup=Number(options.warmup??5),target=Number(options.target??20);
const steps=options.steps===undefined?0:Number(options.steps);
if(options.steps!==undefined&&(!Number.isSafeInteger(steps)||steps<2||steps%2||warmup!==0))throw Error('Fixed-step replay requires an even step count and --warmup=0');
if(!Number.isFinite(seconds)||seconds<5||seconds>300||!Number.isFinite(warmup)||warmup<0||warmup>60)throw Error('Invalid sampling duration');
if(!Number.isFinite(target)||target<=0)throw Error('Invalid target tick rate');
const source=await readFile(options.snapshot,'utf8'),snapshot=JSON.parse(source),reference=options.reference&&resolve(options.reference);
const engine=reference?resolve(reference,'engine.ts').replaceAll('\\','/'):'./src/game/engine.ts';
const legacy=reference?`import {encodeFrame} from './src/platform/replication.ts';
 let engine=null,base,paused=false;
 const publish=()=>{const next=encodeFrame(engine.state,base,0,true);postMessage(next.frame);base=next.base;};
 onmessage=({data})=>{if(data.type==='init'){engine=new Engine(data.state);base=undefined;publish();}else if(data.type==='pause')paused=data.value;};
 setInterval(()=>{if(engine&&!paused&&engine.state.winner===null){engine.step();if(engine.state.tick%2===0)publish();}},50);
 postMessage({type:'ready'});`:`import './src/platform/worker.ts';`;
const entry=`import {Engine} from ${JSON.stringify(engine)};${reference?'':"import {kernel} from './src/game/groundKernel.ts';"}
 ${legacy}
 let times=[];const method=${JSON.stringify(reference?'step':'stepParallel')},original=Engine.prototype[method];
 Engine.prototype[method]=${reference?`function(...args){const start=performance.now();try{return original.apply(this,args);}finally{times.push(performance.now()-start);}}`:`async function(...args){const start=performance.now();try{return await original.apply(this,args);}finally{times.push(performance.now()-start);}}`};
 addEventListener('message',({data})=>{if(data.type==='profile-start')times=[];else if(data.type==='profile-finish')postMessage({type:'profile-result',times,memoryBytes:${reference?'null':'kernel.memory.buffer.byteLength'}});});`;
const client=`import {applyLocalFrame} from './src/platform/localFrames.ts';import {applyFrame} from './src/platform/replication.ts';window.applySimulationFrame=(current,frame)=>frame.type==='local'?applyLocalFrame(current,frame):applyFrame(current,frame);`;
const bundle=async(contents,name)=>(await build({stdin:{contents,resolveDir:process.cwd(),sourcefile:name},bundle:true,write:false,format:'esm',platform:'browser',plugins:[{name:'file-imports',setup(build){build.onResolve({filter:/^file:/},args=>({path:fileURLToPath(args.path)}));}}]})).outputFiles[0].text;
const [worker,physics,pageClient]=await Promise.all([bundle(entry,'profile-worker.ts'),bundle("import './src/platform/physics.worker.ts';",'profile-physics.ts'),bundle(client,'profile-client.ts')]);
const server=createServer((req,res)=>{
 const state=req.url==='/state.json';res.setHeader('Content-Type',state?'application/json':req.url==='/'?'text/html':'text/javascript');
 res.end(state?source:req.url==='/worker.js'?worker:req.url==='/physics.worker.ts'?physics:req.url==='/client.js'?pageClient:'<!doctype html><title>Local simulation clock acceptance</title><script type="module" src="/client.js"></script>');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({executablePath:options.chrome??process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{
 const page=await browser.newPage();page.on('console',message=>{if(['warning','error'].includes(message.type()))console.log(message.type()+': '+message.text());});page.on('pageerror',error=>console.log(error.stack));await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>typeof window.applySimulationFrame==='function');
 await page.exposeFunction('reportProgress',value=>console.log(JSON.stringify(value)));
 const result=await page.evaluate(async({seconds,warmup,steps})=>{
  const {state}=await(await fetch('/state.json')).json();
  return new Promise((resolve,reject)=>{
   const worker=new Worker('/worker.js',{type:'module'}),started=performance.now(),decodeTimes=[],frames=[];
   let current=null,readyAt=0,firstTick=0,firstAt=0,lastAt=0,lastTick=0,lastProgress=0,finishing=false;
   const timer=setTimeout(()=>{worker.terminate();reject(Error('Local clock benchmark timed out'));},(steps?600:seconds+warmup+120)*1000);
   const fail=error=>{clearTimeout(timer);worker.terminate();reject(error);};
   worker.onerror=event=>fail(Error(event.message));
   worker.onmessage=({data})=>{
    try{
     if(data.type==='ready'){worker.postMessage({type:'init',state});return;}
     if(data.type==='error'){fail(Error(data.error));return;}
     if(data.type==='profile-result'){
      clearTimeout(timer);worker.terminate();resolve({firstStateMs:readyAt-started,initialTick:state.tick,initialUnits:state.units.length,startTick:firstTick,endTick:lastTick,endUnits:current.units.length,elapsedMs:lastAt-firstAt,ticksPerSecond:(lastTick-firstTick)*1000/(lastAt-firstAt),times:data.times,memoryBytes:data.memoryBytes,decodeTimes,frames,hardwareConcurrency:navigator.hardwareConcurrency,deviceMemory:navigator.deviceMemory??null});return;
     }
     if(!['local','state','delta'].includes(data.type)||finishing)return;
     const received=performance.now();current=window.applySimulationFrame(current,data);decodeTimes.push(performance.now()-received);
     if(!readyAt){readyAt=received;window.reportProgress({initialized:true,tick:current.tick,units:current.units.length,firstStateMs:readyAt-started});}
     if(!firstAt&&received-readyAt>=warmup*1000){firstAt=received;firstTick=current.tick;worker.postMessage({type:'profile-start'});}
     if(!firstAt)return;
     lastAt=received;lastTick=current.tick;frames.push({elapsedMs:received-firstAt,tick:current.tick,units:current.units.length});
     if(received-lastProgress>=5000){lastProgress=received;window.reportProgress({elapsedMs:received-firstAt,tick:current.tick,units:current.units.length});}
     if(steps?current.tick>=firstTick+steps:received-firstAt>=seconds*1000){finishing=true;worker.postMessage({type:'pause',value:true});worker.postMessage({type:'profile-finish'});}
    }catch(error){fail(error);}
   };
  });
 },{seconds,warmup,steps});
 if(steps&&(result.startTick!==snapshot.state.tick||result.endTick!==result.startTick+steps))throw Error('Fixed-step worker window missed a tick boundary');
 const average=values=>values.reduce((sum,value)=>sum+value,0)/values.length,percentile=(values,q)=>[...values].sort((a,b)=>a-b)[Math.min(values.length-1,Math.floor(values.length*q))];
 const files=['src/game/engine.ts','src/game/map.ts','src/game/terrain-navigation.ts','src/game/buildings.ts','src/game/collision.ts','src/game/polygonQuery.ts','src/game/groundKernel.ts','src/game/physicsPool.ts','src/game/unitFallback.ts','src/platform/worker.ts','src/platform/physics.worker.ts','src/platform/localFrames.ts','src/platform/localSession.ts','scripts/simulation-kernel.as.ts','scripts/build-simulation.mjs','src/generated/simulationKernel.ts','package.json','package-lock.json','scripts/profile-local-simulation.mjs'];
 if(reference)for(const name of ['engine.ts','map.ts','terrain-navigation.ts','buildings.ts','collision.ts','polygonQuery.ts'])files.push(relative(process.cwd(),resolve(reference,name)).replaceAll('\\','/'));
 const hashes={};for(const path of files)hashes[path]=createHash('sha256').update(await readFile(path)).digest('hex');
 // UI state arrives every two ticks. Preserve the raw rate and allow one
 // publication interval of boundary error when testing the nominal clock.
 const clockResolutionTicks=2,clockShortfallTicks=target*result.elapsedMs/1000-(result.endTick-result.startTick);
 const checks={stepBudget:average(result.times)<=1000/target,nominalWallClock:clockShortfallTicks<=clockResolutionTicks};
 const report={schema:1,at:new Date().toISOString(),mode:reference?'reference':'candidate',snapshotSha256:createHash('sha256').update(source).digest('hex'),campaign:snapshot.state.campaign,browser:browser.version(),cpu:cpus()[0].model,logicalCpus:cpus().length,totalMemoryGiB:totalmem()/1024**3,seconds,warmup,target,clockResolutionTicks,clockShortfallTicks,checks,passed:checks.stepBudget&&checks.nominalWallClock,...result,meanStepMs:average(result.times),p95StepMs:percentile(result.times,.95),computeTicksPerSecond:1000/average(result.times),meanDecodeMs:average(result.decodeTimes),p95DecodeMs:percentile(result.decodeTimes,.95),sourceHashes:hashes};
 if(options.output){await mkdir(dirname(options.output),{recursive:true});await writeFile(options.output,JSON.stringify(report,null,2)+'\n');}
 console.log(JSON.stringify({...report,times:undefined,decodeTimes:undefined,frames:undefined,sourceHashes:undefined}));
 if(!reference&&!report.passed)process.exitCode=1;
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
