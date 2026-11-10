import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
const atlas=JSON.parse(readFileSync('src/generated/world.json','utf8')) as {provinces:{id:string;neighbors:number[]}[]};
test('menu → setup → real WebGL game → order → upgrade → multi-slot save → reload',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>Object.defineProperty(globalThis.crypto,'randomUUID',{value:undefined,configurable:true}));
 await page.goto('/');await expect(page.getByRole('heading',{name:'诸省之争',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'English',exact:true}).click();await expect(page.getByTestId('single-player')).toContainText('Single player');
 await expect(page.getByRole('heading',{name:'ROUGE',exact:true})).toBeVisible();
 await page.screenshot({path:'artifacts/menu.png'});
 await page.getByTestId('single-player').click();await page.getByTestId('commander-name').fill('E2E Commander');await page.getByTestId('begin-campaign').click();
 await expect(page.locator('.app')).toHaveAttribute('data-local-ready','true',{timeout:60000});
 await expect(page.locator('.hud-top')).toContainText('E2E Commander');await expect(page.locator('.render-error')).toHaveCount(0);await expect(page.locator('canvas')).toBeVisible();
 // Random starts can have a full friendly default destination, or only one
 // battalion. Choose a legal route explicitly rather than waiting for capacity.
 await page.getByTestId('toggle-pause').click();await expect(page.getByTestId('toggle-pause')).toHaveText('▶');
 await page.getByRole('button',{name:'100%',exact:true}).click();
 const source=Number(await page.locator('canvas').getAttribute('data-selected-region'));
 const distance=new Map([[source,0]]),queue=[source];
 for(let i=0;i<queue.length;i++)for(const next of atlas.provinces[queue[i]].neighbors)if(!distance.has(next)){distance.set(next,distance.get(queue[i])!+1);queue.push(next);}
 let destination:number|undefined;
 for(const candidate of queue.filter(id=>distance.get(id)!>=3).slice(0,40)){
  await page.getByTestId('destination-search').fill(atlas.provinces[candidate].id);
  await page.getByTestId('destination').selectOption(String(candidate));
  const route=await page.getByTestId('route-preview').getAttribute('data-route');
  if(route===`${atlas.provinces[source].id},${atlas.provinces[candidate].id}`&&await page.getByTestId('dispatch').isEnabled()){destination=candidate;break;}
 }
 expect(destination,'A reachable destination with available capacity must exist').toBeDefined();
 await expect(page.getByTestId('dispatch')).toBeEnabled();await page.getByTestId('dispatch').click();
 await expect(page.getByTestId('destination-capacity')).toContainText(/Reserved en route [1-9]\d*/);
 await page.getByTestId('open-upgrades').click();
 await page.getByTestId('upgrade-infantry-attack').click();await expect(page.locator('.upgrade-card').first()).toContainText('1/8');
 await page.getByRole('button',{name:'Close',exact:true}).click();await page.getByTestId('open-settings').click();await page.getByTestId('settings-save').click();
 await page.getByPlaceholder('Save name').fill('First slot');await page.getByTestId('create-save').click();
 await page.getByPlaceholder('Save name').fill('Second slot');await page.getByTestId('create-save').click();
 await expect(page.locator('.save-card')).toHaveCount(2);await page.getByRole('button',{name:'Close',exact:true}).first().click();
 await page.locator('canvas').focus();await page.keyboard.press('End');await page.waitForTimeout(1500);await page.screenshot({path:'artifacts/game-3d.png'});
 await page.reload();await page.getByTestId('open-saves').click();await expect(page.locator('.save-card')).toHaveCount(2);await page.locator('.save-card').filter({hasText:'First slot'}).getByRole('button',{name:'Load',exact:true}).click();
 await expect(page.locator('.hud-top')).toContainText('E2E Commander');expect(errors).toEqual([]);
});
