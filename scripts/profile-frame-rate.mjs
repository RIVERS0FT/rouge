// Local Vite profiling only. All hooks live in the disposable browser context.
// Usage: node scripts/profile-frame-rate.mjs --output=.cache/frame-baseline.json
import {chromium} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {writeFile,mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';
const options=Object.fromEntries(process.argv.slice(2).map(a=>{const [key,...value]=a.replace(/^--/,'').split('=');return[key,value.join('=')||true];}));
const base=String(options.url??'http://127.0.0.1:5187'),output=String(options.output??'.cache/frame-profile.json');
const fixture=JSON.parse(execFileSync(process.execPath,['--experimental-strip-types','tests/create-performance-fixture.mjs',String(options.players??16),String(options.regions??0)],{encoding:'utf8',maxBuffer:32*1024*1024}));
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding',...(options.software?['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']:[])]});
const results=[];
try{
 const system=await(await browser.newBrowserCDPSession()).send('SystemInfo.getInfo');
 const page=await browser.newPage({viewport:{width:Number(options.width??1440),height:Number(options.height??960)},deviceScaleFactor:Number(options.dpr??1)});
 page.setDefaultTimeout(90000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route(/\/src\/render\/WorldRenderer\.ts(?:\?|$)/,async route=>{
  const response=await route.fetch();let body=await response.text();
  // Hold all other work constant; test only the pan refresh cap in memory.
  const before='const interval = moving ? 1e3 / 60 : motion.active ?';
  if(options.pan60){
   if(!body.includes(before))throw Error('Pan probe no longer matches the Vite output');
   body=body.replace(before,'const interval = moving || this.invalidated ? 1e3 / 60 : motion.active ?');
  }
  body+='\n('+installProbe.toString()+')(WorldRenderer, THREE);\n';
  await route.fulfill({response,body});
 });
 await page.addInitScript(({key,value})=>{localStorage.setItem(key,value);localStorage.setItem('rouge.language','en');},fixture);
 await page.goto(base);
 await page.getByTestId('open-saves').click();
 function installProbe(WorldRenderer,three){
  const update=WorldRenderer.prototype.update;
  window.__frameProbe={active:false,frames:[],updates:[],stages:{},stats:[],longTasks:[],instance:null,three};
  const probe=window.__frameProbe;
  new PerformanceObserver(list=>{if(probe.active)for(const e of list.getEntries())probe.longTasks.push(e.duration);}).observe({type:'longtask',buffered:false});
  function wrap(target,key,label){const original=target[key];target[key]=function(...args){const t=performance.now();try{return original.apply(this,args);}finally{if(probe.active)(probe.stages[label]??=[]).push(performance.now()-t);}};}
  for(const name of ['drawLabels','drawMapNames'])wrap(WorldRenderer.prototype,name,name);
  WorldRenderer.prototype.update=function(...args){
   if(!probe.instance){
    probe.instance=this;const original=this.frame,self=this;
    const gl=self.renderer.getContext(),timer=gl.getExtension('EXT_disjoint_timer_query_webgl2'),pending=[];
    this.frame=function(time){const rev=self.renderRevision,t=performance.now();if(probe.active)self.renderer.info.reset();
     if(timer)for(let i=pending.length-1;i>=0;i--){const {query,label,epoch}=pending[i];if(gl.getQueryParameter(query,gl.QUERY_RESULT_AVAILABLE)){
      if(probe.active&&epoch===probe.epoch&&!gl.getParameter(timer.GPU_DISJOINT_EXT))(probe.stages[label]??=[]).push(gl.getQueryParameter(query,gl.QUERY_RESULT)/1e6);
      gl.deleteQuery(query);pending.splice(i,1);
     }}
     original(time);
     if(probe.active&&self.renderRevision!==rev){probe.frames.push({time,duration:performance.now()-t});probe.stats.push({...self.renderer.info.render});}
    };
    self.renderer.info.autoReset=false;
    wrap(this.renderer,'render','threeRender');wrap(this.coastShadow,'renderMask','coastMask');wrap(this.politicalTint,'render','politicalTint');
    if(timer){const render=this.renderer.render;this.renderer.render=function(scene,...args){
     if(!probe.active)return render.call(this,scene,...args);
     const query=gl.createQuery(),label=scene===self.scene?'gpuMainMs':scene===self.coastShadow.maskScene?'gpuCoastMs':'gpuPoliticalMs';
     gl.beginQuery(timer.TIME_ELAPSED_EXT,query);try{return render.call(this,scene,...args);}finally{gl.endQuery(timer.TIME_ELAPSED_EXT);pending.push({query,label,epoch:probe.epoch});}
    };}
   }
   const t=performance.now();try{return update.apply(this,args);}finally{if(probe.active)probe.updates.push(performance.now()-t);}
  };
 }
 console.log('Loading deterministic campaign...');
 await page.locator('.save-card').filter({hasText:'Frame profile fixture'}).getByRole('button',{name:'Load',exact:true}).click();
 await page.locator('.app[data-local-ready="true"]').waitFor();
 await page.getByTestId('toggle-pause').click();
 await page.locator('canvas[data-relief-state="ready"]').waitFor();
 await page.waitForFunction(()=>window.__frameProbe.instance!==null);
 console.log('Campaign and renderer ready.');
 await page.waitForTimeout(1500);
 const cdp=await page.context().newCDPSession(page);await cdp.send('Performance.enable');
 const environment=await page.evaluate(()=>{const w=window.__frameProbe.instance,r=w.renderer,gl=r.getContext(),e=gl.getExtension('WEBGL_debug_renderer_info');return{gpu:e?gl.getParameter(e.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),viewport:{width:innerWidth,height:innerHeight},devicePixelRatio,renderPixelRatio:r.getPixelRatio(),gpuTimer:!!gl.getExtension('EXT_disjoint_timer_query_webgl2'),landTriangles:w.land.geometry.attributes.position.count/3,coastSegments:w.coastShadow.ribbon.geometry.instanceCount,borderSegments:w.countries.geometry.instanceCount,userAgent:navigator.userAgent};});
 console.log(JSON.stringify({environment,fixture:{players:fixture.players,units:fixture.units},pan60:!!options.pan60}));
 async function measure(name,action,variant='baseline'){
  const before=await cdp.send('Performance.getMetrics');
  const result=await page.evaluate(async({name,action,variant,duration,verify})=>{
   const probe=window.__frameProbe,r=probe.instance;
   const saved={names:r.drawMapNames,coast:r.coastShadow.renderMask,ratio:r.renderer.getPixelRatio(),visibility:[]};
   const cleanups=[];
   function capture(){
    r.coastShadow.valid=false;r.coastShadow.renderMask(r.renderer,r.camera,!r.globalView);r.renderer.render(r.scene,r.camera);
    const gl=r.renderer.getContext(),pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);
    gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return pixels;
   }
   const reference=verify&&['coast-tiles','map-tiles'].includes(variant)?capture():null;
   function hide(filter){r.scene.traverse(o=>{if(filter(o)){saved.visibility.push([o,o.visible]);o.visible=false;}});}
   let style;
   if(variant==='names-off'){r.drawMapNames=()=>{};r.countryLayer.hidden=true;r.provinceLayer.hidden=true;}
   if(variant==='coast-off'){r.coastShadow.renderMask=()=>{};r.coastShadow.surface.visible=false;}
   if(variant==='coast-tiles'||variant==='map-tiles'){
    // Prototype only: preserve every original segment and shader, cull tiles.
    const T=probe.three,coast=r.coastShadow,source=coast.ribbon.geometry,tiles=new Map(),meshes=[],geometries=[];
    const starts=source.attributes.aStart,ends=source.attributes.aEnd;
    for(let i=0;i<source.instanceCount;i++){
     const key=`${Math.floor((starts.getX(i)+ends.getX(i))/256)},${Math.floor((starts.getY(i)+ends.getY(i))/256)}`,ids=tiles.get(key)??[];
     ids.push(i);tiles.set(key,ids);
    }
    const originals=[coast.ribbon,...coast.copies];for(const mesh of originals)coast.maskScene.remove(mesh);
    for(const ids of tiles.values()){
     const geometry=new T.InstancedBufferGeometry();geometries.push(geometry);
     geometry.setIndex(source.index);geometry.setAttribute('position',source.attributes.position);geometry.instanceCount=ids.length;
     const box=new T.Box3();
     for(const id of ids)for(const attr of [starts,ends])box.expandByPoint(new T.Vector3(attr.getX(id),-.20,attr.getY(id)));
     // Conservative allowance for the five-pixel extrusion and join miters.
     box.expandByScalar(64);geometry.boundingBox=box;geometry.boundingSphere=box.getBoundingSphere(new T.Sphere());
     for(const [name,attr]of Object.entries(source.attributes))if(name!=='position'){
      const values=new attr.array.constructor(ids.length*attr.itemSize);
      for(let i=0;i<ids.length;i++)values.set(attr.array.subarray(ids[i]*attr.itemSize,(ids[i]+1)*attr.itemSize),i*attr.itemSize);
      geometry.setAttribute(name,new T.InstancedBufferAttribute(values,attr.itemSize,attr.normalized));
     }
     for(const offset of [0,...coast.copies.map(m=>m.position.x)]){
      const mesh=new T.Mesh(geometry,coast.ribbon.material);mesh.position.x=offset;mesh.onBeforeRender=coast.ribbon.onBeforeRender;
      mesh.frustumCulled=true;meshes.push(mesh);coast.maskScene.add(mesh);
     }
    }
    coast.valid=false;coast.renderMask=function(...args){for(const mesh of meshes)mesh.visible=mesh.position.x===0||args[2];return saved.coast.apply(this,args);};
    cleanups.push(()=>{for(const mesh of meshes)coast.maskScene.remove(mesh);for(const mesh of originals)coast.maskScene.add(mesh);for(const geometry of geometries)geometry.dispose();coast.valid=false;});
   }
   if(variant==='map-tiles'){
    const T=probe.three;
    for(const source of [r.land.geometry,r.countries.geometry]){
     const tiles=new Map(),position=source.attributes.position,wide=!!source.attributes.instanceStart;
     const count=wide?source.instanceCount:position.count/3;
     for(let i=0;i<count;i++){
      const a=wide?source.attributes.instanceStart:position,b=wide?source.attributes.instanceEnd:position,j=wide?i:i*3,k=wide?i:i*3+2;
      const key=`${Math.floor((a.getX(j)+b.getX(k))/256)},${Math.floor((a.getZ(j)+b.getZ(k))/256)}`,ids=tiles.get(key)??[];
      ids.push(i);tiles.set(key,ids);
     }
     const geometries=[];
     for(const ids of tiles.values()){
      const geometry=wide?new T.InstancedBufferGeometry():new T.BufferGeometry(),box=new T.Box3();geometries.push(geometry);
      if(wide){
       geometry.setIndex(source.index);geometry.instanceCount=ids.length;
       for(const [name,attr]of Object.entries(source.attributes)){
        if(!attr.isInstancedBufferAttribute&&!attr.data?.isInstancedInterleavedBuffer){geometry.setAttribute(name,attr);continue;}
        const values=new Float32Array(ids.length*attr.itemSize);
        for(let j=0;j<ids.length;j++)for(let c=0;c<attr.itemSize;c++)values[j*attr.itemSize+c]=attr[['getX','getY','getZ','getW'][c]](ids[j]);
        geometry.setAttribute(name,new T.InstancedBufferAttribute(values,attr.itemSize,attr.normalized));
       }
       for(const id of ids)for(const a of [source.attributes.instanceStart,source.attributes.instanceEnd])box.expandByPoint(new T.Vector3(a.getX(id),a.getY(id),a.getZ(id)));
      }else{
       for(const [name,attr]of Object.entries(source.attributes))geometry.setAttribute(name,attr);
       const indices=new Uint32Array(ids.length*3);
       for(let j=0;j<ids.length;j++)for(let k=0;k<3;k++){const id=ids[j]*3+k;indices[j*3+k]=id;box.expandByPoint(new T.Vector3(position.getX(id),position.getY(id),position.getZ(id)));}
       geometry.setIndex(new T.BufferAttribute(indices,1));
      }
      box.expandByScalar(64);geometry.boundingBox=box;geometry.boundingSphere=box.getBoundingSphere(new T.Sphere());
     }
     const originals=[];r.scene.traverse(o=>{if(o.geometry===source)originals.push(o);});
     const replacements=[];
     for(const original of originals){
      const parent=original.parent,group=new T.Group();parent.remove(original);parent.add(group);replacements.push({parent,original,group});
      for(const geometry of geometries){const mesh=original.clone();mesh.geometry=geometry;mesh.frustumCulled=true;group.add(mesh);}
     }
     cleanups.push(()=>{for(const {parent,original,group}of replacements){parent.remove(group);parent.add(original);}for(const geometry of geometries)geometry.dispose();});
    }
   }
   if(variant==='land-off')hide(o=>o.geometry===r.land.geometry);
   if(variant==='borders-off')hide(o=>o.name==='country-boundaries'||o.name==='region-boundaries'||o.name==='coastlines');
   const oceans=[];
   if(variant==='ocean-flat')r.scene.traverse(o=>{if(o.geometry?.type==='PlaneGeometry'&&o.position.y===-.25){oceans.push([o,o.material]);o.material=o.material.clone();}});
   if(variant==='hud-off'){style=document.createElement('style');style.textContent='.hud-top,.hud-rail,.hud-dock,.strategic-outliner,.commander-card,.battle-feed,.dispatch-feed{visibility:hidden!important}';document.head.append(style);}
   if(variant==='dpr1'){r.renderer.setPixelRatio(1);r.resize();}
   if(variant==='scale075'){r.renderer.setPixelRatio(.75);r.resize();}
   let pixelComparison;
   if(reference){const pixels=capture();let changedPixels=0,maxDifference=0,totalDifference=0;
    for(let i=0;i<pixels.length;i+=4){let changed=false;for(let c=0;c<3;c++){const delta=Math.abs(pixels[i+c]-reference[i+c]);if(delta>2)changed=true;maxDifference=Math.max(maxDifference,delta);totalDifference+=delta;}if(changed)changedPixels++;}
    pixelComparison={pixels:pixels.length/4,changedPixels,maxDifference,meanChannelDifference:totalDifference/(pixels.length/4*3)};
   }
   probe.frames=[];probe.updates=[];probe.stages={};probe.stats=[];probe.longTasks=[];
   probe.epoch=(probe.epoch??0)+1;
   const deltas=[];let last,start,frames=0;
   const origin={x:r.focus.x,z:r.desiredFocusZ,distance:r.desiredDistance};
   const totalBefore=r.state.units.length,tickBefore=r.state.tick;
   await new Promise(resolve=>{
    function sample(time){
     start??=time;const elapsed=time-start;if(last!==undefined)deltas.push(time-last);last=time;frames++;
     if(elapsed>=duration){resolve();return;}
     if(action==='pan')r.mapInput.dispatch({type:'pan',x:origin.x+Math.sin(elapsed/800)*r.distance*.12,z:origin.z+Math.cos(elapsed/900)*r.distance*.04});
     if(action==='zoom')r.mapInput.dispatch({type:'zoom',distance:origin.distance*(.84+.1*Math.sin(elapsed/500))});
     requestAnimationFrame(sample);
    }
    probe.active=true;requestAnimationFrame(sample);
   });
   probe.active=false;
   const elapsed=last-start,quantile=(xs,q)=>xs.length?[...xs].sort((a,b)=>a-b)[Math.min(xs.length-1,Math.floor(xs.length*q))]:0;
   const summarize=xs=>({count:xs.length,mean:xs.reduce((a,b)=>a+b,0)/Math.max(1,xs.length),p50:quantile(xs,.5),p95:quantile(xs,.95),max:xs.length?Math.max(...xs):0,total:xs.reduce((a,b)=>a+b,0)});
   const gaps=probe.frames.slice(1).map((f,i)=>f.time-probe.frames[i].time);
   const value={name,action,variant,pixelComparison,elapsedMs:elapsed,rafFps:(frames-1)*1000/elapsed,renderFps:probe.frames.length*1000/elapsed,rafGapMs:summarize(deltas),renderGapMs:summarize(gaps),frameCpuMs:summarize(probe.frames.map(f=>f.duration)),updateCpuMs:summarize(probe.updates),stages:Object.fromEntries(Object.entries(probe.stages).map(([k,v])=>[k,summarize(v)])),longTasks:summarize(probe.longTasks),drawCalls:summarize(probe.stats.map(s=>s.calls)),triangles:summarize(probe.stats.map(s=>s.triangles)),units:{before:totalBefore,after:r.state.units.length,visible:r.visibleUnitIds.size},ticks:r.state.tick-tickBefore,labels:{countries:r.countryLabels.size,provinces:r.provinceLabels.size},distance:r.distance};
   r.drawMapNames=saved.names;r.coastShadow.renderMask=saved.coast;r.coastShadow.surface.visible=true;r.countryLayer.hidden=false;r.provinceLayer.hidden=false;style?.remove();
   for(const [o,visible]of saved.visibility)o.visible=visible;
   for(const [o,material]of oceans){o.material.dispose();o.material=material;}
   for(const cleanup of cleanups)cleanup();
   if(variant==='dpr1'||variant==='scale075'){r.renderer.setPixelRatio(saved.ratio);r.resize();}
   r.mapInput.dispatch({type:'pan',x:origin.x,z:origin.z});r.mapInput.dispatch({type:'zoom',distance:origin.distance});
   return value;
  },{name,action,variant,verify:!!options.verify,duration:Number(options.duration??6000)});
  const after=await cdp.send('Performance.getMetrics'),metrics=Object.fromEntries(before.metrics.map(m=>[m.name,m.value]));
  result.mainThread=Object.fromEntries(after.metrics.filter(m=>['TaskDuration','ScriptDuration','LayoutDuration','RecalcStyleDuration','JSHeapUsedSize','Nodes','LayoutCount','RecalcStyleCount'].includes(m.name)).map(m=>[m.name,m.name==='JSHeapUsedSize'||m.name==='Nodes'?m.value:m.value-(metrics[m.name]??0)]));
  results.push(result);console.log(JSON.stringify({name:result.name,variant:result.variant,pixelComparison:result.pixelComparison,renderFps:result.renderFps,rafFps:result.rafFps,frameP95:result.renderGapMs.p95,cpuMs:result.frameCpuMs.mean,gpuMainMs:result.stages.gpuMainMs?.mean,gpuCoastMs:result.stages.gpuCoastMs?.mean,triangles:result.triangles.mean,ticks:result.ticks,units:result.units}));
  await page.waitForTimeout(700);
 }
 async function view(mode){await page.evaluate(({mode,focus})=>{const r=window.__frameProbe.instance;if(mode==='global')r.view('strategic');else r.focusProvince(focus);},{mode,focus:mode==='active'?fixture.activeFocus:fixture.focus});await page.locator('canvas[data-settled="true"]').waitFor();await page.waitForTimeout(1000);}
 const actions=String(options.actions??'idle,pan,zoom').split(','),modes=String(options.views??'global,near').split(','),variants=String(options.variants??'baseline').split(',');
 for(const mode of modes){
  await view(mode);
  for(const variant of variants)for(const action of actions)await measure(`${mode}-${action}`,action,variant);
 }
 if(options.running){
  await view('active');await page.getByTestId('toggle-pause').click();await page.waitForTimeout(1500);
  for(const action of ['idle','pan'])await measure(`running-${action}`,action);
 }
 if(options.profile){
  await view('near');await cdp.send('Profiler.enable');await cdp.send('Profiler.start');await measure('cpu-profile-pan','pan');
  const {profile}=await cdp.send('Profiler.stop');await mkdir(dirname(output),{recursive:true});await writeFile(output.replace(/\.json$/,'.cpuprofile'),JSON.stringify(profile));
 }
 await page.screenshot({path:output.replace(/\.json$/,'.png')});
 await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify({environment,gpuFeatures:system.gpu.featureStatus,fixture:{players:fixture.players,units:fixture.units,synthetic:true},options,errors,results},null,2));
 if(errors.length)throw Error(JSON.stringify(errors));
}finally{await browser.close();}
