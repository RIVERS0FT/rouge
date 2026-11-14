import {openMapSearch} from './map-search.ts';
import {test,expect,type Page} from '@playwright/test';
import {execFileSync} from 'node:child_process';
const fixture=JSON.parse(execFileSync(process.execPath,['--experimental-strip-types','tests/create-country-name-fixture.mjs'],{encoding:'utf8',maxBuffer:16*1024*1024}));
const owners=JSON.parse(JSON.parse(fixture.value).body).provinces.map((p:{owner:number})=>p.owner);
async function assertInside(page:Page,allowEmpty=false){
 const result=await page.evaluate(async owners=>{
  // @ts-expect-error browser module URL
  const {MAP,pointInProvince,heightAt}=await import('/src/game/map.ts');
  // @ts-expect-error browser module URL
  const {wrapX}=await import('/src/game/geo.ts');
  // @ts-expect-error browser module URL
  const THREE=await import('/node_modules/three/build/three.module.js');
  const canvas=document.querySelector('.world canvas')!,d=canvas.dataset,width=canvas.clientWidth,height=canvas.clientHeight,scale=2*(Number(d.distance)-.8)*Math.tan(Math.PI/9)/height;
  const distance=Number(d.distance),t=Math.max(0,Math.min(1,(distance-90)/230)),blend=1-t*t*(3-2*t),camera=new THREE.PerspectiveCamera(40,width/height,.05,20000);
  camera.up.set(0,0,-1);camera.position.set(Number(d.focusX),distance*Math.cos(blend*.6),Number(d.focusZ)+distance*Math.sin(blend*.6));camera.lookAt(Number(d.focusX),0,Number(d.focusZ));camera.updateMatrixWorld();
  const ray=new THREE.Raycaster(),plane=new THREE.Plane(new THREE.Vector3(0,1,0),-.16),hit=new THREE.Vector3();
  const failures:unknown[]=[],labels=[...document.querySelectorAll<HTMLElement>('.country-label:not([hidden])')];let checked=0,curved=false;
  for(const label of labels){
   label.querySelector<SVGSVGElement>('svg')!.style.display='block';
   const text=label.querySelector('text')!,path=label.querySelector('path')!,matrix=new DOMMatrix(getComputedStyle(label).transform),owner=Number(label.dataset.owner),held=MAP.filter((p:any)=>owners[p.id]===owner),rotations=[];
   const project=(x:number,y:number)=>{const p=new DOMPoint(x,y).matrixTransform(matrix);return {x:p.x/p.w,y:p.y/p.w};};
   for(let i=0;i<text.getNumberOfChars();i++){
    const box=text.getExtentOfChar(i),a=text.getStartPositionOfChar(i),b=text.getEndPositionOfChar(i),start=project(a.x,a.y),end=project(b.x,b.y),angle=Math.atan2(end.y-start.y,end.x-start.x)*180/Math.PI;rotations.push(angle);
    if(angle < -90.01||angle > 90.01)failures.push({name:label.textContent,character:i,angle,reason:'upside-down character'});
    for(const [x,y] of [[box.x,box.y],[box.x+box.width,box.y],[box.x,box.y+box.height],[box.x+box.width,box.y+box.height],[box.x+box.width/2,box.y+box.height/2]]){
     const screen=project(x,y),world={x:wrapX(Number(d.focusX)+(screen.x-width/2)*scale),z:Number(d.focusZ)+(screen.y-height/2)*scale};checked++;
     if(blend>0){ray.setFromCamera(new THREE.Vector2(screen.x/width*2-1,1-screen.y/height*2),camera);plane.constant=-.16;for(let k=0;k<5;k++){ray.ray.intersectPlane(plane,hit);plane.constant=-(.16+heightAt(wrapX(hit.x),hit.z)*blend);}world.x=wrapX(hit.x);world.z=hit.z;}
     if(!held.some((p:any)=>pointInProvince(p.id,world.x,world.z)))failures.push({name:label.textContent,character:i,world});
    }
   }
   if(Math.max(...rotations)-Math.min(...rotations)>3)curved=true;
   if(text.getComputedTextLength()>path.getTotalLength())failures.push({name:label.textContent,reason:'text exceeds path'});
   if((path.getAttribute('d')!.match(/Q/g)??[]).length!==1||/[LC]/.test(path.getAttribute('d')!))failures.push({reason:'not a single quadratic arc'});
  }
  for(const label of labels)if(label.dataset.textRenderer==='distance-field')label.querySelector<SVGSVGElement>('svg')!.style.display='none';
  return {checked,failures:failures.slice(0,8),curved:curved||blend>0,count:labels.length};
 },owners);
 if(!allowEmpty||result.checked){expect(result.checked).toBeGreaterThan(0);expect(result.curved).toBe(true);}expect(result.failures).toEqual([]);
}
for(const mobile of [false,true])test.describe(mobile?'mobile country names':'desktop country names',()=>{
 test.use({hasTouch:mobile,isMobile:mobile,viewport:mobile?{width:844,height:390}:{width:1440,height:960}});
 test('curved country text stays inside owned land through language, zoom, HUD and viewport changes',async({page})=>{
  test.setTimeout(180000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(({key,value})=>{localStorage.setItem(key,value);localStorage.setItem('rouge.language','en');},fixture);
  await page.goto('/');await page.getByTestId('open-saves').click();await page.locator('.save-card').filter({hasText:'Country names fixture'}).getByRole('button',{name:'Load',exact:true}).click();
  await expect(page.locator('.app')).toHaveAttribute('data-local-ready','true',{timeout:60000});
  const canvas=page.locator('.world canvas');await canvas.focus();await page.keyboard.press('Space');await expect(page.getByTestId('toggle-pause')).toHaveText('▶');
  await expect(canvas).toHaveAttribute('data-country-layout-state','ready',{timeout:30000});
  await canvas.focus();await page.keyboard.press('Home');await expect(canvas).toHaveAttribute('data-settled','true',{timeout:20000});
  const revision=await canvas.getAttribute('data-country-anchor-revision');await assertInside(page);
  const anchors=()=>page.locator('.country-label:visible').evaluateAll(nodes=>nodes.map(n=>({owner:(n as HTMLElement).dataset.owner,x:(n as HTMLElement).dataset.anchorX,z:(n as HTMLElement).dataset.anchorZ,path:n.querySelector('path')!.getAttribute('d')})));
  const before=await anchors();
  if(mobile){await page.getByTestId('toggle-province-panel').tap();expect(await anchors()).toEqual(before);await page.getByTestId('toggle-province-panel').tap();}
  await page.screenshot({path:`artifacts/country-curves-${mobile?'mobile':'desktop'}-en.png`});
  await page.getByTestId('open-settings').click();await page.getByRole('button',{name:'简体中文',exact:true}).click();await page.keyboard.press('Escape');
  await assertInside(page);await page.screenshot({path:`artifacts/country-curves-${mobile?'mobile':'desktop'}-zh.png`});
  await canvas.focus();await page.keyboard.press('+');await page.keyboard.press('+');await expect(canvas).toHaveAttribute('data-settled','true',{timeout:20000});await assertInside(page);
  if(mobile){await page.setViewportSize({width:390,height:844});await canvas.focus();await page.keyboard.press('Home');await expect(canvas).toHaveAttribute('data-viewport-width','390',{timeout:20000});await expect(canvas).toHaveAttribute('data-settled','true',{timeout:20000});await assertInside(page,true);}
  await openMapSearch(page);await page.getByTestId('map-search').fill('CHN-1150');await page.locator('.map-search-results button').first().click();
  if(mobile&&await page.getByTestId('toggle-province-panel').getAttribute('aria-expanded')==='true')await page.getByTestId('toggle-province-panel').tap();
  await canvas.focus();await page.keyboard.press('End');await expect(canvas).toHaveAttribute('data-settled','true',{timeout:20000});
  await expect.poll(()=>page.locator('.province-label:visible').count()).toBeGreaterThan(0);
  const title=page.locator('.country-label[data-owner="2"][data-primary="true"]');await expect(title).toBeVisible();await expect(title).toHaveAttribute('data-anchor-kind','interior-curve');
  await expect(title).toHaveText(fixture.players[2].country.name[0]);await assertInside(page);await expect(canvas).toHaveAttribute('data-country-anchor-revision',revision!);
  await expect(title).toHaveAttribute('data-text-renderer','distance-field');
  expect(await title.locator('text').evaluate(text=>({weight:getComputedStyle(text).fontWeight,font:getComputedStyle(text).fontFamily,stroke:text.getAttribute('stroke'),opacity:text.getAttribute('stroke-opacity'),loaded:document.fonts.check('700 24px "ROUGE Country Serif"')}))).toEqual({weight:'700',font:'"ROUGE Country Serif", "Noto Serif SC", "Songti SC", STSong, SimSun, serif',stroke:'#faf4e4',opacity:'0.4',loaded:true});
  await page.screenshot({path:`artifacts/country-style-${mobile?'mobile':'desktop'}-zh.png`});expect(errors).toEqual([]);
 });
});

test('country glyphs keep their map positions while zoom crosses the terrain tilt range',async({page})=>{
 test.setTimeout(120000);
 await page.addInitScript(({key,value})=>{localStorage.setItem(key,value);localStorage.setItem('rouge.language','en');},fixture);
 await page.goto('/');await page.getByTestId('open-saves').click();
 await page.locator('.save-card').filter({hasText:'Country names fixture'}).getByRole('button',{name:'Load',exact:true}).click();
 await expect(page.locator('.app')).toHaveAttribute('data-local-ready','true',{timeout:60000});
 await page.getByTestId('toggle-pause').click();
 await openMapSearch(page);await page.getByTestId('map-search').fill(fixture.labelFocusRegions[2]);await page.locator('.map-search-results button').first().click();
 const canvas=page.locator('.world canvas'),label=page.locator('.country-label[data-owner="2"][data-primary="true"]');
 await expect(canvas).toHaveAttribute('data-country-layout-state','ready',{timeout:30000});
 await canvas.focus();for(let i=0;i<8;i++)await page.keyboard.press('-');
 await expect(canvas).toHaveAttribute('data-settled','true',{timeout:20000});
 const positions=()=>label.evaluate(async element=>{
  // @ts-expect-error browser module URL
  const THREE=await import('/node_modules/three/build/three.module.js');
  const canvas=document.querySelector<HTMLCanvasElement>('.world canvas')!,d=canvas.dataset,width=canvas.clientWidth,height=canvas.clientHeight;
  const distance=Number(d.distance),t=Math.max(0,Math.min(1,(distance-90)/230)),blend=1-t*t*(3-2*t),camera=new THREE.PerspectiveCamera(40,width/height,.05,20000);
  camera.up.set(0,0,-1);camera.position.set(Number(d.focusX),distance*Math.cos(blend*.6),Number(d.focusZ)+distance*Math.sin(blend*.6));camera.lookAt(Number(d.focusX),0,Number(d.focusZ));camera.updateMatrixWorld();
  const svg=element.querySelector<SVGSVGElement>('svg')!;svg.style.display='block';
  const text=element.querySelector('text')!,matrix=new DOMMatrix(getComputedStyle(element).transform),ray=new THREE.Raycaster(),plane=new THREE.Plane(new THREE.Vector3(0,1,0),-Number(element.dataset.elevation)),hit=new THREE.Vector3();
  const points=Array.from({length:text.getNumberOfChars()},(_,i)=>{
   const a=text.getStartPositionOfChar(i),b=text.getEndPositionOfChar(i),screen=new DOMPoint((a.x+b.x)/2,(a.y+b.y)/2).matrixTransform(matrix);
   ray.setFromCamera(new THREE.Vector2(screen.x/screen.w/width*2-1,1-screen.y/screen.w/height*2),camera);ray.ray.intersectPlane(plane,hit);
   return {x:hit.x,z:hit.z};
  });
  if(element.dataset.textRenderer==='distance-field')svg.style.display='none';return points;
 });
 await expect(label).toBeVisible();const before=await positions();expect(before.length).toBeGreaterThan(3);
 for(let step=0;step<3;step++){
  for(let i=0;i<4;i++)await page.keyboard.press('+');
  await expect(canvas).toHaveAttribute('data-settled','true',{timeout:20000});
  await expect(label).toBeVisible();const after=await positions();expect(after).toHaveLength(before.length);
  for(let i=0;i<before.length;i++)expect(Math.hypot(after[i].x-before[i].x,after[i].z-before[i].z)).toBeLessThan(.15);
 }
 expect(Number(await canvas.getAttribute('data-distance'))).toBeLessThan(160);
});
