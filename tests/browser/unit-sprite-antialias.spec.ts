import {test,expect} from '@playwright/test';

test('army atlas retains smooth coverage and distinct glyphs at strategic pixel sizes',async({page})=>{
 await page.route('**/sprite-harness',route=>route.fulfill({contentType:'text/html',body:'<body style="margin:0;background:#8bac98;font:12px sans-serif"></body>'}));
 await page.goto('/sprite-harness');
 const results=await page.evaluate(async()=>{
  // Vite serves the real production module. This exercises Canvas2D artwork,
  // isolated mip chain, atlas UVs, and the instanced material together.
  const {createUnitSpriteTexture,createUnitSpriteMesh}=await import('/src/render/unitSprites.ts');
  const THREE=await import('/node_modules/three/build/three.module.js');
  const texture=createUnitSpriteTexture();
  let borderLeaks=0;
  for(const mip of texture.mipmaps){
   const cell=mip.width/4,data=mip.getContext('2d')!.getImageData(0,0,mip.width,mip.height).data;
   for(let y=0;y<mip.height;y++)for(let x=0;x<mip.width;x++){
    if(cell<4||x%cell===0||x%cell===cell-1||y%cell===0||y%cell===cell-1){
     if(data[(y*mip.width+x)*4+3]!==0)borderLeaks++;
    }
   }
  }
  const renderer=new THREE.WebGLRenderer({alpha:true,antialias:false});
  renderer.setClearColor(0,0);
  const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(0,256,64,0,.1,10);camera.position.z=2;
  const mesh=createUnitSpriteMesh(texture,9);mesh.count=9;scene.add(mesh);
  const glyphs=mesh.geometry.getAttribute('unitGlyph');for(let i=0;i<9;i++)glyphs.setX(i,i);glyphs.needsUpdate=true;
  const samples=[];
  for(const dpr of [1,1.5]){
   const width=256*dpr,height=64*dpr;
   renderer.setSize(width,height);
   const target=new THREE.WebGLRenderTarget(width,height);renderer.setRenderTarget(target);
   const sheet=document.createElement('canvas');sheet.dataset.dpr=String(dpr);
   sheet.width=width;sheet.height=12*(24*dpr+16);document.body.append(sheet);
   const ctx=sheet.getContext('2d')!;ctx.font='10px sans-serif';let row=0;
   for(const size of [7,11,16])for(const offset of [0,.25,.5,.75]){
   for(let i=0;i<9;i++)mesh.setMatrixAt(i,new THREE.Matrix4().compose(new THREE.Vector3(16+i*26+offset,32+offset,0),new THREE.Quaternion(),new THREE.Vector3(size,size,1)));
   mesh.instanceMatrix.needsUpdate=true;renderer.render(scene,camera);
   const pixels=new Uint8Array(width*height*4);renderer.readRenderTargetPixels(target,0,0,width,height,pixels);
   const crop=ctx.createImageData(width,24*dpr);
   for(let y=0;y<24*dpr;y++)crop.data.set(pixels.subarray(((44*dpr-1-y)*width)*4,((44*dpr-y)*width)*4),y*width*4);
   ctx.fillStyle='#14241d';ctx.fillText(`${size}px · offset ${offset} · DPR ${dpr}`,4,row+11);
   ctx.putImageData(crop,0,row+16);row+=24*dpr+16;
   let fractional=0,visible=0,gutter=0;const signatures=[];
   for(let i=0;i<9;i++){
    const rgb=[];
    for(let y=20*dpr;y<44*dpr;y++)for(let x=(4+i*26)*dpr;x<(28+i*26)*dpr;x++){
     const n=(y*width+x)*4,a=pixels[n+3];if(a>0)visible++;if(a>0&&a<255)fractional++;
     rgb.push(...pixels.slice(n,n+4));
     if((x===(4+i*26)*dpr||x===(28+i*26)*dpr-1)&&a>0)gutter++;
    }
    signatures.push(rgb.join(','));
   }
   samples.push({dpr,size,offset,fractional,visible,gutter,distinct:new Set(signatures).size});
   }
   target.dispose();
  }
  mesh.dispose();mesh.geometry.dispose();mesh.material.dispose();texture.dispose();renderer.dispose();return {samples,borderLeaks};
 });
 for(const dpr of [1,1.5])await page.locator(`canvas[data-dpr="${dpr}"]`).screenshot({path:`artifacts/unit-sprites-native-dpr-${dpr}.png`});
 expect(results.borderLeaks).toBe(0);
 for(const result of results.samples){
  expect(result.fractional,JSON.stringify(result)).toBeGreaterThan(20);
  expect(result.visible).toBeGreaterThan(100);expect(result.gutter).toBe(0);
  expect(result.distinct).toBe(9);
 }
});
