import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const atlas=JSON.parse(readFileSync('src/generated/world.json','utf8'));
const region=(code:string)=>atlas.provinces.findIndex((p:{code:string})=>p.code===code);

test('management regions only: no countries, UK detail, remote dispatch UI and persisted route',async({page})=>{
 test.setTimeout(180000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await expect(page.locator('canvas')).toHaveAttribute('data-ready','true',{timeout:45000});
 await expect(page.locator('canvas')).toHaveAttribute('data-region-count','675');
 await expect(page.locator('canvas')).toHaveAttribute('data-boundary-mode','management-regions-only');
 await expect(page.locator('canvas')).toHaveAttribute('data-country-borders','false');
 await page.getByTestId('single-player').click();await page.getByTestId('begin-campaign').click();await page.getByTestId('toggle-pause').click();
 await expect(page.getByTestId('country-flag')).toHaveCount(0);await expect(page.getByTestId('country-identity')).toHaveCount(0);
 await expect(page.getByTestId('faction-identity')).toContainText('阵营 1');
 await page.getByRole('button',{name:'2D',exact:true}).click();await expect(page.locator('canvas')).toHaveAttribute('data-settled','true',{timeout:20000});
 await page.screenshot({path:'artifacts/state-regions-world.png'});
 await page.getByTestId('map-search').fill('STATE_MIDLANDS');await page.locator('.map-search-results button').first().click();
 await expect(page.locator('.province-panel h2')).toContainText('中部地区');await expect(page.locator('canvas')).toHaveAttribute('data-settled','true',{timeout:20000});
 // Pull back from a single region to view the British region boundaries together.
 await page.mouse.move(740,440);await page.mouse.wheel(0,85);await expect(page.locator('canvas')).toHaveAttribute('data-settled','true',{timeout:20000});
 await page.screenshot({path:'artifacts/state-regions-britain.png'});
 await page.getByTestId('map-search').fill('STATE_BRANDENBURG');await page.locator('.map-search-results button').first().click();
 await expect(page.locator('.province-panel h2')).toContainText('勃兰登堡');
 await page.getByTestId('destination-search').fill('巴伐利亚');await page.getByTestId('destination').selectOption(String(region('STATE_BAVARIA')));
 await expect(page.getByTestId('route-preview')).toHaveAttribute('data-route',/STATE_BRANDENBURG,STATE_SAXONY,STATE_FRANCONIA,STATE_BAVARIA/);
 await expect(page.getByTestId('region-capacity')).toContainText('/ 12');
 await page.getByTestId('dispatch').click();await expect(page.getByTestId('destination-capacity')).toContainText('在途预留');
 await page.screenshot({path:'artifacts/remote-order.png'});
 await page.getByTestId('open-settings').click();await page.getByTestId('settings-save').click();
 await page.getByPlaceholder('存档名称').fill('Remote order');await page.getByTestId('create-save').click();
 await expect(page.locator('.save-card').filter({hasText:'Remote order'})).toBeVisible();
 const routes=await page.evaluate(()=>{
  const key=Object.keys(localStorage).find(k=>k.startsWith('rouge.save.state-regions.v1.')&&!k.endsWith('.backup'))!;
  const state=JSON.parse(JSON.parse(localStorage.getItem(key)!).body);
  return state.units.filter((u:any)=>u.owner===0&&u.destination!==null).map((u:any)=>({origin:u.origin,destination:u.destination,route:u.route,province:u.province}));
 });
 expect(routes.length).toBeGreaterThan(0);expect(routes.every(r=>r.destination===region('STATE_BAVARIA')&&r.route.length>=2&&r.province===region('STATE_BRANDENBURG'))).toBe(true);
 await page.reload();await page.getByTestId('open-saves').click();await page.locator('.save-card').filter({hasText:'Remote order'}).getByRole('button',{name:'载入',exact:true}).click();
 await expect(page.getByTestId('open-settings')).toBeVisible();expect(errors).toEqual([]);
});

test('valid 480-battalion player save loads and GPU buffers grow beyond the removed global cap',async({page})=>{
 test.setTimeout(180000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const fixture=JSON.parse(execFileSync(process.execPath,['--experimental-strip-types','tests/create-capacity-fixture.mjs'],{encoding:'utf8'}));
 await page.addInitScript(({key,value})=>localStorage.setItem(key,value),fixture);
 await page.goto('/');await page.getByTestId('open-saves').click();
 await page.locator('.save-card').filter({hasText:'Capacity regression fixture'}).getByRole('button',{name:'载入',exact:true}).click();
 await expect(page.getByTestId('army-total')).toHaveText('480');await page.getByTestId('toggle-pause').click();
 await page.getByRole('button',{name:'3D',exact:true}).click();await expect(page.locator('canvas')).toHaveAttribute('data-settled','true',{timeout:20000});
 const capacity=Number(await page.locator('canvas').getAttribute('data-unit-capacity'));
 expect(capacity).toBeGreaterThanOrEqual(492*3);
 expect(Number(await page.locator('canvas').getAttribute('data-total-units'))).toBe(492);
 expect(Number(await page.locator('canvas').getAttribute('data-rendered-instances'))).toBeGreaterThan(0);
 await expect(page.getByTestId('region-capacity')).toContainText('12 / 12');
 await page.screenshot({path:'artifacts/capacity-fixture-480.png'});expect(errors).toEqual([]);
});
