import {openMapSearch} from './map-search.ts';
import {test,expect,type Page} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {loadMapOrderFixture,mapOrderFixture,targetPoint,saveOrders,worldView} from './map-orders.ts';
const atlas=JSON.parse(readFileSync('src/generated/gameplay-map.json','utf8'));

async function expectPanelLayout(page:Page,owned=true){
 const panel=page.locator('#province-panel');
 await expect(panel).toBeVisible();
 await expect(panel.locator('h2')).toBeInViewport({ratio:1});
 const country=panel.getByTestId('province-country');await expect(country).toBeVisible();
 await expect(country.locator('bdi')).toHaveText((await panel.getByTestId('province-owner-name').textContent())!);
 await expect(panel.locator('.province-ownership')).toHaveCount(0);
 await expect.poll(()=>panel.evaluate(element=>element.scrollTop)).toBe(0);
 await expect(panel.locator('.province-summary')).toHaveCount(1);
 const layout=await panel.evaluate(element=>{
  const box=(selector:string)=>element.querySelector(selector)!.getBoundingClientRect();
  const heading=box('.province-heading'),summary=box('.province-summary'),action=box('.province-actions');
  const production=element.querySelector('.province-production')?.getBoundingClientRect();
  const garrisonLabel=box('.province-garrison dt'),garrisonValue=box('.province-garrison dd');
  return {
   overflows:[element,...element.querySelectorAll('h2,.province-country,.province-summary,.province-ownership,.province-garrison')].some(node=>node.scrollWidth>node.clientWidth+1),
   ordered:heading.bottom<=summary.top&&summary.bottom<=(production?.top??action.top)&&(production?.bottom??summary.bottom)<=action.top,
   columns:garrisonLabel.right<=garrisonValue.left&&garrisonLabel.top>=summary.top&&garrisonLabel.bottom<=summary.bottom,
   production:Boolean(production)
  };
 });
 expect(layout).toEqual({overflows:false,ordered:true,columns:true,production:owned});
 await expect(panel.getByTestId('open-territory-management')).toBeEnabled();
 if(owned)await expect(panel.getByRole('combobox')).toHaveAccessibleName(/自动生产|Auto-production/);
}


for(const language of ['zh','en'] as const)test(`${language}: territory panel shows ownership, production and garrison without orders`,async({page})=>{
 await loadMapOrderFixture(page);
 if(language==='en'){
  await page.getByTestId('open-settings').click();await page.getByRole('button',{name:'English',exact:true}).click();await page.getByTestId('settings-resume').click();
 }
 const panel=page.locator('#province-panel');
 await expect(panel).not.toContainText(language==='zh'?'属于者':'Owned by');
 await expect(page.getByTestId('province-owner-name')).toHaveText('Panel Commander');
 await expect(panel).toContainText(language==='zh'?'自动生产':'Auto-production');
 await expectPanelLayout(page);
 await page.screenshot({path:`artifacts/territory-panel-owned-${language}.png`});
 await expect(page.locator('.hud-top')).not.toContainText(/本方势力|阵营 1|国家 1|指挥官|铁壁统帅|Your faction|Faction 1|Country 1|Panel Commander|Warden/);
 await expect(page.getByTestId('commander-portrait')).toHaveAttribute('data-leader','warden');
 await expect(page.locator('.hud-top .faction-copy,.hud-top .commander-badge')).toHaveCount(0);
 for(const id of ['destination','destination-search','route-preview','destination-capacity','dispatch'])await expect(page.getByTestId(id)).toHaveCount(0);
 await expect(panel.locator('.fraction-picker')).toHaveCount(0);
 for(const [id,name] of [[mapOrderFixture.enemy,mapOrderFixture.country.name[language==='zh'?0:1]],[mapOrderFixture.target,language==='zh'?'中立':'Neutral']] as const){
  await openMapSearch(page);await page.getByTestId('map-search').fill(atlas.provinces[id].id);await page.locator('.map-search-results button').first().click();
  await expect(page.getByTestId('province-owner-name')).toHaveText(name);
  await expectPanelLayout(page,false);
 }
 await page.screenshot({path:`artifacts/territory-panel-${language}.png`});
});

for(const shift of [false,true])test(`${shift?'Shift-click':'right-click'} still dispatches on the map`,async({page})=>{
 await loadMapOrderFixture(page);const point=await targetPoint(page);
 if(shift)await page.keyboard.down('Shift');
 await page.mouse.click(point.x,point.y,{button:shift?'left':'right'});
 if(shift)await page.keyboard.up('Shift');
 await expect(page.locator('.world canvas')).toHaveAttribute('data-selected-region',String(mapOrderFixture.source));
 await expect(page.getByTestId('region-capacity')).toContainText('11 / 12');
 const orders=await saveOrders(page);expect(orders).toHaveLength(1);
 expect(orders.every((u:any)=>u.destination===mapOrderFixture.target&&u.travel?.points.length>=2)).toBe(true);
});

test.describe('touch orders',()=>{
 test.use({hasTouch:true,isMobile:true,viewport:{width:844,height:390}});
 test('long press orders once; interrupted, dragged and pinched holds never order',async({page,context})=>{
  await loadMapOrderFixture(page);const canvas=page.locator('.world canvas');
  await expect(page.getByTestId('toggle-province-panel')).toHaveText('地块');
  await page.getByTestId('toggle-province-panel').tap();await expect(page.getByTestId('province-owner-name')).toHaveText('Panel Commander');
  await page.getByTestId('toggle-province-panel').tap();
  const cdp=await context.newCDPSession(page);
  const touch=(type:string,points:any[])=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points});
  for(const mode of ['cancel','drag','pinch','modal']){
   await worldView(page);const point=await targetPoint(page);
   await touch('touchStart',[{...point,id:1}]);await page.waitForTimeout(600);
   if(mode==='cancel'){await touch('touchCancel',[]);}
   if(mode==='drag'){await touch('touchMove',[{x:point.x+20,y:point.y,id:1}]);await touch('touchMove',[{...point,id:1}]);await touch('touchEnd',[]);}
   if(mode==='pinch'){await touch('touchStart',[{...point,id:1},{x:point.x+30,y:point.y,id:2}]);await touch('touchEnd',[]);}
   if(mode==='modal'){await page.getByTestId('open-settings').click();await touch('touchEnd',[]);await page.keyboard.press('Escape');}
   await expect(canvas).toHaveAttribute('data-selected-region',String(mapOrderFixture.source));
   await expect(page.getByTestId('region-capacity')).toContainText('12 / 12');
  }
  await worldView(page);const point=await targetPoint(page);
  await touch('touchStart',[{...point,id:1}]);await page.waitForTimeout(600);await touch('touchEnd',[]);
  await expect(canvas).toHaveAttribute('data-selected-region',String(mapOrderFixture.source));
  await expect(page.getByTestId('region-capacity')).toContainText('11 / 12');
  const orders=await saveOrders(page);expect(orders).toHaveLength(1);
  expect(orders.every((u:any)=>u.destination===mapOrderFixture.target)).toBe(true);await cdp.detach();
 });
});


test.describe('territory information on touch screens',()=>{
 test.use({hasTouch:true,isMobile:true,viewport:{width:390,height:844}});
 for(const language of ['zh','en'] as const)test(`${language}: consistent portrait and landscape layout, long names and repeated controls`,async({page})=>{
  test.setTimeout(120000);
  await loadMapOrderFixture(page);
  if(language==='en'){
   await page.getByTestId('open-settings').click();await page.getByRole('button',{name:'English',exact:true}).click();await page.getByTestId('settings-resume').click();
  }
  const toggle=page.getByTestId('toggle-province-panel'),panel=page.locator('#province-panel');
  for(const viewport of [{width:390,height:844},{width:844,height:390}]){
   await page.setViewportSize(viewport);
   if(await toggle.getAttribute('aria-expanded')!=='true')await toggle.tap();
   await expectPanelLayout(page);
   await panel.getByRole('combobox').selectOption('infantry');
   await expect(panel.getByRole('combobox')).toHaveValue('infantry');
   await page.getByTestId('open-territory-management').tap();
   await expect(page.getByTestId('territory-management')).toBeVisible();
   await page.getByRole('button',{name:language==='zh'?'关闭':'Close',exact:true}).tap();
   await expect(page.getByTestId('territory-management')).toHaveCount(0);
   await expect(page.locator('.world canvas')).toHaveAttribute('data-selected-region',String(mapOrderFixture.source));
   await toggle.tap();await expect(panel).toBeHidden();
   await toggle.tap();await expectPanelLayout(page);
   await page.screenshot({path:`artifacts/territory-panel-${language}-${viewport.width}.png`});
  }
  const longest=atlas.provinces.filter((p:any,index:number)=>p.playable&&![mapOrderFixture.source,mapOrderFixture.enemy].includes(index)).sort((a:any,b:any)=>b.name[language==='zh'?0:1].length-a.name[language==='zh'?0:1].length)[0];
  await openMapSearch(page);await page.getByTestId('map-search').fill(longest.id);await page.locator('.map-search-results button').first().click();
  await expect(panel.locator('h2')).toHaveText(longest.name[language==='zh'?0:1]);
  await expectPanelLayout(page,false);
  await page.screenshot({path:`artifacts/territory-panel-long-name-${language}.png`});
 });
});
