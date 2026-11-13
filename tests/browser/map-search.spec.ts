import {test,expect} from '@playwright/test';
import {loadMapOrderFixture,mapOrderFixture} from './map-orders.ts';
import {openMapSearch} from './map-search.ts';

test('F opens and focuses the hidden finder; selection, outside clicks and Escape dismiss it',async({page})=>{
 test.setTimeout(150000);
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await loadMapOrderFixture(page);
 const search=page.getByTestId('map-search'),canvas=page.locator('.world canvas');
 await expect(search).toHaveCount(0);
 for(const modifier of ['ctrlKey','metaKey','altKey','isComposing','repeat']){
  await canvas.dispatchEvent('keydown',{key:'f',code:'KeyF',bubbles:true,[modifier]:true});
  await expect(search).toHaveCount(0);
 }
 await openMapSearch(page);await expect(search).toHaveValue('');
 await search.press('Escape');
 await page.getByTestId('campaign-time').getByRole('button',{name:'所有地块',exact:true}).click();
 await expect(search).toBeFocused();await expect(search).toHaveValue('');
 await page.keyboard.type('f');await expect(search).toHaveValue('f');
 await search.fill('江苏');await expect(page.locator('.map-search-results button')).not.toHaveCount(0);
 await page.keyboard.press('Enter');
 await expect(search).toHaveCount(0);await expect(canvas).toBeFocused();
 await expect(page.locator('#province-panel h2')).toContainText('江苏');
 await openMapSearch(page);await expect(search).toHaveValue('');
 await search.fill('DEU-1574');await page.locator('.map-search-results button').first().click();
 await expect(canvas).toHaveAttribute('data-selected-region',String(mapOrderFixture.target));
 await expect(search).toHaveCount(0);
 await openMapSearch(page);await search.fill('未完成的查询');await search.press('Escape');
 await expect(search).toHaveCount(0);await expect(page.getByRole('dialog')).toHaveCount(0);await expect(canvas).toBeFocused();
 await openMapSearch(page);await expect(search).toHaveValue('');
 // Clicking a HUD control both dismisses the finder and performs that control's action.
 await page.getByTestId('open-upgrades').click();await expect(search).toHaveCount(0);await expect(page.locator('#military-panel')).toBeVisible();
 await openMapSearch(page);await search.fill('CHN');
 await page.getByTestId('open-settings').click();await expect(search).toHaveCount(0);
 await page.keyboard.press('f');await expect(search).toHaveCount(0);await expect(page.getByRole('dialog')).toBeVisible();
 await page.getByTestId('settings-save').click();const name=page.getByPlaceholder('存档名称');
 await name.fill('');await name.press('f');await expect(name).toHaveValue('f');await expect(search).toHaveCount(0);
 await name.press('Escape');await page.keyboard.press('Escape');await expect(page.getByTestId('open-settings')).toBeFocused();
 expect(errors).toEqual([]);
});

for(const viewport of [{width:390,height:844},{width:844,height:390}])test.describe(`touch finder ${viewport.width}x${viewport.height}`,()=>{
 test.use({hasTouch:true,isMobile:true,viewport});
 test('the finder is hidden initially, stays usable for result taps and closes on outside taps',async({page})=>{
  await loadMapOrderFixture(page);const search=page.getByTestId('map-search');await expect(search).toHaveCount(0);
  await page.getByTestId('campaign-time').getByRole('button',{name:'所有地块',exact:true}).tap();await expect(search).toBeFocused();
  await search.fill('DEU-1574');await page.locator('.map-search-results button').first().tap();
  await expect(search).toHaveCount(0);await expect(page.locator('.world canvas')).toHaveAttribute('data-selected-region',String(mapOrderFixture.target));
  await openMapSearch(page);await search.fill('CHN');await page.screenshot({path:`artifacts/map-search-open-${viewport.width}.png`});
  await page.getByTestId('open-settings').tap();await expect(search).toHaveCount(0);await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');await expect(search).toHaveCount(0);
  await page.screenshot({path:`artifacts/map-search-hidden-${viewport.width}.png`});
 });
});
