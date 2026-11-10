import {test,expect,type Page} from '@playwright/test';
import {project} from '../../src/game/geo.ts';

async function ready(page:Page){
 await page.goto('/');await page.getByTestId('single-player').click();await page.getByTestId('begin-campaign').click();
 await expect(page.locator('.app')).toHaveAttribute('data-local-ready','true',{timeout:60000});
 const canvas=page.locator('canvas');await expect(canvas).toHaveAttribute('data-input-context','game');
 await canvas.focus();await page.keyboard.press('Space');await home(page);
}
async function home(page:Page){
 await page.locator('canvas').focus();await page.keyboard.press('Home');
 await expect(page.locator('canvas')).toHaveAttribute('data-settled','true',{timeout:20000});
}
// Test real hit testing at known ocean/land coordinates, not a synthetic deselect callback.
async function point(page:Page,lon:number,lat:number){
 const world=project(lon,lat);
 return page.locator('canvas').evaluate((canvas,world)=>{
  const rect=canvas.getBoundingClientRect(),d=canvas.dataset;
  const scale=rect.height/(2*(Number(d.distance)-.16)*Math.tan(20*Math.PI/180));
  const x=rect.x+rect.width/2+(world.x-Number(d.focusX))*scale;
  const y=rect.y+rect.height/2+(world.z-Number(d.focusZ))*scale;
  if(document.elementFromPoint(x,y)!==canvas)throw Error(`Test point is covered: ${x}, ${y}`);
  return {x,y};
 },world);
}
async function emptySelection(page:Page){
 await expect(page.locator('canvas')).toHaveAttribute('data-selected-region','-1');
 await expect(page.locator('canvas')).toHaveAttribute('data-selection-glow-vertices','0');
 await expect(page.locator('canvas')).toHaveAttribute('data-selection-glow-pending','false');
 await expect(page.locator('#province-panel')).toHaveCount(0);
 await expect(page.locator('.hud-top')).toBeVisible();
 await expect(page.getByTestId('open-settings')).toBeVisible();
 await expect(page.getByTestId('open-upgrades')).toBeVisible();
}

test('ocean clicks clear selection and only the province panel; land and search can select again',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));await ready(page);
 const canvas=page.locator('canvas'),ocean=await point(page,-30,0),land=await point(page,10,25);
 const selected=await canvas.getAttribute('data-selected-region');
 // HUD interactions and order gestures are not deselection.
 await page.getByTestId('open-settings').click();await page.keyboard.press('Escape');
 await page.mouse.click(ocean.x,ocean.y,{button:'right'});
 await page.keyboard.down('Shift');await page.mouse.click(ocean.x,ocean.y);await page.keyboard.up('Shift');
 await page.mouse.click(ocean.x,ocean.y,{button:'middle'});
 await expect(canvas).toHaveAttribute('data-selected-region',selected!);
 // A drag remains a drag even when it returns to its starting point.
 await page.mouse.move(ocean.x,ocean.y);await page.mouse.down();
 await page.mouse.move(ocean.x+60,ocean.y,{steps:3});await page.mouse.move(ocean.x,ocean.y,{steps:3});await page.mouse.up();
 await expect(canvas).toHaveAttribute('data-selected-region',selected!);await home(page);
 await page.getByTestId('open-settings').click();
 await canvas.dispatchEvent('pointerdown',{pointerId:20,pointerType:'mouse',button:0,clientX:ocean.x,clientY:ocean.y});
 await canvas.dispatchEvent('pointerup',{pointerId:20,pointerType:'mouse',button:0,clientX:ocean.x,clientY:ocean.y});
 await expect(canvas).toHaveAttribute('data-selected-region',selected!);await page.keyboard.press('Escape');
 for(let i=0;i<2;i++){
  await page.mouse.click(ocean.x,ocean.y);await emptySelection(page);
  // Repeating an empty click and an order without a source are safe no-ops.
  await page.mouse.click(ocean.x,ocean.y);await page.mouse.click(land.x,land.y,{button:'right'});
  await emptySelection(page);await expect(page.locator('.toast')).toHaveCount(0);
  await page.mouse.click(land.x,land.y);await expect(canvas).not.toHaveAttribute('data-selected-region','-1');
  await expect(page.locator('#province-panel')).toBeVisible();
 }
 await page.mouse.click(ocean.x,ocean.y);await emptySelection(page);
 await page.getByTestId('map-search').fill('江苏');await page.locator('.map-search-results button').first().click();
 await expect(page.locator('#province-panel h2')).toContainText('江苏');
 await expect(canvas).not.toHaveAttribute('data-selected-region','-1');
 expect(errors).toEqual([]);
});

test.describe('touch and pen deselection',()=>{
 test.use({hasTouch:true,isMobile:true,viewport:{width:844,height:390}});
 test('a tap closes an open mobile province panel; cancelled drags and pinches preserve selection',async({page,context})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));await ready(page);
  const canvas=page.locator('canvas'),ocean=await point(page,-30,0),selected=await canvas.getAttribute('data-selected-region');
  const cdp=await context.newCDPSession(page);
  const touch=(type:'touchStart'|'touchMove'|'touchEnd'|'touchCancel',points:{x:number;y:number;id:number}[])=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points});
  await touch('touchStart',[{...ocean,id:1}]);await touch('touchMove',[{x:ocean.x+35,y:ocean.y,id:1}]);await touch('touchMove',[{...ocean,id:1}]);await touch('touchEnd',[]);
  await expect(canvas).toHaveAttribute('data-selected-region',selected!);await home(page);
  await touch('touchStart',[{x:ocean.x-20,y:ocean.y,id:1},{x:ocean.x+20,y:ocean.y,id:2}]);
  await touch('touchMove',[{x:ocean.x-45,y:ocean.y,id:1},{x:ocean.x+45,y:ocean.y,id:2}]);await touch('touchEnd',[]);
  await expect(canvas).toHaveAttribute('data-selected-region',selected!);await home(page);
  await touch('touchStart',[{...ocean,id:1}]);await touch('touchCancel',[]);
  await canvas.dispatchEvent('pointerup',{pointerId:1,pointerType:'touch',clientX:ocean.x,clientY:ocean.y});
  await expect(canvas).toHaveAttribute('data-selected-region',selected!);
  await page.getByTestId('toggle-province-panel').tap();await expect(page.locator('#province-panel')).toBeVisible();
  await page.touchscreen.tap(ocean.x,ocean.y);await emptySelection(page);
  await expect(page.getByTestId('toggle-province-panel')).toHaveAttribute('aria-expanded','false');
  await expect(page.getByTestId('toggle-province-panel')).toBeDisabled();
  const land=await point(page,10,25);await page.touchscreen.tap(land.x,land.y);
  await expect(page.getByTestId('toggle-province-panel')).toBeEnabled();
  await page.getByTestId('toggle-province-panel').tap();await expect(page.locator('#province-panel')).toBeVisible();
  await canvas.dispatchEvent('pointerdown',{pointerId:50,pointerType:'pen',clientX:ocean.x,clientY:ocean.y});
  await canvas.dispatchEvent('pointerup',{pointerId:50,pointerType:'pen',clientX:ocean.x,clientY:ocean.y});await emptySelection(page);
  await page.screenshot({path:'artifacts/ocean-deselected-mobile.png'});
  expect(errors).toEqual([]);await cdp.detach();
 });
});
