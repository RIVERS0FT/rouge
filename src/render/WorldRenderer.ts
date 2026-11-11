import {MapSurface} from './mapSurface.ts';
import {OCEAN_FALLBACK} from './mapSurfaceConfig.ts';
import {countryName} from '../game/countryNames.ts';
import {buildCountryLabels,regionMoments,countryTypography,COUNTRY_LABEL_FONT,overlaps,labelIntersectsViewport,provinceNamesVisible,type CountryLabel,type LabelRect} from './countryLabels.ts';
import {SELECTION_GLOW_WIDTH,SELECTION_GLOW_OPACITY} from './selectionGlow.ts';
import {unitRenderMode,unitGlyph,unitSpritePixels,unitSpriteWorldSize,unitPresentationChanged} from './unitPresentation.ts';
import {createUnitSpriteTexture,createUnitSpriteMesh} from './unitSprites.ts';
import {UnitMotion,unitMotionFrameInterval} from './unitMotion.ts';
import {unitMotionSegment} from './unitMotionSegment.ts';
import {UNIT_RADIUS} from '../game/collision.ts';
import {TOWNS,HOUSE_WIDTH,HOUSE_HEIGHT,HOUSE_DEPTH} from '../game/buildings.ts';
import * as THREE from 'three';
import {LineSegments2} from 'three/addons/lines/LineSegments2.js';
import {LineSegmentsGeometry} from 'three/addons/lines/LineSegmentsGeometry.js';
import {LineMaterial} from 'three/addons/lines/LineMaterial.js';
import {buildBorderEdges,classifyBorder,borderPositions,internalBorderOpacity,COUNTRY_BORDER_WIDTH,SELECTION_BORDER_WIDTH,COUNTRY_BORDER_COLOR,type BorderEdge} from './territoryBorders.ts';
import {MapInputController,type MapInputContext} from './mapInput.ts';
import {advanceCameraDistance} from './cameraMotion.ts';
import { MAP, BOUNDS, heightAt, pointInProvince, provinceAt, VISIBLE_COUNT } from '../game/map.ts';
import { project, PROJECTION_ID, worldCoverDistance, cameraGroundSpan, clampViewZ, CROP_ID, WORLD_WIDTH, WORLD_CENTER, NORTH_LATITUDE, SOUTH_LATITUDE, wrapX, nearestWorldX, viewPickX } from '../game/geo.ts';
import { clipTriangle, inRect } from '../game/crop.ts';
import type { GameState, Vec2 } from '../game/types.ts';
import { factionColor, NEUTRAL_LAND_COLOR } from '../game/factionColors.ts';
export { factionColor, FACTION_COLORS } from '../game/factionColors.ts';
interface Label {sprite:THREE.Sprite;canvas:HTMLCanvasElement;texture:THREE.CanvasTexture;key:string}
interface Range {start:number;count:number}
/** No country palette: ownership is the only political color on the map. */
function regionColor():THREE.Color { return new THREE.Color(NEUTRAL_LAND_COLOR); }
/** One merged land mesh, batched boundaries and a bounded label pool for the global atlas. */
export class WorldRenderer {
  readonly renderer:THREE.WebGLRenderer;
  readonly scene=new THREE.Scene();
  readonly camera=new THREE.PerspectiveCamera(40,1,0.05,20000);
  private atlas=new THREE.Group();
  private mapSurface:MapSurface;
  private repeats:THREE.Group[]=[];
  private land:THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>;
  private admin:THREE.LineSegments;
  private countries:LineSegments2;
  private selection:LineSegments2;
  private selectionGlow:THREE.Mesh<THREE.BufferGeometry,THREE.MeshBasicMaterial>;
  private selectionGlowWorker:Worker|null=null;
  private ranges:Range[]=[];
  private colors:THREE.Float32BufferAttribute;
  private labels:Label[]=[];
  private countryComponents:CountryLabel[]=[];
  private countryGeometry=regionMoments(MAP);
  private countryCampaign='';
  private countryAnchorRevision=0;
  private countryLayer:HTMLDivElement;
  private countryLabels=new Map<number,HTMLSpanElement>();
  private provinceLayer:HTMLDivElement;
  private provinceLabels=new Map<number,HTMLSpanElement>();
  private labelMeasure=document.createElement('canvas').getContext('2d')!;
  private labelWidths=new Map<string,number>();
  private countryStamp='';
  private countryLabelRevision=0;
  private labelTimer:ReturnType<typeof setTimeout>|null=null;
  private bodies:THREE.InstancedMesh;
  private heads:THREE.InstancedMesh;
  private unitSprites:THREE.InstancedMesh;
  private unitSpriteTexture:THREE.CanvasTexture;
  private unitInstanceCapacity=512;
  private unitColor=new THREE.Color();
  private unitPoint=new THREE.Vector3();
  private towns:THREE.InstancedMesh;
  private blendUniform={value:0};
  private state:GameState|null=null;
  private renderedUnits:GameState['units']=[];
  private boundaryEdges:BorderEdge[]=[];private groupingStamp='';
  private selected=-1;private hover=-1;private lang:'zh'|'en'='zh';
  private ownerIds=MAP.map(()=>-1);
  private dirty=new Set<number>();
  private ray=new THREE.Raycaster();private pointer=new THREE.Vector2();private dummy=new THREE.Object3D();
  private observer:ResizeObserver;private animation=0;private last=0;
  private distance=4400;private desiredDistance=4400;private lastCameraTarget=4400;private focus=new THREE.Vector3(WORLD_CENTER.x,0,WORLD_CENTER.z);
  private desiredFocusZ=WORLD_CENTER.z;
  private globalView=true;private resized=false;
  private invalidated=true;private lastRender=0;
  private backgroundFrame=true;private renderRevision=0;
  private blend=0;private lastMode='';private lastLabels=0;
  private down:{x:number;y:number;fx:number;fz:number;button:number;moved:boolean}|null=null;
  private unitMotion=new UnitMotion(unitMotionSegment);private unitsWereMoving=false;
  private visibleUnitIds=new Set<number>();
  constructor(private host:HTMLElement,private onPick:(id:number,attack:boolean)=>void,private onMode:(near:boolean)=>void) {
    this.renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.5));this.renderer.setClearColor(0x2c4147);
    this.camera.up.set(0,0,-1);
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.1;
    this.renderer.domElement.setAttribute('aria-label','世界战场');host.append(this.renderer.domElement);
    this.provinceLayer=document.createElement('div');this.provinceLayer.className='province-label-layer';this.provinceLayer.setAttribute('aria-hidden','true');host.append(this.provinceLayer);
    this.countryLayer=document.createElement('div');this.countryLayer.className='country-label-layer';this.countryLayer.setAttribute('aria-hidden','true');host.append(this.countryLayer);
    this.scene.add(new THREE.HemisphereLight(0xf5eedb,0x34484b,2.3));
    const sun=new THREE.DirectionalLight(0xfff2dc,1.7);sun.position.set(-100,250,-120);this.scene.add(sun);
    this.scene.add(this.atlas);
    const sea=new THREE.Mesh(new THREE.PlaneGeometry(WORLD_WIDTH,BOUNDS.bottom-BOUNDS.top),new THREE.MeshBasicMaterial({color:OCEAN_FALLBACK,toneMapped:false}));
    sea.rotation.x=-Math.PI/2;sea.position.set(0,-0.25,WORLD_CENTER.z);this.atlas.add(sea);
    const graticule:number[]=[];
    for(let lon=-180;lon<=180;lon+=30){const a=project(lon,SOUTH_LATITUDE),b=project(lon,NORTH_LATITUDE);graticule.push(a.x,-0.15,a.z,b.x,-0.15,b.z);}
    for(let lat=Math.ceil(SOUTH_LATITUDE/20)*20;lat<=NORTH_LATITUDE;lat+=20){const a=project(-180,lat),b=project(180,lat);graticule.push(a.x,-0.15,a.z,b.x,-0.15,b.z);}
    this.atlas.add(this.lines(graticule,0x90afb0,0.10));
    // No decorative atlas frame: the map continues behind the edge HUD.
    const positions:number[]=[],colors:number[]=[];
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

      }
      this.ranges.push({start,count:positions.length/3-start});
    }
    const edges=buildBorderEdges(MAP,BOUNDS),coasts=borderPositions(edges.filter(e=>e.atoms.length===1),0.27);
    // Keep coasts for selection too; political updates classify and skip them.
    this.boundaryEdges=edges;
    let minLandZ=Infinity,maxLandZ=-Infinity;for(let i=2;i<positions.length;i+=3){minLandZ=Math.min(minLandZ,positions[i]);maxLandZ=Math.max(maxLandZ,positions[i]);}
    this.renderer.domElement.dataset.landMinZ=String(minLandZ);this.renderer.domElement.dataset.landMaxZ=String(maxLandZ);
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    this.colors=new THREE.Float32BufferAttribute(colors,3);this.colors.setUsage(THREE.DynamicDrawUsage);geometry.setAttribute('color',this.colors);
    const normals=new Float32Array(positions.length);for(let i=1;i<normals.length;i+=3)normals[i]=1;geometry.setAttribute('normal',new THREE.BufferAttribute(normals,3));
    const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,side:THREE.DoubleSide});
    this.relief(material);this.mapSurface=new MapSurface(material,sea.material,this.renderer,()=>{this.invalidated=true;this.backgroundFrame=true;},this.blendUniform);this.land=new THREE.Mesh(geometry,material);this.atlas.add(this.land);
    this.admin=this.lines([],0x4c514a,internalBorderOpacity(this.distance));this.relief(this.admin.material as THREE.Material);this.admin.name='region-boundaries';this.atlas.add(this.admin);
    const outlines=this.lines(coasts,0x35433f,0.7);this.relief(outlines.material as THREE.Material);outlines.name='coastlines';this.atlas.add(outlines);
    this.countries=this.wideLines([],COUNTRY_BORDER_COLOR,COUNTRY_BORDER_WIDTH);this.countries.name='country-boundaries';this.atlas.add(this.countries);
    this.renderer.domElement.dataset.boundaryMode='ownership-and-management';
    this.renderer.domElement.dataset.neutralBorders='independent-territories';
    this.renderer.domElement.dataset.countryBorderWidth=String(COUNTRY_BORDER_WIDTH);
    this.renderer.domElement.dataset.selectionBorderWidth=String(SELECTION_BORDER_WIDTH);
    this.renderer.domElement.dataset.coastBorderSegments=String(coasts.length/6);
    this.renderer.domElement.dataset.regionCount=String(MAP.length);
    this.selection=this.wideLines([],0xead5a2,SELECTION_BORDER_WIDTH);this.selection.name='selected-border';this.selection.renderOrder=2;this.atlas.add(this.selection);
    const glowMaterial=new THREE.MeshBasicMaterial({color:0xead5a2,transparent:true,opacity:SELECTION_GLOW_OPACITY,depthWrite:false,side:THREE.DoubleSide});
    glowMaterial.onBeforeCompile=shader=>{
      // Subdivision follows the original land triangle plane, not a differently
      // tessellated relief wave that could dip below the terrain and create gaps.
      shader.uniforms.uRelief=this.blendUniform;
      shader.uniforms.uGlowWidth={value:SELECTION_GLOW_WIDTH};
      shader.vertexShader='uniform float uRelief; attribute float landRelief; attribute float edgeDistance; varying float vEdgeDistance;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvEdgeDistance = edgeDistance; transformed.y += uRelief * landRelief;');
      shader.fragmentShader='uniform float uGlowWidth; varying float vEdgeDistance;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\nfloat fade = 1.0 - smoothstep(0.0, uGlowWidth, vEdgeDistance);\ndiffuseColor.a *= fade * fade;');
    };
    glowMaterial.customProgramCacheKey=()=> 'earth-selection-inner-glow-v3-land-plane';
    const initialGlow=new THREE.BufferGeometry();initialGlow.setAttribute('position',new THREE.Float32BufferAttribute([],3));initialGlow.setAttribute('edgeDistance',new THREE.Float32BufferAttribute([],1));initialGlow.setAttribute('landRelief',new THREE.Float32BufferAttribute([],1));
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
    this.unitSpriteTexture=createUnitSpriteTexture();this.unitSprites=createUnitSpriteMesh(this.unitSpriteTexture,this.unitInstanceCapacity);this.scene.add(this.unitSprites);
    this.towns=new THREE.InstancedMesh(new THREE.BoxGeometry(HOUSE_WIDTH,HOUSE_HEIGHT,HOUSE_DEPTH),new THREE.MeshStandardMaterial({color:0xc8bba0,roughness:1}),192);
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
    this.bodies=grow(this.bodies);this.heads=grow(this.heads);
    const old=this.unitSprites;this.scene.remove(old);old.dispose();old.geometry.dispose();(old.material as THREE.Material).dispose();
    this.unitSprites=createUnitSpriteMesh(this.unitSpriteTexture,capacity);this.scene.add(this.unitSprites);this.unitInstanceCapacity=capacity;
  }
  private lines(points:number[],color:number,opacity:number) {
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(points,3));
    return new THREE.LineSegments(geo,new THREE.LineBasicMaterial({color,transparent:true,opacity,depthWrite:false}));
  }
  /** Mesh-backed screen-space lines: WebGL native linewidth is often fixed at
   * one device pixel, so it cannot express a border hierarchy on phones. */
  private wideLines(points:number[],color:number,width:number) {
    const geometry=new LineSegmentsGeometry().setPositions(points);
    const material=new LineMaterial({color,linewidth:width,worldUnits:false,transparent:true,depthWrite:false,alphaToCoverage:true});
    material.onBeforeCompile=shader=>{
      shader.uniforms.uRelief=this.blendUniform;shader.vertexShader='uniform float uRelief;\n'+shader.vertexShader;
      for(const endpoint of ['instanceStart','instanceEnd'])shader.vertexShader=shader.vertexShader.replace(`vec4( ${endpoint}, 1.0 )`,`vec4( ${endpoint} + vec3(0.0, uRelief * (0.32 * (1.0 + sin(${endpoint}.x * 0.18) * cos(${endpoint}.z * 0.22))), 0.0), 1.0 )`);
    };
    material.customProgramCacheKey=()=> 'earth-wide-border-relief-v1';
    const lines=new LineSegments2(geometry,material);lines.visible=points.length>0;return lines;
  }
  private replaceWideGeometry(lines:LineSegments2,points:number[]) {
    const geometry=new LineSegmentsGeometry().setPositions(points);lines.geometry.dispose();lines.geometry=geometry;lines.visible=points.length>0;
    for(const copy of this.repeats){const repeat=copy.getObjectByName(lines.name) as LineSegments2;repeat.geometry=geometry;repeat.visible=lines.visible;}
  }
  private relief(material:THREE.Material) {
    material.onBeforeCompile=shader=>{shader.uniforms.uRelief=this.blendUniform;shader.vertexShader='uniform float uRelief;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed.y += uRelief * (0.32 * (1.0 + sin(position.x * 0.18) * cos(position.z * 0.22)));');};
    material.customProgramCacheKey=()=> 'earth-relief-v1';
  }
  update(state:GameState,selected:number,lang:'zh'|'en') {
    // Do not redraw the global atlas for HP/cooldown/tick-only snapshots. Tiny
    // movements accumulate from the last rendered state, never the previous tick.
    if(this.state!==state&&unitPresentationChanged(this.renderedUnits,state.units,this.distance,this.host.clientHeight))this.invalidated=true;
    if(this.state!==state)this.unitMotion.update(state,performance.now());
    if(this.state?.campaign!==state.campaign)this.invalidated=true;
    this.state=state;
    const grouping=state.grouping,stamp=`${state.campaign}:${grouping.revision}`;
    let ownershipChanged=false;
    for(const p of state.provinces)if(this.ownerIds[p.id]!==p.owner){this.ownerIds[p.id]=p.owner;this.dirty.add(p.id);ownershipChanged=true;}
    const countryStamp=JSON.stringify([state.campaign,state.players.map(p=>[p.name,p.ai,p.country])]);
    if(ownershipChanged||state.campaign!==this.countryCampaign){
      this.countryCampaign=state.campaign;this.countryComponents=buildCountryLabels(MAP,this.ownerIds,this.countryGeometry);this.lastLabels=0;this.invalidated=true;
      this.renderer.domElement.dataset.countryAnchorRevision=String(++this.countryAnchorRevision);
      this.renderer.domElement.dataset.countryComponents=String(this.countryComponents.length);
    }
    if(countryStamp!==this.countryStamp){this.countryStamp=countryStamp;this.lastLabels=0;this.invalidated=true;}
    if(stamp!==this.groupingStamp||ownershipChanged){
      this.groupingStamp=stamp;
      const groups=MAP.map(p=>grouping.atomToGroup[p.code]??`atom:${p.id}`),internal:BorderEdge[]=[],countries:BorderEdge[]=[];
      for(const edge of this.boundaryEdges){const kind=classifyBorder(edge,this.ownerIds,groups);if(kind==='country')countries.push(edge);else if(kind==='internal')internal.push(edge);}
      const border=borderPositions(internal,.24),geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(border,3));this.admin.geometry.dispose();this.admin.geometry=geometry;
      for(const copy of this.repeats)(copy.getObjectByName('region-boundaries') as THREE.LineSegments).geometry=geometry;
      this.replaceWideGeometry(this.countries,borderPositions(countries,.28));
      this.renderer.domElement.dataset.managementRevision=String(grouping.revision);this.renderer.domElement.dataset.managementBorderSegments=String(internal.length);
      this.renderer.domElement.dataset.countryBorderSegments=String(countries.length);this.invalidated=true;
    }
    if(this.lang!==lang){this.invalidated=true;this.backgroundFrame=true;this.lastLabels=0;}this.lang=lang;this.renderer.domElement.setAttribute('aria-label',lang==='zh'?'世界战场':'World theatre');
    if(selected!==this.selected){this.selected=selected;this.drawSelection();this.lastLabels=0;this.invalidated=true;}
  }
  private drawSelection() {
    const points:number[]=[],segments:[Vec2,Vec2][]=[];
    // Reuse dissolved region boundaries for both outline and glow. Source parts
    // retain administrative geometry, but their shared sides are not game borders.
    if(this.selected>=0&&MAP[this.selected].visible)for(const edge of this.boundaryEdges)if(edge.atoms.includes(this.selected)){
      const {a,b}=edge;segments.push([a,b]);points.push(a.x,0.32,a.z,b.x,0.32,b.z);
    }
    this.replaceWideGeometry(this.selection,points);
    this.selectionGlowWorker?.terminate();this.selectionGlowWorker=null;
    const replaceGlow=(geometry:THREE.BufferGeometry)=>{this.selectionGlow.geometry.dispose();this.selectionGlow.geometry=geometry;for(const copy of this.repeats)(copy.getObjectByName('selected-inner-glow') as THREE.Mesh).geometry=geometry;};
    const empty=new THREE.BufferGeometry();empty.setAttribute('position',new THREE.Float32BufferAttribute([],3));empty.setAttribute('edgeDistance',new THREE.Float32BufferAttribute([],1));empty.setAttribute('landRelief',new THREE.Float32BufferAttribute([],1));replaceGlow(empty);
    this.renderer.domElement.dataset.selectionStyle='outline-inner-glow';
    this.renderer.domElement.dataset.selectionGlowCoverage='single-nearest-boundary';
    this.renderer.domElement.dataset.selectionGlowOpacity=String(SELECTION_GLOW_OPACITY);
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
      worker.onmessage=({data}:{data:{positions:Float32Array;distance:Float32Array;relief:Float32Array;elapsed:number}})=>{
        if(this.selectionGlowWorker!==worker)return;
        const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(data.positions,3));geometry.setAttribute('edgeDistance',new THREE.BufferAttribute(data.distance,1));geometry.setAttribute('landRelief',new THREE.BufferAttribute(data.relief,1));replaceGlow(geometry);
        this.renderer.domElement.dataset.selectionGlowVertices=String(data.distance.length);this.renderer.domElement.dataset.selectionGlowBuildMs=data.elapsed.toFixed(1);this.renderer.domElement.dataset.selectionGlowPending='false';this.invalidated=true;this.backgroundFrame=true;
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
  private resize=()=>{this.backgroundFrame=true;this.down=null;this.touches.clear();this.touchBase=null;this.touchMoved=true;this.invalidated=true;this.renderer.domElement.dataset.settled='false';const w=this.host.clientWidth,h=this.host.clientHeight;if(w<1||h<1)return;this.renderer.setSize(w,h);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();if(this.globalView){this.desiredDistance=worldCoverDistance(w/h);if(!this.resized)this.distance=this.desiredDistance;}this.desiredDistance=Math.min(this.desiredDistance,worldCoverDistance(w/h));this.distance=Math.min(this.distance,worldCoverDistance(w/h));this.resized=true;};
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
    if(action.type==='deselect'){this.onPick(-1,false);return;}
    this.globalView=false;
    if(action.type==='zoom')this.desiredDistance=THREE.MathUtils.clamp(action.distance,5,worldCoverDistance(this.camera.aspect));
    else {this.focus.x=wrapX(action.x);this.desiredFocusZ=THREE.MathUtils.clamp(action.z,BOUNDS.top,BOUNDS.bottom);}
  });
  setInputContext(context:MapInputContext){
    if(this.labelTimer!==null){clearTimeout(this.labelTimer);this.labelTimer=null;}
    this.backgroundFrame=true;this.invalidated=true;this.lastLabels=0;
    this.mapInput.setContext(context);this.down=null;this.touches.clear();this.touchBase=null;this.touchMoved=true;
    this.renderer.domElement.dataset.inputContext=context;
  }
  private touches=new Map<number,{x:number;y:number}>();
  private touchBase:{x:number;y:number;span:number;distance:number;fx:number;fz:number}|null=null;
  private touchMoved=false;
  private touchStartedAt=0;
  private resetTouchBase(){
    const points=[...this.touches.values()];if(!points.length){this.touchBase=null;return;}
    const a=points[0],b=points[1]??a;
    this.touchBase={x:(a.x+b.x)/2,y:(a.y+b.y)/2,span:Math.hypot(b.x-a.x,b.y-a.y),distance:this.desiredDistance,fx:this.focus.x,fz:this.desiredFocusZ};
  }
  private pointerDown=(e:PointerEvent)=>{
    if(!this.mapInput.active)return;
    if(e.pointerType==='touch'||e.pointerType==='pen'){
      if(!this.touches.size){this.touchMoved=false;this.touchStartedAt=performance.now();}
      this.touches.set(e.pointerId,{x:e.clientX,y:e.clientY});
      if(this.touches.size>1)this.touchMoved=true;
      this.resetTouchBase();
    }else{
      if(e.button!==0&&e.button!==2)return;
      this.down={x:e.clientX,y:e.clientY,fx:this.focus.x,fz:this.focus.z,button:e.button,moved:false};
    }
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
    if(this.down){
      if(Math.hypot(e.clientX-this.down.x,e.clientY-this.down.y)>=5)this.down.moved=true;
      if(this.down.moved&&this.down.button!==2){this.globalView=false;this.invalidated=true;const scale=2*this.distance*Math.tan(20*Math.PI/180)/this.host.clientHeight;
        this.mapInput.dispatch({type:'pan',x:this.down.fx-(e.clientX-this.down.x)*scale,z:this.down.fz-(e.clientY-this.down.y)*scale});}
    }
  };
  private selectAt(e:PointerEvent,attack:boolean){
    // Pointer capture can deliver a release above HUD controls or outside the map.
    if(document.elementFromPoint(e.clientX,e.clientY)!==this.renderer.domElement)return;
    const id=this.pick(e);
    if(id>=0)this.mapInput.dispatch({type:'select',region:id,attack});
    else if(!attack)this.mapInput.dispatch({type:'deselect'});
  }
  private pointerUp=(e:PointerEvent)=>{
    if(!this.mapInput.active)return;
    if(e.pointerType==='touch'||e.pointerType==='pen'){
      if(!this.touches.has(e.pointerId))return;
      if(this.touchBase&&Math.hypot(e.clientX-this.touchBase.x,e.clientY-this.touchBase.y)>=5)this.touchMoved=true;
      // A stationary long press orders on release. Drag, pinch, cancellation and
      // a context change invalidate the gesture before it can issue a command.
      if(this.touches.size===1&&!this.touchMoved)this.selectAt(e,performance.now()-this.touchStartedAt>=550);
      this.touches.delete(e.pointerId);this.resetTouchBase();return;
    }
    if(this.down&&!this.down.moved&&this.down.button===e.button&&Math.hypot(e.clientX-this.down.x,e.clientY-this.down.y)<5)this.selectAt(e,e.button===2||e.shiftKey);this.down=null;
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
    if(time-this.lastLabels<180){
      // A final camera/state change must not leave labels at the previous view.
      if(this.labelTimer===null)this.labelTimer=setTimeout(()=>{this.labelTimer=null;this.invalidated=true;this.backgroundFrame=true;},180-(time-this.lastLabels));
      return;
    }
    this.lastLabels=time;const near=this.distance<500;
    const candidates=near?MAP.filter(p=>p.visible&&Math.abs(nearestWorldX(p.center.x,this.focus.x)-this.focus.x)<this.distance*this.camera.aspect*0.45&&Math.abs(p.center.z-this.focus.z)<this.distance*0.5).sort((a,b)=>(a.id===this.selected?-1:b.id===this.selected?1:(a.center.x-this.focus.x)**2+(a.center.z-this.focus.z)**2-(b.center.x-this.focus.x)**2-(b.center.z-this.focus.z)**2)):[];
    const occupied:LabelRect[]=[];let n=0,townCount=0;
    const paint=(name:string,x:number,z:number,ocean=false)=>{
      if(!inRect({x,z},BOUNDS))return;const canonicalX=x;x=nearestWorldX(x,this.focus.x);
      const screen=new THREE.Vector3(x,0.6,z).project(this.camera),sx=(screen.x+1)*this.host.clientWidth/2,sy=(1-screen.y)*this.host.clientHeight/2;
      if(Math.abs(screen.x)>0.95||Math.abs(screen.y)>0.88||occupied.some(p=>overlaps(p,{left:sx-65,right:sx+65,top:sy-13.5,bottom:sy+13.5}))||n>=48)return;
      occupied.push({left:sx-65,right:sx+65,top:sy-13.5,bottom:sy+13.5});const label=this.labels[n++],key=`${name}:${ocean}`;
      if(label.key!==key){const ctx=label.canvas.getContext('2d')!;ctx.clearRect(0,0,512,96);ctx.textAlign='center';ctx.font=`${ocean?'italic 400':'600'} 30px "Noto Serif CJK SC", Georgia, serif`;
        ctx.strokeStyle=ocean?'#14333e':'#d0cdb5';ctx.lineWidth=ocean?0:4;if(!ocean)ctx.strokeText(name,256,58,490);ctx.fillStyle=ocean?'#bfd1d2':'#1e332e';ctx.fillText(name,256,58,490);label.texture.needsUpdate=true;label.key=key;}
      label.sprite.visible=true;label.sprite.position.set(x,0.9+heightAt(canonicalX,z)*this.blend,z);const w=this.distance*(ocean?0.27:0.15);label.sprite.scale.set(w,w*96/512,1);
    };
    // Region information takes priority over country titles at tactical zoom.
    for(const p of candidates){
      if(this.blend>0.1&&townCount<188){for(const {x,z,rotation} of TOWNS[p.id]){
        this.dummy.position.set(nearestWorldX(x,this.focus.x),heightAt(x,z)*this.blend+0.3,z);this.dummy.rotation.set(0,rotation,0);this.dummy.scale.setScalar(1);this.dummy.updateMatrix();this.towns.setMatrixAt(townCount++,this.dummy.matrix);}}
    }
    if(!near){for(const [zh,en,lon,lat] of [['北太平洋','NORTH PACIFIC',-145,22],['南太平洋','SOUTH PACIFIC',-122,-34],['大西洋','ATLANTIC',-37,20],['印度洋','INDIAN OCEAN',77,-27],['北冰洋','ARCTIC OCEAN',5,72]] as const){const p=project(lon,lat);paint(this.lang==='zh'?zh:en,p.x,p.z,true);}}
    for(let i=n;i<this.labels.length;i++)this.labels[i].sprite.visible=false;this.towns.count=townCount;this.towns.instanceMatrix.needsUpdate=true;
  }
  private drawMapNames() {
    const width=this.host.clientWidth,height=this.host.clientHeight,scale=height/(2*this.distance*Math.tan(20*Math.PI/180));
    let countryCount=0,provinceCount=0;const activeOwners=new Set<number>(),point=new THREE.Vector3();
    const draw=(pool:Map<number,HTMLSpanElement>,layer:HTMLDivElement,id:number,name:string,anchor:Vec2,region:number|null,font:number,country:boolean,spacing=.035)=>{
      const baseX=nearestWorldX(anchor.x,this.focus.x);
      const family=country?COUNTRY_LABEL_FONT:'Georgia,"Noto Serif CJK SC","Songti SC",serif',fontKey=`${country?500:600} ${font}px ${family}`,key=`${fontKey}:${spacing}:${name}`;
      let textWidth=this.labelWidths.get(key);
      if(textWidth===undefined){
        this.labelMeasure.font=fontKey;const metrics=this.labelMeasure.measureText(name);
        textWidth=Math.ceil(Math.max(metrics.width,metrics.actualBoundingBoxLeft+metrics.actualBoundingBoxRight)+Array.from(name).length*font*spacing+4);
        if(this.labelWidths.size>=16384)this.labelWidths.clear();this.labelWidths.set(key,textWidth);
      }
      const textHeight=font*1.2;let visible=0;
      // Adjacent globe copies keep a partially visible title at each date-line
      // edge instead of teleporting one node from one side to the other.
      for(const offset of [-1,0,1]){
        const p=point.set(baseX+offset*WORLD_WIDTH,heightAt(anchor.x,anchor.z)*this.blend+.8,anchor.z).project(this.camera);
        const x=(p.x+1)*width/2,y=(1-p.y)*height/2;
        const rect={left:x-textWidth/2-2,right:x+textWidth/2+2,top:y-textHeight/2-2,bottom:y+textHeight/2+2},poolId=id*3+offset+1;
        let label=pool.get(poolId);
        // Cull only complete text bounds outside the viewport. Neither the HUD
        // nor nearby province names move the country away from its centroid.
        if(p.z<-1||p.z>1||!labelIntersectsViewport(rect,width,height)){if(label)label.hidden=true;continue;}
        if(!label){label=document.createElement('span');label.className=country?'country-label':'province-label';pool.set(poolId,label);layer.append(label);}
        if(label.textContent!==name)label.textContent=name;if(label.hidden)label.hidden=false;
        const transform=`translate(${x}px,${y}px) translate(-50%,-50%)`;
        if(label.style.transform!==transform)label.style.transform=transform;
        if(label.style.width!==`${textWidth}px`)label.style.width=`${textWidth}px`;
        if(label.style.height!==`${textHeight}px`)label.style.height=`${textHeight}px`;
        if(label.style.fontSize!==`${font}px`)label.style.fontSize=`${font}px`;
        if(label.style.fontFamily!==family)label.style.fontFamily=family;
        if(label.style.letterSpacing!==`${spacing}em`)label.style.letterSpacing=`${spacing}em`;
        if(region!==null)label.dataset.region=String(region);
        label.dataset.anchorX=String(anchor.x);label.dataset.anchorZ=String(anchor.z);
        if(country)label.dataset.anchorKind='territory-centroid';
        label.dataset.copy=String(Math.round((baseX-anchor.x)/WORLD_WIDTH)+offset);label.dataset.primary=String(offset===0);
        if(country&&label.dataset.owner!==String(id))label.dataset.owner=String(id);
        visible++;
      }
      return visible;
    };
    if(provinceNamesVisible(this.distance)){
      for(const province of MAP)if(province.visible)provinceCount+=draw(this.provinceLabels,this.provinceLayer,province.id,province.name[this.lang==='zh'?0:1],province.center,province.id,12,false);
    }else for(const label of this.provinceLabels.values())label.hidden=true;
    for(const component of this.countryComponents){
      const player=this.state?.players[component.owner];if(!player)continue;activeOwners.add(component.owner);
      const name=countryName(this.lang,player),{font,spacing}=countryTypography(name,component.area,scale);
      countryCount+=draw(this.countryLabels,this.countryLayer,component.owner,name,component.anchor,null,font,true,spacing);
    }
    for(const [poolId,label] of this.countryLabels)if(!activeOwners.has(Math.floor(poolId/3))){label.remove();this.countryLabels.delete(poolId);}
    this.renderer.domElement.dataset.countryLabelRevision=String(++this.countryLabelRevision);
    this.renderer.domElement.dataset.countryLabels=String(countryCount);this.renderer.domElement.dataset.provinceLabels=String(provinceCount);
    this.renderer.domElement.dataset.countryLabelOwners=[...new Set([...this.countryLabels.values()].filter(label=>!label.hidden).map(label=>label.dataset.owner))].join(',');
  }
  private frame=(time:number)=>{
    this.animation=requestAnimationFrame(this.frame);
    if(document.hidden)return;
    const moving=Math.abs(this.distance-this.desiredDistance)>0.01;
    // Menus/dialogs already block map interaction. Keep their backdrop still
    // instead of competing with loading, controls or another LAN client. State
    // updates and the network simulation continue; reopening the map redraws the
    // newest state. Finish camera easing and allow resize/artwork refresh frames.
    if(!this.mapInput.active&&!moving&&!this.backgroundFrame){this.renderer.domElement.dataset.renderPaused='true';return;}
    const motion=this.unitMotion.activity(time,moving?undefined:this.visibleUnitIds);
    // Continue between snapshots and draw the exact endpoint before sleeping.
    // Camera motion and perceptible army motion may use 60fps in either mode.
    if(!moving&&!motion.active&&!this.unitsWereMoving&&!this.invalidated&&!this.dirty.size)return;
    const interval=moving?1000/60:motion.active?unitMotionFrameInterval(motion.speed,this.distance,this.host.clientHeight):1000/30;
    if(time-this.lastRender<interval-0.5)return;
    this.unitsWereMoving=motion.active;
    this.lastRender=time;this.invalidated=false;for(const copy of this.repeats)copy.visible=!this.globalView;
    const elapsed=Math.max(0,(time-this.last)/1000||0.016);this.last=time;
    this.distance=advanceCameraDistance(this.distance,this.desiredDistance,elapsed,this.lastCameraTarget!==this.desiredDistance);this.lastCameraTarget=this.desiredDistance;
    this.blend=1-THREE.MathUtils.smoothstep(this.distance,90,320);this.blendUniform.value=this.blend;
    // Scale the near plane with zoom: a 0.05 near plane loses sea/land depth precision at global distances.
    this.camera.far=Math.max(20000,this.distance*4);this.camera.near=Math.max(0.05,this.distance*0.01);this.camera.updateProjectionMatrix();
    const angle=this.blend*0.6;this.focus.z=clampViewZ(this.desiredFocusZ,this.distance,angle);this.camera.position.set(this.focus.x,this.distance*Math.cos(angle),this.focus.z+this.distance*Math.sin(angle));this.camera.lookAt(this.focus);this.camera.updateMatrixWorld();
    const presentation=unitRenderMode(this.blend),mode=presentation==='3d'?'near':'far';if(mode!==this.lastMode){this.onMode(mode==='near');this.lastMode=mode;}
    (this.admin.material as THREE.LineBasicMaterial).opacity=internalBorderOpacity(this.distance);
    this.renderer.domElement.dataset.internalBorderOpacity=String(internalBorderOpacity(this.distance));
    if(this.dirty.size){this.colors.clearUpdateRanges();for(const id of this.dirty){const r=this.ranges[id],owner=this.ownerIds[id],color=owner<0?regionColor():new THREE.Color(factionColor(owner));for(let v=r.start;v<r.start+r.count;v++)this.colors.setXYZ(v,color.r,color.g,color.b);if(r.count)this.colors.addUpdateRange(r.start*3,r.count*3);}this.colors.needsUpdate=true;this.dirty.clear();}
    const selectedRange=this.ranges[this.selected];
    if(selectedRange?.count){const i=selectedRange.start,actual=new THREE.Color().setRGB(this.colors.getX(i),this.colors.getY(i),this.colors.getZ(i));this.renderer.domElement.dataset.selectedFillColor=actual.getHexString();this.renderer.domElement.dataset.selectedOwnerColor=(this.ownerIds[this.selected]<0?regionColor():new THREE.Color(factionColor(this.ownerIds[this.selected]))).getHexString();}
    this.ensureUnitCapacity(this.state?.units.length??0);
    const sprites=presentation==='2d',pixels=unitSpritePixels(this.distance);
    const glyphs=this.unitSprites.geometry.getAttribute('unitGlyph') as THREE.InstancedBufferAttribute;
    this.unitSprites.visible=sprites;this.bodies.visible=this.heads.visible=!sprites;
    let n=0;this.visibleUnitIds.clear();
    for(const u of this.state?.units??[]) {
      const pos=this.unitMotion.position(u,time);
      if(!inRect(pos,BOUNDS))continue;
      // Both representations share the same canonical position, wrap and viewport
      // test. A mode switch never spawns, deletes or duplicates simulation units.
      const x=nearestWorldX(pos.x,this.focus.x),z=pos.z,y=heightAt(pos.x,z)*this.blend;
      const screen=this.unitPoint.set(x,y+0.55,z).project(this.camera);
      const marginX=16/Math.max(1,this.host.clientWidth),marginY=16/Math.max(1,this.host.clientHeight);
      if(screen.z<-1||screen.z>1||Math.abs(screen.x)>1+marginX||Math.abs(screen.y)>1+marginY)continue;
      this.visibleUnitIds.add(u.id);
      this.unitColor.set(u.owner<0?0x595f50:factionColor(u.owner));
      if(sprites){
        const depth=-this.unitPoint.set(x,y+0.55,z).applyMatrix4(this.camera.matrixWorldInverse).z;
        this.dummy.position.set(x,y+0.55,z);this.dummy.quaternion.copy(this.camera.quaternion);
        this.dummy.scale.setScalar(unitSpriteWorldSize(depth,this.host.clientHeight,pixels));this.dummy.updateMatrix();
        this.unitSprites.setMatrixAt(n,this.dummy.matrix);this.unitSprites.setColorAt(n,this.unitColor);glyphs.setX(n,unitGlyph(u.kind,!!u.transport?.embarked));
      }else{
        // One simulation unit remains one 3D model, matching the garrison count.
        const scale=u.transport?.embarked?1:UNIT_RADIUS[u.kind]/UNIT_RADIUS.infantry;
        this.dummy.position.set(x,y+0.36,z);this.dummy.rotation.set(0,u.id,0);if(u.transport?.embarked)this.dummy.scale.set(2.3,0.5,1.2);else this.dummy.scale.set(scale,1,scale);this.dummy.updateMatrix();this.bodies.setMatrixAt(n,this.dummy.matrix);this.bodies.setColorAt(n,this.unitColor);
        this.dummy.position.y=y+0.68;if(u.transport?.embarked)this.dummy.scale.set(1.2,0.6,1);this.dummy.updateMatrix();this.heads.setMatrixAt(n,this.dummy.matrix);
      }
      n++;
    }
    this.unitSprites.count=sprites?n:0;this.bodies.count=this.heads.count=sprites?0:n;
    if(sprites){this.unitSprites.instanceMatrix.needsUpdate=true;glyphs.needsUpdate=true;if(this.unitSprites.instanceColor)this.unitSprites.instanceColor.needsUpdate=true;}
    else{this.bodies.instanceMatrix.needsUpdate=this.heads.instanceMatrix.needsUpdate=true;if(this.bodies.instanceColor)this.bodies.instanceColor.needsUpdate=true;}
    this.drawLabels(time);
    // DOM titles need the same camera projection on every rendered frame, not
    // the slower text-texture cadence, otherwise they lag and jump during pans.
    this.drawMapNames();this.renderer.render(this.scene,this.camera);this.renderedUnits=this.state?.units??[];this.backgroundFrame=false;
    this.renderer.domElement.dataset.renderRevision=String(++this.renderRevision);this.renderer.domElement.dataset.renderPaused=String(!this.mapInput.active&&!moving);
    this.renderer.domElement.dataset.viewportWidth=String(this.host.clientWidth);this.renderer.domElement.dataset.viewportHeight=String(this.host.clientHeight);
    const span=cameraGroundSpan(this.distance,angle);this.renderer.domElement.dataset.framing='cover';this.renderer.domElement.dataset.distance=String(this.distance);this.renderer.domElement.dataset.groundTop=String(this.focus.z-span.north);this.renderer.domElement.dataset.groundBottom=String(this.focus.z+span.south);
    this.renderer.domElement.dataset.crop=CROP_ID;this.renderer.domElement.dataset.visibleProvinces=String(VISIBLE_COUNT);this.renderer.domElement.dataset.focusX=String(this.focus.x);this.renderer.domElement.dataset.focusZ=String(this.focus.z);this.renderer.domElement.dataset.wrapX='true';
    this.renderer.domElement.dataset.unitRenderMode=presentation;this.renderer.domElement.dataset.renderedSprites=String(this.unitSprites.count);this.renderer.domElement.dataset.renderedModels=String(this.bodies.count);this.renderer.domElement.dataset.unitSpritePixels=String(pixels);
    this.renderer.domElement.dataset.unitCapacity=String(this.unitInstanceCapacity);this.renderer.domElement.dataset.totalUnits=String(this.state?.units.length??0);this.renderer.domElement.dataset.renderedInstances=String(n);
    this.renderer.domElement.dataset.countryBorders='true';this.renderer.domElement.dataset.ready='true';this.renderer.domElement.dataset.projection=PROJECTION_ID;this.renderer.domElement.dataset.provinces=String(MAP.length);this.renderer.domElement.dataset.view=mode;this.renderer.domElement.dataset.settled=String(Math.abs(this.distance-this.desiredDistance)<0.1);
  };
  dispose(){this.unitSpriteTexture.dispose();this.mapSurface.dispose();this.selectionGlowWorker?.terminate();this.selectionGlowWorker=null;cancelAnimationFrame(this.animation);this.observer.disconnect();const c=this.renderer.domElement;c.removeEventListener('keydown',this.keyDown);c.removeEventListener('pointerdown',this.pointerDown);c.removeEventListener('pointermove',this.pointerMove);c.removeEventListener('pointerup',this.pointerUp);c.removeEventListener('pointercancel',this.pointerCancel);c.removeEventListener('lostpointercapture',this.pointerCancel);c.removeEventListener('wheel',this.wheel);c.removeEventListener('contextmenu',this.contextMenu);
    const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();this.scene.traverse(o=>{if(o instanceof THREE.InstancedMesh)o.dispose();const m=o as THREE.Mesh;if(m.geometry)geometries.add(m.geometry);if(m.material)for(const material of Array.isArray(m.material)?m.material:[m.material])materials.add(material);});for(const g of geometries)g.dispose();for(const m of materials)m.dispose();for(const l of this.labels)l.texture.dispose();if(this.labelTimer!==null)clearTimeout(this.labelTimer);this.countryLayer.remove();this.provinceLayer.remove();this.renderer.dispose();c.remove();}
}
