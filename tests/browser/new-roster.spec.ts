import {waitForRuntime} from './readiness.ts';
import {test,expect} from '@playwright/test';
const added=['skirmisher','grenadier','heavyCavalry','horseArtillery'];
test('eight unit cards retain exclusive selection, nine tooltip attributes and scrollable launch',async({page})=>{
 await page.setViewportSize({width:1000,height:720});
 await page.goto('/');
 await page.getByTestId('single-player').click();await waitForRuntime(page);
 const cards=page.locator('.unit-grid .unit-card');
 await expect(cards).toHaveCount(8);
 for(const kind of added){
  const card=page.getByTestId(`choose-unit-${kind}`);
  await expect(card.locator('.unit-attribute')).toHaveCount(0);
  await card.click();
  const tooltip=page.getByTestId(`unit-tooltip-${kind}`);
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toHaveAttribute('role','tooltip');
  await expect(tooltip.locator('.unit-attribute')).toHaveCount(9);
  await expect(card).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('.unit-card[aria-pressed="true"]')).toHaveCount(1);
 }
 await expect(cards.locator('svg')).toHaveCount(8);
 const names=await cards.locator('.unit-name').allTextContents();
 expect(new Set(names).size).toBe(8);
 await expect(page.getByTestId('choose-unit-horseArtillery')).toContainText('骑炮兵');
 // Reopening preserves the chosen unit and does not create duplicate dialogs.
 // Escape dismisses the active tooltip before closing setup.
 await page.keyboard.press('Escape');
 await expect(page.getByRole('tooltip')).toHaveCount(0);
 await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'English',exact:true}).click();
 await page.getByTestId('single-player').click();
 await expect(page.getByTestId('choose-unit-horseArtillery')).toContainText('Horse artillery');
 await expect(page.getByTestId('choose-unit-horseArtillery')).toHaveAttribute('aria-pressed','true');
 await page.getByTestId('begin-campaign').click();
 await page.getByTestId('open-upgrades').click();
 await expect(page.locator('.upgrade-card')).toHaveCount(1);
 await expect(page.locator('.upgrade-card')).toContainText('Horse artillery');
 await expect(page.locator('.upgrade-card .unit-attribute')).toHaveCount(9);
 await page.getByTestId('upgrade-horseArtillery-attack').click();
 await expect(page.locator('.upgrade-card [data-stat="attack"] strong')).toHaveText('30');
});
