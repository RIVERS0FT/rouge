import {test,expect} from '@playwright/test';

test('route overlay pixels lie over map labels, behind depth-tested models and clip the preview markers',async({page})=>{
 await page.route('**/route-overlay-harness',route=>route.fulfill({contentType:'text/html',body:'<body style="margin:0"></body>'}));
 await page.goto('/route-overlay-harness');
 const info=await page.evaluate(async()=>{
  const THREE=await import('/node_modules/three/build/three.module.js');
  const {RoutePaintLayer}=await import('/src/render/routePaintLayer.ts');
  const {layerMapEntity,MAP_LAYERS}=await import('/src/render/mapLayers.ts');
  const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-1,1,1,-1,.01,10);
  camera.position.z=2;camera.updateMatrixWorld();
  const renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});
  renderer.setSize(128,96);document.body.append(renderer.domElement);
  const block=(w:number,h:number,color:string,order:number,depth:boolean)=>{
   const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({color,transparent:true,depthTest:depth,depthWrite:depth,toneMapped:false}));
   m.renderOrder=order;scene.add(m);return m;
  };
  const label=block(2,2,'#142c9c',MAP_LAYERS.countryName,false),entity=block(.30,.50,'#00af40',0,true);
  layerMapEntity(entity,entity.material);
  let invalidations=0;
  const layer=new RoutePaintLayer(scene,()=>invalidations++);
  const ribbon='M12,30L114,30L114,62L12,62Z';
  const get=(x:number,y:number)=>{
   const gl=renderer.getContext(),r=new Uint8Array(4);
   gl.readPixels(x,96-1-y,1,1,gl.RGBA,gl.UNSIGNED_BYTE,r);return Array.from(r);
  };
  layer.resize(128,96,4);
  layer.setCommitted([{d:ribbon,outline:''}]);layer.flush();
  const texture=layer.mesh.material.uniforms.routeTexture.value,version=texture.version;
  layer.setCommitted([{d:ribbon,outline:''}]);layer.resize(128,96,4);layer.flush();
  const unchanged=texture.version===version;
  renderer.render(scene,camera);
  const result={red:get(28,43),overlap:get(64,43),base:get(4,4),
   unchanged,order:layer.mesh.renderOrder,canvasSize:[texture.image.width,texture.image.height],invalidations};
  entity.visible=false;
  layer.setCommitted([]);
  layer.setPreview({d:ribbon,target:'',targetMask:'',cx:122,cy:82,opacity:1,
   markers:[{d:'M18,20L36,20L36,42L18,42Z',opacity:.9}]});
  layer.flush();renderer.render(scene,camera);
  const marker=get(24,34),outside=get(24,23);
  layer.setPreview(null);const lastVersion=texture.version;layer.flush();
  const noWorkWhenEmpty=!layer.mesh.visible&&texture.version===lastVersion;
  layer.dispose();entity.geometry.dispose();entity.material.dispose();label.geometry.dispose();label.material.dispose();renderer.dispose();renderer.domElement.remove();
  return {...result,marker,outside,noWorkWhenEmpty};
 });
 expect(info.order).toBe(6);
 expect(info.canvasSize).toEqual([160,120]);expect(info.unchanged).toBe(true);expect(info.invalidations).toBe(2);expect(info.noWorkWhenEmpty).toBe(true);
 expect(info.red[0]).toBeGreaterThan(info.red[2]);
 expect(info.overlap[1]).toBeGreaterThan(140);expect(info.overlap[0]).toBeLessThan(4);
 expect(info.base[2]).toBeGreaterThan(140);
 expect(info.marker[1]).toBeGreaterThan(info.red[1]+40);expect(info.outside).toEqual(info.base);
});
