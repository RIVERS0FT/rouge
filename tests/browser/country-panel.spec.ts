import {test,expect} from './static-host.ts';

for(const mode of ['desktop','phone'] as const)test(`country details window: entry points, strength comparison and map location on ${mode}`,async({page})=>{
 test.setTimeout(180000);
 if(mode==='phone')await page.setViewportSize({width:390,height:844});
 await page.goto('/');
 await page.getByRole('button',{name:'English',exact:true}).click();
 await page.getByTestId('single-player').click();
 await page.getByTestId('setup-ai-count').fill('1');
 await page.getByTestId('begin-campaign').click();
 await expect(page.locator('.app')).toHaveAttribute('data-local-ready','true',{timeout:60000});
 await page.getByTestId('toggle-pause').click();

 // The rail's country button opens your own country, like the region window opens a region.
 await page.getByTestId('open-country').click();
 const panel=page.locator('#country-panel'),details=panel.getByTestId('country-detail');
 await expect(details).toHaveAttribute('data-country','0');
 await expect(panel.getByTestId('country-kicker')).toContainText('Your country');
 await expect(panel.getByTestId('country-strength')).toHaveText(/^\d[\d,]*$/);
 await expect(panel.getByTestId('country-funds')).toHaveText(/^\d[\d,]*$/);
 // Your own window measures you against the strongest rival still standing.
 const compare=panel.getByTestId('country-compare');
 await expect(compare).toHaveAttribute('data-rival','1');
 await expect(compare.getByTestId('country-verdict')).not.toBeEmpty();
 await expect(compare.locator('.power-bar i')).toHaveCount(2);

 // The rival's window: its strength against yours, and its treasury stays private.
 await compare.locator('.compare-side-other').click();
 await expect(details).toHaveAttribute('data-country','1');
 await expect(panel.getByTestId('country-kicker')).toContainText('AI country');
 await expect(panel.getByTestId('country-funds')).toHaveCount(0);
 await expect(panel.getByTestId('country-compare')).toHaveAttribute('data-rival','1');

 // Locate frames the country on the map; on phones the sheet steps aside.
 const canvas=page.locator('.world canvas');
 await expect(canvas).toHaveAttribute('data-ready','true',{timeout:60000});
 const previous=await canvas.getAttribute('data-selected-region');
 await panel.getByTestId('country-locate').click();
 await expect(canvas).toHaveAttribute('data-selected-region',/^\d+$/);
 await expect(canvas).not.toHaveAttribute('data-selected-region',previous??'-1');
 if(mode==='phone')await expect(panel).toHaveCount(0);else await expect(details).toHaveAttribute('data-country','1');

 // Rankings stay a list; a row opens that country's window.
 if(mode==='phone')await page.getByTestId('open-country').click();
 await panel.getByTestId('country-rankings').click();
 const rankings=page.locator('#nations-panel');
 await expect(rankings.getByRole('heading',{name:'Country rankings'})).toBeVisible();
 await rankings.locator('[data-nation-id="1"]').click();
 await expect(rankings).toHaveCount(0);await expect(details).toHaveAttribute('data-country','1');

 // A region's owner opens its country: the region framed by Locate belongs to the rival.
 await page.keyboard.press('Escape');await expect(panel).toHaveCount(0);
 await page.getByTestId('toggle-province-panel').click();
 await page.locator('#province-panel').getByTestId('province-country').click();
 await expect(details).toHaveAttribute('data-country','1');

 // So does your own banner at the top left.
 await page.keyboard.press('Escape');await expect(panel).toHaveCount(0);
 await page.getByTestId('open-own-country').click();
 await expect(details).toHaveAttribute('data-country','0');
 await page.keyboard.press('Escape');await expect(panel).toHaveCount(0);
});
