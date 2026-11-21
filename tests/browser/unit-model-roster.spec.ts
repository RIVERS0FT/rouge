import {test,expect} from '@playwright/test';
import {existsSync} from 'node:fs';
import {UNIT_GLYPHS} from '../../src/render/unitPresentation.ts';

test('local roster renders nine textured models and switches an embarked army to one boat',async({page})=>{
  test.skip(!UNIT_GLYPHS.every(kind=>existsSync(new URL(`../../src/render/assets/local-roster/${kind}.bin`,import.meta.url))));
  const errors:string[]=[];
  page.on('pageerror',err=>errors.push(err.message));
  page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text());});
  await page.setViewportSize({width:1104,height:924});
  await page.route('**/roster-preview',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><meta charset="UTF-8">
    <style>*{box-sizing:border-box}body{margin:0;background:#dedbd4;color:#353631;font:19px "Microsoft YaHei",sans-serif}
    canvas{display:block}#labels{position:absolute;inset:0;display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(3,1fr)}
    #labels div{display:flex;align-items:flex-end;justify-content:center;padding:0 0 14px;border:1px solid #c5c3ba}</style>
    <div id="labels"></div>`}));
  await page.goto('/roster-preview');
  const result=await page.evaluate(async kinds=>{
    const THREE=await import('/node_modules/three/build/three.module.js');
    const {UnitModelRoster}=await import('/src/render/unitModelRoster.ts');
    const {mapUnitsWithShips}=await import('/src/render/unitPresentation.ts');
    const scene=new THREE.Scene(),roster=new UnitModelRoster(scene,()=>{});
    const units=kinds.map((kind,i)=>({id:i+1,kind:kind==='transport'?'infantry':kind,army:i+1,
      armyStatus:kind==='transport'?'sea':'marching',owner:0,transport:kind==='transport'?{embarked:true}:undefined}));
    const visible=mapUnitsWithShips([...units,{...units[8],id:10}]);
    const matrix=new THREE.Matrix4(),color=new THREE.Color('#476585');
    function draw(walk:number,shot:number){
      roster.begin(true,visible);
      for(const u of visible)roster.forUnit(u)?.add(matrix,color,walk,shot,u.id);
      roster.end();
    }
    const deadline=performance.now()+20000;
    do{
      draw(0,Infinity);if(roster.count===kinds.length)break;
      if(performance.now()>deadline)throw Error('Timed out loading local roster: '+roster.renderedKinds());
      await new Promise(resolve=>setTimeout(resolve,30));
    }while(true);
    const idle=roster.idling;
    draw(360,Infinity);const walking=roster.walking;
    draw(0,120);const shooting=roster.shooting;
    draw(0,Infinity);
    const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
    const w=innerWidth/3,h=innerHeight/3;
    renderer.setSize(w*3,h*3);document.body.prepend(renderer.domElement);
    renderer.setClearColor('#dedbd4');renderer.setScissorTest(true);
    scene.add(new THREE.HemisphereLight(0xffffff,0xb2a794,2));
    const light=new THREE.DirectionalLight(0xfff8ec,2.4);
    light.position.set(3,5,4);scene.add(light);
    const meshes=scene.children.filter(obj=>obj.isInstancedMesh);
    const labels=['步兵','轻骑兵','野战炮兵','工兵','散兵','掷弹兵','重骑兵','骑炮兵','运输艇'];
    let textured=0;
    for(const [i,u] of visible.entries()){
      // Match the mesh to the unit through the real instance writer. Scene
      // insertion order depends on independent fetch and image decode times.
      const showAttack=u.kind==='grenadier';
      const batch=roster.forUnit(u);
      roster.begin(true,[u]);batch.add(matrix,color,0,showAttack?120:Infinity,u.id);roster.end();
      const mesh=meshes.find(obj=>obj.count===1);
      if(mesh.material.map&&mesh.geometry.getAttribute('uv'))textured++;
      const camera=new THREE.OrthographicCamera(-1,1,1,-1,.01,100);
      camera.position.set(6,2.1,6);camera.lookAt(0,0,0);camera.updateMatrixWorld();
      const {data,width}=batch.texture.image;
      const frame=mesh.geometry.getAttribute('rougeFrame').getX(0);
      const count=mesh.geometry.getAttribute('position').count;
      const start=frame*2*Math.ceil(count/width)*width*4;
      const bounds=new THREE.Box3(),point=new THREE.Vector3();
      for(let j=0;j<count;j++)bounds.expandByPoint(point.fromArray(data,start+4*j).applyMatrix4(camera.matrixWorldInverse));
      const center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3());
      const half=Math.max(size.x*h/w/.85,size.y/.80)*.5;
      const midY=center.y-half*.08;
      camera.left=center.x-half*w/h;camera.right=center.x+half*w/h;
      camera.top=midY+half;camera.bottom=midY-half;camera.updateProjectionMatrix();
      const x=(i%3)*w,y=(2-Math.floor(i/3))*h;
      renderer.setViewport(x,y,w,h);renderer.setScissor(x,y,w,h);renderer.render(scene,camera);
      const label=document.createElement('div');label.textContent=labels[i];document.getElementById('labels')!.append(label);
    }
    const landed={...visible[8],armyStatus:'marching',transport:undefined};
    roster.begin(true,[landed]);roster.forUnit(landed).add(matrix,color,0,Infinity,landed.id);roster.end();
    return {idle,walking,shooting,textured,afterLanding:roster.renderedKinds(),sea:visible.filter(u=>u.transport?.embarked).length};
  },[...UNIT_GLYPHS]);
  expect(result).toEqual({idle:9,walking:9,shooting:9,textured:9,afterLanding:'infantry',sea:1});
  expect(errors).toEqual([]);
  await page.screenshot({path:'artifacts/victoria-3-models/rouge-roster.png'});
});
