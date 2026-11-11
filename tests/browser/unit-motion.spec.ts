import {test,expect} from '@playwright/test';
import {execFileSync} from 'node:child_process';
const fixture=JSON.parse(execFileSync(process.execPath,['--experimental-strip-types','tests/create-unit-model-fixture.mjs'],{encoding:'utf8',maxBuffer:16*1024*1024}));

test('real 2D/3D batches render intermediate snapshot positions, settle, and sleep under a modal',async({page})=>{
 test.setTimeout(180000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/movement-harness',route=>route.fulfill({contentType:'text/html',body:'<body style="margin:0"><div id="world" style="width:1440px;height:960px"></div></body>'}));
 await page.goto('/movement-harness');
 const result=await page.evaluate(async(raw)=>{
  const {WorldRenderer}=await import('/src/render/WorldRenderer.ts');
  const {MAP,provinceByCode}=await import('/src/game/map.ts');
  const {UnitMotion}=await import('/src/render/unitMotion.ts');
  const {unitMotionSegment}=await import('/src/render/unitMotionSegment.ts');
  const state=JSON.parse(JSON.parse(raw).body),id=provinceByCode('DEU-3487'),center=MAP[id].center;
  const unit={...state.units[0],x:center.x-3.2,z:center.z,province:id,origin:id};state.units=[unit];state.tick=0;
  const world:any=new WorldRenderer(document.querySelector('#world')!,()=>{},()=>{});
  // Drive the real renderer deterministically, independently of runner GPU
  // speed. Unit tests separately exercise irregular wall-clock samples.
  cancelAnimationFrame(world.animation);const frame=world.frame;world.frame=()=>{};
  let now=0;const realNow=performance.now.bind(performance);Object.defineProperty(performance,'now',{configurable:true,value:()=>now});
  const canvas=world.renderer.domElement,passes=[];
  try{
   for(const distance of [320,80]){
    world.unitMotion=new UnitMotion(unitMotionSegment);world.unitsWereMoving=false;world.lastRender=-Infinity;world.last=0;
    world.globalView=false;world.distance=world.desiredDistance=world.lastCameraTarget=distance;world.focus.set(center.x,0,center.z);world.desiredFocusZ=center.z;
    world.setInputContext('game');now=0;world.update({...state,campaign:`motion-${distance}`},-1,'en');frame(0);
    now=100;world.update({...state,campaign:`motion-${distance}`,tick:2,units:[{...unit,x:unit.x+.4}]},-1,'en');frame(100);
    const positions=[];let previousRevision=canvas.dataset.renderRevision;
    for(const time of [117,134,151,168,185,202,235]){
     now=time;frame(time);if(canvas.dataset.renderRevision!==previousRevision){
      const mesh=canvas.dataset.unitRenderMode==='2d'?world.unitSprites:world.bodies;
      positions.push({time,x:mesh.instanceMatrix.array[12],count:mesh.count});previousRevision=canvas.dataset.renderRevision;
     }
    }
    const settled=canvas.dataset.renderRevision;now=400;frame(400);const idle=canvas.dataset.renderRevision;
    world.setInputContext('blocked');frame(440);const covered=canvas.dataset.renderRevision;
    now=500;world.update({...state,campaign:`motion-${distance}`,tick:4,units:[{...unit,x:unit.x+.8}]},-1,'en');frame(550);frame(620);
    passes.push({mode:canvas.dataset.unitRenderMode,start:unit.x,positions,settled,idle,covered,afterCovered:canvas.dataset.renderRevision});
   }
  }finally{Object.defineProperty(performance,'now',{configurable:true,value:realNow});world.dispose();}
  return passes;
 },fixture.value);
 for(const [index,pass] of result.entries()){
  expect(pass.mode).toBe(index?'3d':'2d');expect(pass.positions.length).toBeGreaterThanOrEqual(5);
  for(const point of pass.positions){expect(point.count).toBe(1);expect(point.x).toBeCloseTo(pass.start+Math.min(1,(point.time-100)/100)*.4,4);}
  expect(pass.positions.at(-1)!.x).toBeCloseTo(pass.start+.4,4);
  expect(pass.idle).toBe(pass.settled);expect(pass.afterCovered).toBe(pass.covered);
 }
 expect(errors).toEqual([]);
});
