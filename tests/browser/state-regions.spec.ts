import {loadMapOrderFixture,mapOrderFixture,targetPoint,worldView} from './map-orders.ts';
import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const atlas=JSON.parse(readFileSync('src/generated/gameplay-map.json','utf8'));
const regionForSource=(code:string)=>atlas.provinces.find((p:{sourceAtoms:string[]})=>p.sourceAtoms.includes(code));
test('ownership border hierarchy, UK detail, map orders and persisted route',async({page})=>{
 test.setTimeout(180000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await loadMapOrderFixture(page);await expect(page.locator('canvas')).toHaveAttribute('data-ready','true',{timeout:45000});
 await expect(page.locator('canvas')).toHaveAttribute('data-region-count',String(atlas.provinces.length));
 await expect(page.locator('canvas')).toHaveAttribute('data-boundary-mode','ownership-and-management');
 await expect(page.locator('canvas')).toHaveAttribute('data-country-borders','true');
 await expect(page.locator('canvas')).toHaveAttribute('data-neutral-borders','independent-territories');
 expect(Number(await page.locator('canvas').getAttribute('data-country-border-segments'))).toBeGreaterThan(0);
 await expect(page.getByTestId('country-flag')).toHaveCount(0);await expect(page.getByTestId('country-identity')).toHaveCount(0);
 await expect(page.locator('.hud-top .faction-copy,.hud-top .commander-badge')).toHaveCount(0);
 const sourceCode=atlas.provinces[Number(await page.locator('canvas').getAttribute('data-selected-region'))].id;
 await page.locator('canvas').focus();await page.keyboard.press('Home');await expect(page.locator('canvas')).toHaveAttribute('data-settled','true',{timeout:20000});
 await page.screenshot({path:'artifacts/state-regions-world.png'});
 await page.getByTestId('map-search').fill('GBR-2764');await page.locator('.map-search-results button').first().click();
 await expect(page.locator('.province-panel h2')).toContainText(regionForSource('GBR-2764').name[0]);await expect(page.locator('canvas')).toHaveAttribute('data-settled','true',{timeout:20000});
 // Pull back from a single region to view the British region boundaries together.
 await page.mouse.move(740,440);await page.mouse.wheel(0,85);await expect(page.locator('canvas')).toHaveAttribute('data-settled','true',{timeout:20000});
 await page.screenshot({path:'artifacts/state-regions-britain.png'});
 await page.getByTestId('map-search').fill(sourceCode);await page.locator('.map-search-results button').first().click();
 await worldView(page);const point=await targetPoint(page);
 const plan=mapOrderFixture;
 await expect(page.getByTestId('region-capacity')).toContainText(/\/\s*[1-9]\d*/);
 await page.mouse.click(point.x,point.y,{button:'right'});
 await expect(page.getByTestId('region-capacity')).toContainText('3 / 12');
 await page.screenshot({path:'artifacts/remote-order.png'});
 await page.getByTestId('open-settings').click();await page.getByTestId('settings-save').click();
 await page.getByPlaceholder('存档名称').fill('Remote order');await page.getByTestId('create-save').click();
 await expect(page.locator('.save-card').filter({hasText:'Remote order'})).toBeVisible();
 const routes=await page.evaluate(()=>{
  const saves=Object.keys(localStorage).filter(k=>k.startsWith('rouge.save.natural-earth-admin1.regions.v3.')&&!k.endsWith('.backup')).map(k=>JSON.parse(localStorage.getItem(k)!));
  const state=JSON.parse(saves.find(s=>s.name==='Remote order').body);
  return state.units.filter((u:any)=>u.owner===0&&u.destination!==null).map((u:any)=>({origin:u.origin,destination:u.destination,route:u.route,travel:u.travel,province:u.province}));
 });
 expect(routes.length).toBeGreaterThan(0);expect(routes.every(r=>r.destination===plan.target&&r.route.length===0&&r.travel?.points.length>=2&&r.province===plan.source)).toBe(true);
 await page.reload();await page.getByTestId('open-saves').click();await page.locator('.save-card').filter({hasText:'Remote order'}).getByRole('button',{name:'载入',exact:true}).click();
 await expect(page.getByTestId('open-settings')).toBeVisible();expect(errors).toEqual([]);
});

test('valid 600-battalion player save loads and GPU buffers grow beyond the removed global cap',async({page})=>{
 test.setTimeout(180000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const fixture=JSON.parse(execFileSync(process.execPath,['--experimental-strip-types','tests/create-capacity-fixture.mjs'],{encoding:'utf8',maxBuffer:16*1024*1024}));
 await page.addInitScript(({key,value})=>localStorage.setItem(key,value),fixture);
 await page.goto('/');await page.getByTestId('open-saves').click();
 await page.locator('.save-card').filter({hasText:'Capacity regression fixture'}).getByRole('button',{name:'载入',exact:true}).click();
 await expect(page.getByTestId('army-total')).toHaveText('600');await page.getByTestId('toggle-pause').click();
 await page.locator('canvas').focus();await page.keyboard.press('End');await expect(page.locator('canvas')).toHaveAttribute('data-settled','true',{timeout:20000});
 const capacity=Number(await page.locator('canvas').getAttribute('data-unit-capacity'));
 expect(capacity).toBeGreaterThanOrEqual(612);
 expect(Number(await page.locator('canvas').getAttribute('data-total-units'))).toBe(612);
 expect(Number(await page.locator('canvas').getAttribute('data-rendered-instances'))).toBeGreaterThan(0);
 await expect(page.getByTestId('region-capacity')).toContainText('12 / 12');
 await page.screenshot({path:'artifacts/capacity-fixture-600.png'});expect(errors).toEqual([]);
});
