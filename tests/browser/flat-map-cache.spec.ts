import {test,expect} from '@playwright/test';

test('flat cache keeps colours and coordinates while panning and zooming, invalidates on content and resize',async({page})=>{
 await page.route('http://127.0.0.1:5187/',route=>route.fulfill({contentType:'text/html',body:'<html><body></body></html>'}));await page.goto('/');
 const result=await page.evaluate(async()=>{
  // @ts-expect-error Vite module
  const THREE=await import('/node_modules/three/build/three.module.js');
  // @ts-expect-error Vite module
  const {FlatMapCache}=await import('/src/render/flatMapCache.ts');
  const renderer=new THREE.WebGLRenderer({preserveDrawingBuffer:true});renderer.setSize(240,160);renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;renderer.setClearColor('#193c43');
  const scene=new THREE.Scene(),background=new THREE.Group(),camera=new THREE.PerspectiveCamera(40,1.5,.1,1000);camera.up.set(0,0,-1);
  const lit=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshStandardMaterial({color:'#81977d',roughness:1}));lit.rotation.x=-Math.PI/2;lit.position.y=.16;background.add(lit);
  scene.add(background,new THREE.HemisphereLight(0xf5eedb,0x34484b,2.3));const sun=new THREE.DirectionalLight(0xfff2dc,1.7);sun.position.set(-100,250,-120);scene.add(sun);
  const sea=new THREE.Mesh(new THREE.PlaneGeometry(30,200),new THREE.MeshBasicMaterial({color:'#103e48',toneMapped:false}));sea.rotation.x=-Math.PI/2;sea.position.set(45,.2,0);background.add(sea);
  const cache=new FlatMapCache();cache.attach(background,renderer);scene.add(cache.surface);
  const gl=renderer.getContext(),pixel=new Uint8Array(4),sample=()=>{gl.readPixels(120,80,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);return [...pixel];};
  let draws=0,revision=0;const frames:unknown[]=[];
  function draw(x:number,distance:number){
   camera.position.set(x,distance,0);camera.lookAt(x,0,0);camera.updateMatrixWorld();renderer.render(scene,camera);const original=sample();
   let passes=0;
   do{cache.prepare(renderer,camera,revision,false,(c:any)=>{draws++;renderer.render(scene,c);});if(++passes>300)throw new Error('cache did not finish');}while(cache.pending);
   background.visible=false;cache.surface.visible=true;renderer.render(scene,camera);const cached=sample();cache.surface.visible=false;background.visible=true;
   frames.push({original,cached});
  }
  draw(0,100);const first=draws;draw(5,100);draw(5,85);const reused=draws===first;
  draw(45,85);const moved=draws>first;const prior=draws;revision++;draw(45,85);const invalidated=draws>prior;
  const beforeResize=draws;renderer.setSize(360,240);draw(45,85);const resized=draws>beforeResize;
  cache.dispose();lit.geometry.dispose();lit.material.dispose();sea.geometry.dispose();sea.material.dispose();renderer.dispose();return {frames,reused,moved,invalidated,resized};
 });
 expect(result.reused).toBe(true);expect(result.moved).toBe(true);expect(result.invalidated).toBe(true);expect(result.resized).toBe(true);
 for(const {original,cached} of result.frames as {original:number[];cached:number[]}[])for(let i=0;i<3;i++)expect(Math.abs(original[i]-cached[i])).toBeLessThanOrEqual(2);
});
