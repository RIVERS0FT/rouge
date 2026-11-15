import {test,expect,type Dialog,type Page} from '@playwright/test';
import {waitForRuntime} from './readiness.ts';

async function beginCampaign(page:Page,name:string){
 await page.getByTestId('single-player').click();
 await page.getByTestId('commander-name').fill(name);
 await page.getByTestId('begin-campaign').click();
 await expect(page.locator('.app')).toHaveAttribute('data-local-ready','true',{timeout:60000});
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

 const storedAutosaves=()=>page.evaluate(()=>{
  return Object.keys(localStorage)
   .filter(key=>/^rouge\.save\.natural-earth-admin1\.regions\.v\d+\.auto(?:$|[-.])/.test(key))
   .map(key=>{
    const state=JSON.parse(JSON.parse(localStorage.getItem(key)!).body);
    return {key,campaign:state.campaign,commander:state.players[0].name};
   });
 });
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

 await page.reload();
 await waitForRuntime(page,60000);
 await page.getByTestId('open-saves').click();
 await expect(page.locator('.save-card')).toHaveCount(2);
 await expect(page.getByRole('heading',{name:'First Campaign Manual',exact:true})).toBeVisible();
 const autosave=page.locator('.save-card').filter({has:page.getByRole('heading',{name:'Autosave',exact:true})});
 await expect(autosave).toHaveCount(1);
 await autosave.getByRole('button',{name:'Load',exact:true}).click();
 await expect(page.locator('.app')).toHaveAttribute('data-local-ready','true',{timeout:60000});
 await expect(page.locator('.commander-player')).toHaveText('Second Commander');
});
