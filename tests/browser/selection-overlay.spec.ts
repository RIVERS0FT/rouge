import {test,expect} from '@playwright/test';

test('selection draws on the next frame without rebuilding the background or leaving cached highlights',async({page},testInfo)=>{
 test.setTimeout(120000);
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/selection-harness',route=>route.fulfill({contentType:'text/html',body:'<body style="margin:0"><div id="world" style="width:960px;height:640px"></div></body>'}));
 await page.goto('/selection-harness');
 const result=await page.evaluate(async()=>{
  // The standalone harness needs Vite's React preamble for flag imports.
  const {default:refresh}=await import('/@react-refresh');refresh.injectIntoGlobalHook(window);
  (window as any).$RefreshReg$=()=>{};(window as any).$RefreshSig$=()=>((type:any)=>type);
  const {WorldRenderer}=await import('/src/render/WorldRenderer.ts');
  const {createGame}=await import('/src/game/engine.ts');
  const {MAP}=await import('/src/game/map.ts');
  const {WORLD_WIDTH}=await import('/src/game/geo.ts');
  const state=createGame([{name:'Selection review',leader:'warden',loadout:['infantry']},{name:'Opponent',leader:'warden',loadout:['infantry']}],17,'selection-overlay-review');state.units=[];
  const target=MAP.find((p:any)=>p.playable&&p.code.startsWith('DEU'))!,neighbor=target.neighbors[0];
  const world:any=new WorldRenderer(document.querySelector('#world')!,(id:number)=>world.update(state,id,'zh'),()=>{});
  cancelAnimationFrame(world.animation);const renderFrame=world.frame;world.frame=()=>{};
  let time=performance.now(),frame=0,baked=0,capturing=false,firstBorder=0,firstGlow=0,glowReady=0,wrapped=false,wantPixels=false,pixels:Uint8Array|null=null;
  const tick=()=>{frame++;time+=1000/144;renderFrame(time);};
  world.scene.traverse((object:any)=>{
   if(!['selected-border','selected-inner-glow'].includes(object.name))return;
   const original=object.onBeforeRender;
   object.onBeforeRender=function(...args:any[]){
    original.apply(this,args);
    if(world.renderer.getRenderTarget()){baked++;return;}
    if(!capturing)return;
    if(object.name==='selected-border'){
     firstBorder ||= frame;
     if(object.matrixWorld.elements[12]>WORLD_WIDTH/2)wrapped=true;
    }else if(object.geometry.getAttribute('position').count){firstGlow ||= frame;}
   };
  });
  const draw=world.drawWorld;world.drawWorld=function(){
   if(capturing&&this.renderer.domElement.dataset.selectionGlowPending==='false'&&this.selectionGlow.geometry.getAttribute('position').count)glowReady ||= frame;
   return draw.call(this);
  };
  const render=world.renderer.render;world.renderer.render=function(scene:any,...args:any[]){
   const result=render.call(this,scene,...args);
   if(wantPixels&&scene===world.scene&&!this.getRenderTarget()){
    const gl=this.getContext();pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);
    gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);wantPixels=false;
   }
   return result;
  };
  async function until(done:()=>boolean){
   for(let i=0;i<900;i++){tick();if(done())return;await new Promise(requestAnimationFrame);}
   throw Error('selection harness did not settle');
  }
  const capture=()=>{wantPixels=true;world.invalidated=true;world.lastRender=-Infinity;tick();return pixels!;};
  try{
   world.setInputContext('game');world.globalView=false;world.focus.set(target.center.x,0,target.center.z);world.desiredFocusZ=target.center.z;
   world.distance=world.desiredDistance=world.lastCameraTarget=900;world.update(state,-1,'zh');
   await until(()=>!world.flatMapCache.pending&&world.mapSurface.pending.length===0&&world.renderer.domElement.dataset.reliefState==='ready'&&world.countryText.pending===0&&world.renderer.domElement.dataset.countryLayoutState==='ready'&&world.renderer.domElement.dataset.borderLayoutState==='ready');
   const baseline=capture(),texture=world.flatMapCache.surface.material.map,revision=world.mapRevision;
   const start=frame;capturing=true;world.mapInput.dispatch({type:'select',region:target.id,attack:false});tick();
   const immediate=firstBorder-start;
   await until(()=>firstGlow>0&&world.renderer.domElement.dataset.selectionGlowPending==='false');
   const selected=capture(),reused=world.flatMapCache.surface.material.map===texture&&world.mapRevision===revision&&!world.flatMapCache.pending;
   let changed=0;for(let i=0;i<baseline.length;i+=4)if(Math.abs(baseline[i]-selected[i])+Math.abs(baseline[i+1]-selected[i+1])+Math.abs(baseline[i+2]-selected[i+2])>6)changed++;
   // An unrelated background refresh must also exclude every live overlay.
   world.flatMapCache.invalidate();world.invalidated=true;await until(()=>!world.flatMapCache.pending);
   // Cancel an in-flight glow by selecting another region, then clear selection.
   world.mapInput.dispatch({type:'select',region:neighbor,attack:false});world.mapInput.dispatch({type:'select',region:target.id,attack:false});
   await until(()=>world.renderer.domElement.dataset.selectionGlowPending==='false');
   const latest=Number(world.renderer.domElement.dataset.selectedRegion);
   world.mapInput.dispatch({type:'deselect'});const cleared=capture();
   let ghostPixels=0;const bounds={left:Infinity,right:0,top:Infinity,bottom:0};for(let i=0;i<baseline.length;i+=4)if(Math.abs(baseline[i]-cleared[i])+Math.abs(baseline[i+1]-cleared[i+1])+Math.abs(baseline[i+2]-cleared[i+2])>6){ghostPixels++;const x=i/4%world.renderer.domElement.width,y=Math.floor(i/4/world.renderer.domElement.width);bounds.left=Math.min(bounds.left,x);bounds.right=Math.max(bounds.right,x);bounds.top=Math.min(bounds.top,y);bounds.bottom=Math.max(bounds.bottom,y);}
   const debug:any={};if(ghostPixels){for(const [key,data]of Object.entries({baseline,selected,cleared})){const canvas=document.createElement('canvas');canvas.width=world.renderer.domElement.width;canvas.height=world.renderer.domElement.height;canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(data as Uint8Array),canvas.width,canvas.height),0,0);debug[key]=canvas.toDataURL();}}
   world.focus.x=target.center.x+WORLD_WIDTH;world.mapInput.dispatch({type:'select',region:target.id,attack:false});world.invalidated=true;
   await until(()=>wrapped&&world.renderer.domElement.dataset.selectionGlowPending==='false'&&!world.flatMapCache.pending);
   return {immediate,glowDelay:firstGlow-glowReady,reused,baked,changed,ghostPixels,bounds,latest,target:target.id,wrapped,width:world.selection.material.linewidth,debug};
  }finally{world.dispose();}
 });
 const {debug,...summary}=result;
 await testInfo.attach('selection-overlay-results',{body:JSON.stringify(summary,null,2),contentType:'application/json'});
 for(const [key,data]of Object.entries(debug))await testInfo.attach(key,{body:Buffer.from((data as string).split(',')[1],'base64'),contentType:'image/png'});
 expect(result.immediate).toBe(1);expect(result.glowDelay).toBe(0);expect(result.reused).toBe(true);
 expect(result.baked).toBe(0);expect(result.changed).toBeGreaterThan(10);expect(result.ghostPixels).toBe(0);
 expect(result.latest).toBe(result.target);expect(result.wrapped).toBe(true);expect(result.width).toBe(3);expect(errors).toEqual([]);
});
