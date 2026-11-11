import {test,expect,type Page} from '@playwright/test';
import {execFileSync} from 'node:child_process';
const fixture=JSON.parse(execFileSync(process.execPath,['--experimental-strip-types','tests/create-unit-model-fixture.mjs'],{encoding:'utf8',maxBuffer:16*1024*1024}));
async function load(page:Page){
 await page.addInitScript(({key,value})=>localStorage.setItem(key,value),fixture);
 await page.goto('/');await page.getByTestId('open-saves').click();
 await page.locator('.save-card').filter({hasText:'Unit model fixture'}).getByRole('button',{name:'载入',exact:true}).click();
 await expect(page.locator('.app')).toHaveAttribute('data-local-ready','true',{timeout:60000});
 await page.getByTestId('toggle-pause').click();await expect(page.getByTestId('toggle-pause')).toHaveText('▶');
}
function errorsOn(page:Page){
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});return errors;
}
test('2D sprites and 3D models switch repeatedly without changing units or selection',async({page})=>{
 test.setTimeout(180000);const errors=errorsOn(page);await load(page);
 const canvas=page.locator('canvas');
 await page.getByTestId('map-search').fill(fixture.regions[0].code);await page.locator('.map-search-results button').first().click();
 await expect(canvas).toHaveAttribute('data-settled','true',{timeout:20000});
 const selected=await canvas.getAttribute('data-selected-region');
 for(let pass=0;pass<2;pass++){
  await canvas.focus();await page.keyboard.press('Home');
  await expect(canvas).toHaveAttribute('data-settled','true',{timeout:20000});
  await expect(canvas).toHaveAttribute('data-unit-render-mode','2d');
  await expect(canvas).toHaveAttribute('data-rendered-models','0');
  await expect.poll(async()=>Number(await canvas.getAttribute('data-rendered-sprites'))).toBeGreaterThan(0);
  await expect(canvas).toHaveAttribute('data-total-units',String(fixture.total));
  await expect(canvas).toHaveAttribute('data-selected-region',selected!);
  if(!pass)await page.screenshot({path:'artifacts/units-strategic-2d.png'});
  await page.keyboard.press('End');for(let n=0;n<4;n++)await page.keyboard.press('+');
  await expect(canvas).toHaveAttribute('data-settled','true',{timeout:20000});
  await expect(canvas).toHaveAttribute('data-unit-render-mode','3d');
  await expect(canvas).toHaveAttribute('data-rendered-sprites','0');
  await expect(canvas).toHaveAttribute('data-rendered-models',String(fixture.count));
  await expect(canvas).toHaveAttribute('data-rendered-instances',String(fixture.count));
  await expect(canvas).toHaveAttribute('data-total-units',String(fixture.total));
  await expect(canvas).toHaveAttribute('data-selected-region',selected!);
  await expect(page.getByTestId('region-capacity')).toContainText(`${fixture.count} / ${fixture.regions[0].capacity}`);
  if(!pass)await page.screenshot({path:'artifacts/units-terrain-3d.png'});
 }
 expect(errors).toEqual([]);
});
test('phone pinch switches unit representation and resizing preserves the active batch',async({page})=>{
 test.setTimeout(180000);const errors=errorsOn(page);await page.setViewportSize({width:390,height:844});await load(page);
 const canvas=page.locator('canvas');
 await page.getByTestId('map-search').fill(fixture.regions[0].code);await page.locator('.map-search-results button').first().click();
 await expect(canvas).toHaveAttribute('data-settled','true',{timeout:20000});
 const selected=await canvas.getAttribute('data-selected-region');
 // Exercise the same pointer stream used by touch hardware. Start at a known
 // close view, pinch inward to strategic distance, then reverse the gesture.
 await canvas.focus();for(let n=0;n<4;n++)await page.keyboard.press('+');
 await expect(canvas).toHaveAttribute('data-settled','true',{timeout:20000});
 await expect(canvas).toHaveAttribute('data-unit-render-mode','3d');
 const pinch=async(start:number,end:number)=>{
  for(const [pointerId,x] of [[1,195-start/2],[2,195+start/2]])await canvas.dispatchEvent('pointerdown',{pointerType:'touch',pointerId,clientX:x,clientY:420});
  for(const [pointerId,x] of [[1,195-end/2],[2,195+end/2]])await canvas.dispatchEvent('pointermove',{pointerType:'touch',pointerId,clientX:x,clientY:420});
  for(const pointerId of [1,2])await canvas.dispatchEvent('pointerup',{pointerType:'touch',pointerId,clientX:195+(pointerId===1?-end/2:end/2),clientY:420});
  await expect(canvas).toHaveAttribute('data-settled','true',{timeout:20000});
 };
 await pinch(260,40);await expect(canvas).toHaveAttribute('data-unit-render-mode','2d');
 await expect(canvas).toHaveAttribute('data-rendered-models','0');
 await expect.poll(async()=>Number(await canvas.getAttribute('data-rendered-sprites'))).toBeGreaterThan(0);
 await page.screenshot({path:'artifacts/units-phone-2d.png'});
 await pinch(40,260);await expect(canvas).toHaveAttribute('data-unit-render-mode','3d');
 await expect(canvas).toHaveAttribute('data-rendered-sprites','0');
 await expect(canvas).toHaveAttribute('data-rendered-models',String(fixture.count));
 await page.setViewportSize({width:844,height:390});await expect(canvas).toHaveAttribute('data-viewport-width','844');
 await expect(canvas).toHaveAttribute('data-unit-render-mode','3d');
 await expect(canvas).toHaveAttribute('data-total-units',String(fixture.total));
 await expect(canvas).toHaveAttribute('data-selected-region',selected!);
 await page.screenshot({path:'artifacts/units-phone-3d.png'});expect(errors).toEqual([]);
});
test('strategic sprites grow past the original 512-unit allocation',async({page})=>{
 test.setTimeout(180000);const errors=errorsOn(page);
 const capacity=JSON.parse(execFileSync(process.execPath,['--experimental-strip-types','tests/create-capacity-fixture.mjs'],{encoding:'utf8',maxBuffer:16*1024*1024}));
 await page.addInitScript(({key,value})=>localStorage.setItem(key,value),capacity);
 await page.goto('/');await page.getByTestId('open-saves').click();
 await page.locator('.save-card').filter({hasText:'Capacity regression fixture'}).getByRole('button',{name:'载入',exact:true}).click();
 await expect(page.locator('.app')).toHaveAttribute('data-local-ready','true',{timeout:60000});await page.getByTestId('toggle-pause').click();
 const canvas=page.locator('canvas');await canvas.focus();await page.keyboard.press('Home');await expect(canvas).toHaveAttribute('data-settled','true',{timeout:20000});
 await expect(canvas).toHaveAttribute('data-unit-render-mode','2d');
 await expect.poll(async()=>Number(await canvas.getAttribute('data-total-units'))).toBeGreaterThan(512);
 await expect.poll(async()=>Number(await canvas.getAttribute('data-unit-capacity'))).toBeGreaterThanOrEqual(1024);
 await expect.poll(async()=>Number(await canvas.getAttribute('data-rendered-sprites'))).toBeGreaterThan(0);
 await expect(canvas).toHaveAttribute('data-rendered-models','0');expect(errors).toEqual([]);
});
