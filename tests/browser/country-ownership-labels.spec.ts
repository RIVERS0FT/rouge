import {test,expect} from '@playwright/test';

test('country ownership changes keep one legal title visible and retain stable glyph textures',async({page})=>{
 test.setTimeout(180000);
 await page.route('**/country-ownership-harness',route=>route.fulfill({contentType:'text/html',body:'<body style="margin:0"><div id="world" style="width:1200px;height:800px"></div></body>'}));
 await page.goto('/country-ownership-harness');
 const result=await page.evaluate(async()=>{
  const {default:refresh}=await import('/@react-refresh');refresh.injectIntoGlobalHook(window);
  (window as any).$RefreshReg$=()=>{};(window as any).$RefreshSig$=()=>((type:any)=>type);
  const {WorldRenderer}=await import('/src/render/WorldRenderer.ts');
  const {createGame}=await import('/src/game/engine.ts');
  const {MAP}=await import('/src/game/map.ts');
  const world:any=new WorldRenderer(document.querySelector('#world')!,()=>{},()=>{});cancelAnimationFrame(world.animation);world.frame=()=>{};
  const ids=MAP.filter((p:any)=>p.visible).map((p:any)=>({id:p.id,area:world.countryGeometry[p.id].reduce((a:number,g:any)=>a+g.area,0)})).sort((a:any,b:any)=>b.area-a.area).slice(0,3).map((p:any)=>p.id);
  let state=createGame(['Stable realm','Opponent','Unchanged realm'].map(name=>({name,leader:'warden',loadout:['infantry']})),77,'country-ownership-review');
  state={...state,units:[],provinces:state.provinces.map((p:any)=>({...p,owner:p.id===ids[0]?0:p.id===ids[2]?2:-1,captor:-1,capture:0}))};
  const draw=()=>{world.drawMapNames();world.renderer.render(world.scene,world.camera);};
  const focus=(owner:number)=>{const curve=world.countryPlacements.get(owner)?.curves[0];if(!curve)return;const {x,z}=curve.anchor;world.focus.set(x,0,z);world.distance=900;world.camera.position.set(x,900,z);world.camera.lookAt(x,0,z);world.camera.updateMatrixWorld();};
  const until=async(check:()=>boolean)=>{const end=performance.now()+90000;while(!check()){if(performance.now()>end)throw Error('country text did not settle');focus(0);draw();await new Promise(resolve=>setTimeout(resolve,30));}};
  world.update(state,-1,'en',0);
  await until(()=>world.countryPlacements.has(0)&&world.countryPlacements.has(2)&&world.countryText.ready);focus(0);draw();
  await until(()=>world.countryText.pending===0);draw();
  const primary=()=>[...world.countryLabels.values()].find((label:any)=>label.dataset.owner==='0'&&label.dataset.primary==='true'&&!label.hidden) as HTMLElement;
  const original=world.countryPlacements.get(0),third=world.countryPlacements.get(2),before=primary(),mesh=world.countryText.meshes.get(before),texture=mesh.material.uniforms.uText.value;
  if(!texture)throw Error('initial GPU text missing');
  const updateOwner=(id:number,owner:number)=>{state={...state,provinces:state.provinces.map((p:any)=>p.id===id?{...p,owner}:p)};world.update(state,-1,'en',0);};
  updateOwner(ids[1],0);draw();
  const gain={samePlacement:world.countryPlacements.get(0)===original,sameElement:primary()===before,sameTexture:mesh.material.uniforms.uText.value===texture,visible:mesh.visible,thirdUnchanged:world.countryPlacements.get(2)===third};
  updateOwner(ids[0],-1);const moved=world.countryPlacements.get(0);focus(0);draw();
  const label=primary(),nextMesh=world.countryText.meshes.get(label);
  const loss={hasPlacement:!!moved?.curves.length,moved:moved!==original,labelVisible:!!label&&!label.hidden,oneLayer:Number(nextMesh.visible)+Number(label.querySelector<SVGSVGElement>('svg')!.style.display!=='none'),thirdUnchanged:world.countryPlacements.get(2)===third};
  // Once its only remaining land is lost, pending old worker replies must not revive it.
  updateOwner(ids[1],-1);draw();const eliminated=!world.countryPlacements.has(0)&&![...world.countryLabels.values()].some((l:any)=>l.dataset.owner==='0');
  await until(()=>!world.countryLayoutBusy&&!world.countryLayoutPending);draw();
  const stayedEliminated=!world.countryPlacements.has(0)&&![...world.countryLabels.values()].some((l:any)=>l.dataset.owner==='0');
  world.dispose();return {gain,loss,eliminated,stayedEliminated};
 });
 expect(result.gain).toEqual({samePlacement:true,sameElement:true,sameTexture:true,visible:true,thirdUnchanged:true});
 expect(result.loss).toEqual({hasPlacement:true,moved:true,labelVisible:true,oneLayer:1,thirdUnchanged:true});
 expect(result.eliminated).toBe(true);expect(result.stayedEliminated).toBe(true);
});
