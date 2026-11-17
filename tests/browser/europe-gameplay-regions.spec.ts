import {expect,test} from '@playwright/test';
import {loadMapOrderFixture} from './map-orders.ts';
import {openMapSearch} from './map-search.ts';

test('European map grouping keeps city and island aliases available after consolidation',async({page})=>{
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
 const malta=await select('马耳他','马耳他');
 const aland=await select('奥兰群岛','奥兰群岛');
 const tallinn=await select('塔林','塔林');
 const courland=await select('库尔兰','库尔兰');
 expect(new Set([malta,aland,tallinn,courland]).size).toBe(4);
 await page.getByTestId('open-settings').click();
 await page.getByRole('button',{name:'English',exact:true}).click();
 await page.getByTestId('settings-resume').click();
 expect(await select('Valletta','Malta')).toBe(malta);
 expect(await select('Mariehamn','Åland Islands')).toBe(aland);
 expect(await select('Saare','Tallinn')).toBe(tallinn);
 expect(await select('Jurmala','Courland')).toBe(courland);
 const andorra=await select('Ordino','Occitanie');
 const liechtenstein=await select('Vaduz','East Switzerland');
 expect(andorra).not.toBe(liechtenstein);
 expect(await select('Izola','Ilirska Bistrica')).not.toBe(andorra);
});
