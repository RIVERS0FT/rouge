import {openMapSearch} from './map-search.ts';
import {test,expect} from '@playwright/test';
import {execFileSync} from 'node:child_process';

test('the pose texture reproduces both bone transforms for every infantry vertex and frame',async({page})=>{
 await page.route('**/infantry-poses',route=>route.fulfill({contentType:'text/html',body:'<!doctype html>'}));
 await page.goto('/infantry-poses');
 const error=await page.evaluate(async()=>{
  const THREE=await import('/node_modules/three/build/three.module.js');
  const {InfantryBatch}=await import('/src/render/infantryBatch.ts');
  let ready!:()=>void;
  const loaded=new Promise<void>(resolve=>{ready=resolve;});
  const batch=new InfantryBatch(new THREE.Scene(),ready);batch.request();await loaded;
  if(!batch.ready)throw Error('Infantry asset failed to load');
  const asset=batch.asset,image=batch.texture.image,vertices=asset.positions.length/3;
  const rows=Math.ceil(vertices/image.width);let maximum=0;
  for(let frame=0;frame<asset.poseCount;frame++)for(let i=0;i<vertices;i++){
   const weight=asset.weights[i]/255;
   for(let channel=0;channel<2;channel++)for(let axis=0;axis<3;axis++){
    const bone=(joint:number)=>{
     const j=12*(frame*asset.joints+joint)+4*axis;
     let value=channel===0?asset.palette[j+3]:0;
     for(let d=0;d<3;d++)value+=asset.palette[j+d]*(channel===0?asset.positions[3*i+d]:Math.max(-1,asset.normals[3*i+d]/127));
     return value;
    };
    const expected=weight*bone(asset.jointPair[2*i])+(1-weight)*bone(asset.jointPair[2*i+1]);
    const texel=(2*frame+channel)*rows*image.width+i;
    maximum=Math.max(maximum,Math.abs(expected-image.data[4*texel+axis]));
   }
  }
  batch.dispose();return maximum;
 });
 expect(error).toBeLessThan(1e-5);
});

test('garrisons stay counted but invisible in both map modes for every faction and kind',async({page})=>{
 test.setTimeout(180000);
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 const fixture=JSON.parse(execFileSync(process.execPath,['--experimental-strip-types','tests/create-unit-model-fixture.mjs'],{encoding:'utf8',maxBuffer:16*1024*1024}));
 await page.addInitScript(({key,value})=>localStorage.setItem(key,value),fixture);
 await page.goto('/');await page.getByTestId('open-saves').click();
 await page.locator('.save-card').filter({hasText:'Unit model fixture'}).getByRole('button',{name:'载入',exact:true}).click();
 await expect(page.locator('.app')).toHaveAttribute('data-local-ready','true',{timeout:60000});
 await page.getByTestId('toggle-pause').click();
 const canvas=page.locator('.world canvas');
 for(const region of fixture.regions){
  await openMapSearch(page);await page.getByTestId('map-search').fill(region.code);await page.locator('.map-search-results button').first().click();
  await canvas.focus();await page.keyboard.press('End');for(let n=0;n<4;n++)await page.keyboard.press('+');
  await expect(canvas).toHaveAttribute('data-settled','true',{timeout:20000});
  await expect(canvas).toHaveAttribute('data-unit-render-mode','3d');
  await expect(page.getByTestId('region-capacity')).toContainText(`${fixture.count} / ${region.capacity}`);
  await expect(canvas).toHaveAttribute('data-rendered-instances','0');
  await expect(canvas).toHaveAttribute('data-total-units',String(fixture.total));
  // At strategic distance the same garrison is not rendered as sprites either.
  await canvas.focus();await page.keyboard.press('Home');
  await expect(canvas).toHaveAttribute('data-settled','true',{timeout:20000});
  await expect(canvas).toHaveAttribute('data-unit-render-mode','2d');
  await expect(canvas).toHaveAttribute('data-rendered-instances','0');
  await expect(canvas).toHaveAttribute('data-total-units',String(fixture.total));
  await page.screenshot({path:`artifacts/unit-model-count-${region.owner}.png`});
 }
 expect(errors).toEqual([]);
});
