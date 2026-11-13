// Isolate simulation throughput from browser rendering. No game rules change.
import {createGame,Engine} from '../src/game/engine.ts';
import {makeAISetups} from '../src/game/spawns.ts';
import {writeFile,mkdir} from 'node:fs/promises';
import {Session} from 'node:inspector';
const counts=process.argv.slice(2).filter(a=>!a.startsWith('--')).map(Number);if(!counts.length)counts.push(3,16,100);
const profile=process.argv.includes('--profile'),steps=200;
const results=[];
for(const players of counts){
 const state=createGame([{name:'CPU probe',leader:'warden',loadout:['infantry']},...makeAISetups(players-1,77)],77,`simulation-profile-${players}`);
 const started=performance.now(),engine=new Engine(state),initMs=performance.now()-started;
 for(let i=0;i<10;i++)engine.step();
 const inspector=profile?new Session():null;
 async function post(method){return new Promise((resolve,reject)=>inspector.post(method,(error,result)=>error?reject(error):resolve(result)));}
 if(inspector){inspector.connect();await post('Profiler.enable');await post('Profiler.start');}
 const samples=[],cloneSamples=[],initialUnits=engine.state.units.length;
 for(let i=0;i<steps;i++){
  const start=performance.now();engine.step();samples.push(performance.now()-start);
  if(i%2===0){const t=performance.now();structuredClone(engine.state);cloneSamples.push(performance.now()-t);}
 }
 if(inspector){const {profile}=await post('Profiler.stop');inspector.disconnect();await mkdir('.cache',{recursive:true});await writeFile(`.cache/simulation-${players}.cpuprofile`,JSON.stringify(profile));}
 const summarize=xs=>({meanMs:xs.reduce((a,b)=>a+b,0)/xs.length,p50Ms:[...xs].sort((a,b)=>a-b)[Math.floor(xs.length*.5)],p95Ms:[...xs].sort((a,b)=>a-b)[Math.floor(xs.length*.95)],maxMs:Math.max(...xs)});
 const result={players,initialUnits,finalUnits:engine.state.units.length,initMs,steps:samples.length,step:summarize(samples),clone:summarize(cloneSamples),targetStepBudgetMs:50};
 results.push(result);console.log(JSON.stringify(result));
}
await mkdir('.cache',{recursive:true});await writeFile('.cache/simulation-profile.json',JSON.stringify({runtime:process.version,synthetic:true,results},null,2));
