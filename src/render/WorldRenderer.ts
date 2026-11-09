import {SELECTION_GLOW_WIDTH} from './selectionGlow.ts';
import * as THREE from 'three';
import {MapInputController,type MapInputContext} from './mapInput.ts';
import { MAP, BOUNDS, heightAt, pointInProvince, provinceAt, VISIBLE_COUNT } from '../game/map.ts';
import { project, PROJECTION_ID, worldCoverDistance, cameraGroundSpan, clampViewZ, CROP_ID, WORLD_WIDTH, WORLD_CENTER, NORTH_LATITUDE, SOUTH_LATITUDE, wrapX, nearestWorldX, viewPickX } from '../game/geo.ts';
import { clipTriangle, clipSegment, inRect } from '../game/crop.ts';
import type { GameState, Vec2 } from '../game/types.ts';
export const FACTION_COLORS=['#609baa','#bb6e62','#c0a263','#8a91b5'];
const OWNER=[0x609baa,0xbb6e62,0xc0a263,0x8a91b5];
interface Label {sprite:THREE.Sprite;canvas:HTMLCanvasElement;texture:THREE.CanvasTexture;key:string}
interface Range {start:number;count:number}
const NEUTRAL_LAND=0x9da48e;
/** No country palette: ownership is the only political color on the map. */
function regionColor():THREE.Color { return new THREE.Color(NEUTRAL_LAND); }
/** One merged land mesh, batched boundaries and a bounded label pool for the global atlas. */
export class WorldRenderer {
  readonly renderer:THREE.WebGLRenderer;
  readonly scene=new THREE.Scene();
  readonly camera=new THREE.PerspectiveCamera(40,1,0.05,20000);
  private atlas=new THREE.Group();
  private repeats:THREE.Group[]=[];
  private land:THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>;
  private admin:THREE.LineSegments;
  private selection:THREE.LineSegments;
  private selectionGlow:THREE.Mesh<THREE.BufferGeometry,THREE.MeshBasicMaterial>;
  private selectionGlowWorker:Worker|null=null;
  private ranges:Range[]=[];
  private colors:THREE.Float32BufferAttribute;
  private labels:Label[]=[];
  private bodies:THREE.InstancedMesh;
  private heads:THREE.InstancedMesh;
  private unitInstanceCapacity=512;
  private towns:THREE.InstancedMesh;
  private blendUniform={value:0};
  private state:GameState|null=null;
  private selected=-1;private hover=-1;private lang:'zh'|'en'='zh';
  private ownerIds=MAP.map(()=>-1);
  private dirty=new Set<number>();
  private ray=new THREE.Raycaster();private pointer=new THREE.Vector2();private dummy=new THREE.Object3D();
  private observer:ResizeObserver;private animation=0;private last=0;
  private distance=4400;private desiredDistance=4400;private focus=new THREE.Vector3(WORLD_CENTER.x,0,WORLD_CENTER.z);
  private desiredFocusZ=WORLD_CENTER.z;
  private globalView=true;private resized=false;
  private invalidated=true;private lastRender=0;
  private blend=0;private lastMode='';private lastLabels=0;
  private down:{x:number;y:number;fx:number;fz:number;button:number}|null=null;
  private smoothed=new Map<number,Vec2>();
  constructor(private host:HTMLElement,private onPick:(id:number,attack:boolean)=>void,private onMode:(near:boolean)=>void) {
    this.renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.5));this.renderer.setClearColor(0x102b35);
    this.camera.up.set(0,0,-1);
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.1;
    this.renderer.domElement.setAttribute('aria-label','World management regions · Miller cylindrical projection');host.append(this.renderer.domElement);
    this.scene.add(new THREE.HemisphereLight(0xf5eedb,0x34484b,2.3));
    const sun=new THREE.DirectionalLight(0xfff2dc,1.7);sun.position.set(-100,250,-120);this.scene.add(sun);
    this.scene.add(this.atlas);
    const sea=new THREE.Mesh(new THREE.PlaneGeometry(WORLD_WIDTH,BOUNDS.bottom-BOUNDS.top),new THREE.MeshBasicMaterial({color:0x173742}));
    sea.rotation.x=-Math.PI/2;sea.position.set(0,-0.25,WORLD_CENTER.z);this.atlas.add(sea);
    const graticule:number[]=[];
    for(let lon=-180;lon<=180;lon+=30){const a=project(lon,SOUTH_LATITUDE),b=project(lon,NORTH_LATITUDE);graticule.push(a.x,-0.15,a.z,b.x,-0.15,b.z);}
    for(let lat=Math.ceil(SOUTH_LATITUDE/20)*20;lat<=NORTH_LATITUDE;lat+=20){const a=project(-180,lat),b=project(180,lat);graticule.push(a.x,-0.15,a.z,b.x,-0.15,b.z);}
    this.atlas.add(this.lines(graticule,0x507078,0.28));
    // No decorative atlas frame: the map continues behind the edge HUD.
    const positions:number[]=[],colors:number[]=[],borders:number[]=[],coasts:number[]=[];
    const edgeOwners=new Map<string,{a:Vec2;b:Vec2;count:number}>();
    for(const province of MAP) {
      const start=positions.length/3,base=regionColor();
      for(const part of province.visible?province.parts:[]) {
        const rings=part.map(r=>r.map(p=>new THREE.Vector2(p.x,p.z)));
        const contour=rings[0],holes=rings.slice(1);
        // Earcut via Three.js supports concave outlines and holes. Each island is separate.
        const points=rings.flat(),triangles=THREE.ShapeUtils.triangulateShape(contour,holes);
        for(const tri of triangles) {
          const clipped=clipTriangle([tri[0],tri[2],tri[1]].map(i=>({x:points[i].x,z:points[i].y})),BOUNDS);
          for(let j=1;j+1<clipped.length;j++)for(const p of [clipped[0],clipped[j],clipped[j+1]]) {
            positions.push(p.x,0.16,p.z);colors.push(base.r,base.g,base.b);
          }
        }
        for(const ring of part)for(let i=0;i<ring.length;i++) {
          const segment=clipSegment(ring[i],ring[(i+1)%ring.length],BOUNDS);if(!segment)continue;const [a,b]=segment;borders.push(a.x,0.24,a.z,b.x,0.24,b.z);
          const ka=`${a.x.toFixed(4)},${a.z.toFixed(4)}`,kb=`${b.x.toFixed(4)},${b.z.toFixed(4)}`,key=ka<kb?`${ka}|${kb}`:`${kb}|${ka}`;
          const edge=edgeOwners.get(key);
          if(edge){edge.count++;}
          else edgeOwners.set(key,{a,b,count:1});
        }
      }
      this.ranges.push({start,count:positions.length/3-start});
    }
    for(const e of edgeOwners.values())if(e.count===1)coasts.push(e.a.x,0.27,e.a.z,e.b.x,0.27,e.b.z);
    let minLandZ=Infinity,maxLandZ=-Infinity;for(let i=2;i<positions.length;i+=3){minLandZ=Math.min(minLandZ,positions[i]);maxLandZ=Math.max(maxLandZ,positions[i]);}
    this.renderer.domElement.dataset.landMinZ=String(minLandZ);this.renderer.domElement.dataset.landMaxZ=String(maxLandZ);
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    this.colors=new THREE.Float32BufferAttribute(colors,3);this.colors.setUsage(THREE.DynamicDrawUsage);geometry.setAttribute('color',this.colors);
    const normals=new Float32Array(positions.length);for(let i=1;i<normals.length;i+=3)normals[i]=1;geometry.setAttribute('normal',new THREE.BufferAttribute(normals,3));
    const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,side:THREE.DoubleSide});
    this.relief(material);this.land=new THREE.Mesh(geometry,material);this.atlas.add(this.land);
    this.admin=this.lines(borders,0x334b40,0.14);this.relief(this.admin.material as THREE.Material);this.admin.name='region-boundaries';this.atlas.add(this.admin);
    const outlines=this.lines(coasts,0x233f39,0.7);this.relief(outlines.material as THREE.Material);outlines.name='coastlines';this.atlas.add(outlines);
    this.renderer.domElement.dataset.boundaryMode='management-regions-only';
    this.renderer.domElement.dataset.regionCount=String(MAP.length);
    this.selection=this.lines([],0xf9df9b,1);this.relief(this.selection.material as THREE.Material);this.selection.name='selected-border';this.selection.renderOrder=2;this.atlas.add(this.selection);
    const glowMaterial=new THREE.MeshBasicMaterial({color:0xf9df9b,transparent:true,opacity:0.38,depthWrite:false,side:THREE.DoubleSide});
    this.relief(glowMaterial);const reliefCompile=glowMaterial.onBeforeCompile;
    glowMaterial.onBeforeCompile=(shader,renderer)=>{
      reliefCompile(shader,renderer);
      shader.uniforms.uGlowWidth={value:SELECTION_GLOW_WIDTH};
      shader.vertexShader='attribute float edgeDistance; varying float vEdgeDistance;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvEdgeDistance = edgeDistance;');
      shader.fragmentShader='uniform float uGlowWidth; varying float vEdgeDistance;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.a *= 1.0 - smoothstep(0.0, uGlowWidth, vEdgeDistance);');
    };
    glowMaterial.customProgramCacheKey=()=> 'earth-selection-inner-glow-v1';
    const initialGlow=new THREE.BufferGeometry();initialGlow.setAttribute('position',new THREE.Float32BufferAttribute([],3));initialGlow.setAttribute('edgeDistance',new THREE.Float32BufferAttribute([],1));
    this.selectionGlow=new THREE.Mesh(initialGlow,glowMaterial);this.selectionGlow.name='selected-inner-glow';this.selectionGlow.renderOrder=1;this.atlas.add(this.selectionGlow);
    // Reuse the same GPU geometry/materials. Only the camera view and picking wrap;
    // canonical entity positions and province IDs never duplicate.
    for(const offset of [-WORLD_WIDTH,WORLD_WIDTH]){const copy=this.atlas.clone(true);copy.position.x=offset;copy.visible=false;this.repeats.push(copy);this.scene.add(copy);}
    for(let i=0;i<48;i++) {
      const canvas=document.createElement('canvas');canvas.width=512;canvas.height=96;
      const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
      const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthTest:false,transparent:true}));sprite.renderOrder=5;sprite.visible=false;
      this.labels.push({sprite,canvas,texture,key:''});this.scene.add(sprite);
    }
    this.bodies=new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.13,0.34,3,5),new THREE.MeshStandardMaterial({roughness:1}),512);
    this.heads=new THREE.InstancedMesh(new THREE.SphereGeometry(0.14,5,4),new THREE.MeshStandardMaterial({color:0xd2c8ad,roughness:1}),512);
    this.towns=new THREE.InstancedMesh(new THREE.BoxGeometry(0.5,0.6,0.65),new THREE.MeshStandardMaterial({color:0xc8bba0,roughness:1}),192);
    for(const mesh of [this.bodies,this.heads,this.towns]){mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.count=0;this.scene.add(mesh);}
    const c=this.renderer.domElement;c.tabIndex=0;c.addEventListener('keydown',this.keyDown);c.addEventListener('pointerdown',this.pointerDown);c.addEventListener('pointermove',this.pointerMove);c.addEventListener('pointerup',this.pointerUp);c.addEventListener('pointercancel',this.pointerCancel);c.addEventListener('lostpointercapture',this.pointerCancel);c.addEventListener('wheel',this.wheel,{passive:false});c.addEventListener('contextmenu',this.contextMenu);
    this.observer=new ResizeObserver(this.resize);this.observer.observe(host);this.resize();this.animation=requestAnimationFrame(this.frame);
  }
  /** Grow GPU buffers; render allocation must never act as a simulation cap. */
  private ensureUnitCapacity(required:number) {
    if(required<=this.unitInstanceCapacity)return;
    let capacity=this.unitInstanceCapacity;while(capacity<required)capacity*=2;
    const grow=(old:THREE.InstancedMesh)=>{
      const next=new THREE.InstancedMesh(old.geometry,old.material,capacity);
      next.frustumCulled=false;next.instanceMatrix.setUsage(THREE.DynamicDrawUsage);next.count=0;
      this.scene.remove(old);old.dispose();this.scene.add(next);return next;
    };
    this.bodies=grow(this.bodies);this.heads=grow(this.heads);this.unitInstanceCapacity=capacity;
  }
  private lines(points:number[],color:number,opacity:number) {
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(points,3));
    return new THREE.LineSegments(geo,new THREE.LineBasicMaterial({color,transparent:true,opacity,depthWrite:false}));
  }
  private relief(material:THREE.Material) {
    material.onBeforeCompile=shader=>{shader.uniforms.uRelief=this.blendUniform;shader.vertexShader='uniform float uRelief;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed.y += uRelief * (0.32 * (1.0 + sin(position.x * 0.18) * cos(position.z * 0.22)));');};
    material.customProgramCacheKey=()=> 'earth-relief-v1';
  }
  update(state:GameState,selected:number,lang:'zh'|'en') {
    this.state=state;if(this.lang!==lang){this.invalidated=true;this.lastLabels=0;}this.lang=lang;
    for(const p of state.provinces)if(this.ownerIds[p.id]!==p.owner){this.ownerIds[p.id]=p.owner;this.dirty.add(p.id);}
    if(selected!==this.selected){this.selected=selected;this.drawSelection();this.lastLabels=0;this.invalidated=true;}
  }
  private drawSelection() {
    const points:number[]=[],segments:[Vec2,Vec2][]=[];
    if(this.selected>=0&&MAP[this.selected].visible)for(const part of MAP[this.selected].parts)for(const ring of part)for(let i=0;i<ring.length;i++){
      const segment=clipSegment(ring[i],ring[(i+1)%ring.length],BOUNDS);if(!segment)continue;const [a,b]=segment;segments.push([a,b]);points.push(a.x,0.32,a.z,b.x,0.32,b.z);
    }
    this.selection.geometry.dispose();this.selection.geometry=new THREE.BufferGeometry();this.selection.geometry.setAttribute('position',new THREE.Float32BufferAttribute(points,3));
    for(const copy of this.repeats)(copy.getObjectByName('selected-border') as THREE.LineSegments).geometry=this.selection.geometry;
    this.selectionGlowWorker?.terminate();this.selectionGlowWorker=null;
    const replaceGlow=(geometry:THREE.BufferGeometry)=>{this.selectionGlow.geometry.dispose();this.selectionGlow.geometry=geometry;for(const copy of this.repeats)(copy.getObjectByName('selected-inner-glow') as THREE.Mesh).geometry=geometry;};
    const empty=new THREE.BufferGeometry();empty.setAttribute('position',new THREE.Float32BufferAttribute([],3));empty.setAttribute('edgeDistance',new THREE.Float32BufferAttribute([],1));replaceGlow(empty);
    this.renderer.domElement.dataset.selectionStyle='outline-inner-glow';
    this.renderer.domElement.dataset.selectionGlowVertices='0';this.renderer.domElement.dataset.selectionGlowPending='false';delete this.renderer.domElement.dataset.selectionGlowError;
    this.renderer.domElement.dataset.selectionGlowWidth=String(SELECTION_GLOW_WIDTH);
    this.renderer.domElement.dataset.selectedRegion=String(this.selected);
    const range=this.ranges[this.selected];if(!range?.count||!segments.length)return;
    // Large coastlines are rebuilt off-thread; only tiny bounded buffers are copied
    // on selection. A newer selection cancels stale work instead of queuing it.
    const land=(this.land.geometry.getAttribute('position').array as Float32Array).slice(range.start*3,(range.start+range.count)*3);
    const edges=Float64Array.from(segments.flatMap(([a,b])=>[a.x,a.z,b.x,b.z]));
    try{
      const worker=new Worker(new URL('./selectionGlow.worker.ts',import.meta.url),{type:'module'});this.selectionGlowWorker=worker;
      this.renderer.domElement.dataset.selectionGlowPending='true';
      worker.onmessage=({data}:{data:{positions:Float32Array;distance:Float32Array;elapsed:number}})=>{
        if(this.selectionGlowWorker!==worker)return;
        const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(data.positions,3));geometry.setAttribute('edgeDistance',new THREE.BufferAttribute(data.distance,1));replaceGlow(geometry);
        this.renderer.domElement.dataset.selectionGlowVertices=String(data.distance.length);this.renderer.domElement.dataset.selectionGlowBuildMs=data.elapsed.toFixed(1);this.renderer.domElement.dataset.selectionGlowPending='false';this.invalidated=true;
        worker.terminate();this.selectionGlowWorker=null;
      };
      worker.onerror=()=>{if(this.selectionGlowWorker===worker){this.renderer.domElement.dataset.selectionGlowPending='false';this.renderer.domElement.dataset.selectionGlowError='workerFailed';worker.terminate();this.selectionGlowWorker=null;}};
      worker.postMessage({land,edges,width:SELECTION_GLOW_WIDTH},[land.buffer,edges.buffer]);
    }catch{this.selectionGlowWorker?.terminate();this.selectionGlowWorker=null;this.renderer.domElement.dataset.selectionGlowPending='false';this.renderer.domElement.dataset.selectionGlowError='workerUnavailable';}

  }
  zoom(delta:number){this.mapInput.dispatch({type:'zoom',distance:this.desiredDistance*Math.exp(delta*0.008)});}
  view(mode:'strategic'|'terrain') {
    this.renderer.domElement.dataset.settled='false';this.invalidated=true;
    if(mode==='strategic'){this.globalView=true;this.focus.set(WORLD_CENTER.x,0,WORLD_CENTER.z);this.desiredFocusZ=WORLD_CENTER.z;this.desiredDistance=worldCoverDistance(this.camera.aspect);}
    else if(this.selected>=0)this.focusProvince(this.selected);
  }
  focusProvince(id:number) {
    const p=MAP[id];if(!p?.visible)return;this.renderer.domElement.dataset.settled='false';this.globalView=false;this.invalidated=true;this.focus.set(p.center.x,0,p.center.z);this.desiredFocusZ=p.center.z;
    this.desiredDistance=THREE.MathUtils.clamp(Math.max(p.bounds.right-p.bounds.left,p.bounds.bottom-p.bounds.top)*2.4,16,240);
  }
  private resize=()=>{this.down=null;this.touches.clear();this.touchBase=null;this.touchMoved=true;this.invalidated=true;this.renderer.domElement.dataset.settled='false';const w=this.host.clientWidth,h=this.host.clientHeight;if(w<1||h<1)return;this.renderer.setSize(w,h);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();if(this.globalView){this.desiredDistance=worldCoverDistance(w/h);if(!this.resized)this.distance=this.desiredDistance;}this.desiredDistance=Math.min(this.desiredDistance,worldCoverDistance(w/h));this.distance=Math.min(this.distance,worldCoverDistance(w/h));this.resized=true;};
  private pick(e:PointerEvent):number {
    const r=this.renderer.domElement.getBoundingClientRect();this.pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);this.ray.setFromCamera(this.pointer,this.camera);
    const point=new THREE.Vector3(),plane=new THREE.Plane(new THREE.Vector3(0,1,0),-0.16);
    for(let i=0;i<4;i++){
      if(!this.ray.ray.intersectPlane(plane,point))return -1;
      plane.constant=-(0.16+(heightAt(wrapX(point.x),point.z)-0.16)*this.blend);
    }
    return provinceAt(viewPickX(point.x,this.globalView),point.z);
  }
  private mapInput=new MapInputController(action=>{
    this.invalidated=true;this.renderer.domElement.dataset.settled='false';
    if(action.type==='select'){this.onPick(action.region,action.attack);return;}
    this.globalView=false;
    if(action.type==='zoom')this.desiredDistance=THREE.MathUtils.clamp(action.distance,5,worldCoverDistance(this.camera.aspect));
    else {this.focus.x=wrapX(action.x);this.desiredFocusZ=THREE.MathUtils.clamp(action.z,BOUNDS.top,BOUNDS.bottom);}
  });
  setInputContext(context:MapInputContext){
    this.mapInput.setContext(context);this.down=null;this.touches.clear();this.touchBase=null;this.touchMoved=true;
    this.renderer.domElement.dataset.inputContext=context;
  }
  private touches=new Map<number,{x:number;y:number}>();
  private touchBase:{x:number;y:number;span:number;distance:number;fx:number;fz:number}|null=null;
  private touchMoved=false;
  private resetTouchBase(){
    const points=[...this.touches.values()];if(!points.length){this.touchBase=null;return;}
    const a=points[0],b=points[1]??a;
    this.touchBase={x:(a.x+b.x)/2,y:(a.y+b.y)/2,span:Math.hypot(b.x-a.x,b.y-a.y),distance:this.desiredDistance,fx:this.focus.x,fz:this.desiredFocusZ};
  }
  private pointerDown=(e:PointerEvent)=>{
    if(!this.mapInput.active)return;
    if(e.pointerType==='touch'||e.pointerType==='pen'){
      if(!this.touches.size)this.touchMoved=false;
      this.touches.set(e.pointerId,{x:e.clientX,y:e.clientY});
      if(this.touches.size>1)this.touchMoved=true;
      this.resetTouchBase();
    }else this.down={x:e.clientX,y:e.clientY,fx:this.focus.x,fz:this.focus.z,button:e.button};
    try{this.renderer.domElement.setPointerCapture(e.pointerId);}catch{/* Synthetic/accessibility events may not hold capture. */}
  };
  private pointerMove=(e:PointerEvent)=>{
    if(!this.mapInput.active)return;
    if(e.pointerType==='touch'||e.pointerType==='pen'){
      if(!this.touches.has(e.pointerId)||!this.touchBase)return;
      this.touches.set(e.pointerId,{x:e.clientX,y:e.clientY});
      const points=[...this.touches.values()],a=points[0],b=points[1]??a,base=this.touchBase;
      const x=(a.x+b.x)/2,y=(a.y+b.y)/2,span=Math.hypot(b.x-a.x,b.y-a.y);
      if(points.length>1||Math.hypot(x-base.x,y-base.y)>=5)this.touchMoved=true;
      if(!this.touchMoved)return;
      if(points.length>1&&base.span>0&&span>0)this.mapInput.dispatch({type:'zoom',distance:base.distance*base.span/span});
      const scale=2*base.distance*Math.tan(20*Math.PI/180)/this.host.clientHeight;
      this.mapInput.dispatch({type:'pan',x:base.fx-(x-base.x)*scale,z:base.fz-(y-base.y)*scale});
      return;
    }
    if(this.down&&this.down.button!==2&&Math.hypot(e.clientX-this.down.x,e.clientY-this.down.y)>=5){this.globalView=false;this.invalidated=true;const scale=2*this.distance*Math.tan(20*Math.PI/180)/this.host.clientHeight;
      this.mapInput.dispatch({type:'pan',x:this.down.fx-(e.clientX-this.down.x)*scale,z:this.down.fz-(e.clientY-this.down.y)*scale});}
  };
  private pointerUp=(e:PointerEvent)=>{
    if(!this.mapInput.active)return;
    if(e.pointerType==='touch'||e.pointerType==='pen'){
      if(!this.touches.has(e.pointerId))return;
      if(this.touchBase&&Math.hypot(e.clientX-this.touchBase.x,e.clientY-this.touchBase.y)>=5)this.touchMoved=true;
      if(this.touches.size===1&&!this.touchMoved){const id=this.pick(e);if(id>=0)this.mapInput.dispatch({type:'select',region:id,attack:false});}
      this.touches.delete(e.pointerId);this.resetTouchBase();return;
    }
    if(this.down&&Math.hypot(e.clientX-this.down.x,e.clientY-this.down.y)<5){const id=this.pick(e);if(id>=0)this.mapInput.dispatch({type:'select',region:id,attack:e.button===2||e.shiftKey});}this.down=null;
  };
  private pointerCancel=(e:PointerEvent)=>{this.down=null;this.touchMoved=true;this.touches.delete(e.pointerId);this.resetTouchBase();};
  private wheel=(e:WheelEvent)=>{if(!this.mapInput.active)return;e.preventDefault();this.mapInput.dispatch({type:'zoom',distance:this.desiredDistance*Math.exp(e.deltaY*0.12*0.008)});};
  private keyDown=(e:KeyboardEvent)=>{
    if(!this.mapInput.active||e.altKey||e.ctrlKey||e.metaKey)return;
    if(e.key==='Home'||e.key==='End'){e.preventDefault();this.view(e.key==='Home'?'strategic':'terrain');return;}
    const step=this.desiredDistance*0.08;
    if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){
      e.preventDefault();this.mapInput.dispatch({type:'pan',x:this.focus.x+(e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0),z:this.desiredFocusZ+(e.key==='ArrowUp'?-step:e.key==='ArrowDown'?step:0)});
    }else if(['+','=','-','_'].includes(e.key)){
      e.preventDefault();this.mapInput.dispatch({type:'zoom',distance:this.desiredDistance*(e.key==='-'||e.key==='_'?1.15:1/1.15)});
    }
  };
  private contextMenu=(e:Event)=>e.preventDefault();
  private drawLabels(time:number) {
    if(time-this.lastLabels<180)return;this.lastLabels=time;const near=this.distance<500;
    const candidates=near?MAP.filter(p=>p.visible&&Math.abs(nearestWorldX(p.center.x,this.focus.x)-this.focus.x)<this.distance*this.camera.aspect*0.45&&Math.abs(p.center.z-this.focus.z)<this.distance*0.5).sort((a,b)=>(a.id===this.selected?-1:b.id===this.selected?1:(a.center.x-this.focus.x)**2+(a.center.z-this.focus.z)**2-(b.center.x-this.focus.x)**2-(b.center.z-this.focus.z)**2)):[];
    const occupied:{x:number;y:number}[]=[];let n=0,townCount=0;
    const paint=(name:string,x:number,z:number,ocean=false)=>{
      if(!inRect({x,z},BOUNDS))return;const canonicalX=x;x=nearestWorldX(x,this.focus.x);
      const screen=new THREE.Vector3(x,0.6,z).project(this.camera),sx=(screen.x+1)*this.host.clientWidth/2,sy=(1-screen.y)*this.host.clientHeight/2;
      if(Math.abs(screen.x)>0.95||Math.abs(screen.y)>0.88||occupied.some(p=>Math.abs(p.x-sx)<130&&Math.abs(p.y-sy)<27)||n>=48)return;
      occupied.push({x:sx,y:sy});const label=this.labels[n++],key=`${name}:${ocean}`;
      if(label.key!==key){const ctx=label.canvas.getContext('2d')!;ctx.clearRect(0,0,512,96);ctx.textAlign='center';ctx.font=`${ocean?'400':'600'} 30px "Noto Serif CJK SC", Georgia, serif`;
        ctx.strokeStyle=ocean?'#14333e':'#d0cdb5';ctx.lineWidth=ocean?0:4;if(!ocean)ctx.strokeText(name,256,58,490);ctx.fillStyle=ocean?'#8ca7ac':'#1e332e';ctx.fillText(name,256,58,490);label.texture.needsUpdate=true;label.key=key;}
      label.sprite.visible=true;label.sprite.position.set(x,0.9+heightAt(canonicalX,z)*this.blend,z);const w=this.distance*(ocean?0.27:0.15);label.sprite.scale.set(w,w*96/512,1);
    };
    for(const p of candidates){
      paint(p.name[this.lang==='zh'?0:1],p.center.x,p.center.z);
      if(this.blend>0.1&&townCount<188){for(let i=0;i<4;i++){const x=p.center.x+Math.cos(i*2.3)*0.65,z=p.center.z+Math.sin(i*2.3)*0.65;if(!pointInProvince(p.id,x,z))continue;
        this.dummy.position.set(nearestWorldX(x,this.focus.x),heightAt(x,z)*this.blend+0.3,z);this.dummy.rotation.set(0,i,0);this.dummy.scale.setScalar(1);this.dummy.updateMatrix();this.towns.setMatrixAt(townCount++,this.dummy.matrix);}}
    }
    if(!near){for(const [zh,en,lon,lat] of [['北太平洋','NORTH PACIFIC',-145,22],['南太平洋','SOUTH PACIFIC',-122,-34],['大西洋','ATLANTIC',-37,20],['印度洋','INDIAN OCEAN',77,-27],['北冰洋','ARCTIC OCEAN',5,72]] as const){const p=project(lon,lat);paint(this.lang==='zh'?zh:en,p.x,p.z,true);}}
    for(let i=n;i<this.labels.length;i++)this.labels[i].sprite.visible=false;this.towns.count=townCount;this.towns.instanceMatrix.needsUpdate=true;
  }
  private frame=(time:number)=>{
    this.animation=requestAnimationFrame(this.frame);
    if(document.hidden)return;
    const moving=Math.abs(this.distance-this.desiredDistance)>0.01;
    // A stationary strategic map has no animated units. Render only when invalidated.
    if(!moving&&!this.invalidated&&!this.dirty.size&&this.blend<0.1)return;
    if(time-this.lastRender<(this.distance>320?100:1000/30))return;
    this.lastRender=time;this.invalidated=false;for(const copy of this.repeats)copy.visible=!this.globalView;
    const dt=Math.min((time-this.last)/1000||0.016,0.1);this.last=time;this.distance+=(this.desiredDistance-this.distance)*(1-Math.exp(-dt*9));
    this.blend=1-THREE.MathUtils.smoothstep(this.distance,90,320);this.blendUniform.value=this.blend;
    // Scale the near plane with zoom: a 0.05 near plane loses sea/land depth precision at global distances.
    this.camera.far=Math.max(20000,this.distance*4);this.camera.near=Math.max(0.05,this.distance*0.01);this.camera.updateProjectionMatrix();
    const angle=this.blend*0.6;this.focus.z=clampViewZ(this.desiredFocusZ,this.distance,angle);this.camera.position.set(this.focus.x,this.distance*Math.cos(angle),this.focus.z+this.distance*Math.sin(angle));this.camera.lookAt(this.focus);this.camera.updateMatrixWorld();
    const mode=this.blend>0.5?'near':'far';if(mode!==this.lastMode){this.onMode(mode==='near');this.lastMode=mode;}
    (this.admin.material as THREE.LineBasicMaterial).opacity=this.distance>1000?0.45:this.distance>300?0.55:0.65;
    if(this.dirty.size){this.colors.clearUpdateRanges();for(const id of this.dirty){const r=this.ranges[id],owner=this.ownerIds[id],color=owner<0?regionColor():new THREE.Color(OWNER[owner]);for(let v=r.start;v<r.start+r.count;v++)this.colors.setXYZ(v,color.r,color.g,color.b);if(r.count)this.colors.addUpdateRange(r.start*3,r.count*3);}this.colors.needsUpdate=true;this.dirty.clear();}
    const selectedRange=this.ranges[this.selected];
    if(selectedRange?.count){const i=selectedRange.start,actual=new THREE.Color().setRGB(this.colors.getX(i),this.colors.getY(i),this.colors.getZ(i));this.renderer.domElement.dataset.selectedFillColor=actual.getHexString();this.renderer.domElement.dataset.selectedOwnerColor=(this.ownerIds[this.selected]<0?regionColor():new THREE.Color(OWNER[this.ownerIds[this.selected]])).getHexString();}
    if(this.blend>0.1)this.ensureUnitCapacity((this.state?.units.length??0)*3);
    let n=0;const live=new Set<number>();
    for(const u of this.state?.units??[]) {
      live.add(u.id);const pos=this.smoothed.get(u.id)??{x:u.x,z:u.z},t=1-Math.exp(-dt*16);pos.x+=(u.x-pos.x)*t;pos.z+=(u.z-pos.z)*t;this.smoothed.set(u.id,pos);
      if(this.blend<0.1||!inRect(pos,BOUNDS)||Math.abs(nearestWorldX(pos.x,this.focus.x)-this.focus.x)>this.distance||Math.abs(pos.z-this.focus.z)>this.distance)continue;
      for(let j=0;j<(u.transport?.embarked?1:3);j++){
        const x=pos.x+Math.cos(j*2.1+u.id)*0.3,z=pos.z+Math.sin(j*2.1+u.id)*0.3,y=heightAt(x,z)*this.blend;
        if(!inRect({x,z},BOUNDS))continue;this.dummy.position.set(nearestWorldX(x,this.focus.x),y+0.36,z);this.dummy.rotation.set(0,u.id,0);if(u.transport?.embarked)this.dummy.scale.set(2.3,0.5,1.2);else this.dummy.scale.setScalar(1);this.dummy.updateMatrix();this.bodies.setMatrixAt(n,this.dummy.matrix);this.bodies.setColorAt(n,new THREE.Color(u.owner<0?0x595f50:OWNER[u.owner]));
        this.dummy.position.y=y+0.68;if(u.transport?.embarked)this.dummy.scale.set(1.2,0.6,1);this.dummy.updateMatrix();this.heads.setMatrixAt(n,this.dummy.matrix);n++;
      }
    }
    for(const id of this.smoothed.keys())if(!live.has(id))this.smoothed.delete(id);
    this.bodies.count=this.heads.count=n;this.bodies.instanceMatrix.needsUpdate=this.heads.instanceMatrix.needsUpdate=true;if(this.bodies.instanceColor)this.bodies.instanceColor.needsUpdate=true;
    this.drawLabels(time);this.renderer.render(this.scene,this.camera);
    this.renderer.domElement.dataset.viewportWidth=String(this.host.clientWidth);this.renderer.domElement.dataset.viewportHeight=String(this.host.clientHeight);
    const span=cameraGroundSpan(this.distance,angle);this.renderer.domElement.dataset.framing='cover';this.renderer.domElement.dataset.distance=String(this.distance);this.renderer.domElement.dataset.groundTop=String(this.focus.z-span.north);this.renderer.domElement.dataset.groundBottom=String(this.focus.z+span.south);
    this.renderer.domElement.dataset.crop=CROP_ID;this.renderer.domElement.dataset.visibleProvinces=String(VISIBLE_COUNT);this.renderer.domElement.dataset.focusX=String(this.focus.x);this.renderer.domElement.dataset.focusZ=String(this.focus.z);this.renderer.domElement.dataset.wrapX='true';
    this.renderer.domElement.dataset.unitCapacity=String(this.unitInstanceCapacity);this.renderer.domElement.dataset.totalUnits=String(this.state?.units.length??0);this.renderer.domElement.dataset.renderedInstances=String(n);
    this.renderer.domElement.dataset.countryBorders='false';this.renderer.domElement.dataset.ready='true';this.renderer.domElement.dataset.projection=PROJECTION_ID;this.renderer.domElement.dataset.provinces=String(MAP.length);this.renderer.domElement.dataset.view=mode;this.renderer.domElement.dataset.settled=String(Math.abs(this.distance-this.desiredDistance)<0.1);
  };
  dispose(){this.selectionGlowWorker?.terminate();this.selectionGlowWorker=null;cancelAnimationFrame(this.animation);this.observer.disconnect();const c=this.renderer.domElement;c.removeEventListener('keydown',this.keyDown);c.removeEventListener('pointerdown',this.pointerDown);c.removeEventListener('pointermove',this.pointerMove);c.removeEventListener('pointerup',this.pointerUp);c.removeEventListener('pointercancel',this.pointerCancel);c.removeEventListener('lostpointercapture',this.pointerCancel);c.removeEventListener('wheel',this.wheel);c.removeEventListener('contextmenu',this.contextMenu);
    const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();this.scene.traverse(o=>{const m=o as THREE.Mesh;if(m.geometry)geometries.add(m.geometry);if(m.material)for(const material of Array.isArray(m.material)?m.material:[m.material])materials.add(material);});for(const g of geometries)g.dispose();for(const m of materials)m.dispose();for(const l of this.labels)l.texture.dispose();this.renderer.dispose();c.remove();}
}
