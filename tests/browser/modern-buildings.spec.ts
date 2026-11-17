import {test,expect} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {openMapSearch} from './map-search.ts';

test('the near map renders modern houses and each constructed facility, the strategic map hides them',async({page})=>{
 test.setTimeout(180000);
 const fixture=JSON.parse(execFileSync(process.execPath,['--experimental-strip-types','tests/create-modern-buildings-fixture.mjs'],{encoding:'utf8',maxBuffer:16*1024*1024}));
 // Freeze worker ticks so the exact same completed constructions are observed
 // on both camera modes, independently of runner start-up/rendering speed.
 await page.route('**/src/platform/worker.ts*',async route=>{
  const response=await route.fetch();
  await route.fulfill({response,body:'const realTimeout = globalThis.setTimeout; globalThis.setTimeout = (fn, delay, ...args) => delay <= 50 ? 0 : realTimeout(fn, delay, ...args);\n'+await response.text()});
 });
 await page.addInitScript(({key,value})=>localStorage.setItem(key,value),fixture);
 await page.goto('/');
 await page.getByRole('button',{name:'English',exact:true}).click();
 await page.getByTestId('open-saves').click();
 await page.locator('.save-card').filter({hasText:fixture.name}).getByRole('button',{name:'Load',exact:true}).click();
 await expect(page.locator('.app')).toHaveAttribute('data-local-ready','true',{timeout:60000});
 const search=await openMapSearch(page);
 await search.fill(fixture.selectedCode);
 await page.locator('.map-search-results button').first().click();

 const canvas=page.locator('.world canvas');
 const count=(kind:string)=>'data-rendered-building-'+kind;
 const facilities=['markets','barracks','fortresses'];
 await expect(canvas).toHaveAttribute('data-unit-render-mode','3d',{timeout:30000});
 await expect(canvas).toHaveAttribute('data-settled','true',{timeout:30000});
 await expect(canvas).toHaveAttribute('data-building-model-asset','modern-v3',{timeout:30000});
 await expect(canvas).toHaveAttribute(count('fallback'),'0');
 await expect.poll(async()=>Number(await canvas.getAttribute(count('houses')))).toBeGreaterThan(0);
 for(const kind of facilities)await expect(canvas).toHaveAttribute(count(kind),'1');

 await canvas.focus();await page.keyboard.press('Home');
 await expect(canvas).toHaveAttribute('data-unit-render-mode','2d',{timeout:30000});
 await expect(canvas).toHaveAttribute('data-settled','true',{timeout:30000});
 await expect(canvas).toHaveAttribute('data-building-model-asset','none');
 for(const kind of ['houses',...facilities,'fallback'])await expect(canvas).toHaveAttribute(count(kind),'0');
});
