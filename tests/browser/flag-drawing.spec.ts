import {test,expect} from '@playwright/test';
test('custom flag supports real drag drawing, delete, undo and clear',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'English',exact:true}).click();await page.getByTestId('edit-player-flag').click();
 await page.getByLabel('Flag type',{exact:true}).selectOption('custom');
 await page.getByTestId('flag-shape-brush').selectOption('triangle');
 const surface=page.getByTestId('flag-drawing-surface');await surface.scrollIntoViewIfNeeded();
 const box=(await surface.boundingBox())!;
 await page.mouse.move(box.x+box.width*.2,box.y+box.height*.2);await page.mouse.down();await page.mouse.move(box.x+box.width*.6,box.y+box.height*.7,{steps:6});await page.mouse.up();
 await expect(page.getByTestId('flag-shape-count')).toHaveText('1 / 24');
 await expect(page.locator('.flag-drawing-canvas .player-flag polygon')).toHaveCount(1);
 await page.getByTestId('flag-delete-shape').click();await expect(page.getByTestId('flag-shape-count')).toHaveText('0 / 24');
 await page.getByTestId('flag-undo').click();await expect(page.getByTestId('flag-shape-count')).toHaveText('1 / 24');
 await page.getByTestId('flag-clear-shapes').click();await expect(page.getByTestId('flag-shape-count')).toHaveText('0 / 24');
 await page.getByTestId('flag-undo').click();await expect(page.getByTestId('flag-shape-count')).toHaveText('1 / 24');
});
