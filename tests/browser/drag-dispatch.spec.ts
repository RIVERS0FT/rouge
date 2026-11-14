import {expect,test,type Locator,type Page} from '@playwright/test';
import {loadMapOrderFixture,mapOrderFixture,saveOrders} from './map-orders.ts';

const counts=(page:Page)=>page.locator(`.province-label[data-region="${mapOrderFixture.source}"]:visible .province-plaque-count[data-dispatch-source=true]`);
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
 return canvas.evaluate((element,world)=>{
  const rect=element.getBoundingClientRect(),data=(element as HTMLElement).dataset;
  const distance=Number(data.distance),t=Math.max(0,Math.min(1,(distance-90)/230)),blend=1-t*t*(3-2*t),angle=.6*blend;
  const relief=.16+.32*(1+Math.sin(world.x*.18)*Math.cos(world.z*.22));
  const h=.16+(relief-.16)*blend,dx=world.x-Number(data.focusX),dz=world.z-Number(data.focusZ);
  const depth=distance-(h*Math.cos(angle)+dz*Math.sin(angle));
  const scale=rect.height/(2*depth*Math.tan(20*Math.PI/180));
  const x=Math.round(rect.x+rect.width/2+dx*scale),y=Math.round(rect.y+rect.height/2+(dz*Math.cos(angle)-h*Math.sin(angle))*scale);
  const hit=document.elementFromPoint(x,y);
  if(hit!==element)throw Error(`Drag target is not on exposed map at ${x}, ${y}: ${hit?.className}`);
  return {x,y};
 },mapOrderFixture.centers.target);
}

test('dragging the owned garrison shows a single clipped arrow and dispatches only on release',async({page})=>{
 test.setTimeout(120000);
 await loadMapOrderFixture(page,process.env.ROUGE_DRAG_LIVE_URL);
 const target=await frameOrder(page,'2d');
 const source=counts(page),start=await middle(source);
 const arrow=page.getByTestId('dispatch-preview');
 await expect(source).toHaveText('12');
 await page.mouse.move(start.x,start.y);await page.mouse.down();
 await page.mouse.move(target.x,target.y,{steps:5});
 await expect(arrow).toBeVisible();
 await expect(arrow).toHaveAttribute('data-target',String(mapOrderFixture.target));
 const ribbon=await arrow.locator('path[data-dispatch-ribbon]').getAttribute('d');
 expect(ribbon).toBeTruthy();
 await expect(arrow.locator('clipPath[data-dispatch-clip] path')).toHaveAttribute('d',ribbon!);
 await expect(arrow.locator('g[data-dispatch-chevrons]')).toHaveAttribute('clip-path',/^url\(#.+\)$/);
 await expect(source).toHaveText('12');
 await page.mouse.up();
 await expect(arrow).toBeHidden();
 await expect(source).toHaveText('11');
 const orders=await saveOrders(page);
 expect(orders.map((unit:{destination:number})=>unit.destination)).toEqual([mapOrderFixture.target]);
});

test.describe('touch garrison dispatch',()=>{
 test.use({hasTouch:true,isMobile:true,viewport:{width:1280,height:700}});
 test('cancelled touch drag leaves the garrison in place; completed touch drag dispatches',async({page,context})=>{
  test.setTimeout(120000);
  await loadMapOrderFixture(page,process.env.ROUGE_DRAG_LIVE_URL);
  const target=await frameOrder(page,'3d');
  const source=counts(page),start=await middle(source);
  const arrow=page.getByTestId('dispatch-preview');
  const cdp=await context.newCDPSession(page);
  const touch=(type:'touchStart'|'touchMove'|'touchEnd'|'touchCancel',points:{x:number;y:number;id:number}[]=[])=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points});
  for(const cancelled of [true,false]){
   await touch('touchStart',[{...start,id:1}]);
   await touch('touchMove',[{...target,id:1}]);
   await expect(arrow).toBeVisible();
   await expect(arrow).toHaveAttribute('data-target',String(mapOrderFixture.target));
   await expect(source).toHaveText('12');
   await touch(cancelled?'touchCancel':'touchEnd');
   await expect(arrow).toBeHidden();
   await expect(source).toHaveText(cancelled?'12':'11');
  }
  await cdp.detach();
  const orders=await saveOrders(page);
  expect(orders.map((unit:{destination:number})=>unit.destination)).toEqual([mapOrderFixture.target]);
 });
});
