import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium,expect} from '@playwright/test';

const external=process.env.PAGES_URL;
const url=external || 'http://127.0.0.1:4173/rouge/';
const base=new URL(url);
if(!base.pathname.endsWith('/'))throw new Error('Pages URL must end with /');
const server=external?null:spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--mode','pages','--host','127.0.0.1','--port','4173','--strictPort'],{stdio:'inherit'});
let browser;
const prefix=external?'published':'static';
fs.mkdirSync('artifacts',{recursive:true});
const failures=[],apiCalls=[],workers=[];
try {
 let ready=false;
 for(let n=0;n<60;n++) {
  try {const response=await fetch(url);if(response.ok){
   if(external && process.env.EXPECTED_COMMIT){
    const info=await (await fetch(new URL('build-info.json',base))).json();
    if(info.sourceCommit!==process.env.EXPECTED_COMMIT){await delay(1000);continue;}
   }
   ready=true;break;
  }}catch{}
  await delay(1000);
 }
 assert.ok(ready,`Site unavailable: ${url}`);
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const context=await browser.newContext({viewport:{width:1440,height:960}});
 const page=await context.newPage();
 page.on('pageerror',e=>failures.push(e.message));
 page.on('response',r=>{if(r.status()>=400)failures.push(`${r.status()} ${r.url()}`);});
 page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api'))apiCalls.push(r.url());});
 page.on('worker',w=>workers.push(w.url()));
 await page.goto(url,{waitUntil:'networkidle',timeout:60000});
 await expect(page.getByRole('heading',{name:/ROUGE/})).toBeVisible();
 await expect(page.getByTestId('hosting-notice')).toBeVisible();
 await expect(page.getByTestId('multiplayer')).toBeDisabled();
 await page.screenshot({path:`artifacts/${prefix}-menu.png`});
 await page.getByRole('button',{name:'English',exact:true}).click();
 await page.getByTestId('single-player').click();
 await page.getByTestId('commander-name').fill('Pages Smoke');
 await page.getByTestId('begin-campaign').click();
 await expect(page.locator('.hud-top')).toContainText('Pages Smoke',{timeout:30000});
 await expect.poll(async()=>Number(await page.getByTestId('game-clock').getAttribute('data-tick')),{timeout:30000}).toBeGreaterThan(5);
 assert.ok(workers.length>0,'Local simulation worker was not created');
 assert.ok(workers.every(w=>w.startsWith(new URL('assets/',base).href)),`Wrong worker paths: ${workers}`);
 await expect(page.locator('.render-error')).toHaveCount(0);
 await page.getByTestId('dispatch').click();
 await page.getByTestId('open-upgrades').click();
 await page.getByTestId('upgrade-infantry-attack').click();
 await expect(page.locator('.upgrade-card').first()).toContainText('1/8');
 await page.getByRole('button',{name:'Close',exact:true}).click();
 await page.getByRole('button',{name:'3D',exact:true}).click();
 await expect(page.locator('canvas')).toHaveAttribute('data-settled','true',{timeout:20000});
 await page.screenshot({path:`artifacts/${prefix}-game.png`});
 await page.getByTestId('open-settings').click();
 await page.screenshot({path:`artifacts/${prefix}-settings.png`});
 await page.getByTestId('settings-save').click();
 await page.getByPlaceholder('Save name').fill('Pages smoke save');
 await page.getByTestId('create-save').click();
 await expect(page.locator('.save-card').filter({hasText:'Pages smoke save'})).toHaveCount(1);
 await page.reload({waitUntil:'networkidle'});
 await page.getByTestId('open-saves').click();
 await page.locator('.save-card').filter({hasText:'Pages smoke save'}).getByRole('button',{name:'Load',exact:true}).click();
 await expect(page.locator('.hud-top')).toContainText('Pages Smoke',{timeout:30000});
 await page.getByTestId('open-upgrades').click();
 await expect(page.locator('.upgrade-card').first()).toContainText('1/8');
 assert.deepEqual(apiCalls,[],'Static site attempted a LAN request');
 assert.deepEqual(failures,[],'Browser/asset failures');
 const evidence={url,result:'passed',profile:'github-pages',workerURLs:workers,checks:['menu','disabled LAN','WebGL map','simulation ticks','dispatch','upgrade','3D view','settings','save','reload','load upgraded state'],apiCalls,failures};
 fs.writeFileSync(`artifacts/${prefix}-smoke.json`,JSON.stringify(evidence,null,2)+'\n');
 console.log(JSON.stringify(evidence));
} finally {
 if(browser)await browser.close();
 if(server)server.kill('SIGTERM');
}
