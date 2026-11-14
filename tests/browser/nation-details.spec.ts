import {test,expect} from '@playwright/test';

for(const mode of ['desktop','phone'] as const)test(`nation details and map location on ${mode}`,async({page})=>{
 test.setTimeout(180000);
 if(mode==='phone')await page.setViewportSize({width:390,height:844});
 await page.goto('/');
 await page.getByRole('button',{name:'English',exact:true}).click();
 await page.getByTestId('single-player').click();
 await page.getByTestId('setup-ai-count').fill('1');
 await page.getByTestId('begin-campaign').click();
 await expect(page.locator('.app')).toHaveAttribute('data-local-ready','true',{timeout:60000});
 await page.getByTestId('toggle-pause').click();
 await page.getByTestId('open-nations').click();

 const panel=page.locator('#nations-panel');
 const own=panel.locator('[data-nation-id="0"]'), rival=panel.locator('[data-nation-id="1"]');
 await expect(panel.getByRole('heading',{name:'Country rankings'})).toBeVisible();
 await own.click();
 const details=panel.getByTestId('nation-detail'), back=panel.getByTestId('nation-back');
 await expect(details).toHaveAttribute('data-nation','0');
 await expect(panel.locator('.nation-detail-flag svg')).toBeVisible();
 await expect(details.getByText('Leader level',{exact:true})).toBeVisible();
 await expect(details.getByTestId('nation-building-market')).toHaveText('0');
 await expect(details.getByTestId('nation-funds')).toHaveText(/^\d+$/);
 await expect(back).toBeFocused();
 await back.click();await expect(own).toBeFocused();

 await rival.click();
 await expect(details).toHaveAttribute('data-nation','1');
 await expect(details.getByTestId('nation-funds')).toHaveCount(0);
 const locate=details.getByTestId('nation-locate');
 await expect(locate).toBeEnabled();
 const canvas=page.locator('.world canvas');
 await expect(canvas).toHaveAttribute('data-ready','true',{timeout:60000});
 const previous=await canvas.getAttribute('data-selected-region');
 await locate.click();
 await expect(panel).toHaveCount(0);
 await expect(canvas).toHaveAttribute('data-selected-region',/^\d+$/);
 await expect(canvas).not.toHaveAttribute('data-selected-region',previous??'-1');

 await page.getByTestId('open-nations').click();await expect(own).toBeVisible();await own.click();
 await page.keyboard.press('Escape');await expect(panel).toHaveCount(0);
});
