import {expect,test,type Locator,type Page} from '@playwright/test';
import {loadMapOrderFixture,mapOrderFixture,saveOrders} from './map-orders.ts';
import {savedCampaigns} from './save-records.ts';

const plaque=(page:Page)=>page.locator(`.province-label[data-region="${mapOrderFixture.source}"][data-dispatch-source=true]:visible`);
const counts=(page:Page)=>plaque(page).locator('.province-plaque-count');
const middle=async(locator:Locator)=>{
 await expect(locator).toBeVisible({timeout:20000});
 const bounds=(await locator.boundingBox())!;
 return {x:Math.round(bounds.x+bounds.width/2),y:Math.round(bounds.y+bounds.height/2)};
};

async function frameOrder(page:Page,mode:'2d'|'3d'){
 const canvas=page.locator('.world canvas');await canvas.focus();await page.keyboard.press('End');
 await expect(canvas).toHaveAttribute('data-settled','true',{timeout:20000});
 if(mode==='2d'){
  const distance=Number(await canvas.getAttribute('data-distance'));
  const steps=Math.max(0,Math.ceil(Math.log(325/distance)/Math.log(1.15)));
  for(let n=0;n<steps;n++)await page.keyboard.press('-');
 }else{
  await page.keyboard.press('-');await page.keyboard.press('-');
 }
 await expect(canvas).toHaveAttribute('data-settled','true',{timeout:20000});
 await expect(canvas).toHaveAttribute('data-unit-render-mode',mode);
 // The selected region's dock can cover the destination on the touch viewport.
 if(await page.locator('#province-panel').isVisible())await page.locator('#province-panel .dock-close').click();
 return canvas.evaluate((element,world)=>{
  const rect=element.getBoundingClientRect(),data=(element as HTMLElement).dataset;
  const distance=Number(data.distance),t=Math.max(0,Math.min(1,(distance-90)/230)),blend=1-t*t*(3-2*t),angle=.6*blend;
  const h=.16,dx=world.x-Number(data.focusX),dz=world.z-Number(data.focusZ);
  const depth=distance-(h*Math.cos(angle)+dz*Math.sin(angle));
  const scale=rect.height/(2*depth*Math.tan(20*Math.PI/180));
  const x=Math.round(rect.x+rect.width/2+dx*scale),y=Math.round(rect.y+rect.height/2+(dz*Math.cos(angle)-h*Math.sin(angle))*scale);
  const hit=document.elementFromPoint(x,y);
  if(hit!==element&&!hit?.closest('.province-label'))throw Error(`Drag target is not on the map at ${x}, ${y}: ${hit?.className}`);
  return {x,y};
 },mapOrderFixture.centers.target);
}

test('dragging the plaque flag shows a single clipped arrow and dispatches only on release',async({page})=>{
 test.setTimeout(120000);
 await loadMapOrderFixture(page,process.env.ROUGE_DRAG_LIVE_URL);
 const target=await frameOrder(page,'2d');
 const source=counts(page),start=await middle(plaque(page).locator('.province-plaque-flag'));
 const arrow=page.getByTestId('dispatch-preview'),tier=page.getByTestId('dispatch-tier');
 await expect(source).toHaveText('12');await expect(tier).toBeHidden();
 const drag=async()=>{
  await page.mouse.move(start.x,start.y);await page.mouse.down();
  await page.mouse.move(target.x,target.y,{steps:5});
  await expect(arrow).toHaveAttribute('data-phase','dragging');await expect(arrow).toHaveAttribute('data-target',String(mapOrderFixture.target));
  await expect(page.locator('.world canvas')).toHaveAttribute('data-route-overlay-visible','true');
 };
 await drag();await expect(tier).toHaveAttribute('data-count','12');
 for(const [fraction,count] of [['0.25','3'],['0.5','6'],['0.75','9'],['1','12']]){
  await page.keyboard.press('Tab');await expect(tier).toHaveAttribute('data-fraction',fraction);await expect(tier).toHaveAttribute('data-count',count);
 }
 await page.keyboard.down('Tab');await page.keyboard.down('Tab');await page.keyboard.up('Tab');
 await expect(tier).toHaveAttribute('data-fraction','0.25');
 await page.keyboard.press('Escape');await page.mouse.up();await expect(tier).toBeHidden();await expect(source).toHaveText('12');
 await expect(page.locator('.world canvas')).toHaveAttribute('data-route-overlay-visible','false');
 await drag();await expect(tier).toHaveAttribute('data-fraction','1');
 for(let i=0;i<3;i++)await page.keyboard.press('Tab');
 await expect(tier).toContainText('出兵 9 · 75%');
 const ribbon=await arrow.locator('path[data-dispatch-ribbon]').getAttribute('d');
 expect(ribbon).toBeTruthy();
 const outline=await arrow.locator('path[data-dispatch-target]').getAttribute('d');
 expect(outline).toMatch(/^M/);expect(outline).not.toContain('Z');
 await expect(arrow.locator('path[data-dispatch-glow]')).toHaveAttribute('d',outline!);
 await expect(arrow.locator('clipPath[data-dispatch-clip] path')).toHaveAttribute('d',ribbon!);
 await expect(arrow.locator('g[data-dispatch-chevrons]')).toHaveAttribute('clip-path',/^url\(#.+\)$/);
 await expect(source).toHaveText('12');
 await page.mouse.up();
 await expect(arrow).toBeHidden();await expect(tier).toBeHidden();
 await expect(source).toHaveText('3');
 await expect(page.locator('.world canvas')).toHaveAttribute('data-route-overlay-visible','false');
 const orders=await saveOrders(page);
 expect(orders.map((army:{to:number;size:number})=>[army.to,army.size])).toEqual([[mapOrderFixture.target,9]]);
 const save=(await savedCampaigns(page,mapOrderFixture.savePrefix)).find(row=>row.name==='Map order result')!;
 const queue=save.state.provinces[mapOrderFixture.source].march!;
 expect(queue.fraction).toBe(.75);expect(queue.pendingIds).toHaveLength(9);
});

test.describe('touch garrison dispatch',()=>{
 test.use({hasTouch:true,isMobile:true,viewport:{width:1280,height:700}});
 test('the whole plaque name supports touch tap, cancelled drag and completed dispatch',async({page,context})=>{
  test.setTimeout(120000);
  await loadMapOrderFixture(page,process.env.ROUGE_DRAG_LIVE_URL);
  const target=await frameOrder(page,'3d');
  const source=counts(page),start=await middle(plaque(page).locator('.province-plaque-name'));
  const arrow=page.getByTestId('dispatch-preview'),tier=page.getByTestId('dispatch-tier');
  const cdp=await context.newCDPSession(page);
  const touch=(type:'touchStart'|'touchMove'|'touchEnd'|'touchCancel',points:{x:number;y:number;id:number}[]=[])=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points});
  await touch('touchStart',[{...start,id:1}]);await touch('touchEnd');
  await expect(source).toHaveText('12');await expect(arrow).toBeHidden();
  await expect(page.locator('.world canvas')).toHaveAttribute('data-selected-region',String(mapOrderFixture.source));
  await page.locator('#province-panel .dock-close').click();
  for(const cancelled of [true,false]){
   await touch('touchStart',[{...start,id:1}]);
   await touch('touchMove',[{...target,id:1}]);
   await expect(arrow).toHaveAttribute('data-phase','dragging');
   await expect(page.locator('.world canvas')).toHaveAttribute('data-route-overlay-visible','true');
   await expect(arrow).toHaveAttribute('data-target',String(mapOrderFixture.target));
   await expect(tier).toHaveAttribute('data-fraction','1');
   await tier.dispatchEvent('pointerdown',{pointerType:'touch',pointerId:998,button:0,bubbles:true});
   await expect(tier).toHaveAttribute('data-fraction','0.25');await expect(tier).toHaveAttribute('data-count','3');
   await expect(source).toHaveText('12');
   await touch(cancelled?'touchCancel':'touchEnd');
   await expect(arrow).toBeHidden();await expect(tier).toBeHidden();
   await expect(source).toHaveText(cancelled?'12':'9');
   await expect(page.locator('.world canvas')).toHaveAttribute('data-route-overlay-visible','false');
  }
  await cdp.detach();
  const orders=await saveOrders(page);
  expect(orders.map((army:{to:number;size:number})=>[army.to,army.size])).toEqual([[mapOrderFixture.target,3]]);
 });
});
