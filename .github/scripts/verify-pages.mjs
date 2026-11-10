import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require = createRequire(path.resolve('game/package.json'));
const {chromium,expect:baseExpect}=require('@playwright/test');
const expect=baseExpect.configure({timeout:45000});
const site=process.env.SITE_URL?.replace(/\/?$/,'/');
assert.ok(site?.startsWith('https://'),'HTTPS Pages URL required');
const pkg=JSON.parse(fs.readFileSync('game/package.json','utf8'));
const atlas=JSON.parse(fs.readFileSync('game/src/generated/gameplay-map.json','utf8'));
const regions=atlas.mapId==='earth-natural-earth-admin1-511-regions-v2';
assert.ok(regions,'Expected preprocessed gameplay-region map');
const region=code=>atlas.provinces.findIndex(p=>p.id===code);
async function chooseRemoteRoute(page){
 // Some gameplay regions have a one-unit capacity. A 75% order
 // correctly rounds down to zero there, so verify an explicit full dispatch.
 await page.getByRole('button',{name:'100%',exact:true}).click();
 const sourceCode=atlas.provinces[Number(await page.locator('canvas').getAttribute('data-selected-region'))].id;
 const source=region(sourceCode),distance=new Map([[source,0]]),queue=[source];
 for(let i=0;i<queue.length;i++)for(const next of atlas.provinces[queue[i]].neighbors)if(!distance.has(next)){distance.set(next,distance.get(queue[i])+1);queue.push(next);}
 for(const target of queue.filter(id=>distance.get(id)>=3).slice(0,40)){
  await page.getByTestId('destination-search').fill(atlas.provinces[target].id);
  await page.getByTestId('destination').selectOption(String(target));
  const route=(await page.getByTestId('route-preview').getAttribute('data-route')).split(',');
  if(route.length>=2&&route[0]===sourceCode&&route.at(-1)===atlas.provinces[target].id&&await page.getByTestId('dispatch').isEnabled())return {source,target,route};
 }
 throw new Error('No verified multi-leg route from the allocated player start');
}

fs.mkdirSync('artifacts',{recursive:true});
let info,routePlan;
for(let n=0;n<24;n++){
 try {
  const r=await fetch(`${site}build-info.json?check=${Date.now()}`,{signal:AbortSignal.timeout(15000)});
  if(r.ok){info=await r.json();if(info.sourceCommit===process.env.SOURCE_COMMIT)break;}
 }catch{}
 await new Promise(resolve=>setTimeout(resolve,5000));
}
assert.equal(info?.sourceCommit,process.env.SOURCE_COMMIT,'Live site must contain intended commit');
assert.equal(info.version,pkg.version);
assert.equal(info.regionCount,atlas.provinces.length);
const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:1440,height:960}});
const page=await context.newPage();page.setDefaultTimeout(45000);
const errors=[],failedResources=[],checks=['HTTPS build identity'];
page.on('pageerror',e=>errors.push(e.message));
page.on('response',r=>{if(r.url().startsWith(site)&&r.status()>=400&&/\.(js|css|json)(\?|$)/.test(r.url()))failedResources.push(`${r.status()} ${r.url()}`);});
try{
 const r=await page.goto(`${site}?release=${info.sourceCommit}`,{waitUntil:'networkidle',timeout:90000});
 assert.equal(r.status(),200);
 await expect(page.getByTestId('single-player')).toBeVisible();
 await expect(page.locator('canvas')).toHaveAttribute('data-ready','true');
 if(regions){
  await expect(page.locator('canvas')).toHaveAttribute('data-region-count',String(atlas.provinces.length));
  await expect(page.locator('canvas')).toHaveAttribute('data-boundary-mode','ownership-and-management');
  await expect(page.locator('canvas')).toHaveAttribute('data-country-borders','true');
  await expect(page.locator('canvas')).toHaveAttribute('data-neutral-borders','independent-territories');
  assert.ok(Number(await page.locator('canvas').getAttribute('data-country-border-segments'))>0);
  assert.ok(atlas.sourceAtomCount>atlas.provinces.length);
  checks.push(atlas.provinces.length+' locked gameplay regions from '+atlas.sourceAtomCount+' source areas, live ownership borders and independent neutral territories');
 }
 await page.screenshot({path:'artifacts/pages-main-menu.png'});
 await page.getByTestId('single-player').click();
 await expect(page.locator('.unit-card[aria-pressed="true"]')).toHaveCount(1);
 await expect(page.getByTestId('choose-unit-infantry')).toHaveAttribute('aria-pressed','true');
 checks.push('single-unit setup defaults to infantry');
 await page.getByTestId('commander-name').fill('Pages v0.5 verification');
 await page.getByTestId('begin-campaign').click();
 await expect(page.getByTestId('open-settings')).toBeVisible();
 await expect(page.locator('.render-error')).toHaveCount(0);
 await expect(page.locator('canvas')).toHaveAttribute('data-framing','cover');
 await expect(page.locator('canvas')).toHaveAttribute('data-settled','true');
 const clock=page.getByTestId('game-clock'),tick=Number(await clock.getAttribute('data-tick'));
 await expect.poll(async()=>Number(await clock.getAttribute('data-tick')),{timeout:20000}).toBeGreaterThan(tick);
 await page.getByTestId('toggle-pause').click();
 checks.push('main menu, full-screen WebGL, Worker simulation ticks');
 if(regions){
  await expect(page.getByTestId('faction-identity')).toBeVisible();
  await expect(page.getByTestId('country-flag')).toHaveCount(0);
  routePlan=await chooseRemoteRoute(page);
  await expect(page.getByTestId('region-capacity')).toContainText(/\/\s*[1-9]\d*/);
 }
 await page.getByTestId('dispatch').click();
 await page.getByTestId('open-upgrades').click();
 await page.getByTestId('upgrade-infantry-attack').click();
 await expect(page.locator('.upgrade-card').first()).toContainText('1/8');
 await page.keyboard.press('Escape');
 await page.locator('canvas').focus();await page.keyboard.press('Home');
 await expect(page.locator('canvas')).toHaveAttribute('data-settled','true');
 await page.screenshot({path:'artifacts/pages-live-battle.png'});
 checks.push(regions?'non-adjacent dispatch from allocated start across multiple gameplay regions using continuous terrain coordinates, per-region capacity':'dispatch');
 checks.push('unit upgrade');
 await page.getByTestId('open-settings').click();await page.getByTestId('settings-save').click();
 await page.getByPlaceholder(/^(存档名称|Save name)$/).fill('Pages verification');
 await page.getByTestId('create-save').click();
 await expect(page.locator('.save-card').filter({hasText:'Pages verification'})).toBeVisible();
 if(regions){
  const routes=await page.evaluate(()=>{
   const records=Object.keys(localStorage).filter(k=>k.startsWith('rouge.save.natural-earth-admin1.regions.v2.')&&!k.endsWith('.backup'));
   const record=records.find(k=>localStorage.getItem(k).includes('Pages verification'));
   if(!record)throw new Error('Verification save missing');
   const s=JSON.parse(JSON.parse(localStorage.getItem(record)).body);
   return {version:s.version,map:s.map,grouping:s.grouping,units:s.units.filter(u=>u.owner===0&&u.destination!==null).map(u=>({destination:u.destination,route:u.route,travel:u.travel}))};
  });
  assert.equal(routes.map,atlas.mapId);
  assert.equal(routes.grouping.mapId,atlas.mapId);
  assert.equal(routes.grouping.groups.flatMap(g=>g.atoms).length,atlas.provinces.length);
  assert.ok(routes.units.length>0);
  assert.ok(routes.units.every(u=>u.destination===routePlan.target&&u.route.length===0&&u.travel?.points.length>=2));
  fs.writeFileSync('artifacts/remote-route-verification.json',JSON.stringify(routes,null,2));
  checks.push('new-map saved grouping, non-adjacent orders and continuous terrain waypoints');
 }
 await page.reload({waitUntil:'networkidle'});
 await page.getByTestId('open-saves').click();
 await page.locator('.save-card').filter({hasText:'Pages verification'}).getByRole('button',{name:/^(载入|Load)$/}).click();
 await expect(page.locator('.hud-top')).toContainText('Pages v0.5 verification');
 await page.getByTestId('open-upgrades').click();
 await expect(page.locator('.upgrade-card').first()).toContainText('1/8');
 checks.push('settings save, browser reload, restore commander and upgrade');
 assert.deepEqual(errors,[]);assert.deepEqual(failedResources,[]);
 const report={verifiedAt:new Date().toISOString(),url:site,build:info,checks,pageErrors:errors,failedResources,result:'PASS'};
 fs.writeFileSync('artifacts/pages-verification.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify(report,null,2));
 if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,`## Pages verified\nVersion: ${info.version}\n\nSource: ${info.sourceCommit}\n\nURL: ${site}\n\n${checks.map(x=>`- ${x}`).join('\n')}\n`);
}catch(e){
 await page.screenshot({path:'artifacts/pages-verification-failed.png'}).catch(()=>{});
 fs.writeFileSync('artifacts/pages-verification-error.txt',String(e));throw e;
}finally{await browser.close();}
