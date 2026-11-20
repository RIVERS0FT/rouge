import {test,expect} from '@playwright/test';

test('remaining march legs paint the turn and move their tail in flat and tilted views',async({page})=>{
 await page.route('**/march-route-pixels',r=>r.fulfill({contentType:'text/html',body:'<body></body>'}));
 await page.goto('/march-route-pixels');
 const result=await page.evaluate(async()=>{
  const THREE=await import('/node_modules/three/build/three.module.js');
  const {AttackArrows}=await import('/src/render/attackArrows.ts'),{RoutePaintLayer}=await import('/src/render/routePaintLayer.ts');
  const {groundArrowProjection}=await import('/src/render/groundArrowProjection.ts');
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(40,1,.1,1000);
  const renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});
  renderer.setClearColor(0);renderer.setSize(400,400);const gl=renderer.getContext();
  const layer=new RoutePaintLayer(scene,camera,0,()=>{}),arrows=new AttackArrows(document.body,layer);
  const from={x:-12,y:0},bend={x:12,y:0},end={x:12,y:-12},routes=[{owner:1,from:0,to:1,units:4,segment:'a'},{owner:1,from:0,to:1,units:4,segment:'b'}];
  const results=[];
  for(const tilt of [0,24]){
   camera.position.set(0,50,tilt);camera.up.set(0,0,-1);camera.lookAt(0,0,0);camera.updateMatrixWorld();
   const projection=groundArrowProjection(camera,400,400,0);
   for(const tail of [-12,3]){
    from.x=tail;
    arrows.draw(routes,(r:any,copy:number)=>copy?null:r.segment==='a'?[from,bend]:[bend,end],projection,400,400,()=>'red',String(tilt));
    layer.flush();renderer.render(scene,camera);
    const lit=(x:number,y:number)=>{const p=projection.point({x,y})!,v=new Uint8Array(4);gl.readPixels(Math.floor(p.x),399-Math.floor(p.y),1,1,gl.RGBA,gl.UNSIGNED_BYTE,v);return v[0]>40;};
    results.push([lit(-6,0),lit(8,0),lit(12,-6),lit(0,-6)]);
   }
  }
  arrows.dispose();layer.dispose();renderer.dispose();return results;
 });
 expect(result).toEqual([[true,true,true,false],[false,true,true,false],[true,true,true,false],[false,true,true,false]]);
});

test('world route fills match the canvas body, overlapping outlines and ledger order after a pan',async({page})=>{
 await page.route('**/world-route-pixels',r=>r.fulfill({contentType:'text/html',body:'<body></body>'}));
 await page.goto('/world-route-pixels');
 const samples=await page.evaluate(async()=>{
  const THREE=await import('/node_modules/three/build/three.module.js');
  const {RoutePaintLayer}=await import('/src/render/routePaintLayer.ts');
  const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(0,128,96,0,.1,10);
  camera.up.set(0,0,-1);camera.position.set(0,2,0);camera.lookAt(0,0,0);camera.updateMatrixWorld();
  const glRenderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});
  glRenderer.setClearColor('#142c9c');glRenderer.setSize(128,96);
  const layer=new RoutePaintLayer(scene,camera,0,()=>{});layer.resize(128,96,1);
  const rect=(x:number,z:number,x2:number,z2:number)=>[{x,y:z},{x:x2,y:z},{x:x2,y:z2},{x,y:z2}];
  const routes=[{body:rect(16,-60,70,-32),edge:[rect(16,-60,26,-32),rect(20,-60,30,-32)]},
   {body:rect(45,-54,92,-38),edge:[rect(82,-54,92,-38)]}];
  const gl=glRenderer.getContext(),read=(x:number)=>{const b=new Uint8Array(4);gl.readPixels(x,46,1,1,gl.RGBA,gl.UNSIGNED_BYTE,b);return Array.from(b);};
  const path=(p:{x:number;y:number}[])=>'M'+p.map(v=>v.x+','+(96+v.y)).join('L')+'Z';
  layer.setCommitted(routes.map(r=>({d:path(r.body),outline:r.edge.map(path).join('')})));layer.flush();glRenderer.render(scene,camera);
  const points=[6,18,22,28,36,52,75,87],reference=points.map(read);
  layer.setWorldRoutes(routes);layer.flush();glRenderer.render(scene,camera);const gpu=points.map(read);
  camera.position.x=4;camera.lookAt(4,0,0);camera.updateMatrixWorld();glRenderer.render(scene,camera);
  const pan=points.map(x=>read(x-4));
  layer.dispose();glRenderer.dispose();return {reference,gpu,pan};
 });
 expect(new Set(samples.reference.map(c=>c.join(','))).size).toBeGreaterThanOrEqual(4);
 for(let i=0;i<samples.reference.length;i++){
  for(let c=0;c<4;c++)expect(Math.abs(samples.reference[i][c]-samples.gpu[i][c])).toBeLessThanOrEqual(3);
  expect(samples.pan[i]).toEqual(samples.gpu[i]);
 }
});

test('flat route painting reuses its texels inside the margin and refreshes after a pan or a dispatch change',async({page})=>{
 await page.route('**/flat-route-margin',route=>route.fulfill({contentType:'text/html',body:'<body></body>'}));
 await page.goto('/flat-route-margin');
 const versions=await page.evaluate(async()=>{
  const THREE=await import('/node_modules/three/build/three.module.js');
  const {RoutePaintLayer}=await import('/src/render/routePaintLayer.ts');
  const {groundArrowProjection}=await import('/src/render/groundArrowProjection.ts');
  const camera=new THREE.OrthographicCamera(-1,1,1,-1,.01,10);
  camera.up.set(0,0,-1);
  const layer=new RoutePaintLayer(new THREE.Scene(),camera,0,()=>{});
  const body=new Path2D();body.rect(-.5,-.1,1,.2);
  const route={d:'',outline:'',ground:{body,edge:new Path2D()}};
  const texture=layer.mesh.material.uniforms.routeTexture.value;
  const draw=(x:number,routes= [route])=>{
   camera.position.set(x,2,0);camera.lookAt(x,0,0);camera.updateMatrixWorld();
   layer.resize(128,96,1.25);
   layer.setCommitted(routes,layer.captureView(),groundArrowProjection(camera,128,96,0).affine);
   layer.flush();return texture.version;
  };
  const initial=draw(0),inside=draw(.1),outside=draw(.4);
  const replaced=draw(.4,[{...route,ground:{body:new Path2D(body),edge:new Path2D()}}]);
  const overscannedWidth=texture.image.width;
  let now=performance.now();
  Object.defineProperty(performance,'now',{configurable:true,value:()=>now});
  const advance=(interval:number)=>{
   now+=interval;
   draw(.4,[{...route,ground:{body:new Path2D(body),edge:new Path2D()}}]);
  };
  for(let n=0;n<16;n++)advance(200);
  const nativeWidth=texture.image.width;
  for(let n=0;n<24;n++)advance(16);
  const recoveredWidth=texture.image.width;
  Reflect.deleteProperty(performance,'now');
  draw(.4,[]);const cleared=!layer.mesh.visible;
  layer.dispose();return {initial,inside,outside,replaced,cleared,overscannedWidth,nativeWidth,recoveredWidth};
 });
 expect(versions.inside).toBe(versions.initial);
 expect(versions.outside).toBeGreaterThan(versions.inside);
 expect(versions.replaced).toBeGreaterThan(versions.outside);
 expect(versions.cleared).toBe(true);
 expect(versions.nativeWidth).toBe(160);
 expect(versions.overscannedWidth).toBeGreaterThan(versions.nativeWidth);
 expect(versions.recoveredWidth).toBe(versions.overscannedWidth);
});

test('painted arrows stay on the ground through camera motion without repainting, including fading previews',async({page})=>{
 await page.route('**/ground-route-harness',route=>route.fulfill({contentType:'text/html',body:'<body style="margin:0"></body>'}));
 await page.goto('/ground-route-harness');
 const info=await page.evaluate(async()=>{
  const THREE=await import('/node_modules/three/build/three.module.js');
  const {RoutePaintLayer}=await import('/src/render/routePaintLayer.ts');
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(40,128/96,.1,100);
  const move=(x:number,y:number,z:number)=>{camera.up.set(0,0,-1);camera.position.set(x,y,z);camera.lookAt(x,0,0);camera.updateMatrixWorld();};
  move(0,4,0);
  const renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});
  renderer.setSize(128,96);renderer.setClearColor('#142c9c');document.body.append(renderer.domElement);
  const layer=new RoutePaintLayer(scene,camera,0,()=>{});layer.resize(128,96,1);
  const d='M64,36L80,36L80,52L64,52Z';layer.setCommitted([{d,outline:''}]);layer.flush();
  const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(72/64-1,1-44/48),camera);
  const anchor=ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),0),new THREE.Vector3())!;
  const get=(x:number,y:number)=>{const gl=renderer.getContext(),rgba=new Uint8Array(4);gl.readPixels(Math.round(x),95-Math.round(y),1,1,gl.RGBA,gl.UNSIGNED_BYTE,rgba);return Array.from(rgba);};
  const point=()=>{const p=anchor.clone().project(camera);return{x:(p.x+1)*64,y:(1-p.y)*48};};
  const sample=()=>{renderer.render(scene,camera);const p=point();return{...p,color:get(p.x,p.y)};};
  const texture=layer.mesh.material.uniforms.routeTexture.value,version=texture.version;
  const initial=sample();move(.5,4,0);const pan=sample(),oldPixel=get(initial.x,initial.y);
  move(0,2,0);const zoom=sample();move(0,3.3,1.5);const tilt=sample();
  const unchanged=texture.version===version;
  // Released previews retain the view they were drawn in, even when a newer
  // committed route is painted under the current camera during their fade.
  move(0,4,0);const view=layer.captureView();
  const preview={d,target:'',targetMask:'',cx:120,cy:80,opacity:1,markers:[]};
  layer.setCommitted([]);layer.setPreview(preview,view);layer.flush();
  move(.5,4,0);layer.setCommitted([{d:'M4,4L12,4L12,12L4,12Z',outline:''}]);
  layer.setPreview({...preview,opacity:.6},view);layer.flush();const faded=sample(),fadedOldPixel=get(72,44);
  const heights=Array.from(layer.mesh.geometry.getAttribute('position').array).filter((_v,i)=>i%3===1);
  layer.dispose();renderer.dispose();renderer.domElement.remove();
  return{initial,pan,zoom,tilt,oldPixel,unchanged,faded,fadedOldPixel,heights};
 });
 for(const sample of [info.initial,info.pan,info.zoom,info.tilt])expect(sample.color[0]).toBeGreaterThan(sample.color[2]);
 expect(info.faded.color[0]).toBeGreaterThan(60);expect(info.faded.color[2]).toBeLessThan(140);
 expect(info.pan.x).toBeLessThan(info.initial.x-15);expect(info.zoom.x-info.initial.x).toBeGreaterThan(7);
 expect(info.oldPixel).toEqual([20,44,156,255]);expect(info.fadedOldPixel).toEqual(info.oldPixel);
 expect(info.unchanged).toBe(true);expect(info.heights).toEqual([0,0,0,0]);
});

test('route overlay pixels lie over map labels, behind depth-tested models and clip the preview markers',async({page})=>{
 await page.route('**/route-overlay-harness',route=>route.fulfill({contentType:'text/html',body:'<body style="margin:0"></body>'}));
 await page.goto('/route-overlay-harness');
 const info=await page.evaluate(async()=>{
  const THREE=await import('/node_modules/three/build/three.module.js');
  const {RoutePaintLayer}=await import('/src/render/routePaintLayer.ts');
  const {layerMapEntity,MAP_LAYERS}=await import('/src/render/mapLayers.ts');
  const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-1,1,1,-1,.01,10);
  camera.up.set(0,0,-1);camera.position.y=2;camera.lookAt(0,0,0);camera.updateMatrixWorld();
  const renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});
  renderer.setSize(128,96);document.body.append(renderer.domElement);
  const block=(w:number,h:number,color:string,order:number,depth:boolean)=>{
   const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({color,transparent:true,depthTest:depth,depthWrite:depth,toneMapped:false}));
   m.rotation.x=-Math.PI/2;m.renderOrder=order;scene.add(m);return m;
  };
  const label=block(2,2,'#142c9c',MAP_LAYERS.countryName,false),entity=block(.30,.50,'#00af40',0,true);
  layerMapEntity(entity,entity.material);
  let invalidations=0;
  const layer=new RoutePaintLayer(scene,camera,0,()=>invalidations++);
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
