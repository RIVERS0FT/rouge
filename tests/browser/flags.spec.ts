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

test('cloth previews stay animated with reduced motion while the drawing surface remains still',async({page})=>{
 await page.goto('/');await page.getByTestId('single-player').click();await page.getByTestId('edit-player-flag').click();
 await page.getByLabel('旗帜类型',{exact:true}).selectOption('custom');
 const preview=page.locator('.flag-controls .player-flag');await expect(preview).toHaveClass(/is-cloth/);
 // Every clip, gradient and href inside a banner resolves to an id of that same banner.
 const flags=await page.locator('.is-cloth').evaluateAll(nodes=>nodes.map(node=>({ids:[...node.querySelectorAll('[id]')].map(el=>el.id),
  refs:[...node.querySelectorAll('*')].flatMap(el=>[...el.attributes].map(a=>a.value.match(/^url\(#(.+)\)$/)?.[1]??(a.name==='href'&&a.value.startsWith('#')?a.value.slice(1):null)).filter(Boolean)),
  animation:getComputedStyle(node).animationName})));
 expect(flags.length).toBeGreaterThanOrEqual(1);
 const ids=flags.flatMap(flag=>flag.ids);expect(new Set(ids).size).toBe(ids.length);
 for(const flag of flags){expect(flag.animation).toBe('flag-billow');expect(flag.refs.length).toBeGreaterThan(0);for(const ref of flag.refs)expect(flag.ids).toContain(ref);}
 const before=await preview.evaluate(node=>getComputedStyle(node).transform);
 await expect.poll(()=>preview.evaluate(node=>getComputedStyle(node).transform)).not.toBe(before);
 await expect(page.locator('.flag-drawing-canvas .player-flag')).not.toHaveClass(/is-cloth/);
 await expect(page.locator('.flag-drawing-canvas .player-flag')).toHaveAttribute('viewBox','0 0 90 60');
 await page.emulateMedia({reducedMotion:'reduce'});
 await expect.poll(()=>preview.evaluate(node=>getComputedStyle(node).animationName)).toBe('flag-billow');
 const reducedTransform=await preview.evaluate(node=>getComputedStyle(node).transform);
 await expect.poll(()=>preview.evaluate(node=>getComputedStyle(node).transform)).not.toBe(reducedTransform);
 const canvas=preview.locator('canvas');
 const pixels=await canvas.evaluate(node=>(node as HTMLCanvasElement).toDataURL());
 await expect.poll(()=>canvas.evaluate(node=>(node as HTMLCanvasElement).toDataURL())).not.toBe(pixels);
 await expect(preview).toBeVisible();await page.screenshot({path:'artifacts/cloth-flags-reduced-motion.png'});
});

test('every computer faction flies a distinct real flag beside its name',async({page})=>{
 await page.goto('/');await page.getByTestId('single-player').click();
 await page.getByTestId('setup-ai-count').fill('7');await page.getByTestId('begin-campaign').click();
 await expect(page.locator('.app')).toHaveAttribute('data-local-ready','true',{timeout:60000});
 await expect(page.getByTestId('province-owner-name')).toHaveText('指挥官');
 await expect(page.locator('#province-panel .owner-swatch>svg[role="img"]')).toHaveAttribute('aria-label','中国');
 await page.getByTestId('outliner-all-nations').click();
 await expect(page.locator('#nations-panel .nation-row')).toHaveCount(8);
 const names=await page.locator('#nations-panel .faction-swatch>svg[role="img"]').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('aria-label')));
 expect(names).toHaveLength(8);expect(names.every(name=>name&&name!=='自定义旗帜')).toBe(true);expect(new Set(names).size).toBe(8);
});
