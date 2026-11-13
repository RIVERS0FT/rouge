import {test,expect,type Page} from '@playwright/test';
import {execFileSync} from 'node:child_process';
async function loadMap(page:Page){
 const fixture=JSON.parse(execFileSync(process.execPath,['--experimental-strip-types','tests/create-country-name-fixture.mjs'],{encoding:'utf8',maxBuffer:16*1024*1024}));
 await page.addInitScript(({key,value})=>{localStorage.setItem(key,value);localStorage.setItem('rouge.language','en');},fixture);
 await page.goto('/');await page.getByTestId('open-saves').click();await page.locator('.save-card').filter({hasText:'Country names fixture'}).getByRole('button',{name:'Load',exact:true}).click();
 await expect(page.locator('.app')).toHaveAttribute('data-local-ready','true',{timeout:60000});
 const canvas=page.locator('.world canvas');await canvas.focus();await page.keyboard.press('Space');await expect(page.getByTestId('toggle-pause')).toHaveText('▶');
 await canvas.focus();await page.keyboard.press('Home');await expect(canvas).toHaveAttribute('data-settled','true',{timeout:20000});
 return canvas;
}
for(const mobile of [false,true])test.describe(mobile?'mobile map surfaces':'desktop map surfaces',()=>{
 test.use({hasTouch:mobile,isMobile:mobile,viewport:mobile?{width:844,height:390}:{width:1440,height:960}});
 test('geographic relief and static ocean surface preserve political borders and names',async({page})=>{
  test.setTimeout(180000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text());});
  const images:string[]=[];page.on('request',r=>{if(/natural-earth-(relief|ocean)-.*webp/.test(r.url()))images.push(r.url());});
  await page.addInitScript(()=>Object.defineProperty(navigator,'deviceMemory',{get:()=>8}));
  const canvas=await loadMap(page);
  await expect(canvas).toHaveAttribute('data-relief-state','ready');await expect(canvas).toHaveAttribute('data-ocean-state','ready');
  await expect(canvas).toHaveAttribute('data-relief-width',mobile?'2048':'4096');
  await expect(canvas).toHaveAttribute('data-ocean-source','procedural-water-surface');await expect(canvas).toHaveAttribute('data-ocean-animation','static');
  await expect(canvas).toHaveAttribute('data-coast-shadow','offshore');
  // Static water must not wake a settled, paused strategic map.
  await page.waitForTimeout(1200);const revision=await canvas.getAttribute('data-render-revision');
  await page.waitForTimeout(800);expect(await canvas.getAttribute('data-render-revision')).toBe(revision);
  await expect(canvas).toHaveAttribute('data-surface-projection','miller-crop');
  await expect.poll(()=>page.locator('.country-label:visible').count()).toBeGreaterThan(0);
  await expect(canvas).toHaveAttribute('data-country-borders','true');
  await page.screenshot({path:`artifacts/map-surfaces-${mobile?'mobile':'desktop'}-world.png`});
  // Verify an owned (not neutral) area retains the actual faction's base color.
  await page.getByTestId('map-search').fill('CHN');await page.locator('.map-search-results button').first().click();
  await expect.poll(async()=>await canvas.getAttribute('data-selected-fill-color')===await canvas.getAttribute('data-selected-owner-color')).toBe(true);
  await expect(canvas).not.toHaveAttribute('data-selected-owner-color','b4b0a2');
  // Himalayan land relief retains geographic alignment at strategic zoom.
  await page.getByTestId('map-search').fill('NPL-1095');await page.locator('.map-search-results button').first().click();
  if(mobile&&await page.getByTestId('toggle-province-panel').getAttribute('aria-expanded')==='true')await page.getByTestId('toggle-province-panel').click();
  await canvas.focus();await page.keyboard.press('End');await expect(canvas).toHaveAttribute('data-settled','true',{timeout:20000});
  const distance=Number(await canvas.getAttribute('data-distance'));for(let n=0;n<Math.ceil(Math.log(650/distance)/Math.log(1.15));n++)await page.keyboard.press('-');
  await expect(canvas).toHaveAttribute('data-settled','true',{timeout:20000});
  expect(await canvas.getAttribute('data-selected-fill-color')).toEqual(await canvas.getAttribute('data-selected-owner-color'));
  await page.screenshot({path:`artifacts/map-surfaces-${mobile?'mobile':'desktop'}-himalaya.png`});
  // An island exposes the same coast and surface in flat and tilted views.
  await page.getByTestId('map-search').fill('USA-3517');await page.locator('.map-search-results button').first().click();
  if(mobile&&await page.getByTestId('toggle-province-panel').getAttribute('aria-expanded')==='true')await page.getByTestId('toggle-province-panel').click();
  await canvas.focus();await page.keyboard.press('End');await expect(canvas).toHaveAttribute('data-settled','true',{timeout:20000});
  await expect(canvas).toHaveAttribute('data-view','near');await expect(canvas).toHaveAttribute('data-ocean-reflection','near-view');
  await page.screenshot({path:`artifacts/ocean-surface-${mobile?'mobile':'desktop'}-near.png`});
  // Water does not animate the backdrop of an open menu, even in the 3D view.
  await page.keyboard.press('Escape');await expect(canvas).toHaveAttribute('data-render-paused','true');
  const menuRevision=await canvas.getAttribute('data-render-revision');await page.waitForTimeout(800);
  expect(await canvas.getAttribute('data-render-revision')).toBe(menuRevision);
  await page.keyboard.press('Escape');
  if(mobile){await page.setViewportSize({width:390,height:844});await expect(canvas).toHaveAttribute('data-viewport-width','390');await expect(canvas).toHaveAttribute('data-surface-resolution','compact');}
  await canvas.focus();await page.keyboard.press('Home');await expect(canvas).toHaveAttribute('data-settled','true',{timeout:20000});
  expect(images).toHaveLength(1);expect(images[0]).toContain('natural-earth-relief-');expect(errors).toEqual([]);
 });
});
test('missing relief image leaves a playable map and intact water surface',async({page})=>{
 test.setTimeout(120000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/natural-earth-*.webp*',route=>route.abort());
 const canvas=await loadMap(page);
 await expect(canvas).toHaveAttribute('data-relief-state','fallback');await expect(canvas).toHaveAttribute('data-ocean-state','ready');
 await expect(canvas).toHaveAttribute('data-ready','true');await expect(page.locator('.render-error')).toHaveCount(0);
 await page.getByTestId('map-search').fill('NPL-1095');await page.locator('.map-search-results button').first().click();
 await expect(canvas).not.toHaveAttribute('data-selected-region','-1');expect(errors).toEqual([]);
});
test('slow artwork does not delay map input or simulation readiness',async({page})=>{
 test.setTimeout(120000);
 let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/natural-earth-*.webp*',async route=>{await gate;await route.continue();});
 try{
  const canvas=await loadMap(page);
  await expect(canvas).toHaveAttribute('data-relief-state','loading');await expect(canvas).toHaveAttribute('data-ocean-state','ready');
  await page.getByTestId('map-search').fill('NPL-1095');await page.locator('.map-search-results button').first().click();
  await expect(canvas).not.toHaveAttribute('data-selected-region','-1');
  release();await expect(canvas).toHaveAttribute('data-relief-state','ready');await expect(canvas).toHaveAttribute('data-ocean-state','ready');
 }finally{release();}
});
