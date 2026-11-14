// Real browser draw FPS. No effect removal, DPR reduction or simulation changes.
// Usage: node --experimental-strip-types scripts/profile-performance-acceptance.mjs
import {spawn,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createFullyOccupiedFixture} from '../tests/fully-occupied-fixture.mjs';
import {validateState} from '../src/game/save.ts';
import {MAP} from '../src/game/map.ts';

const options=Object.fromEntries(process.argv.slice(2).map(a=>{const [key,...value]=a.replace(/^--/,'').split('=');return [key,value.join('=')];}));
const directory=resolve(options.output??'docs/performance/2026-11-15-acceptance');
const duration=Number(options.duration??60000),warmup=Number(options.warmup??60000);
if(!Number.isFinite(duration)||duration<60000||!Number.isFinite(warmup)||warmup<60000)throw Error('Acceptance requires at least 60000ms warmup and measurement.');
await mkdir(directory,{recursive:true});await mkdir('.cache',{recursive:true});
const capture=options.snapshot?JSON.parse(await readFile(options.snapshot,'utf8')):createFullyOccupiedFixture();
const state=capture.state;
if(!validateState(state)||state.players.filter(p=>p.ai).length!==100||MAP.some(p=>p.playable&&state.provinces[p.id].owner<0))throw Error('Acceptance requires a valid save, exactly 100 AI and ownership of every playable region.');
const snapshotText=JSON.stringify(capture),snapshotPath=resolve('.cache/acceptance-full-map.json');
await writeFile(snapshotPath,snapshotText);
const sourceHash=createHash('sha256');
for(const path of execFileSync('git',['ls-files','src'],{encoding:'utf8'}).trim().split(/\r?\n/))sourceHash.update(path).update('\0').update(await readFile(path));
const code={head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),sourceSha256:sourceHash.digest('hex')};
const specs=[{id:'map3d',view:'near60',target:60,mapOnly:true},{id:'ai3d',view:'near60',target:30},{id:'ai2d',view:'flat900',target:60}];
const selected=options.scenarios?options.scenarios.split(','):specs.map(s=>s.id);
if(selected.some(id=>!specs.some(s=>s.id===id)))throw Error('Unknown scenario. Use map3d,ai3d,ai2d.');
const summary={code,criteria:{map3d:60,ai3d:30,ai2d:60,durationMs:duration,warmupMs:warmup,metric:'actual draw frames / wall-clock seconds',actions:'continuous simultaneous pan and zoom'},fixture:{synthetic:!options.snapshot,sha256:createHash('sha256').update(snapshotText).digest('hex'),players:state.players.length,ai:100,playable:MAP.filter(p=>p.playable).length,occupied:state.provinces.filter(p=>p.owner>=0).length,initialUnits:state.units.length},results:[],complete:false,accepted:false};
await writeFile(resolve(directory,'summary.json'),JSON.stringify(summary,null,2));
for(const spec of specs.filter(s=>selected.includes(s.id))){
 const output=resolve(directory,`${spec.id}.json`);
 const args=['--experimental-strip-types','scripts/profile-frame-rate.mjs',`--snapshot=${snapshotPath}`,'--pausedStart','--noGpu','--calibrate',`--duration=${duration}`,`--width=${options.width??1510}`,`--height=${options.height??1090}`,`--dpr=${options.dpr??1.25}`,`--output=${output}`,`--url=${options.url??'http://127.0.0.1:5187'}`];
 if(!options.snapshot)args.push('--synthetic');
 if(spec.mapOnly)args.push('--mapOnly',`--views=${spec.view}`,'--actions=panzoom');
 else args.push('--skipPaused','--running','--denseFocus','--liveScreenshot',`--runningWarmup=${warmup}`,`--runningViews=${spec.view}`,'--runningActions=panzoom');
 console.log(`Starting ${spec.id}: ${spec.mapOnly?'paused map':`${warmup/1000}s live warmup`}, ${duration/1000}s actual draw measurement; target ${spec.target} FPS.`);
 await new Promise((resolve,reject)=>{const child=spawn(process.execPath,args,{stdio:'inherit'});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error(`${spec.id} profiler exited ${code}`)));});
 const raw=JSON.parse(await readFile(output,'utf8')),result=raw.results.find(r=>!r.name.startsWith('warmup-')),warm=raw.results.find(r=>r.name.startsWith('warmup-'));
 const expectedMode=spec.id==='ai2d'?'2d':'3d',allSamples=[...(warm?.stateSamples??[]),...result.stateSamples];
 const conditionsPassed=raw.errors.length===0&&result.elapsedMs>=duration&&result.unitModes.length===1&&result.unitModes[0]===expectedMode&&
  allSamples.every(s=>s.occupied===s.playable&&s.ai===100&&s.activeAI===100&&s.winner===null&&s.renderPixelRatio===raw.environment.devicePixelRatio)&&
  (spec.mapOnly?result.ticks===0&&allSamples.every(s=>s.mapUnits===0&&s.motionTracks===0):warm?.elapsedMs>=warmup&&warm.ticks>0&&result.ticks>0&&allSamples.every(s=>s.mapUnits===s.fieldUnits));
 const entry={scenario:spec.id,targetFps:spec.target,averageFps:result.renderFps,p95EquivalentFps:1000/result.renderGapMs.p95,worstFrameEquivalentFps:1000/result.renderGapMs.max,conditionsPassed,fpsPassed:result.renderFps>=spec.target,accepted:conditionsPassed&&result.renderFps>=spec.target,measurementSeconds:result.elapsedMs/1000,warmupSeconds:(warm?.elapsedMs??0)/1000,warmupTicks:warm?.ticks??0,ticks:result.ticks,simulationTicksPerSecond:result.ticks*1000/result.elapsedMs,first:result.stateSamples[0],last:result.stateSamples.at(-1),calibration:raw.calibration,rawFile:`${spec.id}.json`};
 summary.results.push(entry);summary.complete=specs.every(s=>summary.results.some(r=>r.scenario===s.id));summary.accepted=summary.complete&&summary.results.every(r=>r.accepted);
 await writeFile(resolve(directory,'summary.json'),JSON.stringify(summary,null,2));
 console.log(JSON.stringify(entry));
}
console.log(`Acceptance ${summary.accepted?'PASSED':'NOT PASSED'}; results: ${resolve(directory,'summary.json')}`);
if(!summary.accepted)process.exitCode=1;
