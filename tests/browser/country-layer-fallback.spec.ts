import {test,expect} from '@playwright/test';

test('country text stays visible in the map layer when the distance-field worker cannot start',async({page})=>{
 await page.route('**/country-fallback-harness',route=>route.fulfill({contentType:'text/html',body:'<body style="margin:0"></body>'}));
 await page.addInitScript(()=>Object.defineProperty(window,'Worker',{configurable:true,value:class{constructor(){throw new Error('Worker disabled for this check');}}}));
 await page.goto('/country-fallback-harness');
 const result=await page.evaluate(async()=>{
  const THREE=await import('/node_modules/three/build/three.module.js');
  const {CountryLabelText}=await import('/src/render/countryLabelText.ts');
  const labels=new CountryLabelText(()=>{});
  const deadline=performance.now()+15000;
  while(!labels.ready&&performance.now()<deadline)await new Promise(resolve=>setTimeout(resolve,20));
  if(!labels.ready)throw Error('Country font did not settle');
  const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-4,4,4,-4,.01,20);
  camera.position.set(0,10,0);camera.up.set(0,0,-1);camera.lookAt(0,0,0);camera.updateMatrixWorld();
  scene.add(labels.group);
  const renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});
  renderer.setSize(128,128);renderer.setClearColor('#223344');
  const span=document.createElement('span'),svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  const countChanged=()=>{
   const gl=renderer.getContext(),data=new Uint8Array(128*128*4);
   gl.readPixels(0,0,128,128,gl.RGBA,gl.UNSIGNED_BYTE,data);
   let count=0;
   for(let i=0;i<data.length;i+=4)if(data[i]!==data[0]||data[i+1]!==data[1]||data[i+2]!==data[2])count++;
   return count;
  };
  let metrics;
  try{
   labels.begin();
   const key=labels.preload('M20,100 Q250,90 480,100',500,200,'ROUGE','Georgia','.035em',{});
   labels.update(span,svg,500,200,100,-2.5,-1,.16,16,1,'#ffdd66',key);labels.end();
   renderer.render(scene,camera);
   const mesh=labels.group.children[0];
   metrics={changedPixels:countChanged(),visible:mesh.visible,order:mesh.renderOrder,renderer:span.dataset.textRenderer,pending:labels.pending};
  }finally{labels.dispose();renderer.dispose();}
  return metrics;
 });
 expect(result).toMatchObject({visible:true,order:5,renderer:'canvas-preview',pending:0});
 expect(result?.changedPixels).toBeGreaterThan(20);
});
