import {test,expect} from '@playwright/test';
import {execFileSync} from 'node:child_process';
const fixture=JSON.parse(execFileSync(process.execPath,['--experimental-strip-types','tests/create-unit-model-fixture.mjs'],{encoding:'utf8',maxBuffer:16*1024*1024}));

test('marching plaques interpolate in 2D and 3D while models only animate in 3D',async({page})=>{
 test.setTimeout(180000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/movement-harness',route=>route.fulfill({contentType:'text/html',body:'<body style="margin:0"><div id="world" style="width:1440px;height:960px"></div></body>'}));
 await page.goto('/movement-harness');
 const result=await page.evaluate(async(raw)=>{
  // This HTML harness bypasses Vite's index.html transform. Flag rendering
  // imports TSX too, so install the same development preamble as the app.
  const {default:refresh}=await import('/@react-refresh');refresh.injectIntoGlobalHook(window);
  (window as any).$RefreshReg$=()=>{};(window as any).$RefreshSig$=()=>((type:any)=>type);
  await import('/src/ui/style.css');
  const {WorldRenderer}=await import('/src/render/WorldRenderer.ts');
  const {MAP,provinceByCode}=await import('/src/game/map.ts');
  const {UnitMotion}=await import('/src/render/unitMotion.ts');
  const {unitMotionSegment}=await import('/src/render/unitMotionSegment.ts');
  const state=JSON.parse(JSON.parse(raw).body),id=provinceByCode('DEU-3487'),center=MAP[id].center;
  const unit={...state.units[0],army:7,x:center.x-3.2,z:center.z,province:id,origin:id,target:MAP[id].neighbors[0],destination:MAP[id].neighbors[0]};
  const snapshot=(distance:number,tick:number,offset:number)=>({
   ...state,campaign:`motion-${distance}`,tick,units:[{...unit,x:unit.x+offset}],
   armies:[{id:7,owner:unit.owner,to:unit.target,formed:0,size:1,formation:{
    from:id,phase:'march',position:{x:center.x+offset,z:center.z},heading:0,columns:1,
    route:{index:1,points:[center,MAP[unit.target].center]},lastContact:0,
   }}],
  });
  const plaqueX=()=>document.querySelector<HTMLElement>('[data-army="7"]')!.getBoundingClientRect().x;
  const world:any=new WorldRenderer(document.querySelector('#world')!,()=>{},()=>{});
  // Drive the real renderer deterministically, independently of runner GPU
  // speed. Unit tests separately exercise irregular wall-clock samples.
  cancelAnimationFrame(world.animation);const frame=world.frame;world.frame=()=>{};
  let now=0;const realNow=performance.now.bind(performance);Object.defineProperty(performance,'now',{configurable:true,value:()=>now});
  const canvas=world.renderer.domElement,passes=[];
  try{
   for(const distance of [320,80]){
    world.unitMotion=new UnitMotion(unitMotionSegment);world.unitsWereMoving=false;world.lastRender=-100;world.last=0;world.battleLast=-100;
    world.globalView=false;world.distance=world.desiredDistance=world.lastCameraTarget=distance;world.focus.set(center.x,0,center.z);world.desiredFocusZ=center.z;
    world.setInputContext('game');now=0;world.update(snapshot(distance,0,0),-1,'en',0);frame(0);
    const plaqueStart=plaqueX(),plaquePositions=[];
    now=100;world.update(snapshot(distance,2,.4),-1,'en',0);frame(100);
    const positions=[];let previousRevision=canvas.dataset.renderRevision;
    for(const time of [117,134,151,168,185,202,235]){
     now=time;frame(time);plaquePositions.push({time,x:plaqueX()});if(canvas.dataset.renderRevision!==previousRevision){
      const mesh=world.bodies;
      positions.push({time,x:mesh.instanceMatrix.array[12],count:mesh.count});previousRevision=canvas.dataset.renderRevision;
     }
    }
    // Motion can finish while an independently budgeted background is still
    // building. It must sleep after that work finishes, without losing motion.
    now=235;let builds=0;while(world.flatMapCache.pending&&distance>=320){now+=17;frame(now);if(++builds>300)throw Error('background did not settle');}
    const settled=canvas.dataset.renderRevision;now+=165;frame(now);const idle=canvas.dataset.renderRevision;
    world.setInputContext('blocked');now+=40;frame(now);const covered=canvas.dataset.renderRevision;
    now+=100;world.update(snapshot(distance,4,.8),-1,'en',0);frame(now+50);frame(now+120);
    passes.push({mode:canvas.dataset.unitRenderMode,tracks:world.unitMotion.tracks.size,instances:Number(canvas.dataset.renderedInstances),total:world.state.units.length,start:unit.x,positions,plaqueStart,plaquePositions,settled,idle,covered,afterCovered:canvas.dataset.renderRevision});
   }
  }finally{Object.defineProperty(performance,'now',{configurable:true,value:realNow});world.dispose();}
  return passes;
 },fixture.value);
 for(const [index,pass] of result.entries()){
  expect(pass.mode).toBe(index?'3d':'2d');expect(pass.total).toBe(1);
  const travel=pass.plaquePositions.at(-1)!.x-pass.plaqueStart;
  expect(travel).toBeGreaterThan(1);
  for(const {time,x} of pass.plaquePositions){
   const progress=Math.min(1,(time-100)/100);
   expect(Math.abs(x-(pass.plaqueStart+progress*travel))).toBeLessThan(.12);
  }
  if(!index){expect(pass.tracks).toBe(0);expect(pass.instances).toBe(0);expect(pass.positions.every(p=>p.count===0)).toBe(true);expect(pass.idle).toBe(pass.settled);expect(pass.afterCovered).toBe(pass.covered);continue;}
  expect(pass.positions.length).toBeGreaterThanOrEqual(5);
  for(const point of pass.positions){expect(point.count).toBe(1);expect(point.x).toBeCloseTo(pass.start+Math.min(1,(point.time-100)/100)*.4,4);}
  expect(pass.positions.at(-1)!.x).toBeCloseTo(pass.start+.4,4);
  expect(pass.idle).toBe(pass.settled);expect(pass.afterCovered).toBe(pass.covered);
 }
 expect(errors).toEqual([]);
});
