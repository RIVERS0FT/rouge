import {test,expect,type Page} from '@playwright/test';
import {execFileSync} from 'node:child_process';
const fixture=JSON.parse(execFileSync(process.execPath,['--experimental-strip-types','tests/create-dispatch-fixture.mjs'],{encoding:'utf8',maxBuffer:16*1024*1024}));

async function loadFixture(page:Page,language:'zh'|'en'){
 await page.addInitScript(({saves,language})=>{
  for(const save of saves)localStorage.setItem(save.key,save.value);
  localStorage.setItem('rouge.language',language);
 },{saves:fixture.saves as {key:string;value:string}[],language});
 await page.goto('/');await page.getByTestId('open-saves').click();
 await page.locator('.save-card').filter({has:page.getByRole('heading',{name:'Dispatch fixture',exact:true})}).getByRole('button',{name:language==='zh'?'载入':'Load',exact:true}).click();
 await expect(page.locator('.app')).toHaveAttribute('data-local-ready','true',{timeout:60000});
 await page.getByTestId('toggle-pause').click();await expect(page.getByTestId('toggle-pause')).toHaveText('▶');
}

async function expectDispatches(page:Page,language:'zh'|'en',mobile=false){
 const section=page.getByRole('region',{name:language==='zh'?'战地简报':'Field dispatches'});
 await expect(section).toBeVisible();
 await expect(section.locator('.dispatch-entry')).toHaveCount(4);
 await expect(section.locator('time')).toHaveText(['100:02','100:01','100:01','100:00']);
 await expect(section.locator('.dispatch-player')).toHaveText([fixture.names[0],fixture.names[2],fixture.names[1],fixture.names[0]]);
 await expect(section.locator('.dispatch-region')).toHaveText([fixture.regions[1][language==='zh'?0:1],fixture.regions[0][language==='zh'?0:1]]);
 await expect(section.locator('.dispatch-event').nth(1)).toHaveText(language==='zh'?'取得胜利':'won the campaign');
 await expect(section.locator('.dispatch-event').last()).toHaveText(language==='zh'?'领袖等级提升':'commander level increased');
 const layout=await section.evaluate(element=>{
  const rows=[...element.querySelectorAll('.dispatch-entry')];
  const content=rows.map(row=>row.querySelector('.dispatch-content')!.getBoundingClientRect());
  const panel=element.closest('#strategic-panel')!;
  return {
   overflow:[panel,element,...rows,...element.querySelectorAll('.dispatch-content')].some(node=>node.scrollWidth>node.clientWidth+1),
   aligned:content.every(box=>Math.abs(box.left-content[0].left)<1),
   separated:rows.every((row,index)=>row.querySelector('time')!.getBoundingClientRect().right<content[index].left),
   playerSize:parseFloat(getComputedStyle(element.querySelector('.dispatch-player')!).fontSize),
   wrapping:rows.every(row=>getComputedStyle(row.querySelector('.dispatch-content')!).overflowWrap==='anywhere'),
  };
 });
 expect(layout).toEqual({overflow:false,aligned:true,separated:true,playerSize:mobile?14:12,wrapping:true});
 // The scrolling HUD must keep the last item reachable even on short screens.
 await section.locator('.dispatch-entry').last().scrollIntoViewIfNeeded();
 await expect(section.locator('.dispatch-entry').last()).toBeInViewport();
}

for(const language of ['zh','en'] as const)test(`${language}: dispatches preserve newest four events and readable time columns`,async({page})=>{
 await loadFixture(page,language);
 for(const width of [1440,1024]){
  await page.setViewportSize({width,height:960});await expectDispatches(page,language);
  await page.screenshot({path:`artifacts/dispatches-${language}-${width}.png`});
 }
 await page.getByTestId('open-settings').click();await page.getByTestId('settings-save').click();
 await page.locator('.save-card').filter({has:page.getByRole('heading',{name:'Empty dispatch fixture',exact:true})}).getByRole('button',{name:language==='zh'?'载入':'Load',exact:true}).click();
 await expect(page.locator('.app')).toHaveAttribute('data-local-ready','true',{timeout:60000});
 await expect(page.locator('.dispatch-empty')).toHaveText(language==='zh'?'暂无战报':'No dispatches yet');
 await expect(page.locator('.dispatch-entry')).toHaveCount(0);
});

test.describe('touch dispatches',()=>{
 test.use({hasTouch:true,isMobile:true,viewport:{width:390,height:844}});
 for(const language of ['zh','en'] as const)test(`${language}: long names wrap in portrait and landscape, repeated toggles keep events`,async({page})=>{
  await loadFixture(page,language);
  const toggle=page.getByTestId('toggle-strategic-panel');
  for(const viewport of [{width:320,height:740},{width:390,height:844},{width:844,height:390}]){
   await page.setViewportSize(viewport);
   if(await toggle.getAttribute('aria-expanded')!=='true')await toggle.tap();
   await expectDispatches(page,language,true);
   await toggle.tap();await expect(page.locator('.dispatches')).toBeHidden();
   await toggle.tap();await expectDispatches(page,language,true);
   await page.screenshot({path:`artifacts/dispatches-${language}-${viewport.width}.png`});
  }
  await page.getByTestId('open-settings').tap();await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);await expectDispatches(page,language,true);
 });
});
