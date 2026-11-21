import {installProbe} from './frame-probe.mjs';
import {profilePlayerInput,profileTouch} from './profile-player-input.mjs';
// Local Vite profiling only. All hooks live in the disposable browser context.
// Usage: node --experimental-strip-types scripts/profile-frame-rate.mjs --output=.cache/frame-baseline.json
// An optional --snapshot=.cache/live-state.json replays a captured {state,canvas} without changing it.
import {chromium} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {writeFile,mkdir} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {encodeSave,SAVE_PREFIX} from '../src/game/save.ts';
import {MAP} from '../src/game/map.ts';
import {dirname} from 'node:path';
const options=Object.fromEntries(process.argv.slice(2).map(a=>{const [key,...value]=a.replace(/^--/,'').split('=');return[key,value.join('=')||true];}));
const base=String(options.url??'http://127.0.0.1:5187'),output=String(options.output??'.cache/frame-profile.json');
const snapshotBytes=options.snapshot?readFileSync(String(options.snapshot)):null;
const snapshot=snapshotBytes?JSON.parse(snapshotBytes.toString('utf8')):null;
const snapshotIdentity=snapshot?{campaign:snapshot.state.campaign,initialTick:snapshot.state.tick,armies:snapshot.state.armies?.length,sha256:createHash('sha256').update(snapshotBytes).digest('hex')}:{};
const fixture=snapshot?{key:SAVE_PREFIX+'current-lag-profile',value:encodeSave(snapshot.state,'Frame profile fixture'),focus:Number(options.focus??snapshot.canvas.selectedRegion),activeFocus:Number(options.focus??snapshot.canvas.selectedRegion),units:snapshot.state.units.length,players:snapshot.state.players.length}:JSON.parse(execFileSync(process.execPath,['--experimental-strip-types','tests/create-performance-fixture.mjs',String(options.players??16),String(options.regions??0)],{encoding:'utf8',maxBuffer:32*1024*1024}));
const playableRegions=MAP.filter(p=>p.playable).map(p=>p.id);
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding',...(options.software?['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']:[])]});
const results=[],liveEvidence=[];
let measuredFocus;
try{
 const system=await(await browser.newBrowserCDPSession()).send('SystemInfo.getInfo');
 const page=await browser.newPage({viewport:{width:Number(options.width??1440),height:Number(options.height??960)},deviceScaleFactor:Number(options.dpr??1),hasTouch:!!options.touch,isMobile:!!options.touch});
 page.setDefaultTimeout(90000);
 const calibration=async(target=page)=>target.evaluate(async()=>{
  let first,last,frames=0;const gaps=[];
  await new Promise(resolve=>{const sample=time=>{first??=time;if(last!==undefined)gaps.push(time-last);last=time;frames++;if(time-first>=5000)resolve();else requestAnimationFrame(sample);};requestAnimationFrame(sample);});
  return {elapsedMs:last-first,frames:frames-1,rafFps:(frames-1)*1000/(last-first),maxGapMs:Math.max(...gaps)};
 });
 const emptyPageBefore=options.calibrate?await calibration():null;
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text());});
 await page.addInitScript(disabled=>{window.__disableGpuQueries=disabled;},!!options.noGpu);
 if(!options.production&&(options.workerReference||options.pausedStart))await page.context().route(/\/src\/platform\/worker\.ts(?:\?|$)/,async route=>{
  if(!new URL(route.request().url()).searchParams.has('worker_file')){await route.fallback();return;}
  // Serve an isolated Vite-transformed reference worker for paired runtime tests.
  const url=options.workerReference?new URL(String(options.workerReference),base+'/'):new URL(route.request().url());url.search=new URL(route.request().url()).search;
  const response=await route.fetch({url:url.href});let body=await response.text();
  body+='\nself.__profileRuntime='+JSON.stringify({reference:!!options.workerReference,pausedStart:!!options.pausedStart})+';\n';
  if(options.pausedStart)body+=`
const profileOnMessage=self.onmessage;let profilePauseLocked=true;
self.onmessage=function(event){
 const m=event.data;
 // Startup effects can enqueue an unpause after init. Hold until the profiler
 // has explicitly clicked Pause, then allow normal resume/running windows.
 if(profilePauseLocked&&m.type==='pause'){if(!m.value)return;profilePauseLocked=false;}
 profileOnMessage.call(self,event);
 if(m.type==='init'){paused=true;self.__profileRuntime.tick=engine.state.tick;}
};
`;
  await route.fulfill({response,body});
 });
 if(!options.production)await page.route(/\/src\/render\/WorldRenderer\.ts(?:\?|$)/,async route=>{
  const response=await route.fetch();let body=await response.text();
  body+='\nimport {mapUnitsWithShips as profileMapUnits} from "/src/render/unitPresentation.ts";\n('+installProbe.toString()+')(WorldRenderer, profileMapUnits,'+Boolean(options.stages)+','+Boolean(options.drawOnly)+');\n';
  await route.fulfill({response,body});
 });
 if(options.production)await page.addInitScript(settings=>{
  window.__benchmarkSettings=settings;
  window.__benchmarkFrames=[];
  const post=Worker.prototype.postMessage;
  Worker.prototype.postMessage=function(message,...args){
   if(message?.type==='init'&&message.state){
    window.__benchmarkWorker=this;
    message={...message,__benchmark:settings};
   }
   return post.call(this,message,...args);
  };
 },{pausedStart:!!options.pausedStart,drawOnly:!!options.drawOnly,stages:!!options.stages,collisions:!!options.collisions,saves:!!options.soak});
 await page.addInitScript(()=>{localStorage.setItem('rouge.language','en');});
 // Seed the current save backend, including campaigns above localStorage's quota.
 await page.route('**/__profile_fixture',route=>route.fulfill({contentType:'text/html',body:'<!doctype html>'}));
 await page.goto(new URL('/__profile_fixture',base).href);
 await page.evaluate(({key,value})=>new Promise((resolve,reject)=>{
  const open=indexedDB.open('rouge-campaign-saves',1);
  open.onupgradeneeded=()=>open.result.createObjectStore('slots',{keyPath:'key'});
  open.onerror=()=>reject(open.error);
  open.onsuccess=()=>{const db=open.result,tx=db.transaction('slots','readwrite');tx.objectStore('slots').put({key,value});tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>reject(tx.error);};
 }),fixture);
 await page.goto(base);
 await page.getByTestId('open-saves').click();
 console.log('Loading deterministic campaign...');
 const loadStarted=Date.now();
 await page.locator('.save-card').filter({hasText:'Frame profile fixture'}).getByRole('button',{name:'Load',exact:true}).click();
 await page.getByTestId('toggle-pause').waitFor();
 await page.locator('.app[data-local-ready="true"]').waitFor();
 if(await page.locator('.app').getAttribute('data-eliminated')==='true')await page.getByTestId('spectate-match').click();
 if(await page.locator('.talent-modal').isVisible())await page.keyboard.press('Escape');
 const waitForPlayableFrame=()=>page.waitForFunction(()=>{const r=window.__frameProbe?.instance;return r?.state&&r.mapInput.active&&r.renderRevision>0;});
 await waitForPlayableFrame();
 const coldLoadMs=Date.now()-loadStarted;
 await page.getByTestId('toggle-pause').click();
 await page.locator('canvas[data-country-layout-state="ready"]').waitFor();
 await page.locator('canvas[data-border-layout-state="ready"]').waitFor();
 await page.locator('canvas[data-relief-state="ready"]').waitFor();
 await page.waitForFunction(()=>window.__frameProbe.instance!==null);
 await page.waitForFunction(()=>window.__frameProbe.instance.countryText.ready&&window.__frameProbe.instance.countryText.pending===0);
 const workerRuntime=options.workerReference||options.pausedStart?await Promise.all(page.workers().map(w=>w.evaluate(()=>self.__profileRuntime??null))):[];
 if((options.workerReference||options.pausedStart)&&!workerRuntime.some(w=>w&&w.reference===!!options.workerReference&&w.pausedStart===!!options.pausedStart))throw Error('Reference worker instrumentation was not applied: '+JSON.stringify({workerRuntime,urls:page.workers().map(w=>w.url())}));
 if(options.pausedStart&&snapshot&&await page.evaluate(()=>window.__frameProbe.instance.state.tick)!==snapshot.state.tick)throw Error('Simulation advanced before the controlled comparison');
 console.log('Campaign and renderer ready.');
 await page.waitForTimeout(1500);
 if(options.mapOnly){
  if(options.running)throw new Error('--mapOnly pauses simulation; omit --running');
  await page.evaluate(()=>{const r=window.__frameProbe.instance;r.mapUnits=[];r.renderedUnits=[];r.unitMotion.tracks.clear();r.bodies.count=r.heads.count=0;r.unitsWereMoving=false;r.invalidated=true;});
 }
 const cdp=await page.context().newCDPSession(page);await cdp.send('Performance.enable');
 const traceEvents=[];
 if(options.trace){cdp.on('Tracing.dataCollected',data=>traceEvents.push(...data.value));await cdp.send('Tracing.start',{categories:'devtools.timeline,blink.user_timing,disabled-by-default-v8.gc',transferMode:'ReportEvents'});}
 const environment=await page.evaluate(()=>{const w=window.__frameProbe.instance,r=w.renderer,gl=r.getContext(),e=gl.getExtension('WEBGL_debug_renderer_info');return{gpu:e?gl.getParameter(e.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),viewport:{width:innerWidth,height:innerHeight},devicePixelRatio,renderPixelRatio:r.getPixelRatio(),gpuTimer:!window.__disableGpuQueries&&!!gl.getExtension('EXT_disjoint_timer_query_webgl2'),mapUnits:w.mapUnits.length,motionTracks:w.unitMotion.tracks.size,cacheTilePixels:Number(r.domElement.dataset.mapCacheTilePixels),landTriangles:w.land.geometry.attributes.position.count/3,coastSegments:w.coastShadow.ribbon.geometry.instanceCount,borderSegments:w.countries.geometry.instanceCount,userAgent:navigator.userAgent};});
 environment.workerRuntime=workerRuntime;
 console.log(JSON.stringify({environment,fixture:{players:fixture.players,units:fixture.units},snapshot:!!snapshot,mapOnly:!!options.mapOnly}));
 async function measure(name,action,variant='baseline',duration=Number(options.duration??6000)){
  const before=await cdp.send('Performance.getMetrics');
  const result=await page.evaluate(async({name,action,variant,duration,playableRegions,fixedTicks,formationStats})=>{
   const probe=window.__frameProbe,r=probe.instance;
   const saved={countryTextVisible:r.countryText.group.visible,names:r.drawMapNames,coast:r.coastShadow.renderMask,ratio:r.renderer.getPixelRatio(),visibility:[]};
   function hide(filter){r.scene.traverse(o=>{if(filter(o)){saved.visibility.push([o,o.visible]);o.visible=false;}});}
   let style;
   if(variant==='names-off'){r.countryText.group.visible=false;r.drawMapNames=()=>{};r.countryLayer.hidden=true;r.provinceLayer.hidden=true;}
   if(variant==='coast-off'){r.coastShadow.renderMask=()=>{};r.coastShadow.surface.visible=false;}
   const infantryMesh=r.infantry.mesh,previousColorWrite=infantryMesh?.geometry.drawRange.count;
   if(variant==='infantry-off'&&infantryMesh)infantryMesh.geometry.setDrawRange(0,0);
   if(variant==='land-off')hide(o=>o.geometry===r.land.geometry||o.name==='land-tile');
   if(variant==='borders-off')hide(o=>o.name==='country-boundaries'||o.name==='region-boundaries'||o.name==='coastlines');
   const oceans=[];
   const oceanOrders=[];
   if(variant==='ocean-depth-first')r.scene.traverse(o=>{if(o.geometry?.type==='PlaneGeometry'&&o.position.y===-.25){oceanOrders.push([o,o.renderOrder]);o.renderOrder=1;}});
   if(variant==='ocean-flat')r.scene.traverse(o=>{if(o.geometry?.type==='PlaneGeometry'&&o.position.y===-.25){oceans.push([o,o.material]);o.material=o.material.clone();}});
   if(variant==='hud-off'){style=document.createElement('style');style.textContent='.hud-top,.hud-rail,.hud-dock,.strategic-outliner,.commander-card,.battle-feed,.dispatch-feed{visibility:hidden!important}';document.head.append(style);}
   if(variant==='badges-off'){style=document.createElement('style');style.textContent='.army-plaque-layer,.battle-badge-layer{display:none!important}';document.head.append(style);}
   const badgeStyles={'armies-off':'.army-plaque-layer{display:none!important}','battles-off':'.battle-badge-layer{display:none!important}','badge-filter-off':'.battle-badge{filter:none!important}','badge-contained':'.army-plaque-layer,.battle-badge-layer{contain:strict;transform:translateZ(0)}','badge-cache':'.battle-badge,.army-plaque{will-change:transform}'};
   if(badgeStyles[variant]){style=document.createElement('style');style.textContent=badgeStyles[variant];document.head.append(style);}
   if(variant==='dpr1'){r.renderer.setPixelRatio(1);r.resize();}
   if(variant==='scale075'){r.renderer.setPixelRatio(.75);r.resize();}
   if(variant!=='baseline')r.flatMapCache.revision=-1;
   probe.frames=[];probe.updates=[];probe.stages={};probe.stats=[];probe.longTasks=[];probe.gpuEvents=[];
   probe.epoch=(probe.epoch??0)+1;
   if(window.__benchmarkFrames)window.__benchmarkFrames.length=0;
   const deltas=[],stateSamples=[];let last,start,frames=0,nextStateSample=0,lastAdvance=0,lastTick;
   const origin={x:r.focus.x,z:r.desiredFocusZ,distance:r.desiredDistance};
   const totalBefore=r.state.units.length,unitModes=new Set();
   let tickBefore=r.state.tick;
   function sampleState(elapsedMs){
    const state=r.state,owners=new Set(state.provinces.map(p=>p.owner));for(const unit of state.units)owners.add(unit.owner);
    stateSamples.push({elapsedMs,tick:state.tick,units:state.units.length,movingUnits:state.units.filter(u=>u.target!==null).length,fieldUnits:probe.mapUnitsWithShips(state.units).length,ai:state.players.filter(p=>p.ai).length,activeAI:state.players.filter(p=>p.ai&&owners.has(p.id)).length,occupied:playableRegions.filter(id=>state.provinces[id].owner>=0).length,playable:playableRegions.length,winner:state.winner,mapUnits:r.mapUnits.length,motionTracks:r.unitMotion.tracks.size,visibleUnits:r.visibleUnitIds.size,focusX:r.focus.x,focusZ:r.focus.z,distance:r.distance,renderPixelRatio:r.renderer.getPixelRatio(),mode:r.renderer.domElement.dataset.unitRenderMode});
    const sample=stateSamples.at(-1),previous=stateSamples.at(-2);sample.draws=probe.frames.length;
    if(formationStats){
     const phases={march:0,bottleneck:0,landing:0,battle:0};
     for(const army of state.armies){
      const f=army.formation;if(!f)continue;
      if(f.phase==='march')phases[f.retryAt===undefined?'march':'bottleneck']++;
      else if(f.phase==='battle'&&f.engaged)phases.battle++;
      else if(f.phase==='sea'&&f.route.points[f.route.index]?.sea===false)phases.landing++;
     }
     sample.formations=phases;
    }
    sample.walking=r.infantry.walking;sample.idling=r.infantry.idling;sample.shooting=r.infantry.shooting;
    sample.armies=state.armies.length;sample.battles=state.battles.length;
    sample.intervalFps=previous&&elapsedMs>previous.elapsedMs?(sample.draws-previous.draws)*1000/(elapsedMs-previous.elapsedMs):null;
   }
   await new Promise(resolve=>{
    function sample(time){
     if(start===undefined){
      start=time;probe.frames.length=0;tickBefore=r.state.tick;
      if(fixedTicks){
       window.__benchmarkWorker.postMessage({type:'benchmarkStopAt',tick:tickBefore+fixedTicks});
       document.querySelector('[data-testid="toggle-pause"]').click();
      }
     }
     const elapsed=time-start;if(last!==undefined)deltas.push(time-last);last=time;frames++;
     if(fixedTicks&&r.state.tick!==lastTick){lastTick=r.state.tick;lastAdvance=elapsed;}
     unitModes.add(r.renderer.domElement.dataset.unitRenderMode);
     if(elapsed>=nextStateSample){sampleState(elapsed);nextStateSample=elapsed+1000;}
     if(fixedTicks?r.state.tick>=tickBefore+fixedTicks:elapsed>=duration){sampleState(elapsed);resolve();return;}
     if(fixedTicks&&(elapsed-lastAdvance>120000||r.state.winner!==null)){resolve();return;}
     if(action==='pan'||action==='panzoom')r.mapInput.dispatch({type:'pan',x:origin.x+Math.sin(elapsed/800)*r.distance*.12,z:origin.z+Math.cos(elapsed/900)*r.distance*.04});
     if(action==='zoom'||action==='panzoom')r.mapInput.dispatch({type:'zoom',distance:origin.distance*(.84+.1*Math.sin(elapsed/500))});
     requestAnimationFrame(sample);
    }
    probe.active=true;requestAnimationFrame(sample);
   });
   probe.active=false;
   const elapsed=last-start,quantile=(xs,q)=>xs.length?[...xs].sort((a,b)=>a-b)[Math.min(xs.length-1,Math.floor(xs.length*q))]:0;
   const summarize=xs=>({count:xs.length,mean:xs.reduce((a,b)=>a+b,0)/Math.max(1,xs.length),p50:quantile(xs,.5),p95:quantile(xs,.95),max:xs.length?Math.max(...xs):0,total:xs.reduce((a,b)=>a+b,0)});
   const frameGaps=probe.frames.slice(1).map((f,i)=>({time:f.time,gap:f.time-probe.frames[i].time,cpu:f.duration,previousCpu:probe.frames[i].duration})),gaps=frameGaps.map(f=>f.gap);
   if(probe.frames.length)gaps.push(probe.frames[0].time-start,last-probe.frames.at(-1).time);
   else gaps.push(elapsed);
   const value={name,action,variant,elapsedMs:elapsed,rafFps:(frames-1)*1000/elapsed,renderFps:probe.frames.length*1000/elapsed,rafGapMs:summarize(deltas),renderGapMs:summarize(gaps),frameCpuMs:summarize(probe.frames.map(f=>f.duration)),updateCpuMs:summarize(probe.updates),stages:Object.fromEntries(Object.entries(probe.stages).map(([k,v])=>[k,summarize(v)])),longTasks:summarize(probe.longTasks),drawCalls:summarize(probe.stats.map(s=>s.calls)),triangles:summarize(probe.stats.map(s=>s.triangles)),units:{before:totalBefore,after:r.state.units.length,visible:r.visibleUnitIds.size},ticks:r.state.tick-tickBefore,labels:{countries:r.countryLabels.size,provinces:r.provinceLabels.size},distance:r.distance,spikes:frameGaps.sort((a,b)=>b.gap-a.gap).slice(0,10),gpuSpikes:probe.gpuEvents.sort((a,b)=>b.duration-a.duration).slice(0,16)};
   if(window.__benchmarkFrames)value.workerFrames=window.__benchmarkFrames.splice(0);
   if(window.__saveTimings){
    value.autosaveFrames=window.__saveTimings.filter(s=>s.method==='auto'&&s.started<=last&&s.started+(s.elapsedMs??last-s.started)>=start).map(s=>{
     const end=s.started+(s.elapsedMs??last-s.started);
     const during=frameGaps.filter(f=>f.time>=s.started&&f.time-f.gap<=end).map(f=>f.gap);
     return {tick:s.tick,p95GapMs:quantile(during,.95),maxGapMs:during.length?Math.max(...during):null,drawIntervals:during.length};
    });
   }
   value.unitModes=[...unitModes];value.blend=r.blend;value.stateSamples=stateSamples;
   if(variant!=='baseline')r.flatMapCache.revision=-1;
   r.countryText.group.visible=saved.countryTextVisible;
   r.drawMapNames=saved.names;r.coastShadow.renderMask=saved.coast;r.coastShadow.surface.visible=true;r.countryLayer.hidden=false;r.provinceLayer.hidden=false;style?.remove();
   for(const [o,visible]of saved.visibility)o.visible=visible;
   for(const [o,material]of oceans){o.material.dispose();o.material=material;}
   for(const [o,order]of oceanOrders)o.renderOrder=order;
   if(variant==='infantry-off'&&infantryMesh)infantryMesh.geometry.setDrawRange(0,previousColorWrite);
   if(variant==='dpr1'||variant==='scale075'){r.renderer.setPixelRatio(saved.ratio);r.resize();}
   r.mapInput.dispatch({type:'pan',x:origin.x,z:origin.z});r.mapInput.dispatch({type:'zoom',distance:origin.distance});
   return value;
  },{name,action,variant,duration,playableRegions,fixedTicks:name.startsWith('fixed-')?Number(options.fixedTicks):0,formationStats:!!options.collisions});
  const after=await cdp.send('Performance.getMetrics'),metrics=Object.fromEntries(before.metrics.map(m=>[m.name,m.value]));
  result.mainThread=Object.fromEntries(after.metrics.filter(m=>['TaskDuration','ScriptDuration','LayoutDuration','RecalcStyleDuration','JSHeapUsedSize','Nodes','LayoutCount','RecalcStyleCount'].includes(m.name)).map(m=>[m.name,m.name==='JSHeapUsedSize'||m.name==='Nodes'?m.value:m.value-(metrics[m.name]??0)]));
  const fps=duration=>duration>0?1000/duration:null;
  results.push(result);console.log(JSON.stringify({name:result.name,variant:result.variant,averageFps:result.renderFps,p95EquivalentFps:fps(result.renderGapMs.p95),worstFrameEquivalentFps:fps(result.renderGapMs.max),cpuEquivalentFps:fps(result.frameCpuMs.mean),gpuMainEquivalentFps:fps(result.stages.gpuMainMs?.mean),gpuBackgroundEquivalentFps:fps(result.stages.gpuBackgroundMs?.mean),triangles:result.triangles.mean,ticks:result.ticks,units:result.units}));
  await page.waitForTimeout(700);
 }
 async function view(mode,live=false){
  await page.evaluate(({mode,focus})=>{
   const r=window.__frameProbe.instance;
   if(mode==='global')r.view('strategic');
   else{r.focusProvince(focus);if(/^(flat|near)\d+$/.test(mode))r.mapInput.dispatch({type:'zoom',distance:Number(mode.replace(/^[a-z]+/,''))});}
  },{mode,focus:mode==='active'?fixture.activeFocus:fixture.focus});
  await page.locator('canvas[data-settled="true"]').waitFor();
  if(!live)await page.waitForFunction(()=>{const r=window.__frameProbe.instance;return r.mapSurface.pending.length===0&&(r.blend>0||!r.flatMapCache.pending);});
  await page.waitForTimeout(1000);
 }
 const actions=String(options.actions??'idle,pan,zoom').split(','),modes=String(options.views??'global,near').split(','),variants=String(options.variants??'baseline').split(',');
 if(options.fixedTicks){
  const count=Number(options.fixedTicks);
  if(!options.production||!options.pausedStart||!Number.isSafeInteger(count)||count<1||!options.skipPaused||options.running)throw Error('Fixed-tick replay needs a paused production fixture and one view.');
  const mode=String(options.views);await view(mode);
  if(options.focusX!==undefined)await page.evaluate(({x,z})=>window.__frameProbe.instance.mapInput.dispatch({type:'pan',x,z}),{x:Number(options.focusX),z:Number(options.focusZ)});
  await measure('fixed-'+mode,'panzoom');
  if(results.at(-1).ticks!==count)throw Error('Fixed-tick comparison did not reach its exact endpoint.');
 }
 for(const mode of options.skipPaused?[]:modes){
  await view(mode);
  if(options.pausedWarmup)await measure(`warmup-${mode}`,'panzoom','baseline',Number(options.pausedWarmup));
  for(const variant of variants)for(const action of actions)await measure(`${mode}-${action}`,action,variant);
 }
 if(options.running){
  for(const mode of String(options.runningViews??options.runningView??'active').split(',')){
   await view(mode);
   if(options.speed)await page.getByRole('button',{name:`Speed ${options.speed}×`,exact:true}).click();
   await page.getByTestId('toggle-pause').click();await page.waitForTimeout(1500);
   if(options.runningWarmup)await measure(`warmup-${mode}`,'panzoom','baseline',Number(options.runningWarmup));
   if(options.denseFocus){
    const focus=await page.evaluate(fixed=>{
     const r=window.__frameProbe.instance,size=Math.max(8,r.desiredDistance*.25),cells=new Map();
     if(fixed){r.mapInput.dispatch({type:'pan',...fixed});return fixed;}
     for(const unit of r.mapUnits){const key=`${Math.floor(unit.x/size)},${Math.floor(unit.z/size)}`,cell=cells.get(key)??{x:0,z:0,count:0};cell.x+=unit.x;cell.z+=unit.z;cell.count++;cells.set(key,cell);}
     const best=[...cells.values()].sort((a,b)=>b.count-a.count)[0];if(!best)throw Error('No field armies after live warmup');
     const focus={x:best.x/best.count,z:best.z/best.count,fieldUnitsInCell:best.count};r.mapInput.dispatch({type:'pan',...focus});return focus;
    },options.focusX!==undefined&&options.focusZ!==undefined?{x:Number(options.focusX),z:Number(options.focusZ)}:null);
    await page.waitForFunction(()=>window.__frameProbe.instance.mapSurface.pending.length===0);await page.waitForTimeout(1000);
    measuredFocus=focus;console.log(JSON.stringify({denseFocus:focus,view:mode}));
   }
   for(const action of String(options.runningActions??'idle,pan,zoom').split(','))for(const variant of String(options.runningVariants??'baseline').split(','))await measure(`running-${mode}-${action}`,action,variant);
   if(options.liveScreenshot){
    const screenshot=output.replace(/\.json$/,`.${mode}.running.png`);await mkdir(dirname(screenshot),{recursive:true});
    const evidence=await page.evaluate(()=>{
     const r=window.__frameProbe.instance,state=r.state;
     return {tick:state.tick,units:state.units.length,movingUnits:state.units.filter(u=>u.target!==null).length,aiMovingUnits:state.units.filter(u=>u.target!==null&&state.players[u.owner]?.ai).length,visibleUnits:state.units.filter(u=>r.visibleUnitIds.has(u.id)).map(u=>({id:u.id,owner:u.owner,ai:state.players[u.owner]?.ai,x:u.x,z:u.z,target:u.target})),mode:r.renderer.domElement.dataset.unitRenderMode};
    });
    await page.screenshot({path:screenshot});liveEvidence.push({screenshot,...evidence});
    console.log(JSON.stringify({liveScreenshot:screenshot,tick:evidence.tick,aiMovingUnits:evidence.aiMovingUnits,visibleUnits:evidence.visibleUnits.length}));
   }
   await page.getByTestId('toggle-pause').click();
  }
 }
 if(options.profile){
  await view(String(options.profileView??'near'));await cdp.send('Profiler.enable');await cdp.send('Profiler.start');await measure('cpu-profile-pan','pan');
  const {profile}=await cdp.send('Profiler.stop');await mkdir(dirname(output),{recursive:true});await writeFile(output.replace(/\.json$/,'.cpuprofile'),JSON.stringify(profile));
 }
 if(options.trace){const complete=new Promise(resolve=>cdp.once('Tracing.tracingComplete',resolve));await cdp.send('Tracing.end');await complete;await mkdir(dirname(output),{recursive:true});await writeFile(output.replace(/\.json$/,'.trace.json'),JSON.stringify({traceEvents}));}
 let soak=null;
 if(options.soak){
  const minutes=Number(options.soak);if(!Number.isInteger(minutes)||minutes<1||minutes>120)throw Error('Invalid soak duration');
  const started=Date.now(),beforeWorkers=page.workers().map(w=>w.url());
  let manualUi=null;
  await page.getByTestId('toggle-pause').click();
  for(let i=0;i<minutes;i++){
   if(await page.getByTestId('spectate-match').isVisible())await page.getByTestId('spectate-match').click();
   const mode=i%2?'near60':'flat900';await view(mode,true);
   await measure(`minute-${i+1}-${mode}`,'panzoom','baseline',60000);
   // Keep a playable checkpoint even if the unattended human seat is eliminated later.
   if(i===Math.min(1,minutes-1)){
    await page.evaluate(()=>{
     const sample={start:performance.now(),last:performance.now(),gaps:[],id:0};window.__manualUi=sample;
     const next=t=>{sample.gaps.push(t-sample.last);sample.last=t;sample.id=requestAnimationFrame(next);};sample.id=requestAnimationFrame(next);
    });
    await page.getByTestId('open-settings').click();await page.getByTestId('settings-save').click();
    await page.getByPlaceholder('Save name').fill('Soak checkpoint');await page.getByTestId('create-save').click();
    await page.getByRole('heading',{name:'Soak checkpoint',exact:true}).waitFor();
    await page.getByTestId('settings-back').click();await page.keyboard.press('Escape');
    manualUi=await page.evaluate(()=>{
     const s=window.__manualUi;cancelAnimationFrame(s.id);const end=performance.now();s.gaps.push(end-s.last);s.gaps.sort((a,b)=>a-b);
     return {elapsedMs:end-s.start,rafP95Ms:s.gaps[Math.ceil(s.gaps.length*.95)-1],rafMaxMs:s.gaps.at(-1)};
    });
   }
  }
  const evidence=await page.evaluate(async()=>{
   const saves=window.__benchmarkSaves,slots=await saves.list(),manual=slots.find(s=>s.name==='Soak checkpoint');
   if(!manual)throw Error('Missing manual checkpoint');
   const saved=(await saves.read(manual.id)).state,auto=slots.some(s=>s.id==='auto')?(await saves.read('auto')).state:null;
   return {saves:window.__saveTimings,manualTick:saved.tick,campaign:saved.campaign,autoTick:auto?.tick,autoCampaign:auto?.campaign};
  });
  const oldWorkers=page.workers();let closed=0;for(const w of oldWorkers)w.once('close',()=>closed++);
  await page.reload();await page.getByTestId('open-saves').click();
  const load=Date.now();await page.locator('.save-card').filter({hasText:'Soak checkpoint'}).getByRole('button',{name:'Load',exact:true}).click();
  await page.locator('.app[data-local-ready="true"]').waitFor();
  if(await page.locator('.talent-modal').isVisible())await page.keyboard.press('Escape');
  await waitForPlayableFrame();
  const restored=await page.evaluate(()=>({tick:window.__frameProbe.instance.state.tick,campaign:window.__frameProbe.instance.state.campaign}));
  const reloadMs=Date.now()-load;
  await page.getByTestId('toggle-pause').click();
  const commandSamples=await profilePlayerInput(page,1);
  soak={...evidence,manualUi,restored,reloadMs,totalMs:Date.now()-started,priorWorkers:oldWorkers.length,closedWorkers:closed,initialWorkers:beforeWorkers.length,postLoadCommand:commandSamples.some(s=>s.kind==='dispatch'&&s.ok),commandSamples};
 }
 if(options.touch)await view('flat400');
 const inputs=options.inputs?await profilePlayerInput(page,Number(options.inputs)):options.touch?await profileTouch(page,cdp,Number(options.touch)):[];
 const screenshotPath=String(options.screenshot??output.replace(/\.json$/,'.png'));await mkdir(dirname(screenshotPath),{recursive:true});await page.screenshot({path:screenshotPath});
 // Read the scheduled slot through the same queue as the game, after the
 // measurement window. A write still encoding in its worker will finish first.
 let autosave=null;
 if(options.running&&snapshot){
  autosave=await page.evaluate(async()=>{
   const browserSaves=window.__benchmarkSaves??(await import('/src/platform/browserSaves.ts')).browserSaves;
   if(!(await browserSaves.list()).some(slot=>slot.id==='auto'))return null;
   const {state}=await browserSaves.read('auto');
   return {tick:state.tick,campaign:state.campaign,units:state.units.length};
  });
 }
 let emptyPageAfter=null;
 if(options.calibrate){await page.close();const blank=await browser.newPage({viewport:{width:Number(options.width??1440),height:Number(options.height??960)},deviceScaleFactor:Number(options.dpr??1)});emptyPageAfter=await calibration(blank);await blank.close();}
 await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify({environment,gpuFeatures:system.gpu.featureStatus,calibration:{before:emptyPageBefore,after:emptyPageAfter},fixture:{...snapshotIdentity,players:fixture.players,units:fixture.units,synthetic:!!options.synthetic||!snapshot},options,measuredFocus,errors,liveEvidence,inputs,coldLoadMs,soak,autosave,results},null,2));
 if(errors.length)throw Error(JSON.stringify(errors));
}finally{await browser.close();}
