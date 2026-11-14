import {openMapSearch} from './map-search.ts';
import {test,expect} from '@playwright/test';
import {execFileSync} from 'node:child_process';
test('Baikonur searches and actions resolve to the single Karaganda region and persist once',async({page})=>{
 test.setTimeout(120000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const fixture=JSON.parse(execFileSync(process.execPath,['--experimental-strip-types','tests/create-baikonur-fixture.mjs'],{encoding:'utf8',maxBuffer:16*1024*1024}));
 const oldKey='rouge.save.natural-earth-admin1.regions.v2.preserved';
 await page.addInitScript(({key,value,oldKey})=>{localStorage.setItem(key,value);localStorage.setItem(oldKey,'original v2 campaign bytes');localStorage.setItem('rouge.language','zh');},{...fixture,oldKey});
 await page.goto('/');await page.getByTestId('open-saves').click();await page.locator('.save-card').filter({hasText:'Baikonur merge fixture'}).getByRole('button',{name:'载入',exact:true}).click();
 await expect(page.locator('.app')).toHaveAttribute('data-local-ready','true',{timeout:45000});
 const canvas=page.locator('.world canvas');await canvas.focus();await page.keyboard.press('Space');await expect(page.getByTestId('toggle-pause')).toHaveText('▶');
 await expect(canvas).toHaveAttribute('data-region-count',String(fixture.regionCount));
 for(const query of ['拜科努尔','KAB+00?','卡拉干达','KAZ-3203']){
  await openMapSearch(page);await page.getByTestId('map-search').fill(query);await expect(page.locator('.map-search-results button')).toHaveCount(1);await page.locator('.map-search-results button').click();
  await expect(canvas).toHaveAttribute('data-selected-region',String(fixture.region));
  await expect(page.locator('.province-panel h2')).toHaveText('卡拉干达州');await expect(page.getByTestId('region-capacity')).toContainText('0 / 12');
 }
 await expect(page.locator('.resource').filter({hasText:'领土'})).toContainText('1 / 1150');
 await canvas.focus();await page.keyboard.press('End');await expect(canvas).toHaveAttribute('data-settled','true',{timeout:20000});
 await page.screenshot({path:'artifacts/baikonur-karaganda-region.png'});
 await page.getByTestId('open-settings').click();await page.getByTestId('settings-save').click();await page.getByPlaceholder('存档名称').fill('Merged Karaganda');await page.getByTestId('create-save').click();
 await expect(page.locator('.save-card').filter({hasText:'Merged Karaganda'})).toBeVisible();
 const saved=await page.evaluate(({prefix,oldKey})=>{
  const key=Object.keys(localStorage).find(k=>k.startsWith(prefix)&&!k.endsWith('.backup')&&JSON.parse(localStorage.getItem(k)!).name==='Merged Karaganda')!;
  return {state:JSON.parse(JSON.parse(localStorage.getItem(key)!).body),old:localStorage.getItem(oldKey)};
 },{prefix:fixture.savePrefix,oldKey});
 expect(saved.state.provinces).toHaveLength(fixture.regionCount);expect(saved.state.provinces.filter(p=>p.owner===0)).toHaveLength(1);expect(saved.old).toBe('original v2 campaign bytes');
 expect(saved.state.grouping.groups.find(g=>g.atoms.includes('KAB+00?')).atoms).toEqual(['KAB+00?']);
 await page.reload();await page.getByTestId('open-saves').click();await page.locator('.save-card').filter({hasText:'Merged Karaganda'}).getByRole('button',{name:'载入',exact:true}).click();
 await openMapSearch(page);await page.getByTestId('map-search').fill('拜科努尔');await page.locator('.map-search-results button').click();await expect(canvas).toHaveAttribute('data-selected-region',String(fixture.region));expect(errors).toEqual([]);
});
