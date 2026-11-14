import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
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
const regions=atlas.mapId==='earth-natural-earth-admin1-511-regions-v3';
assert.ok(regions,'Expected preprocessed gameplay-region map');
const mapOrderFixture=JSON.parse(execFileSync(process.execPath,['--experimental-strip-types','tests/create-map-order-fixture.mjs'],{cwd:'game',encoding:'utf8',maxBuffer:16*1024*1024}));

fs.mkdirSync('artifacts',{recursive:true});
let info;
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
await page.addInitScript(({key,value})=>localStorage.setItem(key,value),mapOrderFixture);
const errors=[],failedResources=[],checks=['HTTPS build identity'];
page.on('pageerror',e=>errors.push(e.message));
page.on('response',r=>{if(r.url().startsWith(site)&&r.status()>=400&&/\.(js|css|json)(\?|$)/.test(r.url()))failedResources.push(`${r.status()} ${r.url()}`);});
try{
 const r=await page.goto(`${site}?release=${info.sourceCommit}`,{waitUntil:'networkidle',timeout:90000});
 assert.equal(r.status(),200);
 await expect(page.getByTestId('single-player')).toBeVisible();
 await expect(page.locator('.world canvas')).toHaveAttribute('data-ready','true');
 if(regions){
  await expect(page.locator('.world canvas')).toHaveAttribute('data-region-count',String(atlas.provinces.length));
  await expect(page.locator('.world canvas')).toHaveAttribute('data-boundary-mode','ownership-and-management');
  await expect(page.locator('.world canvas')).toHaveAttribute('data-country-borders','true');
  await expect(page.locator('.world canvas')).toHaveAttribute('data-neutral-borders','independent-territories');
  assert.ok(Number(await page.locator('.world canvas').getAttribute('data-country-border-segments'))>0);
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
 await expect(page.locator('.world canvas')).toHaveAttribute('data-framing','cover');
 await expect(page.locator('.world canvas')).toHaveAttribute('data-settled','true');
 const clock=page.getByTestId('game-clock'),tick=Number(await clock.getAttribute('data-tick'));
 await expect.poll(async()=>Number(await clock.getAttribute('data-tick')),{timeout:20000}).toBeGreaterThan(tick);
 await page.getByTestId('toggle-pause').click();
 checks.push('main menu, full-screen WebGL, Worker simulation ticks');
 if(regions){
  await expect(page.getByTestId('faction-identity')).toBeVisible();
  await expect(page.getByTestId('country-flag')).toHaveCount(0);
  await expect(page.locator('.hud-top .faction-copy,.hud-top .commander-badge')).toHaveCount(0);
  await expect(page.getByTestId('province-owner-name')).toHaveText('Pages v0.5 verification');
  for(const id of ['dispatch','destination','destination-search','route-preview'])await expect(page.getByTestId(id)).toHaveCount(0);
  await expect(page.getByTestId('region-capacity')).toContainText(/\/\s*[1-9]\d*/);
 }
 await page.getByTestId('open-upgrades').click();
 await page.getByTestId('upgrade-infantry-attack').click();
 await expect(page.locator('.upgrade-card').first()).toContainText('1/8');
 await page.keyboard.press('Escape');
 await page.locator('.world canvas').focus();await page.keyboard.press('Home');
 await expect(page.locator('.world canvas')).toHaveAttribute('data-settled','true');
 await page.screenshot({path:'artifacts/pages-live-battle.png'});
 checks.push('territory ownership, garrison and production without march controls; compact flag-only top identity');
 checks.push('unit upgrade');
 await page.getByTestId('open-settings').click();await page.getByTestId('settings-save').click();
 await page.getByPlaceholder(/^(存档名称|Save name)$/).fill('Pages verification');
 await page.getByTestId('create-save').click();
 await expect(page.locator('.save-card').filter({hasText:'Pages verification'})).toBeVisible();
 await page.reload({waitUntil:'networkidle'});
 await page.getByTestId('open-saves').click();
 await page.locator('.save-card').filter({hasText:'Pages verification'}).getByRole('button',{name:/^(载入|Load)$/}).click();
 await expect(page.locator('.commander-player')).toContainText('Pages v0.5 verification');
 await page.getByTestId('open-upgrades').click();
 await expect(page.locator('.upgrade-card').first()).toContainText('1/8');
 checks.push('settings save, browser reload, restore commander and upgrade');
 // Use a deterministic, full garrison for live order verification. The ordinary
 // campaign flow above still verifies startup, production UI, upgrade and reload.
 await page.keyboard.press('Escape');await page.reload({waitUntil:'networkidle'});
 await page.getByTestId('open-saves').click();
 await page.locator('.save-card').filter({hasText:'Map order fixture'}).getByRole('button',{name:/^(载入|Load)$/}).click();
 await expect(page.locator('.app')).toHaveAttribute('data-local-ready','true');
 await page.getByTestId('toggle-pause').click();await expect(page.getByTestId('toggle-pause')).toHaveText('▶');
 const unitsCanvas=page.locator('.world canvas'),unitCount=await unitsCanvas.getAttribute('data-total-units');
 await unitsCanvas.focus();await page.keyboard.press('End');for(let n=0;n<4;n++)await page.keyboard.press('+');
 await expect(unitsCanvas).toHaveAttribute('data-settled','true');
 await expect(unitsCanvas).toHaveAttribute('data-unit-render-mode','3d');
 await expect(unitsCanvas).toHaveAttribute('data-rendered-sprites','0');
 await expect(unitsCanvas).toHaveAttribute('data-rendered-models','0');
 await page.keyboard.press('Home');await expect(unitsCanvas).toHaveAttribute('data-settled','true');
 await expect(unitsCanvas).toHaveAttribute('data-unit-render-mode','2d');
 await expect(unitsCanvas).toHaveAttribute('data-rendered-models','0');
 await expect(unitsCanvas).toHaveAttribute('data-rendered-sprites','0');
 assert.ok(Number(unitCount)>0);
 await expect(unitsCanvas).toHaveAttribute('data-total-units',unitCount);
 checks.push('stationed troops remain counted without showing on either map zoom');
 const targetPoint=await page.locator('.world canvas').evaluate((canvas,world)=>{
  const rect=canvas.getBoundingClientRect(),d=canvas.dataset;
  const scale=rect.height/(2*(Number(d.distance)-.16)*Math.tan(20*Math.PI/180));
  const x=rect.x+rect.width/2+(world.x-Number(d.focusX))*scale,y=rect.y+rect.height/2+(world.z-Number(d.focusZ))*scale;
  if(document.elementFromPoint(x,y)!==canvas)throw new Error('Map order target is covered');
  return {x,y};
 },mapOrderFixture.centers.target);
 await page.mouse.click(targetPoint.x,targetPoint.y,{button:'right'});
 await expect(page.locator('.world canvas')).toHaveAttribute('data-selected-region',String(mapOrderFixture.source));
 await expect(page.getByTestId('region-capacity')).toContainText('11 / 12');
 await expect.poll(async()=>Number(await unitsCanvas.getAttribute('data-rendered-sprites'))).toBeGreaterThan(0);
 await expect(unitsCanvas).toHaveAttribute('data-total-units',unitCount);
 await page.screenshot({path:'artifacts/pages-units-2d.png'});
 await unitsCanvas.focus();await page.keyboard.press('End');for(let n=0;n<4;n++)await page.keyboard.press('+');
 await expect(unitsCanvas).toHaveAttribute('data-settled','true');
 await expect(unitsCanvas).toHaveAttribute('data-unit-render-mode','3d');
 await expect(unitsCanvas).toHaveAttribute('data-rendered-sprites','0');
 await expect.poll(async()=>Number(await unitsCanvas.getAttribute('data-rendered-models'))).toBeGreaterThan(0);
 await expect(unitsCanvas).toHaveAttribute('data-total-units',unitCount);
 await page.screenshot({path:'artifacts/pages-units-3d.png'});
 checks.push('dispatched troops switch from 2D sprites to 3D models without changing troop count');
 await page.screenshot({path:'artifacts/pages-live-map-order.png'});
 await page.getByTestId('open-settings').click();await page.getByTestId('settings-save').click();
 await page.getByPlaceholder(/^(存档名称|Save name)$/).fill('Pages map order');await page.getByTestId('create-save').click();
 await expect(page.locator('.save-card').filter({hasText:'Pages map order'})).toBeVisible();
 if(regions){
  const routes=await page.evaluate(()=>{
   const records=Object.keys(localStorage).filter(k=>k.startsWith('rouge.save.natural-earth-admin1.regions.v3.')&&!k.endsWith('.backup'));
   const record=records.find(k=>localStorage.getItem(k).includes('Pages map order'));
   if(!record)throw new Error('Verification save missing');
   const s=JSON.parse(JSON.parse(localStorage.getItem(record)).body);
   return {version:s.version,map:s.map,grouping:s.grouping,units:s.units.filter(u=>u.owner===0&&u.destination!==null).map(u=>({destination:u.destination,route:u.route,travel:u.travel}))};
  });
  assert.equal(routes.map,atlas.mapId);
  assert.equal(routes.grouping.mapId,atlas.mapId);
  assert.equal(routes.grouping.groups.flatMap(g=>g.atoms).length,atlas.provinces.length);
  assert.equal(routes.units.length,1);
  assert.ok(routes.units.every(u=>u.destination===mapOrderFixture.target&&u.route.length===0&&u.travel?.points.length>=2));
  fs.writeFileSync('artifacts/remote-route-verification.json',JSON.stringify(routes,null,2));
  checks.push('new-map saved grouping, non-adjacent orders and continuous terrain waypoints');
 }
 assert.deepEqual(errors,[]);assert.deepEqual(failedResources,[]);
 const report={verifiedAt:new Date().toISOString(),url:site,build:info,checks,pageErrors:errors,failedResources,result:'PASS'};
 fs.writeFileSync('artifacts/pages-verification.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify(report,null,2));
 if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,`## Pages verified\nVersion: ${info.version}\n\nSource: ${info.sourceCommit}\n\nURL: ${site}\n\n${checks.map(x=>`- ${x}`).join('\n')}\n`);
}catch(e){
 await page.screenshot({path:'artifacts/pages-verification-failed.png'}).catch(()=>{});
 fs.writeFileSync('artifacts/pages-verification-error.txt',String(e));throw e;
}finally{await browser.close();}
