import {expect,type Page} from '@playwright/test';
import {execFileSync} from 'node:child_process';
export const mapOrderFixture=JSON.parse(execFileSync(process.execPath,['--experimental-strip-types','tests/create-map-order-fixture.mjs'],{encoding:'utf8',maxBuffer:16*1024*1024}));
export async function loadMapOrderFixture(page:Page){
 await page.addInitScript(({key,value})=>localStorage.setItem(key,value),mapOrderFixture);
 await page.goto('/');await page.getByTestId('open-saves').click();
 await page.locator('.save-card').filter({hasText:'Map order fixture'}).getByRole('button',{name:'载入',exact:true}).click();
 await expect(page.locator('.app')).toHaveAttribute('data-local-ready','true',{timeout:60000});
 await page.getByTestId('toggle-pause').click();await expect(page.getByTestId('toggle-pause')).toHaveText('▶');
 await worldView(page);
}
export async function worldView(page:Page){
 await page.locator('.world canvas').focus();await page.keyboard.press('Home');
 await expect(page.locator('.world canvas')).toHaveAttribute('data-settled','true',{timeout:20000});
}
export async function targetPoint(page:Page){
 return page.locator('.world canvas').evaluate((canvas,world)=>{
  const rect=canvas.getBoundingClientRect(),d=canvas.dataset;
  const scale=rect.height/(2*(Number(d.distance)-.16)*Math.tan(20*Math.PI/180));
  const x=rect.x+rect.width/2+(world.x-Number(d.focusX))*scale,y=rect.y+rect.height/2+(world.z-Number(d.focusZ))*scale;
  if(document.elementFromPoint(x,y)!==canvas)throw Error(`Order target is covered: ${x}, ${y}`);
  return {x,y};
 },mapOrderFixture.centers.target);
}
export async function saveOrders(page:Page){
 await page.getByTestId('open-settings').click();await page.getByTestId('settings-save').click();
 await page.getByPlaceholder('存档名称').fill('Map order result');await page.getByTestId('create-save').click();
 return page.evaluate(()=>{
  const saves=Object.keys(localStorage).filter(k=>k.startsWith('rouge.save.natural-earth-admin1.regions.v6.')&&!k.endsWith('.backup')).map(k=>JSON.parse(localStorage.getItem(k)!));
  const save=saves.find(s=>s.name==='Map order result');
  if(!save)throw Error('Map order result save missing');
  return JSON.parse(save.body).units.filter((u:any)=>u.owner===0&&u.destination!==null);
 });
}
