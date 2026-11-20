// Run six independent browser windows against the same saved campaign.
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {parseArgs} from 'node:util';

const {values}=parseArgs({options:{
 snapshot:{type:'string'},url:{type:'string',default:'http://127.0.0.1:5187'},
 output:{type:'string',default:'.cache/live-campaign'},flatFocus:{type:'string'},nearFocus:{type:'string'},analyze:{type:'boolean'},
 production:{type:'boolean'},reverse:{type:'boolean'},
}});
if(!values.snapshot)throw Error('Supply --snapshot=<captured campaign JSON>.');
const capture=await readFile(values.snapshot),{state}=JSON.parse(capture);
const summary={
 snapshotSha256:createHash('sha256').update(capture).digest('hex'),campaign:state.campaign,
 initialTick:state.tick,units:state.units.length,armies:state.armies.length,results:[],accepted:false,
};
const views=[{view:'flat900',mode:'2d',fps:60,focus:values.flatFocus},{view:'near60',mode:'3d',fps:30,focus:values.nearFocus}];
await mkdir(values.output,{recursive:true});
for(let run=1;run<=3;run++)for(const spec of (run%2===0)!==!!values.reverse?[...views].reverse():views){
 const file=join(values.output,`${spec.view}-${run}.json`);
 const args=['--experimental-strip-types','scripts/profile-frame-rate.mjs',`--url=${values.url}`,`--snapshot=${values.snapshot}`,
  '--pausedStart','--skipPaused','--running','--denseFocus','--liveScreenshot','--drawOnly','--noGpu',
  `--runningViews=${spec.view}`,'--runningActions=panzoom','--runningWarmup=60000','--duration=60000',
  '--width=1510','--height=1090','--dpr=1.25',`--output=${file}`];
 if(values.production)args.push('--production');
 if(spec.focus){
  const pair=spec.focus.split(',');
  if(pair.length!==2||pair.some(v=>!v.trim()||!Number.isFinite(Number(v))))throw Error('A focus must be x,z.');
  args.push(`--focusX=${pair[0]}`,`--focusZ=${pair[1]}`);
 }
 if(!values.analyze)await new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,args,{stdio:'inherit'});child.once('error',reject);
  child.once('exit',code=>code===0?resolve():reject(Error(`Profiler exited with ${code}`)));
 });
 const raw=JSON.parse(await readFile(file,'utf8')), [warm,measured]=raw.results;
 const samples=measured.stateSamples,first=samples[0];
 spec.focus??=`${first.focusX},${first.focusZ}`;
 const visible=samples.map(s=>s.visibleUnits),scheduled=measured.stateSamples.at(-1).tick-state.tick>=1200;
 const fixtureMatches=raw.fixture.sha256===summary.snapshotSha256;
 const denseFraction=visible.filter(n=>n>=180).length/visible.length;
 const conditions=fixtureMatches&&raw.errors.length===0&&raw.fixture.units===state.units.length&&
  raw.environment.workerRuntime.some(w=>w?.pausedStart&&w.tick===state.tick)&&
  warm.elapsedMs>=60000&&measured.elapsedMs>=60000&&warm.ticks>0&&
  measured.unitModes.length===1&&measured.unitModes[0]===spec.mode&&
  samples.every(s=>s.renderPixelRatio===1.25&&s.mapUnits===s.fieldUnits&&s.winner===null)&&
  samples.length>=55&&!/swiftshader|llvmpipe|software/i.test(raw.environment.gpu)&&
  (spec.mode==='2d'?samples.every(s=>s.visibleUnits===0&&s.motionTracks===0):denseFraction>=.9)&&
  (!scheduled||(raw.autosave?.campaign===state.campaign&&raw.autosave.tick>=state.tick+1200));
 // The client's published clock is quantized to two ticks.
 const clockPassed=Math.abs(measured.ticks-measured.elapsedMs*.02)<=2;
 summary.results.push({run,view:spec.view,focus:spec.focus,file,fps:measured.renderFps,
  p95GapMs:measured.renderGapMs.p95,maxGapMs:measured.renderGapMs.max,ticksPerSecond:measured.ticks*1000/measured.elapsedMs,
  visible:[Math.min(...visible),Math.max(...visible)],autosaveTick:raw.autosave?.tick??null,conditions,clockPassed,
  denseFraction,passed:conditions&&clockPassed&&measured.renderFps>=spec.fps&&
   measured.renderGapMs.p95<=(spec.mode==='2d'?33:67)&&measured.renderGapMs.max<=200});
 summary.accepted=summary.results.length===6&&summary.results.every(r=>r.passed);
 await writeFile(join(values.output,'summary.json'),JSON.stringify(summary,null,2));
}
if(!summary.accepted)process.exitCode=1;
