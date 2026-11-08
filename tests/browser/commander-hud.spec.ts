import { test, expect, type Page } from '@playwright/test';

async function assertLayout(page: Page) {
  const flag=await page.getByTestId('country-identity').boundingBox();
  const portrait=await page.getByTestId('commander-portrait').boundingBox();
  const panel=await page.locator('.province-panel').boundingBox();
  const footer=await page.locator('.hud-bottom').boundingBox();
  const viewport=page.viewportSize()!;
  expect(flag).not.toBeNull();expect(portrait).not.toBeNull();expect(panel).not.toBeNull();expect(footer).not.toBeNull();
  expect(flag!.x).toBeLessThan(45);expect(flag!.y).toBeLessThan(40);
  expect(portrait!.x).toBeLessThan(40);expect(portrait!.y).toBeGreaterThan(viewport.height*.5);
  expect(panel!.y+panel!.height).toBeLessThanOrEqual(portrait!.y-10);
  expect(portrait!.y+portrait!.height).toBeLessThanOrEqual(footer!.y-8);
  expect(portrait!.x+portrait!.width).toBeLessThan(viewport.width);
}

for (const [leader,index,name] of [['warden',0,'Iron Warden'],['vanguard',1,'Vanguard'],['steward',2,'Quartermaster']] as const) {
  test(`HUD ${leader}: half-body portrait, stable flag, responsive layout and talent entry`,async({page})=>{
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
    await expect(page.getByTestId('country-flag')).toHaveAttribute('data-country','DEU');
    await expect(page.getByTestId('country-flag')).toHaveAccessibleName('德国 · 国旗');
    await page.keyboard.press('Space');await page.getByRole('button',{name:'2D',exact:true}).click();
    await expect(page.locator('canvas')).toHaveAttribute('data-settled','true',{timeout:15000});
    await assertLayout(page);await page.screenshot({path:`artifacts/hud-${leader}-1440.png`});
    // Browsing another country must not change either local-player identity element.
    await page.getByTestId('map-search').fill('江苏');await page.locator('.map-search-results button').first().click();
    await expect(page.locator('.province-panel h2')).toContainText('江苏');
    await expect(page.getByTestId('country-flag')).toHaveAttribute('data-country','DEU');
    await expect(page.getByTestId('commander-portrait')).toHaveAttribute('data-leader',leader);
    await page.getByRole('button',{name:'English',exact:true}).click();
    await expect(page.getByTestId('country-flag')).toHaveAccessibleName('Germany · National flag');
    await page.getByTestId('portrait-talents').click();await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.setViewportSize({width:1280,height:720});await assertLayout(page);
    await page.screenshot({path:`artifacts/hud-${leader}-1280.png`});
    await page.setViewportSize({width:800,height:600});await assertLayout(page);
    await page.setViewportSize({width:1440,height:960});
    if(leader==='steward') {
      await page.getByRole('button',{name:'Save campaign',exact:false}).click();
      await page.getByPlaceholder('Save name').fill('HUD preserved');await page.getByTestId('create-save').click();
      await page.reload();await page.getByTestId('open-saves').click();
      await page.locator('.save-card').filter({hasText:'HUD preserved'}).getByRole('button',{name:'Load',exact:true}).click();
      await expect(page.getByTestId('commander-portrait')).toHaveAttribute('data-leader','steward');
      await expect(page.getByTestId('country-flag')).toHaveAttribute('data-country','DEU');
    }
    expect(errors).toEqual([]);
  });
}
