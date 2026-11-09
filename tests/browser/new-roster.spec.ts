import {test,expect} from '@playwright/test';
const added=['skirmisher','grenadier','heavyCavalry','horseArtillery'];
test('eight unit cards retain exclusive selection, nine attributes and scrollable launch',async({page})=>{
 await page.setViewportSize({width:1000,height:720});
 await page.goto('/');
 await page.getByTestId('single-player').click();
 const cards=page.locator('.unit-grid .unit-card');
 await expect(cards).toHaveCount(8);
 for(const kind of added){
  const card=page.getByTestId(`choose-unit-${kind}`);
  await expect(card.locator('.unit-attribute')).toHaveCount(9);
  await card.click();
  await expect(card).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('.unit-card[aria-pressed="true"]')).toHaveCount(1);
 }
 const marks=await cards.locator('.unit-mark').allTextContents();
 expect(new Set(marks).size).toBe(8);
 await expect(page.getByTestId('choose-unit-horseArtillery')).toContainText('骑炮兵');
 // Reopening preserves the chosen unit and does not create duplicate dialogs.
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
