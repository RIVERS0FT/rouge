// Build the selected working tree with its production Vite configuration.
// Only the private benchmark directory contains the measurement hooks.
import {build,loadConfigFromFile} from 'vite';
import {resolve,join} from 'node:path';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {installProbe} from './frame-probe.mjs';

function replaceOnce(source,anchor,replacement){
 if(source.split(anchor).length!==2)throw Error('Benchmark hook unavailable: '+anchor);
 return source.replace(anchor,replacement);
}

function observeBuild(){
 return {name:'rouge-performance-measurements',enforce:'pre',transform(source,id){
  if(id.endsWith('/src/render/WorldRenderer.ts')){
   return source+'\nif(window.__benchmarkSettings)('+installProbe.toString()+')(WorldRenderer,mapUnitsWithShips,window.__benchmarkSettings.stages,window.__benchmarkSettings.drawOnly);';
  }
  if(id.endsWith('/src/platform/browserSaves.ts'))return source+`
if(window.__benchmarkSettings){
 window.__benchmarkSaves=browserSaves;
 if(window.__benchmarkSettings.saves){
  window.__saveTimings=[];
  for(const method of ['auto','write']){
   const original=browserSaves[method];
   browserSaves[method]=async(...args)=>{
    const state=method==='auto'?args[0]:args[1],record={method,tick:state.tick,started:performance.now(),ok:false};
    window.__saveTimings.push(record);
    try{const result=await original(...args);record.ok=true;return result;}finally{record.elapsedMs=performance.now()-record.started;}
   };
  }
 }
}`;
  if(id.endsWith('/src/platform/localSession.ts')){
   let code=replaceOnce(source,'try{current=data.type', 'const arrived=performance.timeOrigin+performance.now();try{current=data.type');
   return replaceOnce(code,'initialized=true;onState(current!);',
    'initialized=true;onState(current!);if(data.__timing && window.__benchmarkFrames)window.__benchmarkFrames.push({...data.__timing,arrived,applied:performance.timeOrigin+performance.now()});');
  }
  if(!id.endsWith('/src/platform/worker.ts'))return;
  let code=replaceOnce(source,'const publish=','let settings,hold=false,stepStart=0,stepFinish=0,intended=0,pendingSteps=[];const stamp=()=>performance.timeOrigin+performance.now();const publish=');
  code=replaceOnce(code,'const next=encodeLocalFrame','const encodeStart=stamp();const next=encodeLocalFrame');
  code=replaceOnce(code,'send(next.frame,next.transfer);',
   'if(settings)next.frame.__timing={tick:engine.state.tick,intended,stepStart,stepFinish,steps:pendingSteps.splice(0),encodeStart,sent:stamp()};send(next.frame,next.transfer);');
  code=replaceOnce(code,'base=undefined;paused=false;publish();',
   'base=undefined;settings=m.__benchmark;paused=hold=!!settings?.pausedStart;if(settings)self.__profileRuntime={reference:false,pausedStart:hold,tick:engine.state.tick};publish();');
  code=replaceOnce(code,"else if(m.type==='pause'){paused=Boolean(m.value);",
   "else if(m.type==='pause'){if(hold&&!m.value)return;hold=false;paused=Boolean(m.value);");
  code=replaceOnce(code,"}else if(m.type==='command'&&engine)", "}else if(m.type==='benchmarkStopAt'&&settings){settings.stopTick=m.tick;}else if(m.type==='command'&&engine)");
  code=replaceOnce(code,'if(pool&&!pool.failed)await engine.stepParallel','if(settings){intended=performance.timeOrigin+deadline;stepStart=stamp();}if(pool&&!pool.failed)await engine.stepParallel');
  code=replaceOnce(code,'if(pool?.failed)stopPool();if(!base',
   'if(settings){stepFinish=stamp();pendingSteps.push({tick:engine.state.tick,intended,stepStart,stepFinish,...(settings.collisions?{collision:{...engine.collision}}:{})});if(engine.state.tick>=settings.stopTick){paused=true;publish();return;}}if(pool?.failed)stopPool();if(!base');
  return code;
 }};
}

export async function buildPerformancePreview(root,output){
 root=resolve(root);output=resolve(output);
 const {config}=await loadConfigFromFile({command:'build',mode:'production'},resolve(root,'vite.config.ts'));
 const worker=config.worker;
 await mkdir(output,{recursive:true});
 const harness='virtual:rouge-isolated-probe';
 const isolated={name:'rouge-isolated-worker-entry',resolveId(id){if(id===harness)return '\0'+harness;},load(id){
  if(id!=='\0'+harness)return;
  const module=(file)=>JSON.stringify(join(root,'src/platform',file).replaceAll('\\','/'));
  return `export {applyLocalFrame} from ${module('localFrames.ts')};export {default as workerUrl} from ${module('worker.ts?worker&url')};`;
 }};
 const result=await build({...config,root,configFile:false,logLevel:'warn',plugins:[...config.plugins,observeBuild(),isolated],
  worker:{...worker,plugins:()=>[...(worker.plugins?.()??[]),observeBuild()]},
  build:{...config.build,outDir:output,emptyOutDir:false,rollupOptions:{...config.build.rollupOptions,preserveEntrySignatures:'exports-only',input:{index:resolve(root,'index.html'),isolated:harness}}}});
 const files={};
 for(const item of (Array.isArray(result)?result:[result]).flatMap(r=>r.output)){
  files[item.fileName]=createHash('sha256').update(await readFile(resolve(output,item.fileName))).digest('hex');
 }
 const bytes=JSON.stringify(Object.entries(files).sort());
 const manifest={sha256:createHash('sha256').update(bytes).digest('hex'),files,
  isolated:Object.keys(files).find(name=>/^assets\/isolated-.*\.js$/.test(name))};
 await writeFile(resolve(output,'benchmark-build.json'),JSON.stringify(manifest,null,2));
 return manifest.sha256;
}
