import {test,expect} from '@playwright/test';
test('cosmetic leader choice and custom flag survive close/reopen and appear in game',async({page})=>{
 await page.goto('/');await page.getByTestId('single-player').click();await page.getByTestId('edit-player-leader').click();
 await expect(page.locator('.leader-copy>b')).toContainText(['铁壁统帅','机动先锋','军需总监']);
 await expect(page.locator('.leader-copy p')).toHaveCount(0);
 await page.keyboard.press('Escape');await page.getByTestId('edit-player-flag').click();
 await page.getByLabel('旗帜类型',{exact:true}).selectOption('custom');
 await page.getByLabel('旗帜图案',{exact:true}).selectOption('cross');
 await page.getByLabel('旗帜颜色 1',{exact:true}).fill('#112233');
 await page.keyboard.press('Escape');await page.getByTestId('edit-player-flag').click();
 await expect(page.getByLabel('旗帜图案',{exact:true})).toHaveValue('cross');
 await expect(page.getByLabel('旗帜颜色 1',{exact:true})).toHaveValue('#112233');
 await page.keyboard.press('Escape');
 await page.getByTestId('begin-campaign').click();
 await expect(page.getByTestId('faction-identity').getByRole('img',{name:'自定义旗帜',exact:true})).toBeVisible();
 await expect(page.getByTestId('commander-portrait')).toBeVisible();
});
test('all national presets are selectable and editor fits mobile landscape',async({page})=>{
 await page.setViewportSize({width:844,height:390});await page.goto('/');await page.getByTestId('single-player').click();await page.getByTestId('edit-player-flag').click();
 for(const id of ['cn','fr','de','it','jp','gb','us','ch']){
  await page.getByLabel('旗帜类型',{exact:true}).selectOption(id);
  await expect(page.getByTestId('flag-editor').getByRole('img')).toBeVisible();
 }
 await page.keyboard.press('Escape');
 await page.getByTestId('begin-campaign').click();await expect(page.getByTestId('faction-identity').getByRole('img',{name:'瑞士',exact:true})).toBeVisible();
});

test('cloth previews animate while reduced motion and the drawing surface remain still',async({page})=>{
 await page.goto('/');await page.getByTestId('single-player').click();await page.getByTestId('edit-player-flag').click();
 await page.getByLabel('旗帜类型',{exact:true}).selectOption('custom');
 const preview=page.locator('.flag-controls .player-flag');await expect(preview).toHaveClass(/is-cloth/);
 const flags=await page.locator('.is-cloth').evaluateAll(nodes=>nodes.map(node=>({ids:[...node.querySelectorAll('[id]')].map(el=>el.id),filter:node.querySelector('g[filter]')!.getAttribute('filter'),animation:getComputedStyle(node).animationName})));
 expect(flags.length).toBeGreaterThanOrEqual(1);
 const ids=flags.flatMap(flag=>flag.ids);expect(new Set(ids).size).toBe(ids.length);
 for(const flag of flags){expect(flag.animation).toBe('flag-billow');expect(ids).toContain(flag.filter!.slice(5,-1));}
 const before=await preview.evaluate(node=>getComputedStyle(node).transform);
 await expect.poll(()=>preview.evaluate(node=>getComputedStyle(node).transform)).not.toBe(before);
 await expect(page.locator('.flag-drawing-canvas .player-flag')).not.toHaveClass(/is-cloth/);
 await expect(page.locator('.flag-drawing-canvas .player-flag')).toHaveAttribute('viewBox','0 0 90 60');
 await page.emulateMedia({reducedMotion:'reduce'});
 expect(await preview.evaluate(node=>node.getAnimations({subtree:true}).length)).toBe(0);
 await expect(preview).toBeVisible();await page.screenshot({path:'artifacts/cloth-flags-reduced-motion.png'});
});
