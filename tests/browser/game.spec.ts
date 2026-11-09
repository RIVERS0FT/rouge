import {test,expect} from '@playwright/test';
test('menu → setup → real WebGL game → order → upgrade → multi-slot save → reload',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>Object.defineProperty(globalThis.crypto,'randomUUID',{value:undefined,configurable:true}));
 await page.goto('/');await expect(page.getByRole('heading',{name:/ROUGE/})).toBeVisible();
 await page.getByRole('button',{name:'English',exact:true}).click();await expect(page.getByTestId('single-player')).toContainText('Single player');
 await page.screenshot({path:'artifacts/menu.png'});
 await page.getByTestId('single-player').click();await page.getByTestId('commander-name').fill('E2E Commander');await page.getByTestId('begin-campaign').click();
 await expect(page.locator('.hud-top')).toContainText('E2E Commander');await expect(page.locator('.render-error')).toHaveCount(0);await expect(page.locator('canvas')).toBeVisible();
 await page.getByTestId('dispatch').click();await page.waitForTimeout(500);await page.getByTestId('open-upgrades').click();
 await page.getByTestId('upgrade-infantry-attack').click();await expect(page.locator('.upgrade-card').first()).toContainText('1/8');
 await page.getByRole('button',{name:'Close',exact:true}).click();await page.getByTestId('open-settings').click();await page.getByTestId('settings-save').click();
 await page.getByPlaceholder('Save name').fill('First slot');await page.getByTestId('create-save').click();
 await page.getByPlaceholder('Save name').fill('Second slot');await page.getByTestId('create-save').click();
 await expect(page.locator('.save-card')).toHaveCount(2);await page.getByRole('button',{name:'Close',exact:true}).first().click();
 await page.getByRole('button',{name:'3D',exact:true}).click();await page.waitForTimeout(1500);await page.screenshot({path:'artifacts/game-3d.png'});
 await page.reload();await page.getByTestId('open-saves').click();await expect(page.locator('.save-card')).toHaveCount(2);await page.locator('.save-card').filter({hasText:'First slot'}).getByRole('button',{name:'Load',exact:true}).click();
 await expect(page.locator('.hud-top')).toContainText('E2E Commander');expect(errors).toEqual([]);
});
