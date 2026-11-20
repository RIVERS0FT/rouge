import {test,expect,type Page} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {openMapSearch} from './map-search.ts';

async function loadEliminatedMatch(page:Page){
 const fixture=JSON.parse(execFileSync(process.execPath,['--experimental-strip-types','tests/create-eliminated-fixture.mjs'],{encoding:'utf8',maxBuffer:16*1024*1024}));
 await page.addInitScript(({key,value})=>localStorage.setItem(key,value),fixture);
 await page.goto('/');await page.getByTestId('open-saves').click();
 await page.locator('.save-card').filter({hasText:'Eliminated country fixture'}).getByRole('button',{name:'载入',exact:true}).click();
 await expect(page.locator('.app.is-game')).toHaveAttribute('data-local-ready','true',{timeout:60000});
 return fixture;
}

test('zero-territory player sees defeat before a global winner and can spectate without issuing orders',async({page})=>{
 await loadEliminatedMatch(page);
 await expect(page.locator('.app')).toHaveAttribute('data-eliminated','true');
 await expect(page.getByTestId('elimination-result')).toContainText('你已被淘汰');
 await expect(page.getByTestId('elimination-result')).toContainText('其余国家继续战斗');
 await expect(page.getByTestId('eliminated-return-menu')).toBeVisible();
 await expect(page.getByTestId('army-total')).toHaveText('0');
 await page.getByTestId('spectate-match').click();
 await expect(page.getByTestId('elimination-result')).toHaveCount(0);
 await expect(page.getByTestId('spectating-status')).toBeVisible();
 const tick=Number(await page.getByTestId('game-clock').getAttribute('data-tick'));
 await expect.poll(async()=>Number(await page.getByTestId('game-clock').getAttribute('data-tick'))).toBeGreaterThan(tick);
 await page.getByTestId('open-upgrades').click();
 await expect(page.getByTestId('upgrade-infantry-attack')).toBeDisabled();
 await page.keyboard.press('Escape');await page.getByTestId('portrait-talents').click();
 await expect(page.locator('.talent-card')).toBeDisabled();
 await page.keyboard.press('Escape');await page.getByTestId('open-settings').click();
 await expect(page.getByTestId('settings-resume')).toBeEnabled();
});

test('paused spectator sees AI army plaques and battle badges in strategic and terrain views',async({page})=>{
 test.setTimeout(120000);
 const fixture=await loadEliminatedMatch(page);
 await page.getByTestId('spectate-match').click();
 await page.getByTestId('toggle-pause').click();
 await expect(page.getByTestId('campaign-time')).toHaveAttribute('data-paused','true');
 await expect(page.getByTestId('spectating-status')).toBeVisible();
 const canvas=page.locator('.world canvas');
 const army=page.locator(`.army-plaque[data-army="${fixture.army}"]`);
 const badge=page.locator(`.battle-badge[data-region="${fixture.battleRegion}"]`);
 async function checkArmy(){
  await expect(army.locator('.army-plaque-flag')).toBeVisible();
  await expect(army.locator('.army-plaque-count')).toHaveText(/\d/);
 }
 async function checkBattle(){
  await expect(badge.locator('.battle-swords svg')).toBeVisible();
  for(const owner of [1,2]){
   const side=badge.locator(`.battle-side[data-owner="${owner}"]`);
   await expect(side.locator('.battle-flag')).toBeVisible();
   await expect(side.locator('.battle-count')).toHaveText(/^[1-9]\d*$/);
   await expect(badge.locator(`.battle-power i[data-owner="${owner}"]`)).toBeVisible();
  }
  const shares=await badge.locator('.battle-power i:visible').evaluateAll(nodes=>nodes.map(n=>parseFloat((n as HTMLElement).style.width)));
  expect(shares).toHaveLength(2);expect(shares[0]+shares[1]).toBeCloseTo(100,0);
 }
 async function focusRegion(code:string){
  const search=await openMapSearch(page);await search.fill(code);
  await page.locator('.map-search-results button').first().click();
  await expect(canvas).toHaveAttribute('data-view','near');
  await expect(canvas).toHaveAttribute('data-settled','true',{timeout:20000});
 }
 await canvas.focus();await page.keyboard.press('Home');
 await expect(canvas).toHaveAttribute('data-view','far');
 await checkArmy();await checkBattle();
 await focusRegion(fixture.battleCode);await checkBattle();
 await focusRegion(fixture.sourceCode);await checkArmy();
});
