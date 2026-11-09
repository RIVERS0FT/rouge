import {test,expect} from '@playwright/test';
test('setup chooses exactly one of four units and starts a non-infantry army',async({page})=>{
 await page.goto('/');
 await page.getByRole('button',{name:'English',exact:true}).click();
 await page.getByTestId('single-player').click();
 for(const kind of ['infantry','cavalry','artillery','engineer']){
  await page.getByTestId('choose-unit-'+kind).click();
  await expect(page.locator('.unit-card[aria-pressed="true"]')).toHaveCount(1);
  await expect(page.getByTestId('choose-unit-'+kind)).toHaveAttribute('aria-pressed','true');
 }
 await page.getByTestId('choose-unit-engineer').click();
 await expect(page.locator('.unit-card[aria-pressed="true"]')).toHaveCount(1);
 await page.getByTestId('begin-campaign').click();
 await expect(page.locator('.hud-top')).toBeVisible();
 await page.getByTestId('open-upgrades').click();
 await expect(page.locator('.upgrade-card')).toHaveCount(1);
 await expect(page.locator('.upgrade-card')).toContainText('Engineers');
 await page.getByTestId('upgrade-engineer-attack').click();
 await expect(page.locator('.upgrade-card')).toContainText('1/8');
 await expect(page.getByTestId('upgrade-infantry-attack')).toHaveCount(0);
});
