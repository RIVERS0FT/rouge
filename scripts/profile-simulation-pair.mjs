// Exact live-state replay. Capture files stay local; no browser or rules changes.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const options=Object.fromEntries(process.argv.slice(2).map(arg=>{const [key,...value]=arg.replace(/^--/,'').split('=');return[key,value.join('=')];}));
if(!options.snapshot||!options.reference)throw Error('Required: --snapshot=<captured {state}> --reference=<reference engine.ts>');
const steps=Number(options.steps??80),warmup=5;if(!Number.isSafeInteger(steps)||steps<1)throw Error('Invalid step count');
const source=await readFile(options.snapshot,'utf8'),{state}=JSON.parse(source),Reference=(await import(pathToFileURL(resolve(options.reference)).href)).Engine;
const candidateModule=options.candidate?pathToFileURL(resolve(options.candidate)):new URL('../src/game/engine.ts',import.meta.url);
const {Engine}=await import(candidateModule.href);
const engines={reference:new Reference(state),current:new Engine(state)},times={reference:[],current:[]};
for(let i=0;i<steps+warmup;i++){
 for(const name of i%2?['current','reference']:['reference','current']){const start=performance.now();engines[name].step();if(i>=warmup)times[name].push(performance.now()-start);}
 assert.deepEqual(engines.current.state,engines.reference.state,`full state at tick ${engines.reference.state.tick}`);
 assert.deepEqual(engines.current.collision,engines.reference.collision,`collision report at tick ${engines.reference.state.tick}`);
 if((i+1)%10===0)console.log(JSON.stringify({verified:i+1,tick:engines.current.state.tick}));
}
const summarize=values=>{const sorted=[...values].sort((a,b)=>a-b),meanMs=values.reduce((sum,x)=>sum+x,0)/values.length;return {meanMs,p95Ms:sorted[Math.floor(sorted.length*.95)],maxMs:sorted.at(-1),ticksPerSecond:1000/meanMs};};
const reference=summarize(times.reference),current=summarize(times.current),sources={};
for(const name of ['engine.ts','map.ts','polygonQuery.ts','buildings.ts','terrain-navigation.ts','collision.ts'])sources[name]=createHash('sha256').update(await readFile(new URL(name,candidateModule))).digest('hex');
const result={runtime:process.version,snapshotSha256:createHash('sha256').update(source).digest('hex'),sources,units:state.units.length,initialTick:state.tick,steps,warmup,fullStateIdentical:true,collisionReportsIdentical:true,reference,current,speedup:reference.meanMs/current.meanMs,times};
const output=options.output??'.cache/simulation-pair.json';await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(result,null,2));console.log(JSON.stringify({...result,times:undefined}));
