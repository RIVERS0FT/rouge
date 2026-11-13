import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
const atlas=JSON.parse(readFileSync('src/generated/gameplay-map.json','utf8'));
test('state-region Miller atlas: geometry limits, sea exclusion, wrapping and polar anchor',async({page})=>{
  test.setTimeout(120000);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');const canvas=page.locator('.world canvas');
  await expect(canvas).toHaveAttribute('data-ready','true',{timeout:30000});
  await expect(canvas).toHaveAttribute('data-crop','miller-74n-reference-aspect-v1');
  await expect(canvas).toHaveAttribute('data-visible-provinces',String(atlas.provinces.filter((p:{playable:boolean})=>p.playable).length));
  const min=Number(await canvas.getAttribute('data-land-min-z')),max=Number(await canvas.getAttribute('data-land-max-z'));
  expect(min).toBeGreaterThanOrEqual(-923.4389955662654-1e-7);expect(max).toBeLessThanOrEqual(665.6235044337346+1e-7);
  await page.screenshot({path:'artifacts/cropped-miller-menu.png'});
  await page.getByTestId('single-player').click();await page.getByTestId('begin-campaign').click();
  await expect(page.locator('.hud-top')).toBeVisible();
  // Freeze the war for deterministic atlas screenshots, not the renderer.
  await expect(page.locator('.app')).toHaveAttribute('data-local-ready','true',{timeout:60000});
  await canvas.focus();await page.keyboard.press('Space');
  await expect(page.getByTestId('toggle-pause')).toHaveText('▶');
  await page.keyboard.press('Home');
  await expect(canvas).toHaveAttribute('data-settled','true',{timeout:15000});
  expect(Number(await canvas.getAttribute('data-focus-z'))).toBeCloseTo(-128.90774556626536,6);
  await page.screenshot({path:'artifacts/cropped-miller-world.png'});
  await expect(page.locator('.atlas-credit')).toHaveCount(0);await expect(page.locator('.world canvas')).toHaveAttribute('data-projection','miller-cylindrical');
  await page.getByTestId('map-search').fill('NOR-901');await expect(page.locator('.map-search-results button')).toHaveCount(0);
  await page.getByTestId('map-search').fill('GRL-2743');await page.locator('.map-search-results button').first().click();
  await expect(canvas).toHaveAttribute('data-settled','true',{timeout:15000});
  expect(Number(await canvas.getAttribute('data-focus-z'))).toBeGreaterThan(-923.4389955662654);
  await page.screenshot({path:'artifacts/cropped-miller-greenland.png'});
  await page.getByTestId('map-search').fill('江苏');await page.locator('.map-search-results button').first().click();
  await expect(page.locator('.province-panel h2')).toContainText('江苏');
  await expect(canvas).toHaveAttribute('data-settled','true',{timeout:15000});
  await page.screenshot({path:'artifacts/cropped-miller-jiangsu.png'});
  await page.locator('.world canvas').focus();await page.keyboard.press('Home');await expect(canvas).toHaveAttribute('data-settled','true',{timeout:15000});
  // A real pointer drag passes the dateline. The nearest repeated atlas is drawn
  // and focus wraps into the canonical interval, rather than clamping at ±1800.
  for(let i=0;i<2;i++){await page.mouse.move(1100,600);await page.mouse.down();await page.mouse.move(360,600,{steps:12});await page.mouse.up();}
  await expect(canvas).toHaveAttribute('data-wrap-x','true');
  await expect.poll(async()=>Number(await canvas.getAttribute('data-focus-x'))).toBeLessThan(0);
  expect(Number(await canvas.getAttribute('data-focus-x'))).toBeGreaterThanOrEqual(-1800);
  await page.screenshot({path:'artifacts/cropped-miller-dateline.png'});
  await page.locator('.world canvas').focus();await page.keyboard.press('Home');await expect(canvas).toHaveAttribute('data-settled','true',{timeout:15000});
  expect(errors).toEqual([]);await expect(page.locator('.render-error')).toHaveCount(0);
});
