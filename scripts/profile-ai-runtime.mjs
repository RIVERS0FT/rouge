// Node simulation/transport throughput, separate from real browser FPS.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {Engine,createGame} from '../src/game/engine.ts';
import {makeAISetups} from '../src/game/spawns.ts';
import {encodeFrame,applyFrame} from '../src/platform/replication.ts';

const options=Object.fromEntries(process.argv.slice(2).map(arg=>{const [key,...value]=arg.replace(/^--/,'').split('=');return[key,value.join('=')];}));
const steps=Number(options.steps??200),count=Number(options.ai??100),output=options.output??'.cache/ai-runtime.json';
const state=options.snapshot?JSON.parse(await readFile(options.snapshot,'utf8')).state:createGame([{name:'AI runtime review',leader:'warden',loadout:['infantry']},...makeAISetups(count,77)],77,'ai-runtime-review');
const summarize=values=>{const sorted=[...values].sort((a,b)=>a-b);return {count:values.length,meanMs:values.reduce((sum,n)=>sum+n,0)/values.length,p95Ms:sorted[Math.floor(sorted.length*.95)],maxMs:sorted.at(-1)};};
async function simulation(Type){
 const engine=new Type(state),samples=[],aiSamples=[],phases={separation:[],marchDispatch:[]};let decisions=0;
 const ai=engine.ai;engine.ai=function(){const start=performance.now();try{return ai.call(this);}finally{aiSamples.push(performance.now()-start);}};
 for(const [method,label]of [['separate','separation'],['releaseMarches','marchDispatch']]){const original=engine[method];engine[method]=function(...args){const start=performance.now();try{return original.apply(this,args);}finally{phases[label].push(performance.now()-start);}};}
 const command=engine.command;engine.command=function(actor,input){if(actor>0)decisions++;return command.call(this,actor,input);};
 engine.step(10);samples.length=aiSamples.length=0;for(const values of Object.values(phases))values.length=0;decisions=0;
 for(let i=0;i<steps;i++){const start=performance.now();engine.step();samples.push(performance.now()-start);}
 return {state:engine.state,step:summarize(samples),ai:summarize(aiSamples),phases:Object.fromEntries(Object.entries(phases).map(([key,values])=>[key,summarize(values)])),decisions};
}
const before=options.reference?await simulation((await import(pathToFileURL(resolve(options.reference)).href)).Engine):null;
const after=await simulation(Engine);if(before)assert.deepEqual(after.state,before.state);
const engine=new Engine(state),initial=encodeFrame(engine.state,undefined,0,true);let base=initial.base,client=applyFrame(null,structuredClone(initial.frame)),lastFull=client,lastFrame=initial.frame;
const full=[],incremental=[];
for(let i=0;i<50;i++){
 engine.step(2);let start=performance.now();lastFull=structuredClone(engine.state);full.push(performance.now()-start);
 start=performance.now();const next=encodeFrame(engine.state,base,0,true),wire=structuredClone(next.frame);client=applyFrame(client,wire);incremental.push(performance.now()-start);base=next.base;lastFrame=wire;
}
assert.deepEqual(client,lastFull);
const {state:finalState,...current}=after,old=before?(({state,...value})=>value)(before):null;
const result={players:state.players.length,ai:state.players.filter(p=>p.ai).length,units:state.units.length,steps,before:old,after:current,simulationStateEqual:before?true:null,transport:{full:summarize(full),incremental:summarize(incremental),fullBytes:Buffer.byteLength(JSON.stringify(lastFull)),incrementalBytes:Buffer.byteLength(JSON.stringify(lastFrame)),reusedPaths:lastFrame.reusedPaths?.length??0,exactState:true}};
await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(result,null,2));
console.log(JSON.stringify({players:result.players,ai:result.ai,units:result.units,beforeStepEquivalentFps:old?1000/old.step.meanMs:null,afterStepEquivalentFps:1000/current.step.meanMs,simulationSpeedup:old?old.step.meanMs/current.step.meanMs:null,fullPublishEquivalentFps:1000/result.transport.full.meanMs,incrementalPublishEquivalentFps:1000/result.transport.incremental.meanMs,transportSpeedup:result.transport.full.meanMs/result.transport.incremental.meanMs,exactState:true}));
