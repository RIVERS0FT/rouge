import {test,expect} from '@playwright/test';

test('coastal shadow fades offshore while opaque land keeps its original color',async({page})=>{
 await page.route('http://127.0.0.1:5187/',route=>route.fulfill({contentType:'text/html',body:'<html><body></body></html>'}));
 await page.goto('/');
 const result=await page.evaluate(async()=>{
  // Exercise the real GPU shader and depth mask without a second copy of the atlas.
  // @ts-expect-error browser URL is served by Vite
  const THREE=await import('/node_modules/three/build/three.module.js');
  // @ts-expect-error browser URL is served by Vite
  const {CoastShadow}=await import('/src/render/coastShadow.ts');
  const renderer=new THREE.WebGLRenderer({preserveDrawingBuffer:true});renderer.setPixelRatio(1);renderer.setSize(200,200);document.body.append(renderer.domElement);
  const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-10,10,10,-10,.1,30);camera.position.set(0,10,0);camera.up.set(0,0,-1);camera.lookAt(0,0,0);
  const sea=new THREE.Mesh(new THREE.PlaneGeometry(20,20),new THREE.MeshBasicMaterial({color:'#103e48',toneMapped:false}));sea.rotation.x=-Math.PI/2;sea.position.y=-.25;scene.add(sea);
  const land=new THREE.Mesh(new THREE.PlaneGeometry(10,10),new THREE.MeshBasicMaterial({color:'#d5c79e',toneMapped:false}));land.rotation.x=-Math.PI/2;land.position.y=.16;scene.add(land);
  const corners=[{x:-5,z:-5},{x:5,z:-5},{x:5,z:5},{x:-5,z:5}];
  const layer=new CoastShadow(corners.map((a,i)=>({a,b:corners[(i+1)%4],atoms:[0]})),{left:-10,right:10,top:-10,bottom:10}),shadow=layer.surface;scene.add(shadow);
  const context=renderer.getContext(),pixel=new Uint8Array(4);
  const sample=(x:number)=>{context.readPixels(x,100,1,1,context.RGBA,context.UNSIGNED_BYTE,pixel);return [...pixel];};
  shadow.visible=false;renderer.render(scene,camera);const baseLand=sample(149),baseWater=sample(151);
  shadow.visible=true;layer.renderMask(renderer,camera,false);renderer.render(scene,camera);const near=sample(151),far=sample(155),open=sample(160),inland=sample(149);
  const calls=renderer.info.render.calls;layer.renderMask(renderer,camera,false);const cached=renderer.info.render.calls===calls;
  const coast=corners.map((a,i)=>({a,b:corners[(i+1)%4],atoms:[0]})),duplicate=new CoastShadow([...coast,...coast],{left:-10,right:10,top:-10,bottom:10});
  shadow.visible=false;scene.add(duplicate.surface);duplicate.renderMask(renderer,camera,false);renderer.render(scene,camera);const overlap=sample(151);
  for(const effect of [layer,duplicate]){effect.dispose();effect.surface.geometry.dispose();effect.surface.material.dispose();}for(const mesh of [land,sea]){mesh.geometry.dispose();mesh.material.dispose();}renderer.dispose();
  return {baseLand,baseWater,near,far,open,inland,overlap,cached};
 });
 expect(result.inland).toEqual(result.baseLand);
 expect(result.near[1]).toBeLessThan(result.far[1]);
 expect(result.far[1]).toBeLessThanOrEqual(result.open[1]);
 expect(result.open).toEqual(result.baseWater);
 expect(result.overlap).toEqual(result.near);expect(result.cached).toBe(true);
 await page.screenshot({path:'artifacts/coast-shadow-depth-check.png'});
});
