import {expect,test} from '@playwright/test';
import {loadMapOrderFixture} from './map-orders.ts';
import {openMapSearch} from './map-search.ts';

test('Island place aliases select each merged playable region in either language',async({page})=>{
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
 const bahamas=await select('拿骚','巴哈马');
 const seychelles=await select('维多利亚','塞舌尔');
 const palau=await select('科罗尔州','西密克罗尼西亚');
 expect(new Set([bahamas,seychelles,palau]).size).toBe(3);
 await page.getByTestId('open-settings').click();
 await page.getByRole('button',{name:'English',exact:true}).click();
 await page.getByTestId('settings-resume').click();
 expect(await select('Bimini','Bahamas')).toBe(bahamas);
 expect(await select('Outer Islands','Seychelles')).toBe(seychelles);
 expect(await select('Kayangel','West Micronesia')).toBe(palau);
});
