import {test,expect} from '@playwright/test';
import {execFileSync} from 'node:child_process';
test('leader artwork and preferences persist while solo AI selection controls faction count',async({page})=>{
 await page.goto('/');await page.getByTestId('single-player').click();await page.getByTestId('edit-player-leader').click();
 await expect(page.locator('.leader-card img[data-testid=leader-bust]')).toHaveCount(3);
 for(const portrait of await page.locator('.leader-card img[data-testid=leader-bust]').all()) {await expect(portrait).toHaveJSProperty('complete',true);await expect(portrait).toHaveJSProperty('naturalWidth',720);}
 await page.getByTestId('choose-leader-steward').click();
 await page.keyboard.press('Escape');await page.getByTestId('edit-player-flag').click();
 await page.getByLabel('旗帜类型').selectOption('jp');
 await page.reload();await page.getByTestId('single-player').click();await page.getByTestId('edit-player-leader').click();
 await expect(page.getByTestId('choose-leader-steward')).toHaveAttribute('aria-pressed','true');
 await page.keyboard.press('Escape');await page.getByTestId('edit-player-flag').click();
 await expect(page.getByLabel('旗帜类型')).toHaveValue('jp');
 await page.keyboard.press('Escape');
 await page.getByTestId('setup-ai-count').fill('3');await page.getByTestId('begin-campaign').click();
 await expect(page.locator('.app')).toHaveAttribute('data-local-ready','true',{timeout:60000});
 await expect(page.locator('.faction-bars>span')).toHaveCount(4);
 await expect(page.getByTestId('commander-portrait')).toHaveAttribute('data-leader','steward');
 await page.getByTestId('open-settings').click();await page.getByTestId('settings-save').click();
 await page.getByPlaceholder('存档名称').fill('Remembered campaign');await page.getByTestId('create-save').click();
 // Changing next-game preferences cannot rewrite a saved campaign.
 await page.evaluate(()=>localStorage.setItem('rouge.setup-preferences.v1',JSON.stringify({version:1,leader:'vanguard',flag:{type:'preset',id:'fr'}})));
 await page.reload();await page.getByTestId('open-saves').click();
 await page.locator('.save-card').filter({hasText:'Remembered campaign'}).getByRole('button',{name:'载入',exact:true}).click();
 await expect(page.getByTestId('commander-portrait')).toHaveAttribute('data-leader','steward');
});
test('queued level choices stay open until the final authoritative choice is applied',async({page})=>{
 const fixture=JSON.parse(execFileSync(process.execPath,['--experimental-strip-types','tests/create-talents-fixture.mjs'],{encoding:'utf8',maxBuffer:16*1024*1024}));
 await page.addInitScript(({key,value})=>localStorage.setItem(key,value),fixture);
 await page.goto('/');await page.getByTestId('open-saves').click();
 await page.locator('.save-card').filter({hasText:'Queued talent choices'}).getByRole('button',{name:'载入',exact:true}).click();
 await page.getByTestId('portrait-talents').click();await expect(page.getByRole('dialog')).toBeVisible();
 const first=await page.locator('.talent-card h3').first().textContent();
 await page.locator('.talent-card').first().click();
 await expect(page.getByRole('dialog')).toBeVisible();
 await expect(page.locator('.chosen-talents')).toContainText(first!);
 await expect(page.locator('.talent-card').first()).toBeEnabled();
 await page.locator('.talent-card').first().click();
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.getByTestId('portrait-talents').click();
 await expect(page.locator('.talent-card')).toHaveCount(0);await expect(page.locator('.chosen-talents>span')).toHaveCount(2);
});
