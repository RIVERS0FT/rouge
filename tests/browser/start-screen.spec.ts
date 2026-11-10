import {test,expect,type Locator} from '@playwright/test';

async function bounds(locator:Locator,width:number,height:number){
 const box=await locator.boundingBox();expect(box).not.toBeNull();
 expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.y).toBeGreaterThanOrEqual(0);
 expect(box!.x+box!.width).toBeLessThanOrEqual(width+1);expect(box!.y+box!.height).toBeLessThanOrEqual(height+1);
 return box!;
}

test('menu identity anchors stay in the left corners and edits are not repeated before matches',async({page})=>{
 await page.goto('/');
 const flag=page.getByTestId('edit-player-flag'),leader=page.getByTestId('edit-player-leader');
 const flagBox=await bounds(flag,1440,960),leaderBox=await bounds(leader,1440,960);
 const menu=await bounds(page.locator('.menu-content'),1440,960);expect(menu.x).toBeGreaterThan(900);
 expect(await page.locator('.map-vignette').evaluate(el=>getComputedStyle(el).backgroundImage)).toContain('270deg');
 expect(flagBox.x).toBeLessThan(40);expect(flagBox.y).toBeLessThan(40);
 expect(leaderBox.x).toBeLessThan(40);expect(leaderBox.y+leaderBox.height).toBeGreaterThan(920);
 await flag.click();await page.getByLabel('旗帜类型',{exact:true}).selectOption('fr');await page.keyboard.press('Escape');await expect(flag).toBeFocused();
 await leader.click();await page.getByTestId('choose-leader-vanguard').click();await page.keyboard.press('Escape');await expect(leader).toBeFocused();
 await expect(leader).toHaveAttribute('data-leader','vanguard');
 await page.reload();await expect(leader).toHaveAttribute('data-leader','vanguard');
 await expect(flag.getByRole('img',{name:'法国',exact:true})).toBeVisible();
 await page.screenshot({path:'artifacts/start-screen-desktop.png'});
 await page.getByTestId('single-player').click();
 await expect(page.locator('.leader-grid,.flag-editor')).toHaveCount(0);
 await expect(page.getByTestId('choose-unit-infantry')).toBeVisible();
 await page.keyboard.press('Escape');
 await page.getByRole('button',{name:/局域网联机/}).click();
 await expect(page.locator('.leader-grid,.flag-editor')).toHaveCount(0);
 await expect(page.getByTestId('choose-unit-infantry')).toBeVisible();
});

test('unit tooltip is external to the button, keyboard dismissible and mouse hoverable',async({page})=>{
 await page.goto('/');await page.getByTestId('single-player').click();
 const card=page.getByTestId('choose-unit-infantry');await card.focus();
 const tooltip=page.getByTestId('unit-tooltip-infantry');
 await expect(card.locator(':scope > *')).toHaveCount(2);await expect(card.locator('svg')).toHaveCount(1);
 await expect(card.locator('.unit-attribute')).toHaveCount(0);await expect(tooltip.locator('.unit-attribute')).toHaveCount(9);
 await expect(card).toHaveAttribute('aria-describedby','unit-tooltip-infantry');
 const box=await card.boundingBox(),name=await card.locator('.unit-name').boundingBox();expect(name!.x-box!.x).toBeLessThan(20);expect(name!.y-box!.y).toBeLessThan(20);
 await page.keyboard.press('Escape');await expect(tooltip).toHaveCount(0);await expect(page.getByRole('dialog')).toBeVisible();
 await page.getByTestId('commander-name').focus();await card.hover();await expect(tooltip).toBeVisible();await tooltip.hover();await page.waitForTimeout(180);await expect(tooltip).toBeVisible();
 await page.keyboard.press('Escape');await expect(tooltip).toHaveCount(0);await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByTestId('single-player')).toBeFocused();
});

test.describe('touch identity and unit selection',()=>{
 test.use({hasTouch:true,isMobile:true});
 test('phone corners, editor focus return and tooltip stay within the screen',async({page})=>{
  test.setTimeout(180000);
  for(const [width,height] of [[390,844],[360,640],[844,390]]){
   await page.setViewportSize({width,height});await page.goto('/');
   const flag=page.getByTestId('edit-player-flag'),leader=page.getByTestId('edit-player-leader');
   await bounds(flag,width,height);const portrait=await bounds(leader,width,height);
   expect(portrait.x).toBeLessThan(24);expect(portrait.y+portrait.height).toBeGreaterThan(height-30);
   await page.getByTestId('single-player').scrollIntoViewIfNeeded();const start=await bounds(page.getByTestId('single-player'),width,height);
   expect(start.x).toBeGreaterThan(portrait.x+portrait.width);
   expect(start.x+start.width).toBeGreaterThan(width*.85);
   expect(await page.locator('.map-vignette').evaluate(el=>getComputedStyle(el).backgroundImage)).toContain('270deg');
   await leader.tap();expect(await page.locator('.leader-grid').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBe(3);await page.getByTestId('choose-leader-steward').tap();await page.getByRole('button',{name:'关闭',exact:true}).tap();await expect(leader).toBeFocused();
   await page.screenshot({path:`artifacts/start-screen-${width}x${height}.png`});
   await page.getByTestId('single-player').tap();expect(await page.locator('.unit-grid').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBe(4);const card=page.getByTestId('choose-unit-cavalry');await card.tap();
   await expect(card).toHaveAttribute('aria-pressed','true');const tip=await bounds(page.getByRole('tooltip'),width,height),trigger=await card.boundingBox();
   expect(tip.y+tip.height<=trigger!.y||tip.y>=trigger!.y+trigger!.height).toBe(true);await expect(page.getByRole('tooltip').locator('.unit-attribute')).toHaveCount(9);
   await page.screenshot({path:`artifacts/unit-tooltip-${width}x${height}.png`});
   await page.keyboard.press('Escape');await expect(page.getByRole('tooltip')).toHaveCount(0);
   await card.tap();await expect(page.getByRole('tooltip')).toBeVisible();await card.tap();await expect(page.getByRole('tooltip')).toHaveCount(0);
   await page.getByTestId('begin-campaign').tap();await expect(page.getByTestId('commander-portrait')).toHaveAttribute('data-leader','steward');
  }
 });
});

test('home settings safely return focus and offer archives without an active match',async({page})=>{
 await page.goto('/');
 const trigger=page.getByTestId('home-settings');
 await trigger.click();
 await expect(page.locator('.settings-status,.settings-leave')).toHaveCount(0);
 await page.getByRole('dialog').getByRole('button',{name:'English',exact:true}).click();
 await expect(page.getByTestId('settings-resume')).toHaveText(/Return to menu/);
 await page.getByTestId('settings-save').click();
 await expect(page.getByTestId('create-save')).toHaveCount(0);
 await page.keyboard.press('Escape');await expect(page.getByTestId('settings-resume')).toBeVisible();
 await page.keyboard.press('Escape');await expect(trigger).toBeFocused();
 await trigger.click();await page.getByTestId('settings-resume').click();await expect(trigger).toBeFocused();
 await expect(page.getByTestId('single-player')).toBeVisible();
});

test('numeric opponents show physical range and reject empty, fractional and out-of-range drafts',async({page})=>{
 await page.goto('/');await page.getByTestId('single-player').click();
 const input=page.getByTestId('setup-ai-count'),start=page.getByTestId('begin-campaign');
 await expect(input).toHaveAttribute('type','number');
 const maximum=Number(await input.getAttribute('max'));expect(maximum).toBeGreaterThan(3);
 await expect(input).toHaveAttribute('placeholder',new RegExp(`1–${maximum}`));
 for(const value of ['', '-1', '1.5',String(maximum+1)]){
  await input.fill(value);await expect(start).toBeDisabled();await expect(input).toHaveAttribute('aria-invalid','true');
 }
 await input.fill('4');await expect(start).toBeEnabled();
 await input.fill(String(maximum));await expect(start).toBeEnabled();
 await input.fill('4');await start.click();await expect(page.getByTestId('open-settings')).toBeVisible();
});
