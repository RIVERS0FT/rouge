// Drive Chromium's input path and time the first draw with the expected state.
// Looking up a hittable point is setup; game commands always go through the UI.
import {MAP} from '../src/game/map.ts';

export async function profilePlayerInput(page,count=30){
 const entries=[];
 // End frames the selected province. A continent-sized province fits in 2D,
 // so select targets whose normal terrain shortcut actually crosses into 3D.
 const terrainTargets=MAP.map(p=>p.visible&&2.4*Math.max(p.bounds.right-p.bounds.left,p.bounds.bottom-p.bounds.top)<200);
 const canvas=page.locator('.world canvas');
 await canvas.focus();
 await page.getByTestId('toggle-pause').click();
 const observe=async(kind,event,args={})=>{
  await page.evaluate(({kind,event,args})=>{
   const w=window.__frameProbe.instance,el=w.renderer.domElement;
   window.__inputSample=null;
   const onInput=e=>{
    if(!e.isTrusted)return;
    window.removeEventListener(event,onInput,true);
    if(kind==='wheel'&&e.target!==el){window.__inputSample={kind,intercepted:true,target:e.target?.className?.toString()};return;}
    const start=e.timeStamp,domEventMs=performance.now()-start,revision=w.renderRevision,initial=Number(el.dataset.distance);
    const startTick=w.state.tick;
    let commandReply;
    const worker=window.__benchmarkWorker;
    const onReply=event=>{if(event.data?.type==='result')commandReply=event.data.result;};
    if(kind==='dispatch')worker?.addEventListener('message',onReply);
    let firstMs=null;
    const check=()=>{
     const now=performance.now(),draw=w.renderRevision>revision,mode=el.dataset.unitRenderMode;
     const camera=kind==='to2d'||kind==='to3d',drag=kind==='drag',dispatch=kind==='dispatch';
     const preview=document.querySelector('[data-testid=dispatch-preview]');
     const applied=dispatch&&w.state.armies.some(a=>a.id>=args.nextArmy&&a.owner===w.actor&&a.to===args.target);
     const shown=camera||kind==='wheel'?Math.abs(Number(el.dataset.distance)-initial)>.01:
      drag?preview?.dataset.phase==='dragging'&&Number(preview.dataset.target)===args.target:
      dispatch?el.dataset.routeOverlayVisible==='false'||applied:Number(el.dataset.selectedRegion)===args.target;
     if(firstMs===null&&draw&&shown)firstMs=now-start;
     const done=camera?mode===(kind==='to2d'?'2d':'3d')&&el.dataset.settled==='true':
      kind==='wheel'?shown&&el.dataset.settled==='true':dispatch?applied:shown;
     if((firstMs!==null&&done)||now-start>5000){
      if(dispatch)worker?.removeEventListener('message',onReply);
      window.__inputSample={kind,firstMs,domEventMs,drawWaitMs:firstMs===null?null:firstMs-domEventMs,settledMs:done?now-start:null,startTick,tick:w.state.tick,draws:w.renderRevision-revision,ok:firstMs!==null&&done,
       ...(dispatch?{source:args.region,target:args.target,commandReply,sourceOwner:w.ownerIds[args.region],garrison:w.provinceGarrisons[args.region]}:{}),
       ...(kind==='wheel'?{initial,distance:w.distance,desired:w.desiredDistance,active:w.mapInput.active}:{})};
     }else requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
   };
   window.addEventListener(event,onInput,true);
  },{kind,event,args});
 };
 const collect=async()=>{
  await page.waitForFunction(()=>!!window.__inputSample,null,{timeout:8000});
  entries.push(await page.evaluate(()=>window.__inputSample));
 };
 const close=page.locator('#province-panel .dock-close');
 const findGesture=async(source,distance)=>{
  await page.evaluate(({source,distance})=>{
   const w=window.__frameProbe.instance;w.focusProvince(source);w.mapInput.dispatch({type:'zoom',distance});
  },{source,distance});
  await page.waitForFunction(()=>window.__frameProbe.instance.renderer.domElement.dataset.settled==='true');
  return page.evaluate(({source,terrainTargets})=>{
   const w=window.__frameProbe.instance,c=w.renderer.domElement,b=c.getBoundingClientRect();
   const plaques=[...document.querySelectorAll('.province-label[data-dispatch-source=true]:not([hidden])')];
   plaques.sort((a,b)=>Number(b.dataset.region===String(source))-Number(a.dataset.region===String(source))||w.provinceGarrisons[b.dataset.region]-w.provinceGarrisons[a.dataset.region]);
   let fallback=null;
   for(const plaque of plaques){
   const region=Number(plaque.dataset.region),box=plaque.getBoundingClientRect();
   const start=[.5,.15,.85].map(f=>({x:box.x+box.width*f,y:box.y+box.height/2})).find(p=>plaque.contains(document.elementFromPoint(p.x,p.y)));
   if(!start)continue;
   const members=w.plaqueByRegion.get(region)?.members??[region];
   for(let radius=35;radius<Math.min(b.width,b.height)*.45;radius+=25)for(let j=0;j<16;j++){
    const x=Math.round(start.x+Math.cos(j*Math.PI/8)*radius),y=Math.round(start.y+Math.sin(j*Math.PI/8)*radius);
    if(document.elementFromPoint(x,y)!==c)continue;
    const target=w.pickedRegion(c,{clientX:x,clientY:y});
    if(target<0||target===w.selected||members.includes(target)||members.some(id=>w.state.provinces[id].march?.to===target))continue;
    const pair={start,x,y,target,region};
    if(terrainTargets[target])return pair;
    fallback??=pair;
   }
   }
   return fallback;
  },{source,terrainTargets});
 };
 for(let i=0;i<count;i++){
  if(await close.isVisible())await close.click();
  const sources=await page.evaluate(()=>{
   const w=window.__frameProbe.instance;
   return w.plaqueTerritories.filter(p=>w.ownerIds[p.id]===w.actor&&w.provinceGarrisons[p.id]>0)
    .sort((a,b)=>w.provinceGarrisons[b.id]-w.provinceGarrisons[a.id]||a.id-b.id).map(p=>p.id);
  });
  // A large province or a HUD-covered plaque can leave the first camera with
  // no second selectable region. Finish setup before starting an input timer.
  let points;
  for(const distance of [180,140,195]){
   for(const source of sources){points=await findGesture(source,distance);if(points)break;}
   if(points)break;
  }
  if(!points)throw Error('No clickable source/target pair across '+sources.length+' owned garrisons before gesture '+(i+1));
  await observe('select','pointerup',points);await page.mouse.click(points.x,points.y);await collect();
  if(await close.isVisible())await close.click();
  await page.mouse.move(points.start.x,points.start.y);await page.mouse.down();
  await observe('drag','pointermove',points);await page.mouse.move(points.x,points.y);await collect();
  await page.keyboard.press('Tab');
  const nextArmy=await page.evaluate(()=>window.__frameProbe.instance.state.nextArmy);
  await observe('dispatch','pointerup',{...points,nextArmy});await page.mouse.up();await collect();
  await canvas.focus();
  let intercepted=0;
  for(;;){
  const wheelAt=await page.evaluate(offset=>{
   const canvas=window.__frameProbe.instance.renderer.domElement,b=canvas.getBoundingClientRect();
   const points=[];
   for(const dx of [.5,.45,.6,.35,.7])for(const dy of [.45,.55,.6,.35]){const x=b.x+b.width*dx,y=b.y+b.height*dy;if(document.elementFromPoint(x,y)===canvas)points.push({x,y});}
   if(points.length)return points[offset%points.length];
   throw Error('No unobstructed canvas for wheel zoom');
  },intercepted);
  await page.mouse.move(wheelAt.x,wheelAt.y);
  await observe('wheel','wheel');await page.mouse.wheel(0,i%2?90:-90);
  await page.waitForFunction(()=>!!window.__inputSample,null,{timeout:8000});
  const result=await page.evaluate(()=>window.__inputSample);
  if(!result.intercepted){entries.push({...result,intercepted});break;}
  if(++intercepted>=8)throw Error('Map wheel was intercepted by '+result.target);
  }
  // End fits the selected region. Give this separate shortcut sample a
  // terrain-sized region when the preceding dispatch selected a large one.
  if(!terrainTargets[points.target]){
   const target=MAP.filter(p=>terrainTargets[p.id]).sort((a,b)=>
    Math.hypot(a.center.x-MAP[points.target].center.x,a.center.z-MAP[points.target].center.z)-
    Math.hypot(b.center.x-MAP[points.target].center.x,b.center.z-MAP[points.target].center.z))[0].id;
   await page.evaluate(id=>window.__frameProbe.instance.mapInput.dispatch({type:'select',region:id,attack:false}),target);
   await page.waitForFunction(id=>window.__frameProbe.instance.selected===id,target);
   if(await close.isVisible())await close.click();
   await canvas.focus();
  }
  for(const [kind,key] of [['to2d','Home'],['to3d','End']]){
   await observe(kind,'keydown');await page.keyboard.press(key);await collect();
  }
 }
 return entries;
}

export async function profileTouch(page,session,count=30){
 await page.getByTestId('toggle-pause').click();
 const samples=[];
 const input=(type,points)=>session.send('Input.dispatchTouchEvent',{type,touchPoints:points});
 for(let i=0;i<count;i++)for(const kind of ['pan','pinch']){
  await page.waitForFunction(()=>window.__frameProbe.instance.renderer.domElement.dataset.settled==='true');
  const centers=await page.evaluate(()=>{
   const c=document.querySelector('.world canvas'),r=c.getBoundingClientRect();
   const clear=[];
   for(const h of [.55,.45,.65,.35,.75])for(const w of [.5,.6,.4,.3,.7]){
    const x=r.x+r.width*w,y=r.y+r.height*h;
    if([-48,-32,0,32,48].every(d=>[-6,0,6].every(dy=>document.elementFromPoint(x+d,y+dy)===c)))clear.push({x,y});
   }
   return clear;
  });
  // Reverse the same pair of spans. Unequal inverse ratios can gradually
  // reach the zoom limit, where the next outward gesture has no visible effect.
  const startSpan=i%2?48:32,endSpan=i%2?32:48;
  let x,y,intercepted=0,ready=false;
  const fingers=span=>[{x:x-span,y,id:1},{x:x+span,y,id:2}];
  for(const center of centers){
   ({x,y}=center);
   const from=kind==='pan'?[{x,y,id:1}]:fingers(startSpan);
   await input('touchStart',from);
   ready=await page.evaluate(n=>{const r=window.__frameProbe.instance;return !r.dispatchDrag&&r.touches.size===n;},from.length);
   if(ready)break;
   await input('touchCancel',[]);intercepted++;
  }
  if(!ready)throw Error('Unable to place '+kind+' gesture on canvas at repetition '+(i+1));
  await page.evaluate(kind=>{
   const r=window.__frameProbe.instance,x=r.focus.x,d=r.distance,rev=r.renderRevision;
   window.__touchSample=null;
   // Map input consumes trusted touch pointer events. A browser may omit
   // touchmove while already delivering pointermove to the map.
   const onMove=e=>{
    if(e.pointerType!=='touch'||!e.isTrusted)return;
    window.removeEventListener('pointermove',onMove,true);clearTimeout(timer);
    const start=e.timeStamp;
    function check(){
     const elapsed=performance.now()-start;
     if(r.renderRevision>rev&&(kind==='pan'?Math.abs(r.focus.x-x)>.001:Math.abs(r.distance-d)>.001))window.__touchSample={kind,ms:elapsed,ok:true};
     else if(elapsed>3000)window.__touchSample={kind,ms:elapsed,ok:false,reason:'no visible camera change'};
     else requestAnimationFrame(check);
    }
    requestAnimationFrame(check);
   };
   const timer=setTimeout(()=>{window.removeEventListener('pointermove',onMove,true);window.__touchSample={kind,ms:null,ok:false,reason:'no touch pointermove delivered'};},3000);
   window.addEventListener('pointermove',onMove,true);
  },kind);
  await input('touchMove',kind==='pan'?[{x:x+(i%2?45:-45),y,id:1}]:fingers(endSpan));
  await page.waitForFunction(()=>!!window.__touchSample,null,{timeout:8000});
  samples.push({...await page.evaluate(()=>window.__touchSample),intercepted});
  await input('touchEnd',[]);
 }
 return samples;
}
