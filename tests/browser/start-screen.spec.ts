import {waitForRuntime} from './readiness.ts';
import {test,expect,type Locator,type Page} from '@playwright/test';

async function bounds(locator:Locator,width:number,height:number){
 const box=await locator.boundingBox();expect(box).not.toBeNull();
 expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.y).toBeGreaterThanOrEqual(0);
 expect(box!.x+box!.width).toBeLessThanOrEqual(width+1);expect(box!.y+box!.height).toBeLessThanOrEqual(height+1);
 return box!;
}

// Hold the actual shared data responses, not a fake timeout or a readiness flag.
// The same pattern works for dev URLs and hashed production asset URLs.
const sharedMapData=/\/(?:world|terrain-navigation)(?:-[A-Za-z0-9_-]+)?\.json(?:\?|$)/;
async function delaySharedMapData(page:Page){
 const requested=new Set<string>();let release!:()=>void;
 const gate=new Promise<void>(resolve=>{release=resolve;});
 await page.route(sharedMapData,async route=>{
  if(route.request().resourceType()==='fetch'){
   requested.add(new URL(route.request().url()).pathname);
   await gate;
  }
  await route.continue();
 });
 return {requested,release};
}

test('minimal menu renders before game modules and preserves language without storage',async({page})=>{
 let release!:()=>void,gameRequested=false;
 const gate=new Promise<void>(resolve=>{release=resolve;}),requests:string[]=[];
 await page.addInitScript(()=>{Storage.prototype.setItem=()=>{throw new DOMException('Storage unavailable','QuotaExceededError');};});
 page.on('request',request=>requests.push(request.url()));
 await page.route(/\/(?:src\/ui\/App\.tsx|assets\/App-[^/]+\.js)(?:\?|$)/,async route=>{gameRequested=true;await gate;await route.continue();});
 try{
  await page.goto('/',{waitUntil:'domcontentloaded'});
  await expect(page.locator('.menu-content h1')).toHaveText('诸省之争');
  await expect(page.getByTestId('single-player')).toBeEnabled();
  await expect.poll(()=>gameRequested).toBe(true);
  expect(requests.filter(url=>sharedMapData.test(url)||/three(?:\.js|\/)|\/leaders\//.test(url))).toEqual([]);
  await page.getByRole('button',{name:'English',exact:true}).click();await expect(page).toHaveTitle('ROUGE');
  await page.getByTestId('single-player').click();await expect(page.getByTestId('resource-loading')).toBeVisible();
  await page.keyboard.press('Escape');await expect(page.getByTestId('single-player')).toBeFocused();
  release();
  await expect(page.locator('.app')).toHaveAttribute('data-resource-state','ready',{timeout:30000});
  await expect(page.locator('html')).toHaveAttribute('lang','en');await expect(page).toHaveTitle('ROUGE');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByTestId('single-player')).toBeFocused();
 }finally{release();}
});

test('menu and settings work before shared assets arrive and the latest early action wins',async({page})=>{
 const loading=await delaySharedMapData(page),errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 try{
  await page.goto('/',{waitUntil:'domcontentloaded'});
  await expect(page.locator('.menu-content h1')).toHaveText('诸省之争');
  await expect(page.getByTestId('single-player')).toBeEnabled();
  await expect.poll(()=>loading.requested.size).toBe(2);
  await expect(page.locator('.app')).toHaveAttribute('data-resource-state','loading');
  await expect(page.locator('.world canvas')).toHaveCount(0);
  await expect(page.getByTestId('edit-player-flag')).toHaveCount(0);
  await expect(page.getByTestId('edit-player-leader')).toHaveCount(0);
  await page.getByRole('button',{name:'English',exact:true}).click();
  await expect(page).toHaveTitle('ROUGE');await expect(page.locator('html')).toHaveAttribute('lang','en');
  await page.getByTestId('home-settings').click();
  await expect(page.getByTestId('settings-resume')).toHaveText(/Return to menu/);
  await page.getByTestId('settings-save').click();await expect(page.getByTestId('resource-loading')).toBeVisible();
  await page.keyboard.press('Escape');await expect(page.getByTestId('settings-resume')).toBeVisible();
  await page.keyboard.press('Escape');await expect(page.getByTestId('home-settings')).toBeFocused();
  await page.getByTestId('single-player').click();await expect(page.getByTestId('resource-loading')).toBeVisible();
  await page.keyboard.press('Escape');await expect(page.getByTestId('single-player')).toBeFocused();
  await page.getByRole('button',{name:/LAN multiplayer/}).click();
  await expect(page.getByTestId('resource-loading')).toBeVisible();
  loading.release();await waitForRuntime(page);
  await expect(page.getByRole('button',{name:'Create room',exact:true})).toBeVisible();
  await expect(page.getByTestId('begin-campaign')).toHaveCount(0);
  await expect(page.getByTestId('commander-name')).toHaveValue('Commander');
  await expect(page.getByTestId('resource-loading')).toHaveCount(0);
  await expect(page.locator('.leader-grid,.flag-editor')).toHaveCount(0);
  await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:/LAN multiplayer/})).toBeFocused();
  expect(errors).toEqual([]);
 }finally{loading.release();}
});

test('cancelled early setup does not reopen when background downloads finish',async({page})=>{
 const loading=await delaySharedMapData(page);
 try{
  await page.goto('/',{waitUntil:'domcontentloaded'});
  await page.getByTestId('single-player').click();await expect(page.getByTestId('resource-loading')).toBeVisible();
  await page.getByRole('button',{name:'关闭',exact:true}).click();
  await expect(page.getByTestId('single-player')).toBeFocused();
  await page.getByTestId('home-settings').click();
  await page.getByRole('dialog').getByRole('button',{name:'English',exact:true}).click();
  await expect.poll(()=>loading.requested.size).toBe(2);
  loading.release();
  await expect(page.locator('.world canvas')).toHaveAttribute('data-ready','true',{timeout:30000});
  await expect(page.getByTestId('settings-resume')).toBeVisible();
  await expect(page.getByTestId('commander-name')).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('lang','en');
  await page.keyboard.press('Escape');await expect(page.getByTestId('home-settings')).toBeFocused();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByTestId('single-player').click();await expect(page.getByTestId('commander-name')).toHaveValue('Commander');
 }finally{loading.release();}
});

test('failed shared downloads leave the menu usable and offer a working reload',async({page})=>{
 await page.route(sharedMapData,async route=>{
  if(route.request().resourceType()==='fetch')await route.fulfill({status:503,body:'Temporarily unavailable'});
  else await route.continue();
 });
 await page.goto('/',{waitUntil:'domcontentloaded'});
 await expect(page.locator('.app')).toHaveAttribute('data-resource-state','failed');
 await expect(page.getByTestId('reload-resources')).toBeVisible();
 await page.getByRole('button',{name:'English',exact:true}).click();await expect(page).toHaveTitle('ROUGE');
 await page.getByTestId('home-settings').click();await expect(page.getByTestId('settings-resume')).toBeVisible();
 await page.keyboard.press('Escape');await expect(page.getByTestId('home-settings')).toBeFocused();
 await page.unroute(sharedMapData);
 await page.getByTestId('reload-resources').click();
 await expect(page.locator('.world canvas')).toHaveAttribute('data-ready','true',{timeout:30000});
 await expect(page.getByTestId('single-player')).toBeVisible();
 await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('left-side menu keeps identity in setup and remembers appearance across matches',async({page})=>{
 await page.goto('/');await waitForRuntime(page);
 await expect(page.locator('.world canvas')).toHaveAttribute('data-ready','true',{timeout:30000});
 await expect(page.getByTestId('edit-player-flag')).toHaveCount(0);
 await expect(page.getByTestId('edit-player-leader')).toHaveCount(0);
 const menu=await bounds(page.locator('.menu-content'),1440,960);expect(menu.x).toBeLessThan(160);
 const title=await bounds(page.locator('.menu-content h1'),1440,960);expect(title.x).toBeLessThan(170);
 expect(await page.locator('.map-vignette').evaluate(el=>getComputedStyle(el).backgroundImage)).toContain('90deg');
 await page.screenshot({path:'artifacts/start-screen-desktop.png'});
 await page.getByTestId('single-player').click();
 const flag=page.getByTestId('edit-player-flag'),leader=page.getByTestId('edit-player-leader');
 await expect(page.locator('.leader-grid,.flag-editor')).toHaveCount(0);
 await page.getByTestId('commander-name').fill('Remembered commander');
 await page.getByTestId('setup-ai-count').fill('3');
 await flag.click();await page.getByLabel('旗帜类型',{exact:true}).selectOption('fr');await page.keyboard.press('Escape');await expect(flag).toBeFocused();
 await leader.click();await page.getByTestId('choose-leader-vanguard').click();await page.getByRole('button',{name:'关闭',exact:true}).click();await expect(leader).toBeFocused();
 await expect(leader).toHaveAttribute('data-leader','vanguard');
 await expect(page.getByTestId('commander-name')).toHaveValue('Remembered commander');
 await expect(page.getByTestId('setup-ai-count')).toHaveValue('3');
 await page.keyboard.press('Escape');await expect(page.getByTestId('single-player')).toBeFocused();
 await expect(flag).toHaveCount(0);await expect(leader).toHaveCount(0);
 await page.reload();await expect(flag).toHaveCount(0);await expect(leader).toHaveCount(0);
 await page.getByRole('button',{name:/局域网联机/}).click();await waitForRuntime(page);
 await expect(page.locator('.leader-grid,.flag-editor')).toHaveCount(0);
 await expect(leader).toHaveAttribute('data-leader','vanguard');
 await expect(flag.getByRole('img',{name:'法国',exact:true})).toBeVisible();
 await flag.click();await expect(page.getByLabel('旗帜类型',{exact:true})).toHaveValue('fr');
 await page.getByRole('button',{name:'关闭',exact:true}).click();await expect(flag).toBeFocused();
 await expect(page.getByRole('button',{name:'创建房间',exact:true})).toBeVisible();
 await leader.click();await expect(page.getByTestId('choose-leader-vanguard')).toHaveAttribute('aria-pressed','true');
 await page.keyboard.press('Escape');await expect(leader).toBeFocused();
 await expect(page.getByRole('button',{name:'创建房间',exact:true})).toBeVisible();
 await expect(page.getByTestId('choose-unit-infantry')).toBeVisible();
});

test('unit tooltip is external to the button, keyboard dismissible and mouse hoverable',async({page})=>{
 await page.goto('/');await page.getByTestId('single-player').click();await waitForRuntime(page);
 const card=page.getByTestId('choose-unit-infantry');await card.focus();
 const tooltip=page.getByTestId('unit-tooltip-infantry');
 await expect(card.locator(':scope > *')).toHaveCount(2);await expect(card.locator('svg')).toHaveCount(1);
 await expect(card.locator('.unit-attribute')).toHaveCount(0);await expect(tooltip.locator('.unit-attribute')).toHaveCount(9);
 await expect(card).toHaveAttribute('aria-describedby','unit-tooltip-infantry');
 const box=await card.boundingBox(),name=await card.locator('.unit-name').boundingBox();expect(name!.x-box!.x).toBeLessThan(20);expect(name!.y-box!.y).toBeLessThan(20);
 await page.keyboard.press('Escape');await expect(tooltip).toHaveCount(0);await expect(page.getByRole('dialog')).toBeVisible();
 await page.getByTestId('commander-name').focus();await card.hover();await expect(tooltip).toBeVisible();await tooltip.hover();await page.waitForTimeout(180);await expect(tooltip).toBeVisible();
 await page.keyboard.press('Escape');await expect(page.getByRole('tooltip')).toHaveCount(0);await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByTestId('single-player')).toBeFocused();
});

test.describe('touch identity and unit selection',()=>{
 test.use({hasTouch:true,isMobile:true});
 test('left-side menu, setup editor focus return and tooltip fit portrait and landscape',async({page})=>{
  test.setTimeout(180000);
  for(const [width,height] of [[390,844],[360,640],[844,390]]){
   await page.setViewportSize({width,height});await page.goto('/');await waitForRuntime(page);
   await expect(page.locator('.world canvas')).toHaveAttribute('data-ready','true',{timeout:30000});
   await expect(page.getByTestId('edit-player-flag')).toHaveCount(0);
   await expect(page.getByTestId('edit-player-leader')).toHaveCount(0);
   const title=await bounds(page.locator('.menu-content h1'),width,height);
   await page.getByTestId('single-player').scrollIntoViewIfNeeded();const start=await bounds(page.getByTestId('single-player'),width,height);
   expect(start.x).toBeLessThan(width*.2);expect(title.x).toBeLessThan(width*.2);
   expect(await page.locator('.map-vignette').evaluate(el=>getComputedStyle(el).backgroundImage)).toContain('90deg');
   await page.screenshot({path:`artifacts/start-screen-${width}x${height}.png`});
   await page.getByTestId('single-player').tap();
   const flag=page.getByTestId('edit-player-flag'),leader=page.getByTestId('edit-player-leader');
   await flag.scrollIntoViewIfNeeded();await bounds(flag,width,height);await leader.scrollIntoViewIfNeeded();await bounds(leader,width,height);
   await leader.tap();expect(await page.locator('.leader-grid').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBe(3);await page.getByTestId('choose-leader-steward').tap();await page.getByRole('button',{name:'关闭',exact:true}).tap();await expect(leader).toBeFocused();
   expect(await page.locator('.unit-grid').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBe(4);const card=page.getByTestId('choose-unit-cavalry');await card.tap();
   await expect(card).toHaveAttribute('aria-pressed','true');const tip=await bounds(page.getByRole('tooltip'),width,height),trigger=await card.boundingBox();
   expect(tip.y+tip.height<=trigger!.y||tip.y>=trigger!.y+trigger!.height||tip.x+tip.width<=trigger!.x||tip.x>=trigger!.x+trigger!.width).toBe(true);await expect(page.getByRole('tooltip').locator('.unit-attribute')).toHaveCount(9);
   expect(await page.getByRole('tooltip').evaluate(el=>el.scrollHeight<=el.clientHeight&&el.scrollWidth<=el.clientWidth)).toBe(true);
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
 await page.goto('/');await page.getByTestId('single-player').click();await waitForRuntime(page);
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
