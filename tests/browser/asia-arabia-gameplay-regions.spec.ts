import {expect,test} from '@playwright/test';
import {loadMapOrderFixture} from './map-orders.ts';
import {openMapSearch} from './map-search.ts';

test('Asia and Arabia regions expose former territory aliases and respect merged group IDs',async({page})=>{
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
 const timor=await select('帝力县','东帝汶');
 const malaysia=await select('新加坡','马来半岛');
 const kuwait=await select('科威特','科威特');
 const bahrain=await select('巴林','巴林');
 expect(new Set([timor,malaysia,kuwait,bahrain]).size).toBe(4);
 await page.getByTestId('open-settings').click();
 await page.getByRole('button',{name:'English',exact:true}).click();
 await page.getByTestId('settings-resume').click();
 expect(await select('Ambeno','Timor-Leste')).toBe(timor);
 expect(await select('Perlis','Malay Peninsula')).toBe(malaysia);
 expect(await select('Hawalli','Kuwait')).toBe(kuwait);
 expect(await select('Al Muḩarraq','Bahrain')).toBe(bahrain);
});
