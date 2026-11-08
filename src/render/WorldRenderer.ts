import * as THREE from 'three';
import { MAP, heightAt, contains } from '../game/map.ts';
import { MAX_UNITS } from '../game/content.ts';
import type { GameState, Vec2 } from '../game/types.ts';
export const FACTION_COLORS=['#609baa','#bb6e62','#c0a263','#8a91b5'];
const OWNER=[0x609baa,0xbb6e62,0xc0a263,0x8a91b5];
function tessellate(a:Vec2,b:Vec2,c:Vec2,n:number,out:number[]){
  if(n===0){for(const p of[a,b,c])out.push(p.x,0.18,p.z);return;}
  const ab={x:(a.x+b.x)/2,z:(a.z+b.z)/2},bc={x:(b.x+c.x)/2,z:(b.z+c.z)/2},ca={x:(c.x+a.x)/2,z:(c.z+a.z)/2};
  tessellate(a,ab,ca,n-1,out);tessellate(ab,b,bc,n-1,out);tessellate(ca,bc,c,n-1,out);tessellate(ab,bc,ca,n-1,out);
}
function provinceGeometry(id:number){
  const p=MAP[id],positions:number[]=[];
  for(let i=0;i<p.polygon.length;i++)tessellate(p.center,p.polygon[i],p.polygon[(i+1)%p.polygon.length],3,positions);
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.computeVertexNormals();
  const elevated=positions.map((v,i)=>i%3===1?heightAt(positions[i-1],positions[i+1]):v),near=new THREE.BufferGeometry();near.setAttribute('position',new THREE.Float32BufferAttribute(elevated,3));near.computeVertexNormals();
  geometry.morphAttributes.position=[near.getAttribute('position')];geometry.morphAttributes.normal=[near.getAttribute('normal')];geometry.computeBoundingSphere();return geometry;
}
interface Label{sprite:THREE.Sprite;canvas:HTMLCanvasElement;texture:THREE.CanvasTexture;key:string}
export class WorldRenderer{
  readonly renderer:THREE.WebGLRenderer;readonly scene=new THREE.Scene();readonly camera=new THREE.PerspectiveCamera(40,1,0.1,600);
  private meshes:THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>[]=[];
  private borders:THREE.Line[]=[];private labels:Label[]=[];
  private bodies:THREE.InstancedMesh;private heads:THREE.InstancedMesh;private trees:THREE.InstancedMesh;private towns:THREE.InstancedMesh;
  private townPoints:Vec2[]=[];private treePoints:Vec2[]=[];
  private state:GameState|null=null;private selected=-1;private hover=-1;private lang:'zh'|'en'='zh';
  private ray=new THREE.Raycaster();private pointer=new THREE.Vector2();private dummy=new THREE.Object3D();
  private animation=0;private observer:ResizeObserver;private last=0;private distance=112;private desiredDistance=112;private focus=new THREE.Vector3();private blend=0;private lastBlend=-1;private lastMode='';
  private down:{x:number;y:number;button:number;fx:number;fz:number}|null=null;
  private smoothed=new Map<number,{x:number;z:number}>();
  constructor(private host:HTMLElement,private onPick:(id:number,attack:boolean)=>void,private onMode:(near:boolean)=>void){
    this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.75));this.renderer.setClearColor(0x132a31);this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.3;
    this.renderer.domElement.setAttribute('aria-label','Interactive province map');this.host.append(this.renderer.domElement);
    this.scene.add(new THREE.HemisphereLight(0xf4e9cf,0x30454a,2.4));const sun=new THREE.DirectionalLight(0xffefce,2.2);sun.position.set(-45,60,-20);this.scene.add(sun);
    const ocean=new THREE.Mesh(new THREE.PlaneGeometry(600,600),new THREE.MeshStandardMaterial({color:0x17343d,roughness:0.9}));ocean.rotation.x=-Math.PI/2;ocean.position.y=-0.18;this.scene.add(ocean);
    const grid=new THREE.GridHelper(400,80,0x31545a,0x27464e);grid.position.y=-0.15;const gm=grid.material as THREE.Material;gm.transparent=true;gm.opacity=0.28;this.scene.add(grid);
    for(const p of MAP){
      const material=new THREE.MeshStandardMaterial({color:0x8f9979,roughness:1,metalness:0,side:THREE.DoubleSide});const mesh=new THREE.Mesh(provinceGeometry(p.id),material);mesh.userData.id=p.id;this.meshes.push(mesh);this.scene.add(mesh);
      const points=p.polygon.concat(p.polygon[0]).map(v=>new THREE.Vector3(v.x,0.22,v.z));const border=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:0x34433c,transparent:true,opacity:0.85}));this.borders.push(border);this.scene.add(border);
      const canvas=document.createElement('canvas');canvas.width=384;canvas.height=112;const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
      const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthTest:false}));sprite.renderOrder=5;sprite.scale.set(7.5,2.2,1);this.labels.push({sprite,canvas,texture,key:''});this.scene.add(sprite);
      for(let i=0;i<4;i++)this.townPoints.push({x:p.center.x+Math.cos(i*2.3)*0.8,z:p.center.z+Math.sin(i*2.3)*0.8});
      if(p.terrain==='forest')for(let i=0;i<42;i++){const x=p.center.x+Math.sin(i*7.13+p.id)*4.3,z=p.center.z+Math.cos(i*4.47+p.id)*4.3;if(contains(p.polygon,x,z))this.treePoints.push({x,z});}
    }
    this.bodies=new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.13,0.34,3,5),new THREE.MeshStandardMaterial({roughness:1}),MAX_UNITS*3);
    this.heads=new THREE.InstancedMesh(new THREE.SphereGeometry(0.14,5,4),new THREE.MeshStandardMaterial({color:0xc8bf9e,roughness:1}),MAX_UNITS*3);
    this.trees=new THREE.InstancedMesh(new THREE.ConeGeometry(0.43,1.6,5),new THREE.MeshStandardMaterial({color:0x354b38,roughness:1}),this.treePoints.length);
    this.towns=new THREE.InstancedMesh(new THREE.BoxGeometry(0.5,0.7,0.6),new THREE.MeshStandardMaterial({color:0xc6b99b,roughness:1}),this.townPoints.length);
    for(const mesh of[this.bodies,this.heads,this.trees,this.towns]){mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.scene.add(mesh);}
    this.bodies.count=this.heads.count=0;
    const canvas=this.renderer.domElement;canvas.addEventListener('pointerdown',this.pointerDown);canvas.addEventListener('pointermove',this.pointerMove);canvas.addEventListener('pointerup',this.pointerUp);canvas.addEventListener('pointercancel',this.pointerCancel);canvas.addEventListener('wheel',this.wheel,{passive:false});canvas.addEventListener('contextmenu',this.contextMenu);
    this.observer=new ResizeObserver(this.resize);this.observer.observe(host);this.resize();this.animation=requestAnimationFrame(this.frame);
  }
  update(state:GameState,selected:number,lang:'zh'|'en'){this.state=state;this.selected=selected;this.lang=lang;}
  zoom(delta:number){this.desiredDistance=THREE.MathUtils.clamp(this.desiredDistance+delta,23,155);}
  view(mode:'strategic'|'terrain'){this.desiredDistance=mode==='strategic'?112:48;}
  focusProvince(id:number){const p=MAP[id];if(p){this.focus.set(p.center.x,0,p.center.z);this.desiredDistance=56;}}
  private resize=()=>{const width=this.host.clientWidth,height=this.host.clientHeight;if(width<1||height<1)return;this.renderer.setSize(width,height);this.camera.aspect=width/height;this.camera.updateProjectionMatrix();};
  private pick(event:PointerEvent):number{const rect=this.renderer.domElement.getBoundingClientRect();this.pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);this.ray.setFromCamera(this.pointer,this.camera);return this.ray.intersectObjects(this.meshes,false)[0]?.object.userData.id??-1;}
  private pointerDown=(e:PointerEvent)=>{this.down={x:e.clientX,y:e.clientY,button:e.button,fx:this.focus.x,fz:this.focus.z};this.renderer.domElement.setPointerCapture(e.pointerId);};
  private pointerMove=(e:PointerEvent)=>{if(this.down&&this.down.button!==2){const scale=this.distance*0.0014;this.focus.x=THREE.MathUtils.clamp(this.down.fx-(e.clientX-this.down.x)*scale,-65,65);this.focus.z=THREE.MathUtils.clamp(this.down.fz-(e.clientY-this.down.y)*scale,-45,45);}else if(!this.down)this.hover=this.pick(e);};
  private pointerUp=(e:PointerEvent)=>{if(this.down&&Math.hypot(e.clientX-this.down.x,e.clientY-this.down.y)<5){const id=this.pick(e);if(id>=0)this.onPick(id,e.button===2||e.shiftKey);}this.down=null;};
  private pointerCancel=()=>{this.down=null;};
  private wheel=(e:WheelEvent)=>{e.preventDefault();this.zoom(e.deltaY*0.045);};
  private contextMenu=(e:Event)=>e.preventDefault();
  private frame=(time:number)=>{
    const dt=Math.min((time-this.last)/1000||0.016,0.1);this.last=time;this.distance+=(this.desiredDistance-this.distance)*(1-Math.exp(-dt*8));this.blend=THREE.MathUtils.smoothstep(112-this.distance,12,65);
    const angle=this.blend*0.68;this.camera.position.set(this.focus.x,this.distance*Math.cos(angle),this.focus.z+this.distance*Math.sin(angle)+0.001);this.camera.lookAt(this.focus);
    const mode=this.blend>0.5?'near':'far';if(mode!==this.lastMode){this.onMode(mode==='near');this.lastMode=mode;}
    if(Math.abs(this.blend-this.lastBlend)>0.002){
      for(const[p,mesh]of this.meshes.entries()){
        if(mesh.morphTargetInfluences)mesh.morphTargetInfluences[0]=this.blend;
        const attr=this.borders[p].geometry.getAttribute('position');for(let i=0;i<attr.count;i++)attr.setY(i,0.23+heightAt(attr.getX(i),attr.getZ(i))*this.blend);attr.needsUpdate=true;
      }
      for(const[mesh,points,offset]of[[this.trees,this.treePoints,0.8],[this.towns,this.townPoints,0.35]] as const){for(let i=0;i<points.length;i++){const p=points[i];this.dummy.position.set(p.x,heightAt(p.x,p.z)*this.blend+offset*this.blend,p.z);this.dummy.rotation.set(0,i*0.8,0);this.dummy.scale.setScalar(this.blend);this.dummy.updateMatrix();mesh.setMatrixAt(i,this.dummy.matrix);}mesh.instanceMatrix.needsUpdate=true;}this.lastBlend=this.blend;
    }
    const state=this.state;
    if(state){
      const totals=new Map<number,number>();for(const u of state.units)totals.set(u.province,(totals.get(u.province)??0)+1);
      for(const p of state.provinces){
        const mesh=this.meshes[p.id],base=new THREE.Color(p.owner<0?0x8d977b:OWNER[p.owner]),highlight=p.id===this.selected?0.2:p.id===this.hover?0.1:0;
        mesh.material.color.copy(base).lerp(new THREE.Color(0x849075),this.blend*0.4);mesh.material.emissive.setHex(highlight?0xb7aa77:0x000000);mesh.material.emissiveIntensity=highlight;
        const border=this.borders[p.id].material as THREE.LineBasicMaterial;border.color.setHex(p.id===this.selected?0xf5dc99:0x34433c);
        const label=this.labels[p.id],name=MAP[p.id].name[this.lang==='zh'?0:1],count=totals.get(p.id)??0,key=`${name}:${count}:${p.owner}`;
        if(label.key!==key){const ctx=label.canvas.getContext('2d')!;ctx.clearRect(0,0,384,112);ctx.textAlign='center';ctx.fillStyle='#172726';ctx.font='600 29px Georgia, "Noto Serif CJK SC", serif';ctx.fillText(name,192,40);ctx.font='600 25px system-ui';ctx.fillStyle=p.owner<0?'#34443e':'#142b2d';ctx.fillText(`${p.owner<0?'◇':'⚑'}  ${count}`,192,79);label.texture.needsUpdate=true;label.key=key;}
        label.sprite.position.set(MAP[p.id].center.x,heightAt(MAP[p.id].center.x,MAP[p.id].center.z)*this.blend+0.55,MAP[p.id].center.z-2.3);label.sprite.visible=this.distance>34||p.id===this.selected;
      }
      let instance=0;const activeIds=new Set<number>();
      for(const u of state.units){
        activeIds.add(u.id);const pos=this.smoothed.get(u.id)??{x:u.x,z:u.z};pos.x+=(u.x-pos.x)*(1-Math.exp(-dt*16));pos.z+=(u.z-pos.z)*(1-Math.exp(-dt*16));this.smoothed.set(u.id,pos);
        const angle=u.target===null?0:Math.atan2(MAP[u.target].center.x-u.x,MAP[u.target].center.z-u.z),color=new THREE.Color(u.owner<0?0x575c50:OWNER[u.owner]);
        for(let j=0;j<3;j++){
          const spread=(u.id%3)*0.17,x=pos.x+Math.cos(j*2.1+u.id)*0.4+spread,z=pos.z+Math.sin(j*2.1+u.id)*0.4,y=heightAt(x,z)*this.blend;
          const scale=u.kind==='cavalry'?1.35:u.kind==='artillery'?1.1:1;
          this.dummy.position.set(x,y+0.36,z);this.dummy.rotation.set(0,angle,0);this.dummy.scale.set(scale,scale,scale);this.dummy.updateMatrix();this.bodies.setMatrixAt(instance,this.dummy.matrix);this.bodies.setColorAt(instance,color);
          this.dummy.position.y=y+0.68*scale;this.dummy.scale.setScalar(scale);this.dummy.updateMatrix();this.heads.setMatrixAt(instance,this.dummy.matrix);instance++;
        }
      }
      for(const id of this.smoothed.keys())if(!activeIds.has(id))this.smoothed.delete(id);
      this.bodies.count=this.heads.count=instance;this.bodies.visible=this.heads.visible=this.blend>0.15;this.bodies.instanceMatrix.needsUpdate=this.heads.instanceMatrix.needsUpdate=true;if(this.bodies.instanceColor)this.bodies.instanceColor.needsUpdate=true;
    }
    this.renderer.render(this.scene,this.camera);this.animation=requestAnimationFrame(this.frame);
  };
  dispose(){cancelAnimationFrame(this.animation);this.observer.disconnect();const c=this.renderer.domElement;c.removeEventListener('pointerdown',this.pointerDown);c.removeEventListener('pointermove',this.pointerMove);c.removeEventListener('pointerup',this.pointerUp);c.removeEventListener('pointercancel',this.pointerCancel);c.removeEventListener('wheel',this.wheel);c.removeEventListener('contextmenu',this.contextMenu);
    this.scene.traverse(object=>{const mesh=object as THREE.Mesh;mesh.geometry?.dispose();if(mesh.material)for(const m of Array.isArray(mesh.material)?mesh.material:[mesh.material])m.dispose();});for(const l of this.labels)l.texture.dispose();this.renderer.dispose();c.remove();}
}
