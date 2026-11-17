import {expect,test} from '@playwright/test';
import {loadMapOrderFixture} from './map-orders.ts';
import {openMapSearch} from './map-search.ts';

test('European small sources keep their merged destinations searchable',async({page})=>{
 test.setTimeout(150000);
 await loadMapOrderFixture(page);
 const canvas=page.locator('.world canvas'),heading=page.locator('#province-panel h2');
 const select=async(query:string,label:string)=>{
  const search=await openMapSearch(page);await search.fill(query);
  const result=page.locator('.map-search-results button').filter({has:page.getByText(label,{exact:true})});
  await expect(result).toBeVisible();await result.click();
  await expect(heading).toHaveText(label);
  const id=await canvas.getAttribute('data-selected-region');expect(id).not.toBeNull();
  return id;
 };
 const lowerSaxony=await select('不来梅','下萨克森');
 const schleswig=await select('汉堡','石勒苏益格-荷尔斯泰因');
 expect(lowerSaxony).not.toBe(schleswig);
 await page.getByTestId('open-settings').click();
 await page.getByRole('button',{name:'English',exact:true}).click();
 await page.getByTestId('settings-resume').click();
 expect(await select('Bremen','Niedersachsen')).toBe(lowerSaxony);
 expect(await select('Hamburg','Schleswig-Holstein')).toBe(schleswig);
 await select('Camenca',"Dnipropetrovs'k");
});
