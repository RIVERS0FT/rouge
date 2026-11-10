import {test,expect} from '@playwright/test';
import {execFileSync} from 'node:child_process';
for(const mobile of [false,true])test.describe(mobile?'mobile country names':'desktop country names',()=>{
 test.use({hasTouch:mobile,isMobile:mobile,viewport:mobile?{width:844,height:390}:{width:1440,height:960}});
 test('countries follow ownership, preserve human names, localize AI and yield to tactical detail',async({page})=>{
  test.setTimeout(180000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  const fixture=JSON.parse(execFileSync(process.execPath,['--experimental-strip-types','tests/create-country-name-fixture.mjs'],{encoding:'utf8',maxBuffer:16*1024*1024}));
  await page.addInitScript(({key,value})=>{localStorage.setItem(key,value);localStorage.setItem('rouge.language','en');},fixture);
  await page.goto('/');await page.getByTestId('open-saves').click();await page.locator('.save-card').filter({hasText:'Country names fixture'}).getByRole('button',{name:'Load',exact:true}).click();
  await expect(page.locator('.app')).toHaveAttribute('data-local-ready','true',{timeout:60000});
  const canvas=page.locator('canvas');await canvas.focus();await page.keyboard.press('Space');await expect(page.getByTestId('toggle-pause')).toHaveText('▶');
  await canvas.focus();await page.keyboard.press('Home');await expect(canvas).toHaveAttribute('data-settled','true',{timeout:20000});
  await expect.poll(()=>page.locator('.country-label:visible').count()).toBeGreaterThan(0);
  const check=async()=>{
   const labels=await page.locator('.country-label:visible').evaluateAll(nodes=>nodes.map(node=>({text:node.textContent,owner:Number((node as HTMLElement).dataset.owner),region:Number((node as HTMLElement).dataset.region),box:node.getBoundingClientRect().toJSON(),pointer:getComputedStyle(node).pointerEvents})));
   expect(labels.length).toBeLessThanOrEqual(32);expect(new Set(labels.map(l=>l.owner)).size).toBe(labels.length);
   const state=JSON.parse(JSON.parse(fixture.value).body);
   for(const l of labels){expect(l.owner).toBeGreaterThanOrEqual(0);expect(state.provinces[l.region].owner).toBe(l.owner);expect(l.pointer).toBe('none');if(l.owner<2)expect(l.text).toBe(fixture.players[l.owner].name);}
   for(let a=0;a<labels.length;a++)for(let b=a+1;b<labels.length;b++){const x=labels[a].box,y=labels[b].box;expect(x.right<y.left||x.left>y.right||x.bottom<y.top||x.top>y.bottom).toBe(true);}
   return labels;
  };
  await check();
  if(mobile){
   const camera=await canvas.getAttribute('data-distance'),tick=await page.getByTestId('game-clock').getAttribute('data-tick');
   for(const open of [true,false]){
    const revision=Number(await canvas.getAttribute('data-country-label-revision'));
    await page.getByTestId('toggle-province-panel').tap();
    await expect(page.getByTestId('toggle-province-panel')).toHaveAttribute('aria-expanded',String(open));
    await expect.poll(async()=>Number(await canvas.getAttribute('data-country-label-revision'))).toBeGreaterThan(revision);
    await expect(canvas).toHaveAttribute('data-distance',camera!);await expect(page.getByTestId('game-clock')).toHaveAttribute('data-tick',tick!);
    if(open){
     // The Brazilian country remains in the unobstructed left half. Waiting
     // for it also proves we captured the completed layout, not hidden stale labels.
     await expect(page.locator('.country-label[data-owner="3"]:visible')).toHaveCount(1);
     const panel=await page.locator('#province-panel').boundingBox();expect(panel).not.toBeNull();
     for(const label of await check()){const r=label.box;expect(r.right<=panel!.x||r.left>=panel!.x+panel!.width||r.bottom<=panel!.y||r.top>=panel!.y+panel!.height).toBe(true);}
     await page.screenshot({path:'artifacts/country-names-mobile-panel.png'});
    }else await expect.poll(()=>page.locator('.country-label:visible').count()).toBeGreaterThan(0);
   }
  }
  await page.screenshot({path:`artifacts/country-names-${mobile?'mobile':'desktop'}-world.png`});
  // Find each of two actual human countries. Their labels must use their own
  // names rather than the local actor's name or a source country label.
  for(const owner of [0,1,2]){
   if(mobile&&await page.getByTestId('toggle-province-panel').getAttribute('aria-expanded')==='true')await page.getByTestId('toggle-province-panel').click();
   await page.getByTestId('map-search').fill(fixture.origins[owner]);await page.locator('.map-search-results button').first().click();
   await canvas.focus();await page.keyboard.press('End');await expect(canvas).toHaveAttribute('data-settled','true',{timeout:20000});
   // Focus fits each geographic region (16–240), rather than choosing a
   // universal tactical zoom. Explicitly zoom large regions into close view.
   const focusedDistance=Number(await canvas.getAttribute('data-distance'));
   const closeSteps=Math.max(0,Math.ceil(Math.log(focusedDistance/100)/Math.log(1.15)));
   for(let n=0;n<closeSteps;n++)await page.keyboard.press('+');
   await expect(canvas).toHaveAttribute('data-settled','true',{timeout:20000});
   await expect.poll(async()=>Number(await canvas.getAttribute('data-distance'))).toBeLessThan(180);
   await expect(page.locator('.country-label:visible')).toHaveCount(0);
   // Zoom out enough for a strategic country title, leaving province text intact.
   const closeDistance=Number(await canvas.getAttribute('data-distance'));
   const strategicSteps=Math.ceil(Math.log(800/closeDistance)/Math.log(1.15));
   for(let n=0;n<strategicSteps;n++)await page.keyboard.press('-');
   await expect(canvas).toHaveAttribute('data-settled','true',{timeout:20000});
   await expect(page.locator(`.country-label[data-owner="${owner}"]:visible`)).toHaveCount(1,{timeout:15000});
   await check();
  }
  await page.getByTestId('open-settings').click();await page.getByRole('button',{name:'简体中文',exact:true}).click();await page.keyboard.press('Escape');
  await expect(page.locator('.country-label[data-owner="2"]:visible')).toHaveText(fixture.players[2].country.name[0]);
  await page.screenshot({path:`artifacts/country-names-${mobile?'mobile':'desktop'}-zh.png`});
  expect(errors).toEqual([]);
 });
});
