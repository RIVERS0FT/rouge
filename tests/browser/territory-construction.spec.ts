import {test,expect} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {openMapSearch} from './map-search.ts';

test('construction spends build funds and targets only the chosen base region in a merged territory',async({page})=>{
 test.setTimeout(180000);
 const fixture=JSON.parse(execFileSync(process.execPath,['--experimental-strip-types','tests/create-territory-ui-fixture.mjs'],{encoding:'utf8',maxBuffer:16*1024*1024}));
 await page.addInitScript(({key,value})=>localStorage.setItem(key,value),fixture);
 await page.goto('/');await page.getByRole('button',{name:'English',exact:true}).click();await page.getByTestId('open-saves').click();
 await page.locator('.save-card').filter({hasText:'Territory UI fixture'}).getByRole('button',{name:'Load',exact:true}).click();
 await expect(page.locator('.app')).toHaveAttribute('data-local-ready','true',{timeout:60000});
 await page.getByTestId('toggle-pause').click();
 const search=await openMapSearch(page);
 await search.fill(fixture.selectedCode);await page.locator('.map-search-results button').first().click();
 const construction=page.getByTestId('province-construction'),funds=page.getByTestId('construction-funds').locator('strong');
 await expect(construction).toBeVisible();
 await expect(construction.getByTestId('construct-market')).toBeEnabled();
 const initial=Number(await funds.textContent());

 await page.getByTestId('open-territory-management').click();
 await page.getByTestId('territory-merge-neighbor').first().check();await page.getByTestId('merge-territory-groups').click();
 await expect(page.getByTestId('territory-split-atom')).toHaveCount(2);
 await page.keyboard.press('Escape');

 const target=page.getByTestId('construction-target');
 await expect(target.locator('option')).toHaveCount(2);
 const first=await target.inputValue();
 const second=await target.locator('option').evaluateAll(options=>options.map(option=>(option as HTMLOptionElement).value).find(value=>value!==first)!);
 await target.selectOption(second);
 const barracks=construction.getByTestId('construct-barracks');
 const cost=Number((await barracks.textContent())!.split('·')[1].trim());
 await barracks.click();
 const current=construction.getByTestId('construction-current');
 await expect(current).toHaveAttribute('data-kind','barracks');await expect(current).toHaveAttribute('data-level','1');
 await expect(funds).toHaveText(String(initial-cost));
 await expect(page.getByTestId('construction-summary')).toContainText('1/2 slots built');
 await expect(page.getByTestId('construction-summary')).toContainText('Barracks ×1');
 await expect(barracks).toBeDisabled();
 await target.selectOption(first);
 await expect(current).toHaveCount(0);
 await expect(construction.getByTestId('construct-market')).toBeDisabled();
 await target.selectOption(second);
 await expect(current).toHaveAttribute('data-kind','barracks');
});
