import {openMapSearch} from './map-search.ts';
import {test,expect,type Page} from '@playwright/test';

async function hoverVisibleLand(page:Page){
 const position=await page.evaluate(async()=>{
  const {MAP,heightAt}=await import('/src/game/map.ts'),THREE=await import('/node_modules/three/build/three.module.js');
  const canvas=document.querySelector<HTMLCanvasElement>('.world canvas')!,d=canvas.dataset,w=canvas.clientWidth,h=canvas.clientHeight,distance=Number(d.distance),t=Math.max(0,Math.min(1,(distance-90)/230)),blend=1-t*t*(3-2*t);
  const camera=new THREE.PerspectiveCamera(40,w/h,.05,20000);camera.up.set(0,0,-1);camera.position.set(Number(d.focusX),distance*Math.cos(blend*.6),Number(d.focusZ)+distance*Math.sin(blend*.6));camera.lookAt(Number(d.focusX),0,Number(d.focusZ));camera.updateMatrixWorld();
  const selected=Number(d.selectedRegion),candidates=[MAP[selected],...MAP].filter(Boolean);
  for(const p of candidates){if(!p.visible)continue;const point=new THREE.Vector3(p.center.x,.16+(heightAt(p.center.x,p.center.z)-.16)*blend,p.center.z).project(camera),x=(point.x+1)*w/2,y=(1-point.y)*h/2;
   if(point.z>=-1&&point.z<=1&&document.elementFromPoint(x,y)===canvas)return{x,y};
  }
  throw Error('no unobscured land to hover');
 });
 await page.mouse.move(0,0);await page.mouse.move(position.x,position.y);
 await expect.poll(async()=>Number(await page.locator('.world canvas').getAttribute('data-selection-glow-vertices'))).toBeGreaterThan(0);
}
test('selection preserves owner fill and uses bounded inner glow in strategic and terrain views',async({page},testInfo)=>{
 await page.goto('/');await page.getByTestId('single-player').click();await page.getByTestId('begin-campaign').click();
 test.setTimeout(150000);
 const canvas=page.locator('.world canvas');
 await expect(page.locator('.app')).toHaveAttribute('data-local-ready','true',{timeout:60000});
 await expect(page.locator('.modal-backdrop')).toHaveCount(0);
 await canvas.focus();await page.keyboard.press('Space');await expect(page.getByTestId('toggle-pause')).toHaveText('▶');
 await expect(canvas).toHaveAttribute('data-selection-style','outline-hover-glow');
 await hoverVisibleLand(page);
 await expect.poll(async()=>Number(await canvas.getAttribute('data-selection-glow-vertices'))).toBeGreaterThan(0);
 await expect(canvas).not.toHaveAttribute('data-selection-glow-error');
 await expect(canvas).toHaveAttribute('data-selection-glow-coverage','single-nearest-boundary');
 await expect(canvas).toHaveAttribute('data-selection-glow-opacity','0.24');
 for(const key of ['Home','End']){
  await canvas.focus();await page.keyboard.press(key);
  if(key==='End')for(let i=0;i<6;i++)await page.keyboard.press('=');
  await expect(canvas).toHaveAttribute('data-settled','true',{timeout:20000});
  await hoverVisibleLand(page);
  await expect(canvas).toHaveAttribute('data-selected-fill-color',/^[0-9a-f]{6}$/);
  await expect.poll(async()=>(await canvas.getAttribute('data-selected-fill-color'))===(await canvas.getAttribute('data-selected-owner-color'))).toBe(true);
  await expect(canvas).toHaveAttribute('data-selection-glow-width','2');
  await expect(canvas).toHaveAttribute('data-view',key==='Home'?'far':'near');
  await expect(page.locator('.app')).toHaveAttribute('data-local-ready','true');
  await page.screenshot({path:testInfo.outputPath(`selection-glow-${key}.png`)});
 }
 for(const [width,height]of [[390,844],[844,390],[1440,960]]){
  await page.setViewportSize({width,height});await expect(canvas).toHaveAttribute('data-settled','true',{timeout:20000});
  await hoverVisibleLand(page);
  await expect(canvas).toHaveAttribute('data-selected-fill-color',/^[0-9a-f]{6}$/);
  await expect.poll(async()=>(await canvas.getAttribute('data-selected-fill-color'))===(await canvas.getAttribute('data-selected-owner-color'))).toBe(true);
  expect(Number(await canvas.getAttribute('data-selection-glow-vertices'))).toBeGreaterThan(0);
  await page.screenshot({path:testInfo.outputPath(`selection-glow-${width}x${height}.png`)});
 }
 // Explicit complex coast, enclosed holes and smallest close-up island evidence.
 for(const code of ['GRL-2743','HUN-3138','FJI-2619']){
  await openMapSearch(page);await page.getByTestId('map-search').fill(code);await page.locator('.map-search-results button').first().click();
  await canvas.focus();await page.keyboard.press('End');
  await expect(canvas).toHaveAttribute('data-settled','true',{timeout:20000});
  await hoverVisibleLand(page);
  await expect(canvas).toHaveAttribute('data-selection-glow-pending','false',{timeout:20000});
  await expect.poll(async()=>Number(await canvas.getAttribute('data-selection-glow-vertices'))).toBeGreaterThan(0);
  await expect(canvas).not.toHaveAttribute('data-selection-glow-error');
  await expect.poll(async()=>(await canvas.getAttribute('data-selected-fill-color'))===(await canvas.getAttribute('data-selected-owner-color'))).toBe(true);
  await page.screenshot({path:testInfo.outputPath(`selection-glow-${code}.png`)});
 }
});
