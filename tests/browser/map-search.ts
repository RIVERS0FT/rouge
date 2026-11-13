import {expect,type Page} from '@playwright/test';

/** Open the transient finder through its actual shortcut before using it. */
export async function openMapSearch(page:Page){
 await expect(page.locator('.app')).toHaveAttribute('data-local-ready','true',{timeout:60000});
 await page.locator('.world canvas').focus();await page.keyboard.press('f');
 const search=page.getByTestId('map-search');await expect(search).toBeFocused();
 return search;
}
