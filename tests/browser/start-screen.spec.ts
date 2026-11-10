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
   const start=await bounds(page.getByTestId('single-player'),width,height);
   expect(start.x>=portrait.x+portrait.width||start.y+start.height<=portrait.y).toBe(true);
   await leader.tap();await page.getByTestId('choose-leader-steward').tap();await page.getByRole('button',{name:'关闭',exact:true}).tap();await expect(leader).toBeFocused();
   await page.screenshot({path:`artifacts/start-screen-${width}x${height}.png`});
   await page.getByTestId('single-player').tap();const card=page.getByTestId('choose-unit-cavalry');await card.tap();
   await expect(card).toHaveAttribute('aria-pressed','true');await bounds(page.getByRole('tooltip'),width,height);await expect(page.getByRole('tooltip').locator('.unit-attribute')).toHaveCount(9);
   await page.screenshot({path:`artifacts/unit-tooltip-${width}x${height}.png`});
   await page.keyboard.press('Escape');await expect(page.getByRole('tooltip')).toHaveCount(0);
   await card.tap();await expect(page.getByRole('tooltip')).toBeVisible();await card.tap();await expect(page.getByRole('tooltip')).toHaveCount(0);
   await page.getByTestId('begin-campaign').tap();await expect(page.getByTestId('commander-portrait')).toHaveAttribute('data-leader','steward');
  }
 });
});
