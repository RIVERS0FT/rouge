// Run identical production builds, fixtures and camera motions on both sides.
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {resolve,join,dirname,relative} from 'node:path';
import {parseArgs} from 'node:util';
import {preview} from 'vite';
import {buildPerformancePreview} from './build-performance-preview.mjs';
import {measureIsolatedBuild} from './profile-isolated-build.mjs';
import {createFullyOccupiedFixture} from '../tests/fully-occupied-fixture.mjs';
import {formationLoad,growLateGame} from './performance-loads.mjs';
import {measureLanBuild} from './profile-lan-build.mjs';
import {validateState} from '../src/game/save.ts';
import {mapUnitsWithShips} from '../src/render/unitPresentation.ts';

const {values}=parseArgs({options:{reference:{type:'string'},candidate:{type:'string',default:'.'},
 snapshot:{type:'string',default:'.cache/perf-campaign-nov18/real.json'},active:{type:'string',default:'.cache/perf-campaign-nov18/synthetic.json'},
 output:{type:'string',default:'.cache/performance-baseline'},report:{type:'string'},scenarios:{type:'string'},rounds:{type:'string',default:'3'},resume:{type:'boolean'},late:{type:'string'}}});
const directory=resolve(values.output),rounds=Number(values.rounds);
if(!Number.isSafeInteger(rounds)||rounds<1)throw Error('Rounds must be a positive integer.');
await mkdir(directory,{recursive:true});
const specs=[
 {id:'real2d',source:'real',view:'flat900',target:60,focus:[122.074327145583,-549.508845705757]},
 {id:'real3d',source:'real',view:'near60',target:30,focus:[-82.3046755766882,-412.427772597611],dense:true},
 {id:'active2d',source:'active',view:'flat900',target:60},
 {id:'active3d',source:'active',view:'near60',target:30},
 {id:'map3d',source:'full',view:'near60',target:60,paused:true},
 {id:'ai2d',source:'full',view:'flat900',target:60},{id:'ai3d',source:'full',view:'near60',target:30},
 {id:'fixed-worker',source:'real',fixed:true},{id:'fixed-2d',source:'real',fixed:true,view:'flat900'},
 {id:'fixed-3d',source:'real',fixed:true,view:'near60'},
 {id:'double2d',source:'real',view:'flat900',speed:2},{id:'double3d',source:'real',view:'near60',speed:2},
 {id:'input',source:'active',inputs:true},
 {id:'touch',source:'active',touch:true},{id:'soak',source:'active',soak:true},{id:'lan',source:'active',lan:true},
 {id:'late2d',source:'late',view:'flat900'},{id:'late3d',source:'late',view:'near60'},
 ...['march','bottleneck','landing','battle'].flatMap(load=>[330,1600].map(armies=>({
  id:load+'-'+armies,source:load+'-'+armies,view:'near60',load,armies}))),
];
const selected=values.scenarios?values.scenarios.split(','):specs.map(s=>s.id);
if(new Set(selected).size!==selected.length)throw Error('A scenario may only be selected once.');
for(const id of selected)if(!specs.some(s=>s.id===id))throw Error('Unknown scenario '+id);
const sources={real:resolve(values.snapshot),active:resolve(values.active),full:join(directory,'fully-occupied.json')};
if(specs.some(s=>selected.includes(s.id)&&s.source==='full'))await writeFile(sources.full,JSON.stringify(createFullyOccupiedFixture()));
if(specs.some(s=>selected.includes(s.id)&&s.source==='late')){
 sources.late=values.late?resolve(values.late):join(directory,'late.json');
 if(!values.late)await writeFile(sources.late,JSON.stringify(await growLateGame(JSON.parse(await readFile(sources.real,'utf8')))));
}
for(const s of specs.filter(s=>s.load&&selected.includes(s.id))){
 sources[s.source]=join(directory,s.source+'.json');
 await writeFile(sources[s.source],JSON.stringify(formationLoad(JSON.parse(await readFile(sources.real,'utf8')),s.load,s.armies)));
}
const fixtures={};
for(const kind of new Set(specs.filter(s=>selected.includes(s.id)).map(s=>s.source))){
 const bytes=await readFile(sources[kind]),capture=JSON.parse(bytes);
 const s=capture.state;
 if(!validateState(s)||s.winner!==null)throw Error('Invalid or finished fixture: '+kind);
 if((kind==='real'||kind==='active')&&(s.units.length<9750||s.units.length>10500||s.provinces.some(p=>p.owner===0)!==(kind==='active')))throw Error('Expected a 10k '+kind+' fixture with the correct player status');
 if(kind==='late'&&(s.units.length<24500||s.units.length>25500))throw Error('Expected a 25k fixture compatible with the current rules');
 const pressure=specs.find(spec=>spec.source===kind&&spec.load);
 if(pressure){
  if(s.units.length!==10000||s.armies.length!==pressure.armies)throw Error('Invalid workload size: '+kind);
  const cells=new Map();
  for(const u of mapUnitsWithShips(s.units)){
   const key=Math.floor(u.x/15)+','+Math.floor(u.z/15),cell=cells.get(key)??{x:0,z:0,n:0};
   cell.x+=u.x;cell.z+=u.z;cell.n++;cells.set(key,cell);
  }
  const cell=[...cells.values()].sort((a,b)=>b.n-a.n)[0];if(!cell)throw Error('Empty workload viewport: '+kind);
  pressure.focus=[cell.x/cell.n,cell.z/cell.n];
 }
 fixtures[kind]={sha256:createHash('sha256').update(bytes).digest('hex'),tick:capture.state.tick,armies:capture.state.armies.length,units:capture.state.units.length};
}
const builds={},servers=[],results=[],scripts={};
const harness=createHash('sha256');
for(const name of ['profile-baseline','frame-probe','profile-frame-rate','profile-isolated-build','profile-lan-build','profile-player-input','build-performance-preview','performance-loads']){
 const bytes=await readFile(new URL('./'+name+'.mjs',import.meta.url));
 harness.update(bytes);scripts[name]=createHash('sha256').update(bytes).digest('hex');
}
const harnessSha256=harness.digest('hex'),summaryPath=join(directory,'summary.json');
// Shared simulation modules also ship in the benchmark build. The LAN HTTP
// server runs from its Node source, so its revision must be pinned separately.
const lanRuntime=selected.includes('lan')?{
 node:process.version,
 server:Object.fromEntries(await Promise.all(Object.entries({...(values.reference?{before:values.reference}:{}),after:values.candidate}).map(async([variant,root])=>
  [variant,createHash('sha256').update(await readFile(resolve(root,'server/lan.ts'))).digest('hex')]))),
}:undefined;
const scenarioSignatures=Object.fromEntries(specs.map(spec=>{
 const names=['profile-baseline','build-performance-preview',...(spec.lan?['profile-lan-build']:spec.id==='fixed-worker'?['profile-isolated-build']:['frame-probe','profile-frame-rate']),
  ...(spec.inputs||spec.touch||spec.soak?['profile-player-input']:[])];
 return [spec.id,createHash('sha256').update(JSON.stringify([spec,...names.map(k=>scripts[k]),...(spec.lan?[lanRuntime]:[])])).digest('hex')];
}));
const focuses=new Map(),comparisons={};
const summary=()=>({fixtures,builds,lanRuntime,harnessSha256,scenarioSignatures,rounds,selected,results,comparisons});
async function checkpoint(extra={}){
 const snapshot={...summary(),complete:false,accepted:false,...extra};
 await writeFile(summaryPath+'.tmp',JSON.stringify(snapshot,null,2));
 await rename(summaryPath+'.tmp',summaryPath);
 if(values.report){
  // A portable receipt omits ephemeral preview ports, save files and local user paths.
  const report=resolve(values.report);
  const portable={...snapshot,builds:Object.fromEntries(Object.entries(builds).map(([k,b])=>[k,b.sha256])),
   results:results.map(({file,...row})=>({...row,raw:relative(directory,file).replaceAll('\\','/')}))};
  await mkdir(dirname(report),{recursive:true});await writeFile(report+'.tmp',JSON.stringify(portable,null,2)+'\n');await rename(report+'.tmp',report);
 }
}
function comparison(spec){
 const rows=results.filter(r=>r.scenario===spec.id&&r.valid);
 const median=xs=>{xs.sort((a,b)=>a-b);const i=Math.floor(xs.length/2);return xs.length%2?xs[i]:(xs[i-1]+xs[i])/2;};
 const metrics={};
 const measures={fps:r=>r.fps,ticksPerSecond:r=>r.ticksPerSecond,p95GapMs:r=>r.p95GapMs,p95InputMs:r=>r.p95InputMs};
 if(spec.lan)for(const [i,seat] of ['host','guest'].entries()){
  measures[seat+'Fps']=r=>r.clients?.[i]?.fps;
  measures[seat+'RttMs']=r=>r.clients?.[i]?.p95CommandMs;
 }
 if(spec.touch)for(const kind of ['pan','pinch'])measures[kind+'P95Ms']=r=>r.gestures?.find(g=>g.kind===kind)?.p95Ms;
 for(const [key,measure] of Object.entries(measures)){
  const sign=key.endsWith('Ms')?-1:1;
  const both=['before','after'].map(variant=>rows.filter(r=>r.variant===variant).map(measure).filter(Number.isFinite));
  if(both.some(xs=>xs.length<rounds))continue;
  const [before,after]=both.map(median);
  if(before>0)metrics[key]={before,after,regression:(before-after)*sign/before};
 }
 return {metrics,regressed:Object.values(metrics).some(m=>m.regression>.1)};
}
const previous=values.resume?await readFile(summaryPath,'utf8').then(JSON.parse).catch(e=>{if(e.code!=='ENOENT')throw e;}):null;
try{
 for(const [variant,root] of Object.entries({...(values.reference?{before:values.reference}:{}),after:values.candidate})){
  const dist=join(directory,variant,'dist'),sha256=await buildPerformancePreview(root,dist);
  const server=await preview({configFile:false,root:resolve(root),build:{outDir:dist},preview:{host:'127.0.0.1',port:0},logLevel:'warn'});
  servers.push(server);builds[variant]={sha256,root:resolve(root),dist,url:'http://127.0.0.1:'+server.httpServer.address().port};
 }
 if(previous&&(previous.rounds!==rounds||JSON.stringify(previous.selected)!==JSON.stringify(selected)||
  Object.keys(builds).length!==Object.keys(previous.builds).length||
  Object.entries(builds).some(([key,b])=>b.sha256!==previous.builds[key]?.sha256)))throw Error('Resume requires identical builds, variants, rounds and scenario selection. Use a different output directory.');
 if(!previous)await checkpoint();
 const extra=new Set();
 for(let round=1;round<=rounds+(rounds>=3&&builds.before?3:0);round++){
  if(round===rounds+1)for(const s of specs.filter(s=>selected.includes(s.id)&&!s.target&&!s.fixed&&!s.inputs&&!s.soak)){
   if(comparison(s).regressed)extra.add(s.id);
  }
  const ordered=selected.map(id=>specs.find(s=>s.id===id)).filter(s=>round<=rounds||extra.has(s.id));
  if(round%2===0)ordered.reverse();
  for(const spec of ordered){
   if(spec.soak&&round>1)continue;
   const variants=Object.entries(builds);
   if(round%2===0)variants.reverse();
   for(const [variant,build] of variants){
    const file=join(directory,variant,spec.id+'-'+round+'.json');
    const reusable=previous?.fixtures[spec.source]?.sha256===fixtures[spec.source].sha256&&
     previous?.scenarioSignatures?.[spec.id]===scenarioSignatures[spec.id];
    const saved=reusable&&previous.results.find(r=>r.round===round&&r.variant===variant&&r.scenario===spec.id&&r.valid);
    if(saved&&createHash('sha256').update(await readFile(file).catch(()=>Buffer.alloc(0))).digest('hex')===saved.rawSha256){
     results.push(saved);if(saved.focus)focuses.set(spec.id,saved.focus);continue;
    }
    try{
    let metrics;
    if(spec.lan){
     const raw=await measureLanBuild(build.root,build.dist,JSON.parse(await readFile(sources.active,'utf8')));
     await writeFile(file,JSON.stringify(raw));
     const rtts=raw.clients.flatMap(c=>c.commandMs).sort((a,b)=>a-b);
     metrics={valid:raw.startTick===fixtures.active.tick&&raw.reconnected&&raw.clients.every(c=>c.startTick===raw.startTick&&c.frames>0&&c.endTick>c.startTick&&c.commandMs.length===30&&c.environment.dpr===1.25&&!/swiftshader|llvmpipe|software/i.test(c.environment.gpu)),passed:null,
      reconnected:raw.reconnected,clients:raw.clients.map(c=>({fps:c.fps,commands:c.commandMs.length,p95CommandMs:[...c.commandMs].sort((a,b)=>a-b)[Math.ceil(c.commandMs.length*.95)-1]})),
      ticksPerSecond:raw.ticksPerSecond,fps:Math.min(...raw.clients.map(c=>c.fps)),p95InputMs:rtts[Math.ceil(rtts.length*.95)-1]};
    }else if(spec.id==='fixed-worker'){
     const raw=await measureIsolatedBuild(build.url,JSON.parse(await readFile(sources.real,'utf8')));
     await writeFile(file,JSON.stringify(raw));
     metrics={ticksPerSecond:raw.ticksPerSecond,elapsedMs:raw.elapsedMs,valid:raw.endTick===fixtures.real.tick+1200,passed:null};
    }else{
     const args=['--experimental-strip-types','scripts/profile-frame-rate.mjs','--production','--drawOnly','--noGpu','--pausedStart','--calibrate',
      '--url='+build.url,'--snapshot='+sources[spec.source],'--output='+file,'--duration=60000',
      ...(spec.touch?['--width=844','--height=390','--dpr=2']:['--width=1510','--height=1090','--dpr=1.25'])];
     const focus=spec.focus??focuses.get(spec.id)??(spec.fixed||spec.speed?specs.find(s=>s.source==='real'&&s.view===spec.view)?.focus:undefined);
     if(focus)args.push('--focusX='+focus[0],'--focusZ='+focus[1]);
     if(spec.source!=='real')args.push('--synthetic');
     if(spec.load)args.push('--collisions');
     if(spec.inputs)args.push('--skipPaused','--inputs=30');
     else if(spec.touch)args.push('--skipPaused','--touch=30');
     else if(spec.soak)args.push('--skipPaused','--soak=30');
     else if(spec.paused)args.push('--mapOnly','--pausedWarmup=60000','--views='+spec.view,'--actions=panzoom');
     else if(spec.fixed||spec.load)args.push('--skipPaused','--fixedTicks=1200','--views='+spec.view);
     else args.push('--skipPaused','--running','--denseFocus','--liveScreenshot','--runningWarmup=60000','--runningViews='+spec.view,'--runningActions=panzoom');
     if(spec.speed)args.push('--speed='+spec.speed);
     await new Promise((ok,fail)=>{const p=spawn(process.execPath,args,{stdio:'inherit'});p.once('error',fail);p.once('exit',n=>n===0?ok():fail(Error('Profiler exited '+n)));});
     const raw=JSON.parse(await readFile(file,'utf8'));
     metrics=assess(spec,raw,fixtures[spec.source]);
     if(raw.measuredFocus){metrics.focus=[raw.measuredFocus.x,raw.measuredFocus.z];focuses.set(spec.id,metrics.focus);}
    }
    const rawSha256=createHash('sha256').update(await readFile(file)).digest('hex');
    results.push({round,variant,scenario:spec.id,file,rawSha256,captureHarnessSha256:harnessSha256,...metrics});
    }catch(e){console.error(spec.id,variant,round,e.message);results.push({round,variant,scenario:spec.id,file,valid:false,passed:false,error:e.message});}
    await checkpoint();
   }
  }
 }
 if(builds.before)for(const s of specs.filter(s=>selected.includes(s.id)&&!s.target&&!s.fixed&&!s.inputs&&!s.soak))comparisons[s.id]={...comparison(s),extraPairs:extra.has(s.id)?3:0};
 const complete=rounds>=3&&specs.every(s=>selected.includes(s.id))&&!!builds.before&&results.every(r=>r.valid);
 const accepted=complete&&results.filter(r=>r.variant==='after').every(r=>r.passed!==false)&&Object.values(comparisons).every(c=>!c.regressed);
 await checkpoint({complete,accepted});
 if(!accepted)process.exitCode=1;
}finally{for(const server of servers)await server.close();}

function assess(spec,raw,fixture){
 if(spec.soak){
  const s=raw.soak;
  const valid=raw.fixture.sha256===fixture.sha256&&raw.errors.length===0&&raw.results.length===30&&s.totalMs>=1800000&&
   raw.results.every((r,i)=>r.elapsedMs>=60000&&r.ticks>0&&r.stateSamples.every(x=>x.winner===null&&x.mode===(i%2?'3d':'2d')))&&
   s.saves.filter(e=>e.method==='auto'&&e.ok).length>=2&&s.saves.every(e=>e.ok)&&s.campaign===s.autoCampaign&&
   s.restored.campaign===s.campaign&&s.restored.tick===s.manualTick&&s.postLoadCommand&&s.priorWorkers===s.closedWorkers;
  return {valid,passed:null,coldLoadMs:raw.coldLoadMs,reloadMs:s.reloadMs,heapBytes:raw.results.map(r=>r.mainThread.JSHeapUsedSize),
   saves:s.saves,manualUi:s.manualUi,autosaveFrames:raw.results.flatMap(r=>r.autosaveFrames??[]),postLoadCommand:s.postLoadCommand,manualTick:s.manualTick,restoredTick:s.restored.tick,priorWorkers:s.priorWorkers,closedWorkers:s.closedWorkers,
   minutes:raw.results.map(r=>({fps:r.renderFps,ticksPerSecond:r.ticks*1000/r.elapsedMs,p95GapMs:r.renderGapMs.p95,maxGapMs:r.renderGapMs.max})),
   fps:raw.results.reduce((sum,r)=>sum+r.renderFps,0)/raw.results.length,
   ticksPerSecond:raw.results.reduce((sum,r)=>sum+r.ticks,0)*1000/raw.results.reduce((sum,r)=>sum+r.elapsedMs,0)};
 }
 if(spec.touch){
  const percentile=xs=>xs.sort((a,b)=>a-b)[Math.ceil(xs.length*.95)-1];
  const times=raw.inputs.filter(e=>e.ok).map(e=>e.ms);
  const gestures=['pan','pinch'].map(kind=>{
   const samples=raw.inputs.filter(e=>e.kind===kind),times=samples.filter(e=>e.ok).map(e=>e.ms);
   return {kind,count:samples.length,confirmed:times.length,p95Ms:percentile(times)};
  });
  const valid=raw.fixture.sha256===fixture.sha256&&raw.errors.length===0&&gestures.every(g=>g.count===30&&g.confirmed===30)&&!/swiftshader|llvmpipe|software/i.test(raw.environment.gpu);
  return {valid,passed:null,gestures,p95InputMs:percentile(times)};
 }
 if(spec.inputs){
  const groups={};
  for(const kind of ['select','drag','dispatch','wheel','to2d','to3d']){
   const inputs=raw.inputs.filter(r=>r.kind===kind);
   const times=inputs.filter(r=>r.ok).map(r=>r.firstMs).sort((a,b)=>a-b);
   const settled=inputs.filter(r=>r.ok).map(r=>r.settledMs).sort((a,b)=>a-b);
   groups[kind]={samples:inputs.length,verified:times.length,p95Ms:times[Math.ceil(times.length*.95)-1]??null,p95SettledMs:settled[Math.ceil(settled.length*.95)-1]??null};
  }
  const valid=raw.fixture.sha256===fixture.sha256&&raw.errors.length===0&&Object.values(groups).every(g=>g.samples===30)&&
   !/swiftshader|llvmpipe|software/i.test(raw.environment.gpu);
  return {valid,groups,passed:valid&&Object.values(groups).every(g=>g.verified===30&&g.p95Ms<=150)};
 }
 const m=raw.results.at(-1),warm=raw.results[0],samples=m.stateSamples,flat=spec.view==='flat900';
 const denseFraction=samples.filter(s=>s.visibleUnits>=180).length/samples.length;
 const identity=raw.fixture.sha256===fixture.sha256&&raw.fixture.units===fixture.units&&raw.environment.workerRuntime.some(w=>w?.tick===fixture.tick);
 const states=samples.every(s=>s.winner===null&&s.renderPixelRatio===1.25&&s.mode===(flat?'2d':'3d')&&
  (spec.paused?s.mapUnits===0&&s.motionTracks===0:s.mapUnits===s.fieldUnits)&&(!flat||s.visibleUnits===0&&s.motionTracks===0)&&
  (spec.source!=='full'||s.occupied===s.playable&&s.activeAI===100));
 const replay=spec.fixed||!!spec.load;
 const saveDue=!replay&&!spec.paused&&samples.at(-1).tick>=fixture.tick+1200;
 const refreshHz=Math.min(raw.calibration?.before?.rafFps??0,raw.calibration?.after?.rafFps??0);
 const refreshEligible=!spec.target||refreshHz>=spec.target*.98;
 const checks={identity,browserErrors:raw.errors.length===0,hardwareWebGL:!/swiftshader|llvmpipe|software/i.test(raw.environment.gpu),states,
  sampleWindow:replay?m.ticks===1200:warm.elapsedMs>=60000&&m.elapsedMs>=60000&&samples.length>=55,
  formations:!spec.load||samples[0].formations?.[spec.load]===spec.armies&&m.workerFrames.some(f=>f.steps?.some(s=>s.collision)),
  density:!spec.dense||denseFraction>=.9,sustainedUnits:spec.source!=='late'||samples.every(s=>s.units>=23750&&s.units<=26250),
  autosave:!saveDue||raw.autosave?.tick>=fixture.tick+1200&&raw.autosave?.campaign===raw.fixture.campaign};
 const failedChecks=Object.keys(checks).filter(key=>!checks[key]),valid=!failedChecks.length;
 const clock=spec.paused?m.ticks===0:Math.abs(m.ticks-m.elapsedMs*.02*(spec.speed??1))<=2;
 const units=samples.map(s=>s.units),visible=samples.map(s=>s.visibleUnits);
 const steps=m.workerFrames?.flatMap(f=>f.steps??[])??[];
 const distribution=xs=>{if(!xs.length)return null;xs.sort((a,b)=>a-b);return {mean:xs.reduce((sum,x)=>sum+x,0)/xs.length,p95:xs[Math.ceil(xs.length*.95)-1],max:xs.at(-1)};};
 const worker=steps.length?{computeMs:distribution(steps.map(s=>s.stepFinish-s.stepStart)),scheduleDelayMs:distribution(steps.map(s=>s.stepStart-s.intended)),
  encodeMs:distribution(m.workerFrames.map(f=>f.sent-f.encodeStart)),deliveryMs:distribution(m.workerFrames.map(f=>f.arrived-f.sent)),applyMs:distribution(m.workerFrames.map(f=>f.applied-f.arrived))}:null;
 const reports=steps.map(s=>s.collision).filter(Boolean);
 const collisions=reports.length?Object.fromEntries(Object.keys(reports[0]).map(key=>[key,distribution(reports.map(c=>c[key]))])):null;
 return {valid,fps:m.renderFps,ticksPerSecond:m.ticks*1000/m.elapsedMs,p95GapMs:m.renderGapMs.p95,maxGapMs:m.renderGapMs.max,
  failedChecks,initialTick:samples[0].tick,endTick:samples.at(-1).tick,units:[Math.min(...units),Math.max(...units)],visibleUnits:[Math.min(...visible),Math.max(...visible)],
  activeAI:[Math.min(...samples.map(s=>s.activeAI)),Math.max(...samples.map(s=>s.activeAI))],
  worker,...(collisions?{collisions}:{}),...(spec.speed?{targetTicksPerSecond:20*spec.speed}:{}),
  denseFraction,refreshHz,refreshEligible,clockPassed:clock,elapsedMs:m.elapsedMs,passed:spec.target?valid&&refreshEligible&&clock&&m.renderFps>=spec.target&&m.renderGapMs.p95<=(spec.target===60?33:67)&&m.renderGapMs.max<=200:null};
}
