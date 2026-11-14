import {test,expect} from '@playwright/test';

test('tiled coastlines match independent source segments at strategic and tilted zoom',async({page})=>{
 await page.route('http://127.0.0.1:5187/',route=>route.fulfill({contentType:'text/html',body:'<body style="margin:0"></body>'}));await page.goto('/');
 const result=await page.evaluate(async()=>{
  // @ts-expect-error Vite module
  const THREE=await import('/node_modules/three/build/three.module.js');
  // @ts-expect-error Vite module
  const {MAP,BOUNDS}=await import('/src/game/map.ts');
  // @ts-expect-error Vite module
  const {buildBorderEdges,borderPositions}=await import('/src/render/territoryBorders.ts');
  // @ts-expect-error Vite module
  const {mapGeometryTiles}=await import('/src/render/mapGeometryTiles.ts');
  const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(1.25);renderer.setSize(1510,1090);renderer.setClearColor('#f1e7d0');document.body.append(renderer.domElement);
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(40,1510/1090,21.7859,20000);camera.up.set(0,0,-1);
  const points=borderPositions(buildBorderEdges(MAP,BOUNDS).filter((edge:{atoms:number[]})=>edge.atoms.length===1),.27),geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(points,3));
  const source=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:0x35433f,transparent:true,opacity:.7,depthWrite:false})),tiles=mapGeometryTiles(source,2);scene.add(source,tiles);
  const gl=renderer.getContext(),size=new THREE.Vector2();renderer.getDrawingBufferSize(size);const reference=new Uint8Array(size.x*size.y*4),actual=new Uint8Array(reference.length),views=[];
  for(const [x,z,distance,tilt]of [[0,-128.90774556626536,2178.5907550892034,0],[202.157846847,-127.409675625,2178.5907550892034,0],[-570,-30,220,.18],[180,100,60,.6]]){
   camera.near=Math.max(.05,distance*.01);camera.updateProjectionMatrix();camera.position.set(x,distance*Math.cos(tilt),z+distance*Math.sin(tilt));camera.lookAt(x,0,z);camera.updateMatrixWorld();
   source.visible=true;tiles.visible=false;renderer.render(scene,camera);gl.readPixels(0,0,size.x,size.y,gl.RGBA,gl.UNSIGNED_BYTE,reference);
   source.visible=false;tiles.visible=true;renderer.render(scene,camera);gl.readPixels(0,0,size.x,size.y,gl.RGBA,gl.UNSIGNED_BYTE,actual);
   let differingPixels=0,worst=0;for(let i=0;i<actual.length;i+=4){let delta=0;for(let c=0;c<3;c++)delta=Math.max(delta,Math.abs(reference[i+c]-actual[i+c]));if(delta>2)differingPixels++;worst=Math.max(worst,delta);}
   views.push({distance,differingPixels,worst});
  }
  for(const tile of tiles.children)tile.geometry.dispose();geometry.dispose();source.material.dispose();renderer.dispose();return {segments:points.length/6,views};
 });
 expect(result.segments).toBeGreaterThan(150000);
 for(const view of result.views)expect(view.differingPixels,JSON.stringify(view)).toBe(0);
});
