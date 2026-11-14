import {test,expect} from '@playwright/test';

test('incremental cache matches a whole-image render across borders, coast shadows and tile seams; swaps atomically',async({page})=>{
 await page.route('http://127.0.0.1:5187/',route=>route.fulfill({contentType:'text/html',body:'<html><body></body></html>'}));await page.goto('/');
 const result=await page.evaluate(async()=>{
  // @ts-expect-error Vite URL
  const THREE=await import('/node_modules/three/build/three.module.js');
  // @ts-expect-error Vite URL
  const {FlatMapCache}=await import('/src/render/flatMapCache.ts');
  // @ts-expect-error Vite URL
  const {CoastShadow}=await import('/src/render/coastShadow.ts');
  // @ts-expect-error Vite URL
  const {LineSegments2}=await import('/node_modules/three/examples/jsm/lines/LineSegments2.js');
  // @ts-expect-error Vite URL
  const {LineSegmentsGeometry}=await import('/node_modules/three/examples/jsm/lines/LineSegmentsGeometry.js');
  // @ts-expect-error Vite URL
  const {LineMaterial}=await import('/node_modules/three/examples/jsm/lines/LineMaterial.js');
  const renderer=new THREE.WebGLRenderer({preserveDrawingBuffer:true});renderer.setSize(480,320);renderer.setPixelRatio(1.25);renderer.outputColorSpace=THREE.SRGBColorSpace;
  const camera=new THREE.PerspectiveCamera(40,1.5,.1,1000);camera.up.set(0,0,-1);camera.position.set(0,100,0);camera.lookAt(0,0,0);camera.updateMatrixWorld();
  const gl=renderer.getContext(),read=()=>{const pixels=new Uint8Array(600*400*4);gl.readPixels(0,0,600,400,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return pixels;};
  function exercise(tileSize:number){
   const scene=new THREE.Scene(),background=new THREE.Group();scene.add(background);
   const sea=new THREE.Mesh(new THREE.PlaneGeometry(400,400),new THREE.MeshBasicMaterial({color:'#103e48',toneMapped:false}));sea.rotation.x=-Math.PI/2;sea.position.y=-.25;background.add(sea);
   const land=new THREE.Mesh(new THREE.PlaneGeometry(66,38),new THREE.MeshBasicMaterial({color:'#afc483',toneMapped:false}));land.rotation.x=-Math.PI/2;land.position.y=.16;background.add(land);
   const corners=[{x:-33,z:-19},{x:33,z:-19},{x:33,z:19},{x:-33,z:19}],coast=new CoastShadow(corners.map((a,i)=>({a,b:corners[(i+1)%4],atoms:[0]})),{left:-200,right:200,top:-200,bottom:200});background.add(coast.surface);
   const line=new LineSegments2(new LineSegmentsGeometry().setPositions([-80,.3,-30,80,.3,30,-20,.3,-80,20,.3,80]),new LineMaterial({color:'#273a30',linewidth:2.2,worldUnits:false,transparent:true,depthWrite:false}));background.add(line);
   const cache=new FlatMapCache(tileSize);cache.attach(background,renderer);scene.add(cache.surface);let revision=0;
   const prepare=()=>cache.prepare(renderer,camera,revision,false,(c:any,width:number,height:number,ratio:number,viewport:any)=>{
    const hook=line.material.onBeforeRender,oldWidth=line.material.linewidth;line.material.linewidth*=ratio/renderer.getPixelRatio();line.material.onBeforeRender=()=>line.material.resolution.set(width/renderer.getPixelRatio(),height/renderer.getPixelRatio());
    try{coast.renderMask(renderer,c,false,{width,height,pixelRatio:ratio,offsetX:viewport.maskOffsetX,offsetY:viewport.maskOffsetY});renderer.render(scene,c);}finally{line.material.linewidth=oldWidth;line.material.onBeforeRender=hook;}
   });
   let passes=0;do{prepare();if(++passes>100)throw Error('unfinished cache');}while(cache.pending);
   function screen(){background.visible=false;cache.surface.visible=true;renderer.render(scene,camera);const pixels=read();background.visible=true;cache.surface.visible=false;return pixels;}
   const pixels=screen(),texture=cache.surface.material.map;
   land.material.color.set('#8b9f67');revision++;prepare();const atomic=!cache.pending||cache.surface.material.map===texture;
   const before=cache.pending?screen():null;
   revision++;land.material.color.set('#859761');prepare();
   let updates=0;while(cache.pending){prepare();if(++updates>100)throw Error('content changed during build never settled');}const after=screen();
   // A sudden zoom-out must ask for the normal sharp renderer until coverage
   // is complete, rather than return an enlarged low-resolution placeholder.
   camera.position.y=300;camera.lookAt(0,0,0);camera.updateMatrixWorld();prepare();const fallback=cache.pending&&!cache.usable;
   while(cache.pending)prepare();const covered=cache.usable;
   camera.position.y=30;camera.lookAt(0,0,0);camera.updateMatrixWorld();prepare();const sharpZoomIn=cache.pending&&!cache.usable;while(cache.pending)prepare();
   camera.position.y=100;camera.lookAt(0,0,0);camera.updateMatrixWorld();
   cache.dispose();coast.dispose();for(const object of [land,sea,line,coast.surface]){object.geometry.dispose();object.material.dispose();}
   return {pixels,before,after,passes,atomic,fallback,covered,sharpZoomIn};
  }
  const whole=exercise(2048),tiles=exercise(512);let maxDifference=0,different=0,atomicDifference=0,changed=0,freshDifference=0;
  for(let i=0;i<whole.pixels.length;i++){const delta=Math.abs(whole.pixels[i]-tiles.pixels[i]);maxDifference=Math.max(maxDifference,delta);if(delta>2)different++;if(tiles.before)atomicDifference=Math.max(atomicDifference,Math.abs(tiles.before[i]-tiles.pixels[i]));if(tiles.after[i]!==tiles.pixels[i])changed++;freshDifference=Math.max(freshDifference,Math.abs(tiles.after[i]-whole.after[i]));}
  renderer.dispose();return {maxDifference,different,atomicDifference,changed,freshDifference,passes:tiles.passes,atomic:tiles.atomic,fallback:tiles.fallback,covered:tiles.covered,sharpZoomIn:tiles.sharpZoomIn};
 });
 expect(result.passes).toBeGreaterThan(1);expect(result.atomic).toBe(true);expect(result.atomicDifference).toBe(0);expect(result.changed).toBeGreaterThan(1000);
 expect(result.different).toBe(0);expect(result.maxDifference).toBeLessThanOrEqual(2);expect(result.freshDifference).toBeLessThanOrEqual(2);expect(result.fallback).toBe(true);expect(result.covered).toBe(true);expect(result.sharpZoomIn).toBe(true);
});
