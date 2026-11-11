import {test,expect} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {WORLD_WIDTH} from '../../src/game/geo.ts';
for(const mobile of [false,true])test.describe(mobile?'mobile country names':'desktop country names',()=>{
 test.use({hasTouch:mobile,isMobile:mobile,viewport:mobile?{width:844,height:390}:{width:1440,height:960}});
 test('map names keep world anchors through pans, partial clipping, HUD and zoom',async({page})=>{
  test.setTimeout(180000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  const fixture=JSON.parse(execFileSync(process.execPath,['--experimental-strip-types','tests/create-country-name-fixture.mjs'],{encoding:'utf8',maxBuffer:16*1024*1024}));
  await page.addInitScript(({key,value})=>{localStorage.setItem(key,value);localStorage.setItem('rouge.language','en');},fixture);
  await page.goto('/');await page.getByTestId('open-saves').click();await page.locator('.save-card').filter({hasText:'Country names fixture'}).getByRole('button',{name:'Load',exact:true}).click();
  await expect(page.locator('.app')).toHaveAttribute('data-local-ready','true',{timeout:60000});
  const canvas=page.locator('canvas');await canvas.focus();await page.keyboard.press('Space');await expect(page.getByTestId('toggle-pause')).toHaveText('▶');
  await canvas.focus();await page.keyboard.press('Home');await expect(canvas).toHaveAttribute('data-settled','true',{timeout:20000});
  await expect.poll(()=>page.locator('.country-label:visible').count()).toBeGreaterThan(0);
  await expect(page.locator('.province-label:visible')).toHaveCount(0);
  const anchorRevision=await canvas.getAttribute('data-country-anchor-revision');
  const check=async()=>{
   const labels=await page.locator('.country-label:visible').evaluateAll(nodes=>nodes.map(node=>({text:node.textContent,copy:(node as HTMLElement).dataset.copy,owner:Number((node as HTMLElement).dataset.owner),anchorX:Number((node as HTMLElement).dataset.anchorX),anchorZ:Number((node as HTMLElement).dataset.anchorZ),anchorKind:(node as HTMLElement).dataset.anchorKind,box:node.getBoundingClientRect().toJSON(),pointer:getComputedStyle(node).pointerEvents})));
   expect(new Set(labels.map(l=>`${l.owner}:${l.copy}`)).size).toBe(labels.length);
   for(const l of labels){expect(l.owner).toBeGreaterThanOrEqual(0);expect(l.anchorKind).toBe('territory-centroid');expect(l.anchorX).toBeCloseTo(fixture.labelAnchors[l.owner].x,8);expect(l.anchorZ).toBeCloseTo(fixture.labelAnchors[l.owner].z,8);expect(l.pointer).toBe('none');if(l.owner<2)expect(l.text).toBe(fixture.players[l.owner].name);}
   await expect(canvas).toHaveAttribute('data-country-anchor-revision',anchorRevision!);
   return labels;
  };
  await check();
  if(mobile){
   const camera=await canvas.getAttribute('data-distance'),tick=await page.getByTestId('game-clock').getAttribute('data-tick'),labels=await check();
   for(const open of [true,false]){
    await page.getByTestId('toggle-province-panel').tap();
    await expect(page.getByTestId('toggle-province-panel')).toHaveAttribute('aria-expanded',String(open));
    await expect(canvas).toHaveAttribute('data-distance',camera!);await expect(page.getByTestId('game-clock')).toHaveAttribute('data-tick',tick!);
    expect(await check()).toEqual(labels); // Panels neither move nor hide map names.
    if(open)await page.screenshot({path:'artifacts/country-names-mobile-panel.png'});
   }
  }
  await page.screenshot({path:`artifacts/country-names-${mobile?'mobile':'desktop'}-world.png`});
  for(const owner of [0,1,2]){
   await page.getByTestId('map-search').fill(fixture.labelFocusRegions[owner]);await page.locator('.map-search-results button').first().click();
   await canvas.focus();await page.keyboard.press('End');await expect(canvas).toHaveAttribute('data-settled','true',{timeout:20000});
   if(mobile&&await page.getByTestId('toggle-province-panel').getAttribute('aria-expanded')==='true')await page.getByTestId('toggle-province-panel').tap();
   const size=page.viewportSize()!,target=fixture.labelAnchors[owner],distance=Number(await canvas.getAttribute('data-distance')),focusX=Number(await canvas.getAttribute('data-focus-x')),focusZ=Number(await canvas.getAttribute('data-focus-z')),perPixel=2*distance*Math.tan(Math.PI/9)/size.height;
   const dx=((target.x-focusX+WORLD_WIDTH/2)%WORLD_WIDTH+WORLD_WIDTH)%WORLD_WIDTH-WORLD_WIDTH/2;
   await page.mouse.move(size.width/2,size.height*.6);await page.mouse.down();await page.mouse.move(size.width/2-dx/perPixel,size.height*.6-(target.z-focusZ)/perPixel,{steps:8});await page.mouse.up();
   await expect(canvas).toHaveAttribute('data-settled','true',{timeout:20000});
   const focusedDistance=Number(await canvas.getAttribute('data-distance'));
   for(let n=0;n<Math.max(0,Math.ceil(Math.log(focusedDistance/100)/Math.log(1.15)));n++)await page.keyboard.press('+');
   await expect(canvas).toHaveAttribute('data-settled','true',{timeout:20000});
   await expect(canvas).toHaveAttribute('data-view','near');
   await expect(page.locator(`.country-label[data-owner="${owner}"][data-primary="true"]:visible`)).toHaveCount(1);
   const anchor=await page.locator(`.country-label[data-owner="${owner}"][data-primary="true"]`).getAttribute('data-anchor-x');
   await expect.poll(()=>page.locator('.province-label:visible').count()).toBeGreaterThan(0);
   const closeDistance=Number(await canvas.getAttribute('data-distance'));
   for(let n=0;n<Math.ceil(Math.log(800/closeDistance)/Math.log(1.15));n++)await page.keyboard.press('-');
   await expect(canvas).toHaveAttribute('data-settled','true',{timeout:20000});
   await expect(page.locator(`.country-label[data-owner="${owner}"][data-primary="true"]:visible`)).toHaveCount(1);
   await expect(page.locator(`.country-label[data-owner="${owner}"][data-primary="true"]`)).toHaveAttribute('data-anchor-x',anchor!);
   await expect(page.locator('.province-label:visible')).toHaveCount(0);await check();
  }
  // Test clipping inside the original province-name range while still using
  // the flat camera (320–500), so both kinds share the same projection math.
  const strategicDistance=Number(await canvas.getAttribute('data-distance'));
  await canvas.focus();for(let n=0;n<Math.ceil(Math.log(strategicDistance/430)/Math.log(1.15));n++)await page.keyboard.press('+');
  await expect(canvas).toHaveAttribute('data-settled','true',{timeout:20000});
  const panDistance=Number(await canvas.getAttribute('data-distance'));expect(panDistance).toBeGreaterThanOrEqual(320);expect(panDistance).toBeLessThan(500);
  const country=page.locator('.country-label[data-owner="2"][data-primary="true"]'),anchor=await country.getAttribute('data-anchor-x');
  await expect.poll(()=>page.locator('.province-label:visible').count()).toBeGreaterThan(0);
  let steps=0,partial=false,fullyOutside=false;
  for(;steps<30;){
   const before=await canvas.getAttribute('data-focus-x');await canvas.focus();await page.keyboard.press('ArrowRight');steps++;
   await expect.poll(()=>canvas.getAttribute('data-focus-x')).not.toBe(before);
   const sample=await country.evaluate((node,worldWidth)=>{
    const canvas=document.querySelector('canvas')!,r=canvas.getBoundingClientRect(),d=canvas.dataset,a=(node as HTMLElement).dataset;
    const raw=Number(a.anchorX)-Number(d.focusX),dx=((raw+worldWidth/2)%worldWidth+worldWidth)%worldWidth-worldWidth/2;
    const x=r.width/2+dx*r.height/(2*(Number(d.distance)-.8)*Math.tan(Math.PI/9));
    const label=node as HTMLElement,half=parseFloat(label.style.width)/2+2;
    const province=document.querySelector('.province-label[data-primary="true"]:not([hidden])') as HTMLElement|null;
    const provinceX=province?Number(province.dataset.anchorX):0,px=r.width/2+(((provinceX-Number(d.focusX)+worldWidth/2)%worldWidth+worldWidth)%worldWidth-worldWidth/2)*r.height/(2*(Number(d.distance)-.8)*Math.tan(Math.PI/9));
    const provinceHalf=province?parseFloat(province.style.width)/2+2:0;
    return {x,width:r.width,visible:!label.hidden,expected:x+half>=0&&x-half<=r.width,anchor:a.anchorX,error:label.hidden?0:Math.abs((label.getBoundingClientRect().left+label.getBoundingClientRect().right)/2-r.left-x),provinceVisible:!!province&&!province.hidden,provinceExpected:!!province&&px+provinceHalf>=0&&px-provinceHalf<=r.width};
   },WORLD_WIDTH);
   expect(sample.anchor).toBe(anchor);expect(sample.visible).toBe(sample.expected);expect(sample.error).toBeLessThan(1);
   expect(sample.provinceVisible).toBe(sample.provinceExpected);
   if(sample.x<0&&sample.visible){partial=true;await page.screenshot({path:`artifacts/country-names-${mobile?'mobile':'desktop'}-partial.png`});}
   if(!sample.visible){fullyOutside=true;break;}
  }
  expect(partial).toBe(true);expect(fullyOutside).toBe(true);
  for(let n=0;n<steps;n++){
   const before=await canvas.getAttribute('data-focus-x');await page.keyboard.press('ArrowLeft');await expect.poll(()=>canvas.getAttribute('data-focus-x')).not.toBe(before);
  }
  await expect(country).toBeVisible();await expect(country).toHaveAttribute('data-anchor-x',anchor!);
  await page.getByTestId('open-settings').click();await page.getByRole('button',{name:'简体中文',exact:true}).click();await page.keyboard.press('Escape');
  await expect(country).toHaveText(fixture.players[2].country.name[0]);
  await page.screenshot({path:`artifacts/country-names-${mobile?'mobile':'desktop'}-zh.png`});
  if(mobile){
   // At a wide world view both ends of a date-line title can be visible.
   // Crossing nearestWorldX's copy boundary must retain both screen positions.
   await canvas.focus();await page.keyboard.press('Home');await expect(canvas).toHaveAttribute('data-settled','true',{timeout:20000});
   const distance=Number(await canvas.getAttribute('data-distance')),focus=Number(await canvas.getAttribute('data-focus-x'));
   const anchorX=Number(await country.getAttribute('data-anchor-x')),perPixel=2*distance*Math.tan(Math.PI/9)/390,target=anchorX-WORLD_WIDTH/2+15;
   await page.mouse.move(422,240);await page.mouse.down();await page.mouse.move(422-(target-focus)/perPixel,240,{steps:12});await page.mouse.up();
   await expect.poll(async()=>Math.abs(Number(await canvas.getAttribute('data-focus-x'))-target)).toBeLessThan(2);
   const copies=page.locator('.country-label[data-owner="2"]:visible');await expect(copies).toHaveCount(2);
   const positions=()=>copies.evaluateAll(nodes=>nodes.map(node=>({copy:(node as HTMLElement).dataset.copy,x:(node.getBoundingClientRect().left+node.getBoundingClientRect().right)/2})).sort((a,b)=>a.x-b.x));
   const before=await positions(),start=Number(await canvas.getAttribute('data-focus-x'));
   await page.mouse.move(422,240);await page.mouse.down();await page.mouse.move(422+30/perPixel,240,{steps:4});await page.mouse.up();
   await expect.poll(async()=>Math.abs(Number(await canvas.getAttribute('data-focus-x'))-(start-30))).toBeLessThan(2);
   await expect(copies).toHaveCount(2);const after=await positions(),shift=30*390/(2*(distance-.8)*Math.tan(Math.PI/9));
   for(let n=0;n<2;n++){expect(after[n].copy).toBe(before[n].copy);expect(Math.abs(after[n].x-before[n].x-shift)).toBeLessThan(1);}
   await page.screenshot({path:'artifacts/country-names-mobile-seam.png'});
  }
  await expect(canvas).toHaveAttribute('data-country-anchor-revision',anchorRevision!);
  expect(errors).toEqual([]);
 });
});
