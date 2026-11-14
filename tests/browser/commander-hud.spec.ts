import {openMapSearch} from './map-search.ts';
import { test, expect, type Page } from '@playwright/test';

async function assertLayout(page: Page) {
  const flag=await page.getByTestId('faction-identity').boundingBox();
  const portrait=await page.getByTestId('commander-portrait').boundingBox();
  // Compact viewports keep side panels closed initially.
  await expect(page.locator('.hud-bottom')).toHaveCount(0);
  const name=await page.locator('.commander-portrait-copy h2').boundingBox();
  const talent=await page.getByTestId('portrait-talents').boundingBox();
  const rank=(await page.getByTestId('commander-level').boundingBox())!;
  const viewport=page.viewportSize()!;
  await expect(page.locator('.commander-player')).toBeVisible();
  expect(name).not.toBeNull();expect(talent).not.toBeNull();
  expect(name!.x).toBeGreaterThanOrEqual(portrait!.x);
  expect(name!.x+name!.width).toBeLessThanOrEqual(portrait!.x+portrait!.width);
  expect(name!.y).toBeGreaterThanOrEqual(portrait!.y);
  expect(name!.y+name!.height).toBeLessThanOrEqual(portrait!.y+portrait!.height);
  expect(rank.x).toBeGreaterThanOrEqual(portrait!.x);
  expect(rank.x+rank.width).toBeLessThanOrEqual(portrait!.x+portrait!.width);
  expect(rank.y).toBeGreaterThanOrEqual(portrait!.y);
  expect(rank.y+rank.height).toBeLessThanOrEqual(portrait!.y+portrait!.height);
  expect(talent!.width).toBeGreaterThanOrEqual(portrait!.width-2);
  expect(talent!.height).toBeGreaterThanOrEqual(portrait!.height-2);
  await expect(page.locator('.commander-player')).toHaveAttribute('title',/\S/);
  expect(flag).not.toBeNull();expect(portrait).not.toBeNull();
  if(await page.locator('.app').getAttribute('data-layout')==='compact'){
    // On compact layouts the panels start closed, but their desktop anchors
    // and the framed portrait stay in place.
    const toggle=page.getByTestId('toggle-province-panel');
    await expect(toggle).toHaveAttribute('aria-expanded','false');
    await expect(page.locator('.province-panel')).toBeHidden();
    expect(flag!.x).toBeLessThan(45);expect(flag!.y).toBeLessThan(40);
    const rail=(await page.locator('.hud-rail').boundingBox())!;
    expect(rail.x).toBeCloseTo(portrait!.x);
    expect(rail.y+rail.height).toBeLessThan(portrait!.y);
    expect(portrait!.width).toBeLessThanOrEqual(124);
    expect(viewport.height-portrait!.y-portrait!.height).toBe(8);
    for(const locator of [page.getByTestId('commander-portrait'),page.getByTestId('portrait-talents'),page.getByTestId('mobile-talents'),toggle]){
      const box=await locator.boundingBox();expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThanOrEqual(44);expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.x+box!.width).toBeLessThanOrEqual(viewport.width);
      expect(box!.y+box!.height).toBeLessThanOrEqual(viewport.height);
    }
    await toggle.click();await expect(toggle).toHaveAttribute('aria-expanded','true');
    await expect(page.locator('.province-panel')).toBeVisible();
    const expanded=(await page.locator('.province-panel').boundingBox())!;
    expect(expanded.x).toBeGreaterThan(rail.x+rail.width);
    expect(expanded.y).toBeCloseTo(rail.y);
    expect(expanded.x+expanded.width).toBeLessThanOrEqual(viewport.width);
    expect(expanded.y+expanded.height).toBeLessThan(portrait!.y);
    const close=(await page.locator('.province-panel .dock-close').boundingBox())!;
    expect(close.width).toBeGreaterThanOrEqual(44);
    expect(close.height).toBeGreaterThanOrEqual(44);
    await toggle.click();await expect(page.locator('.province-panel')).toBeHidden();
    await page.getByTestId('mobile-talents').click();await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
    return;
  }
  const panel=await page.locator('.province-panel').boundingBox();expect(panel).not.toBeNull();
  expect(flag!.x).toBeLessThan(45);expect(flag!.y).toBeLessThan(40);
  expect(portrait!.x).toBeLessThan(40);expect(portrait!.y).toBeGreaterThan(viewport.height*.5);
  expect(panel!.y+panel!.height).toBeLessThanOrEqual(portrait!.y-10);
  expect(portrait!.y+portrait!.height).toBeLessThanOrEqual(viewport.height-8);
  expect(portrait!.x+portrait!.width).toBeLessThan(viewport.width);

}

for (const leader of ['warden','vanguard','steward'] as const) {
  test(`HUD ${leader}: half-body portrait, stable faction identity, responsive layout and talent entry`,async({page})=>{
    test.setTimeout(180000);
    const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('/');await expect(page.locator('.world canvas')).toHaveAttribute('data-ready','true',{timeout:30000});
    await expect(page.getByTestId('commander-portrait')).toHaveCount(0);
    await expect(page.getByTestId('country-flag')).toHaveCount(0);
    await page.getByTestId('single-player').click();await page.getByTestId('edit-player-leader').click();await page.getByTestId(`choose-leader-${leader}`).click();
    await page.keyboard.press('Escape');
    const playerName=leader==='steward'?'Alexandra 王 Commander 88':`HUD ${leader}`;
    await page.getByTestId('commander-name').fill(playerName);await page.getByTestId('begin-campaign').click();
    await expect(page.getByTestId('commander-portrait')).toHaveAttribute('data-leader',leader);
    await expect(page.locator('.commander-player')).toHaveText(playerName);
    await expect(page.getByTestId('commander-level')).toHaveAccessibleName('等级 1');
    await expect(page.locator('.commander-experience,.commander-portrait .eyebrow')).toHaveCount(0);
    await expect(page.getByTestId('leader-bust')).toHaveAttribute('data-leader',leader);
    await expect(page.getByTestId('leader-bust')).toHaveAttribute('role','img');
    await expect(page.getByTestId('leader-bust')).toHaveAttribute('src',new RegExp(`${leader}.*\\.webp`));
    await expect(page.getByTestId('leader-bust')).toHaveJSProperty('complete',true);
    await expect(page.getByTestId('leader-bust')).toHaveJSProperty('naturalWidth',720);
    await expect(page.getByTestId('leader-bust')).toHaveAttribute('alt',/\S/);
    await expect(page.getByTestId('country-flag')).toHaveCount(0);await expect(page.getByTestId('faction-identity')).toHaveAttribute('data-actor','0');
    await expect(page.locator('.hud-top .faction-copy,.hud-top .commander-badge')).toHaveCount(0);
    // The HUD renders before the worker is ready. Do not activate the startup
    // dialog's focused Cancel button with Space.
    await expect(page.locator('.app')).toHaveAttribute('data-local-ready','true',{timeout:60000});
    await page.locator('.world canvas').focus();await page.keyboard.press('Space');
    await expect(page.getByTestId('toggle-pause')).toHaveText('▶');
    await page.keyboard.press('Home');
    await expect(page.locator('.world canvas')).toHaveAttribute('data-settled','true',{timeout:15000});
    await assertLayout(page);await page.screenshot({path:`artifacts/hud-${leader}-1440.png`});
    // Browsing another country must not change either local-player identity element.
    await openMapSearch(page);await page.getByTestId('map-search').fill('江苏');await page.locator('.map-search-results button').first().click();
    await expect(page.locator('.province-panel h2')).toContainText('江苏');
    await expect(page.getByTestId('country-flag')).toHaveCount(0);await expect(page.getByTestId('faction-identity')).toHaveAttribute('data-actor','0');
    await expect(page.getByTestId('commander-portrait')).toHaveAttribute('data-leader',leader);
    await page.getByTestId('open-settings').click();await page.getByRole('button',{name:'English',exact:true}).click();await page.getByTestId('settings-resume').click();
    await expect(page.locator('.hud-top .faction-copy,.hud-top .commander-badge')).toHaveCount(0);
    await assertLayout(page);
    await expect(page.locator('.commander-player')).toHaveText(playerName);
    await expect(page.getByTestId('commander-level')).toHaveAccessibleName('Level 1');
    await expect(page.getByTestId('portrait-talents')).toHaveAccessibleName(`${playerName} · View leader talents`);
    await expect(page.getByTestId('portrait-talents')).toHaveAttribute('title',`${playerName} · View leader talents`);
    await page.getByTestId('portrait-talents').focus();await page.keyboard.press('Enter');await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByTestId('portrait-talents')).toBeFocused();
    await page.keyboard.press('Space');await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button',{name:'Close',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByTestId('portrait-talents')).toBeFocused();
    await page.setViewportSize({width:1280,height:720});await assertLayout(page);
    await page.screenshot({path:`artifacts/hud-${leader}-1280.png`});
    await page.setViewportSize({width:800,height:600});await assertLayout(page);
    if(leader==='steward')for(const size of [{width:390,height:844},{width:667,height:375},{width:320,height:568}]){
      await page.setViewportSize(size);await assertLayout(page);
      const portrait=await page.getByTestId('commander-portrait').boundingBox(),upgrades=await page.getByTestId('open-upgrades').boundingBox();
      // Left rail controls always end above the bottom-left commander card.
      expect(upgrades!.y+upgrades!.height).toBeLessThan(portrait!.y);
      await expect(page.locator('.commander-player')).toHaveText(playerName);
      await page.getByTestId('portrait-talents').click();await expect(page.getByRole('dialog')).toBeVisible();
      await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
      await page.screenshot({path:`artifacts/hud-player-${size.width}x${size.height}.png`});
    }
    await page.setViewportSize({width:1440,height:960});
    if(leader==='steward') {
      await page.getByTestId('open-settings').click();await page.getByTestId('settings-save').click();
      await page.getByPlaceholder('Save name').fill('HUD preserved');await page.getByTestId('create-save').click();
      await page.reload();await page.getByTestId('open-saves').click();
      await page.locator('.save-card').filter({hasText:'HUD preserved'}).getByRole('button',{name:'Load',exact:true}).click();
      await expect(page.getByTestId('commander-portrait')).toHaveAttribute('data-leader','steward');
      await expect(page.locator('.commander-player')).toHaveText(playerName);
      await expect(page.getByTestId('country-flag')).toHaveCount(0);await expect(page.getByTestId('faction-identity')).toHaveAttribute('data-actor','0');
    }
    expect(errors).toEqual([]);
  });
}
