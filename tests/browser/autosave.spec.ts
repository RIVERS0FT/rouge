import {test,expect,type Dialog,type Page} from './static-host.ts';
import {waitForRuntime} from './readiness.ts';
import {savedCampaigns} from './save-records.ts';

async function beginCampaign(page:Page,name:string){
 await page.getByTestId('single-player').click();
 await page.getByTestId('commander-name').fill(name);
 await page.getByTestId('begin-campaign').click();
 await expect(page.locator('.app.is-game')).toHaveAttribute('data-local-ready','true',{timeout:60000});
 await expect(page.locator('.commander-player')).toHaveText(name);
}

async function returnToMenu(page:Page,settingsAlreadyOpen=false){
 if(!settingsAlreadyOpen)await page.getByTestId('open-settings').click();
 const confirmations:string[]=[];
 const acceptExit=async(dialog:Dialog)=>{
  confirmations.push(dialog.message());
  await (confirmations.length===1 ? dialog.accept() : dialog.dismiss());
 };
 page.on('dialog',acceptExit);
 try{
  await page.getByRole('button',{name:'Return to menu',exact:true}).click();
  expect(confirmations).toEqual(['Leave this campaign? Solo progress will be auto-saved when storage is available.']);
  await expect(page.getByTestId('single-player')).toBeVisible();
 }finally{page.off('dialog',acceptExit);}
}

test('leaving successive campaigns overwrites one autosave and keeps manual saves',async({page})=>{
 test.setTimeout(150000);
 await page.goto('/');
 await page.getByRole('button',{name:'English',exact:true}).click();
 await waitForRuntime(page,60000);
 await beginCampaign(page,'First Commander');

 await page.getByTestId('open-settings').click();
 await page.getByTestId('settings-save').click();
 await page.getByPlaceholder('Save name').fill('First Campaign Manual');
 await page.getByTestId('create-save').click();
 await expect(page.getByRole('heading',{name:'First Campaign Manual',exact:true})).toBeVisible();
 await page.getByTestId('settings-back').click();
 await returnToMenu(page,true);

 const storedAutosaves=async()=>(await savedCampaigns(page,'rouge.save.'))
  .filter(({key})=>/\.auto(?:$|[-.])/.test(key))
  .map(({key,state})=>({key,campaign:state.campaign,commander:state.players[0].name}));
 const first=await storedAutosaves();
 expect(first).toHaveLength(1);
 expect(first[0].commander).toBe('First Commander');
 expect(first[0].key).toMatch(/\.auto$/);

 await beginCampaign(page,'Second Commander');
 await returnToMenu(page);
 const second=await storedAutosaves();
 expect(second).toHaveLength(1);
 expect(second[0].key).toBe(first[0].key);
 expect(second[0].campaign).not.toBe(first[0].campaign);
 expect(second[0].commander).toBe('Second Commander');
 expect(await page.evaluate(()=>Object.keys(localStorage).filter(key=>key.startsWith('rouge.save.')))).toEqual([]);

 await page.getByTestId('open-saves').click();
 await expect(page.locator('.save-card')).toHaveCount(2);
 await expect(page.getByRole('heading',{name:'First Campaign Manual',exact:true})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Autosave',exact:true})).toHaveCount(1);
});

test('manual saves and autosaves survive a full localStorage and a reload',async({page})=>{
 test.setTimeout(150000);
 await page.addInitScript(()=>{
  const set=Storage.prototype.setItem;
  Storage.prototype.setItem=function(key,value){
   if(this===localStorage&&key.startsWith('rouge.save.'))throw new DOMException('Full','QuotaExceededError');
   set.call(this,key,value);
  };
 });
 await page.goto('/');
 await page.getByRole('button',{name:'English',exact:true}).click();
 await waitForRuntime(page,60000);
 await beginCampaign(page,'Quota Commander');
 await page.getByTestId('open-settings').click();
 await page.getByTestId('settings-save').click();
 await page.getByPlaceholder('Save name').fill('Manual overflow');
 await page.getByTestId('create-save').click();
 await expect(page.getByRole('heading',{name:'Manual overflow',exact:true})).toBeVisible();
 await page.getByTestId('settings-back').click();
 await returnToMenu(page,true);
 await page.reload();
 await waitForRuntime(page,60000);
 await page.getByTestId('open-saves').click();
 await expect(page.getByRole('heading',{name:'Manual overflow',exact:true})).toBeVisible();
 const autosave=page.locator('.save-card').filter({has:page.getByRole('heading',{name:'Autosave',exact:true})});
 await autosave.getByRole('button',{name:'Load',exact:true}).click();
 await expect(page.locator('.app.is-game')).toHaveAttribute('data-local-ready','true',{timeout:60000});
 await expect(page.locator('.commander-player')).toHaveText('Quota Commander');
});

test('overlapping slot operations preserve invocation order after a failed background encode',async({page})=>{
 await page.route('**/save-order',route=>route.fulfill({contentType:'text/html',body:'<!doctype html>'}));
 await page.goto('/save-order');
 const result=await page.evaluate(async()=>{
  const {browserSaves}=await import('/src/platform/browserSaves.ts');
  const {createGame}=await import('/src/game/engine.ts');
  const seats=['Command','Rival'].map(name=>({name,leader:'warden',loadout:['infantry']}));
  const first=createGame(seats,77,'save-order');
  const invalid=browserSaves.auto({...first,tick:-1},'Invalid').then(()=>false,()=>true);
  const writes=[browserSaves.auto(first,'First'),browserSaves.auto({...first,tick:first.tick+1},'Second')];
  const read=browserSaves.read('auto');
  const remove=browserSaves.delete('auto'),slots=browserSaves.list();
  await Promise.all(writes);await remove;
  return {invalid:await invalid,tick:(await read).state.tick,expected:first.tick+1,remaining:(await slots).length};
 });
 expect(result.invalid).toBe(true);
 expect(result.tick).toBe(result.expected);
 expect(result.remaining).toBe(0);
});
