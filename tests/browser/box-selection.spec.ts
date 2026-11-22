import {test,expect} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {saveOrders,worldView} from './map-orders.ts';

test('left drag selects friendly forces, middle drag pans, and right click orders the group',async({page})=>{
 test.setTimeout(180000);
 const fixture=JSON.parse(execFileSync(process.execPath,['--experimental-strip-types','tests/create-garrison-fixture.mjs'],{encoding:'utf8',maxBuffer:16*1024*1024}));
 await page.addInitScript(({key,value})=>{
  localStorage.setItem(key,value);localStorage.setItem('rouge.dispatch-fraction','0.5');
 },fixture);
 await page.goto('/');await page.getByTestId('open-saves').click();
 await page.locator('.save-card').filter({hasText:'Garrison regression fixture'}).getByRole('button',{name:'载入',exact:true}).click();
 const canvas=page.locator('.world canvas');
 await expect(page.locator('.app')).toHaveAttribute('data-local-ready','true',{timeout:60000});
 await page.getByTestId('toggle-pause').click();await worldView(page);
 const points=await canvas.evaluate(async el=>{
  const {MAP,LAND_Y,provinceByCode}=await import('/src/game/map.ts'),d=(el as HTMLElement).dataset,rect=el.getBoundingClientRect();
  const scale=rect.height/(2*(Number(d.distance)-LAND_Y)*Math.tan(Math.PI/9));
  return ['DEU-3487','DEU-1574'].map(code=>{
   const p=MAP[provinceByCode(code)].center;
   return {x:rect.left+rect.width/2+(p.x-Number(d.focusX))*scale,y:rect.top+rect.height/2+(p.z-Number(d.focusZ))*scale};
  });
 });
 const left=Math.min(...points.map(p=>p.x))-40,right=Math.max(...points.map(p=>p.x))+40;
 const top=Math.min(...points.map(p=>p.y))-42,bottom=Math.max(...points.map(p=>p.y))+25;
 const focus=await canvas.getAttribute('data-focus-x'),box=page.locator('.map-selection-box');
 await page.mouse.move(right,bottom);await page.mouse.down();await page.mouse.move(left,top,{steps:5});
 await expect(box).toBeVisible();await expect(canvas).toHaveAttribute('data-focus-x',focus!);
 await page.mouse.up();await expect(box).toBeHidden();
 await expect(page.locator('.army-plaque[data-selected="true"]')).toHaveCount(1);
 await expect(page.locator('.province-label[data-selected="true"]:visible').first()).toBeVisible();
 await page.mouse.move(left,top);await page.mouse.down({button:'middle'});
 await page.mouse.move(left+35,top+12,{steps:4});await page.mouse.up({button:'middle'});
 await expect(canvas).not.toHaveAttribute('data-focus-x',focus!);
 await expect(page.locator('.army-plaque[data-selected="true"]')).toHaveCount(1);
 await worldView(page);
 const target=await canvas.evaluate(async el=>{
  const {MAP,LAND_Y}=await import('/src/game/map.ts'),d=(el as HTMLElement).dataset,rect=el.getBoundingClientRect();
  const scale=rect.height/(2*(Number(d.distance)-LAND_Y)*Math.tan(Math.PI/9));
  for(const p of MAP.filter(p=>p.playable&&p.code.startsWith('ESP-')&&p.center.x>-90&&p.center.x<0)){
   const x=rect.left+rect.width/2+(p.center.x-Number(d.focusX))*scale,y=rect.top+rect.height/2+(p.center.z-Number(d.focusZ))*scale;
   if(document.elementFromPoint(x,y)===el)return {x,y,id:p.id};
  }
  throw Error('No exposed Spanish destination on the map');
 });
 await page.mouse.click(target.x,target.y,{button:'right'});
 const orders=await saveOrders(page);
 expect(orders.map((army:{size:number})=>army.size).sort((a:number,b:number)=>a-b)).toEqual([3,6,6]);
 expect(orders.every((army:{to:number})=>army.to===target.id)).toBe(true);
});
