import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type {Seat} from '../platform/session.ts';
import {leaderAppearances} from '../game/portrait.ts';
import {assembleCommander,disposeCommander,loadCommanderIdle} from '../ui/commanderRender.ts';
import type {CommanderIdle} from '../ui/commanderIdle.ts';
import {lightRoom,loadLightmap,placeSun,positionCamera,type CameraFrame,type RoomLighting} from './lobbyLighting.ts';

const roomUrl=new URL('../assets/lobby/war-room.glb',import.meta.url).href;
export type EditorView={full:boolean};
const initialEditorAngle=9;
// The editor frames every look as the same 1.8 m figure (the default bodies stand 1.62 and
// 1.76 m, the tallest hat reaches 1.90 m), so changing body, hair or hat never moves the camera.
const editorFigure=1.8;
type CameraMove={position:THREE.Vector3;rotation:THREE.Quaternion;lens:THREE.Vector3;start:number;duration:number};
function seatOffset(index:number){
 return new THREE.Vector3(index===1?-1.12:index===2?1.12:0,.017,index>0?-.54:0);
}
type Officer={recipe:string;model?:THREE.Group;idle?:CommanderIdle;ready?:boolean};
function disposeRoom(room:THREE.Object3D){
 const materials=new Set<THREE.MeshStandardMaterial>(),textures=new Set<THREE.Texture>();
 room.traverse(obj=>{
  if(obj instanceof THREE.Mesh){
   obj.geometry.dispose();
   for(const m of Array.isArray(obj.material)?obj.material:[obj.material])materials.add(m);
  }
 });
 for(const m of materials){
  for(const t of Object.values(m))if(t instanceof THREE.Texture)textures.add(t);
  m.dispose();
 }
 for(const t of textures){t.dispose();t.image?.close?.();}
}

export class LobbyScene {
 private readonly renderer:THREE.WebGLRenderer;
 private readonly scene=new THREE.Scene();
 private readonly camera=new THREE.PerspectiveCamera();
 private readonly home=new THREE.Vector3();
 private readonly homeRotation=new THREE.Quaternion();
 // Horizontal center, vertical center and height of the displayed frustum at unit depth.
 private readonly lens=new THREE.Vector3();
 private readonly reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
 private cameraMove?:CameraMove;
 private pendingDuration=0;
 private frame?:CameraFrame;
 private editor:EditorView|null=null;
 private editorAngle=initialEditorAngle;
 private reported='';
 private lightmap?:THREE.Texture;
 private pivot=new THREE.Vector3();
 private yaw=0;
 private seats:Seat[]=[];
 private lobbySeats:Seat[]=[];
 private officers=new Map<number,Officer>();
 private room?:THREE.Object3D;
 private environment:THREE.WebGLRenderTarget;
 private sun=new THREE.DirectionalLight();
 private observer:ResizeObserver;
 private animation=0;
 private layoutDirty=true;
 private lastDraw=0;
 private width=0;
 private height=0;
 private closed=false;
 private controller=new AbortController();

 constructor(private canvas:HTMLCanvasElement,private party:HTMLElement,private fail:()=>void,private onPreview:(recipe:string)=>void){
  this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
  this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
  this.renderer.shadowMap.enabled=true;
  this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  // The Blender view transform and exposure, so the room keeps its authored grade.
  this.renderer.toneMapping=THREE.AgXToneMapping;this.renderer.toneMappingExposure=2**-.27;
  this.scene.background=new THREE.Color('#494039');
  this.scene.fog=new THREE.FogExp2('#998978',.03);
  // Real-time lighting: the baked lightmap, the live sun and an environment captured from the
  // room itself once it loads. Until then a black capture of the same size stands in, so no
  // shader has to recompile when the real one arrives.
  const pmrem=new THREE.PMREMGenerator(this.renderer),empty=new THREE.Scene();
  this.environment=pmrem.fromScene(empty,0,.1,1,{size:256});pmrem.dispose();
  this.scene.environment=this.environment.texture;
  this.sun.castShadow=true;
  this.sun.shadow.mapSize.set(2048,2048);this.sun.shadow.normalBias=.012;this.sun.shadow.bias=-.00012;
  this.scene.add(this.sun,this.sun.target);
  // Studio fill for the officers only; the room's shader ignores these (see lightRoom).
  const key=new THREE.SpotLight(0xffe6c5,62,22,1.12,.85,2);
  key.position.set(-3.5,3.4,3.8);key.target.position.set(.4,.35,1.3);
  this.scene.add(new THREE.HemisphereLight(0xffe9d0,0xb29b8c,.92),key,key.target);
  for(const [x,y,z,color,power] of [[-4.7,3.3,-1.6,0xffebca,15],[1,3.6,3.2,0xffdec2,7],[-3.6,2.9,-7.2,0xe1eaff,20],[2.3,3.4,-2.6,0xffdda9,14]]){
   const light=new THREE.PointLight(color,power,11,2);light.position.set(x,y,z);this.scene.add(light);
  }
  this.observer=new ResizeObserver(()=>this.invalidate());
  this.observer.observe(canvas);
  this.observer.observe(party.querySelector<HTMLElement>('.party-stage')!);
  const opts={signal:this.controller.signal};
  this.reducedMotion.addEventListener('change',()=>this.invalidate(),opts);
  canvas.addEventListener('dblclick',()=>this.setYaw(0),opts);
  canvas.addEventListener('keydown',e=>{
   if(!['ArrowLeft','ArrowRight','Home'].includes(e.key))return;
   e.preventDefault();this.setYaw(e.key==='Home'?0:this.yaw+(e.key==='ArrowLeft'?-.06:.06));
  },opts);
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.fail();},opts);
 }
 async load(){
  // The lightmap downloads alongside the room; neither waits for the other.
  const baked=loadLightmap();
  let gltf:Awaited<ReturnType<GLTFLoader['loadAsync']>>;
  try{gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(roomUrl);}
  catch(error){baked.then(map=>map.dispose(),()=>{});throw error;}
  if(this.closed){disposeRoom(gltf.scene);baked.then(map=>map.dispose(),()=>{});return;}
  this.room=gltf.scene;const authored=gltf.cameras[0] as THREE.PerspectiveCamera;
  const node=gltf.scene.getObjectByProperty('isPerspectiveCamera',true);
  const {frame,lighting,stand,approach}=(node?.userData??{}) as {frame?:CameraFrame;lighting?:RoomLighting;stand?:[number,number,number];approach?:number};
  if(!authored||!frame||!lighting||!stand||!approach)throw new Error('Lobby camera missing');
  node!.getWorldPosition(this.home);node!.getWorldQuaternion(this.homeRotation);
  // The officers' mark is fixed in the room (export-lobby.py). The camera watches from part of
  // the way along the line to it, so the mark keeps its place in the authored frame while the
  // officers stand larger in it.
  this.pivot.fromArray(stand);
  this.home.sub(this.pivot).multiplyScalar(approach).add(this.pivot);
  gltf.scene.traverse(obj=>{
   if(!(obj instanceof THREE.Mesh))return;
   const mat=obj.material as THREE.MeshStandardMaterial;
   if(mat.userData.surfaceTint)mat.color.fromArray(mat.userData.surfaceTint);
   obj.castShadow=!mat.name.includes('orchard');obj.receiveShadow=true;
  });
  const lightmap=await baked;
  if(this.closed){lightmap.dispose();return;}
  this.lightmap=lightmap;lightRoom(gltf.scene,lightmap,lighting);placeSun(this.sun,gltf.scene,lighting);
  this.scene.add(gltf.scene);
  await this.compile(this.scene);
  if(this.closed)return;
  this.captureEnvironment();
  this.frame=frame;this.invalidate();
 }
 /** Reflections and the officers' ambient light come from the lit room itself, seen from
  * chest height where they stand. The officers are left out of their own surroundings. */
 private captureEnvironment(){
  const officers=[...this.officers.values()].flatMap(o=>o.model?[o.model]:[]);
  for(const model of officers)model.visible=false;
  const pmrem=new THREE.PMREMGenerator(this.renderer);
  const capture=pmrem.fromScene(this.scene,0,.1,60,{size:256,position:this.pivot.clone().add(new THREE.Vector3(0,1.4,0))});
  pmrem.dispose();
  for(const model of officers)model.visible=true;
  this.environment.dispose();this.environment=capture;this.scene.environment=capture.texture;
 }
 /** Hand every shader the subtree needs to the driver at once (KHR_parallel_shader_compile links them
  * on worker threads) and wait without blocking, so the first frame finds them ready instead of
  * stalling on each in turn. Unlike WebGLRenderer.compileAsync this stops when the scene closes. */
 private async compile(root:THREE.Object3D,target:THREE.Scene|null=null){
  const materials=this.renderer.compile(root,this.camera,target),gl=this.renderer.getContext();
  if(!this.renderer.extensions.has('KHR_parallel_shader_compile'))return;
  const ready=(material:THREE.Material)=>(this.renderer.properties.get(material) as {currentProgram?:{isReady():boolean}}).currentProgram?.isReady()??true;
  while(!this.closed&&!gl.isContextLost()&&[...materials].some(material=>!ready(material)))await new Promise(resolve=>setTimeout(resolve,10));
 }
 private setYaw(yaw:number){this.yaw=THREE.MathUtils.clamp(yaw,-.22,.22);this.invalidate();}
 setEditor(view:EditorView|null){
  if(this.editor?.full===view?.full)return;
  this.pendingDuration=this.editor&&view?520:850;
  this.editor=view;
  if(!view){this.reported='';this.editorAngle=initialEditorAngle;}
  this.invalidate();
 }
 rotateEditor(degrees:number){
  if(!this.editor||!degrees)return;
  this.editorAngle=(this.editorAngle+degrees)%360;
  this.invalidate();
 }
 private invalidate(layout=true){
  if(layout)this.layoutDirty=true;
  if(!this.closed&&!this.animation)this.animation=requestAnimationFrame(()=>{this.animation=0;this.draw();});
 }
 setSeats(seats:Seat[]){
  this.seats=seats;
  if(!this.editor)this.lobbySeats=seats;
  for(const [id,officer] of this.officers)if(!seats.some(s=>s.id===id))this.remove(id,officer);
  for(const seat of seats){
   const appearance=seat.appearance??leaderAppearances[seat.leader],recipe=JSON.stringify(appearance),old=this.officers.get(seat.id);
   if(old?.recipe===recipe)continue;
   const entry:Officer={recipe,model:old?.model,idle:old?.idle};this.officers.set(seat.id,entry);
   const motion=old?.idle?.body===appearance.body?Promise.resolve(old.idle):loadCommanderIdle(appearance.body);
   motion.then(async idle=>{
    if(this.closed||this.officers.get(seat.id)!==entry)return;
    const model=await assembleCommander(appearance,idle);
    if(this.closed||this.officers.get(seat.id)!==entry){disposeCommander(model);return;}
    model.scale.multiplyScalar(.01);
    model.traverse(part=>{if(part instanceof THREE.Mesh){part.castShadow=true;part.receiveShadow=true;}});
    await this.compile(model,this.scene);
    if(this.closed||this.officers.get(seat.id)!==entry){disposeCommander(model);return;}
    if(entry.model){this.scene.remove(entry.model);disposeCommander(entry.model);}
    entry.model=model;entry.idle=idle;entry.ready=true;this.scene.add(model);this.invalidate();
   }).catch(()=>{if(!this.closed&&this.officers.get(seat.id)===entry)this.fail();});
  }
  this.invalidate();
 }
 private remove(id:number,officer:Officer){
  this.officers.delete(id);if(officer.model){this.scene.remove(officer.model);disposeCommander(officer.model);}
 }
 private draw(){
  if(!this.frame||this.closed)return;
  const width=this.canvas.clientWidth,height=this.canvas.clientHeight;if(!width||!height)return;
  const now=performance.now(),elapsed=this.lastDraw?Math.min((now-this.lastDraw)/1000,.1):0;
  this.lastDraw=now;
  for(const [id,{idle}] of this.officers){
   if(!idle||this.reducedMotion.matches)continue;
   const previous=idle.name;idle.update(elapsed);
   if(previous!==idle.name){
    const plate=this.party.querySelector<HTMLElement>(`.party-member[data-seat="${id}"]`);
    if(plate)plate.dataset.idle=idle.name;
   }
   this.invalidate(false);
  }
  // Idle-only frames reuse the camera and nameplate positions.
  if(!this.layoutDirty){this.renderer.render(this.scene,this.camera);return;}
  this.layoutDirty=false;
  if(width!==this.width||height!==this.height){
   this.width=width;this.height=height;this.renderer.setSize(width,height,false);
  }
  const [l,r,b,t]=this.frame,mid=(r+l)/2,cy=(t+b)/2,aspect=width/height,near=.08;
  // Across landscape displays retain both sides of the reference composition.
  // Portrait keeps the same eye point and lens, with one officer per page.
  const vertical=aspect>=1?Math.max(t-b,(r-l)/aspect):t-b;
  const stage=this.party.querySelector<HTMLElement>('.party-stage')!;
  const stageTop=stage.offsetTop;
  const edited=this.officers.get(this.seats[0]?.id);
  const space=this.editor&&edited?.model&&this.party.querySelector<HTMLElement>('.workshop-preview-space');
  const slot=this.editor?Math.max(0,this.lobbySeats.findIndex(seat=>seat.id===this.seats[0]?.id)):0;
  if(this.pendingDuration&&(!this.editor||space)){
   if(!this.lens.z){
    positionCamera(this.camera,this.home,this.homeRotation,this.pivot,this.yaw);
    this.lens.set(mid,cy,vertical);
   }
   // Retarget from the last rendered frame, including when the player reverses mid-move.
   this.cameraMove=this.reducedMotion.matches?undefined:{
    position:this.camera.position.clone(),rotation:this.camera.quaternion.clone(),lens:this.lens.clone(),
    start:now,duration:this.pendingDuration,
   };
   this.pendingDuration=0;
  }
  this.lens.set(mid,cy,vertical);
  if(this.editor&&space){
   const area=space.getBoundingClientRect(),canvas=this.canvas.getBoundingClientRect();
   const span=editorFigure*(this.editor.full?1.15:.49);
   const distance=Math.max(span/Math.max(area.height,1),.8/Math.max(area.width,1))*height/(t-b);
   this.camera.position.set(0,0,distance).applyQuaternion(this.homeRotation).add(this.pivot).add(seatOffset(slot));
   this.camera.position.y+=editorFigure*(this.editor.full?.50:.805);
   this.camera.quaternion.copy(this.homeRotation);
   this.lens.set((.5-(area.left-canvas.left+area.width/2)/width)*(t-b)*aspect,
    ((area.top-canvas.top+area.height/2)/height-.5)*(t-b),t-b);
  }else positionCamera(this.camera,this.home,this.homeRotation,this.pivot,this.yaw);
  const move=this.cameraMove;
  if(move){
   const elapsed=(now-move.start)/move.duration;
   if(elapsed<1&&!this.reducedMotion.matches){
    const remaining=1-THREE.MathUtils.smoothstep(elapsed,0,1);
    this.camera.position.lerp(move.position,remaining);
    this.camera.quaternion.slerp(move.rotation,remaining);
    this.lens.lerp(move.lens,remaining);
    this.invalidate();
   }else this.cameraMove=undefined;
  }
  this.camera.updateMatrixWorld();
  const {x:cx,y:cyOffset,z:span}=this.lens,halfWidth=span*aspect/2;
  this.camera.projectionMatrix.makePerspective((cx-halfWidth)*near,(cx+halfWidth)*near,(cyOffset+span/2)*near,(cyOffset-span/2)*near,near,65);
  this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();
  this.seats.forEach((seat,index)=>{
   const entry=this.officers.get(seat.id),officer=entry?.model;
   const foot=this.pivot.clone().add(seatOffset(this.editor?slot:index));
   if(officer){officer.position.copy(foot);officer.rotation.y=this.editor?THREE.MathUtils.degToRad(this.editorAngle):[.05,.15,-.12][index];}
   foot.project(this.camera);
   const plate=stage.querySelector<HTMLElement>(`[data-seat="${seat.id}"]`);
   if(plate){
    plate.style.left=((foot.x+1)*width/2)+'px';
    plate.style.top=Math.min((1-foot.y)*height/2-stageTop+3,stage.clientHeight-plate.offsetHeight)+'px';
    plate.dataset.modelState=entry?.ready?'ready':'loading';
    if(entry?.idle&&plate.dataset.idle!==entry.idle.name)plate.dataset.idle=entry.idle.name;
   }
  });
  this.renderer.render(this.scene,this.camera);
  this.canvas.dataset.view=this.cameraMove||this.pendingDuration?'moving':this.editor?(this.editor.full?'full':'bust'):'party';
  if(this.editor&&edited?.ready&&this.reported!==edited.recipe){this.reported=edited.recipe;this.onPreview(edited.recipe);}
  this.canvas.dataset.sceneState='ready';this.canvas.dataset.yaw=String(this.yaw);
 }
 dispose(){
  this.closed=true;cancelAnimationFrame(this.animation);this.observer.disconnect();this.controller.abort();
  for(const [id,officer] of this.officers)this.remove(id,officer);
  if(this.room)disposeRoom(this.room);
  this.lightmap?.dispose();
  this.sun.shadow.dispose();this.environment.dispose();this.renderer.dispose();this.renderer.forceContextLoss();
 }
}
