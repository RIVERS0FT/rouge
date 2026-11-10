import {test,expect} from '@playwright/test';
test('cosmetic leader choice and custom flag survive close/reopen and appear in game',async({page})=>{
 await page.goto('/');await page.getByTestId('edit-player-leader').click();
 await expect(page.locator('.leader-copy>b')).toContainText(['铁壁统帅','机动先锋','军需总监']);
 await expect(page.locator('.leader-copy p')).toHaveCount(0);
 await page.keyboard.press('Escape');await page.getByTestId('edit-player-flag').click();
 await page.getByLabel('旗帜类型',{exact:true}).selectOption('custom');
 await page.getByLabel('旗帜图案',{exact:true}).selectOption('cross');
 await page.getByLabel('旗帜颜色 1',{exact:true}).fill('#112233');
 await page.keyboard.press('Escape');await page.getByTestId('edit-player-flag').click();
 await expect(page.getByLabel('旗帜图案',{exact:true})).toHaveValue('cross');
 await expect(page.getByLabel('旗帜颜色 1',{exact:true})).toHaveValue('#112233');
 await page.keyboard.press('Escape');await page.getByTestId('single-player').click();
 await page.getByTestId('begin-campaign').click();
 await expect(page.getByTestId('faction-identity').getByRole('img',{name:'自定义旗帜',exact:true})).toBeVisible();
 await expect(page.getByTestId('commander-portrait')).toBeVisible();
});
test('all national presets are selectable and editor fits mobile landscape',async({page})=>{
 await page.setViewportSize({width:844,height:390});await page.goto('/');await page.getByTestId('edit-player-flag').click();
 for(const id of ['cn','fr','de','it','jp','gb','us','ch']){
  await page.getByLabel('旗帜类型',{exact:true}).selectOption(id);
  await expect(page.getByTestId('flag-editor').getByRole('img')).toBeVisible();
 }
 await page.keyboard.press('Escape');await page.getByTestId('single-player').click();
 await page.getByTestId('begin-campaign').click();await expect(page.getByTestId('faction-identity').getByRole('img',{name:'瑞士',exact:true})).toBeVisible();
});
