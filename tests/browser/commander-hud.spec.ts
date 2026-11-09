import { test, expect, type Page } from '@playwright/test';

async function assertLayout(page: Page) {
  const flag=await page.getByTestId('faction-identity').boundingBox();
  const portrait=await page.getByTestId('commander-portrait').boundingBox();
  const panel=await page.locator('.province-panel').boundingBox();
  await expect(page.locator('.hud-bottom')).toHaveCount(0);
  const name=await page.locator('.commander-portrait-copy h2').boundingBox();
  const talent=await page.getByTestId('portrait-talents').boundingBox();
  const viewport=page.viewportSize()!;
  expect(flag).not.toBeNull();expect(portrait).not.toBeNull();
  if(await page.getByTestId('toggle-province-panel').isVisible()){
    // Compact layouts intentionally collapse the side panel and move the portrait
    // beside search. Verify reachable functionality, not desktop-only placement.
    const toggle=page.getByTestId('toggle-province-panel');
    await expect(toggle).toHaveAttribute('aria-expanded','false');
    await expect(page.locator('.province-panel')).toBeHidden();
    expect(flag!.x).toBeLessThan(45);expect(flag!.y).toBeLessThan(40);
    for(const locator of [page.getByTestId('commander-portrait'),page.getByTestId('portrait-talents'),page.getByTestId('mobile-talents'),toggle]){
      const box=await locator.boundingBox();expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThanOrEqual(44);expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.x+box!.width).toBeLessThanOrEqual(viewport.width);
      expect(box!.y+box!.height).toBeLessThanOrEqual(viewport.height);
    }
    await toggle.click();await expect(toggle).toHaveAttribute('aria-expanded','true');
    await expect(page.locator('.province-panel')).toBeVisible();
    const expanded=await page.locator('.province-panel').boundingBox(),control=await toggle.boundingBox();
    expect(expanded!.x).toBeGreaterThanOrEqual(0);expect(expanded!.y).toBeGreaterThanOrEqual(0);
    expect(expanded!.x+expanded!.width).toBeLessThanOrEqual(viewport.width);
    expect(expanded!.y+expanded!.height).toBeLessThanOrEqual(control!.y);
    await toggle.click();await expect(page.locator('.province-panel')).toBeHidden();
    await page.getByTestId('mobile-talents').click();await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
    return;
  }
  expect(panel).not.toBeNull();
  expect(flag!.x).toBeLessThan(45);expect(flag!.y).toBeLessThan(40);
  expect(portrait!.x).toBeLessThan(40);expect(portrait!.y).toBeGreaterThan(viewport.height*.5);
  expect(panel!.y+panel!.height).toBeLessThanOrEqual(portrait!.y-10);
  expect(portrait!.y+portrait!.height).toBeLessThanOrEqual(viewport.height-8);
  expect(portrait!.x+portrait!.width).toBeLessThan(viewport.width);
  expect(name).not.toBeNull();expect(talent).not.toBeNull();
  expect(name!.x+name!.width).toBeLessThanOrEqual(talent!.x-8);
  await expect(page.locator('.commander-portrait-copy h2')).toHaveAttribute('title',/\S/);
}

for (const [leader,index] of [['warden',0],['vanguard',1],['steward',2]] as const) {
  test(`HUD ${leader}: half-body portrait, stable faction identity, responsive layout and talent entry`,async({page})=>{
    test.setTimeout(150000);
    const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('/');await expect(page.locator('canvas')).toHaveAttribute('data-ready','true',{timeout:30000});
    await expect(page.getByTestId('commander-portrait')).toHaveCount(0);
    await expect(page.getByTestId('country-flag')).toHaveCount(0);
    await page.getByTestId('single-player').click();await page.locator('.leader-card').nth(index).click();
    await page.getByTestId('commander-name').fill(`HUD ${leader}`);await page.getByTestId('begin-campaign').click();
    await expect(page.getByTestId('commander-portrait')).toHaveAttribute('data-leader',leader);
    await expect(page.getByTestId('leader-bust')).toHaveAttribute('data-leader',leader);
    await expect(page.getByTestId('leader-bust')).toHaveAttribute('role','img');
    await expect(page.getByTestId('country-flag')).toHaveCount(0);await expect(page.getByTestId('faction-identity')).toHaveAttribute('data-actor','0');
    await expect(page.getByTestId('faction-identity')).toContainText('阵营 1');
    await page.keyboard.press('Space');await page.locator('canvas').focus();await page.keyboard.press('Home');
    await expect(page.locator('canvas')).toHaveAttribute('data-settled','true',{timeout:15000});
    await assertLayout(page);await page.screenshot({path:`artifacts/hud-${leader}-1440.png`});
    // Browsing another country must not change either local-player identity element.
    await page.getByTestId('map-search').fill('江苏');await page.locator('.map-search-results button').first().click();
    await expect(page.locator('.province-panel h2')).toContainText('江苏');
    await expect(page.getByTestId('country-flag')).toHaveCount(0);await expect(page.getByTestId('faction-identity')).toHaveAttribute('data-actor','0');
    await expect(page.getByTestId('commander-portrait')).toHaveAttribute('data-leader',leader);
    await page.getByTestId('open-settings').click();await page.getByRole('button',{name:'English',exact:true}).click();await page.getByTestId('settings-resume').click();
    await expect(page.getByTestId('faction-identity')).toContainText('Faction 1');
    await assertLayout(page);
    await page.getByTestId('portrait-talents').click();await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.setViewportSize({width:1280,height:720});await assertLayout(page);
    await page.screenshot({path:`artifacts/hud-${leader}-1280.png`});
    await page.setViewportSize({width:800,height:600});await assertLayout(page);
    await page.setViewportSize({width:1440,height:960});
    if(leader==='steward') {
      await page.getByTestId('open-settings').click();await page.getByTestId('settings-save').click();
      await page.getByPlaceholder('Save name').fill('HUD preserved');await page.getByTestId('create-save').click();
      await page.reload();await page.getByTestId('open-saves').click();
      await page.locator('.save-card').filter({hasText:'HUD preserved'}).getByRole('button',{name:'Load',exact:true}).click();
      await expect(page.getByTestId('commander-portrait')).toHaveAttribute('data-leader','steward');
      await expect(page.getByTestId('country-flag')).toHaveCount(0);await expect(page.getByTestId('faction-identity')).toHaveAttribute('data-actor','0');
    }
    expect(errors).toEqual([]);
  });
}
