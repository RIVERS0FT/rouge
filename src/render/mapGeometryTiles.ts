import * as THREE from 'three';
import {LineSegments2} from 'three/examples/jsm/lines/LineSegments2.js';
import {LineSegmentsGeometry} from 'three/examples/jsm/lines/LineSegmentsGeometry.js';

/** Keep complete primitives in conservative bounds. Land attributes stay shared
 * so ownership/capture edits remain exact. Native line tiles own compact pairs:
 * the global Uint32 indexed-line path can emit cross-map streaks in a live
 * browser even when the uploaded endpoints and indices are correct. */
export function mapGeometryTiles(source:THREE.Mesh|THREE.LineSegments,primitiveSize:2|3,side=128):THREE.Group{
 const geometry=source.geometry,position=geometry.getAttribute('position'),tiles=new Map<string,{indices:number[];bounds:THREE.Box3}>(),point=new THREE.Vector3();
 for(let i=0;i<position.count;i+=primitiveSize){
  let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;
  for(let k=0;k<primitiveSize;k++){const x=position.getX(i+k),z=position.getZ(i+k);left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,z);bottom=Math.max(bottom,z);}
  const key=`${Math.floor((left+right)/(2*side))}:${Math.floor((top+bottom)/(2*side))}`;
  let tile=tiles.get(key);if(!tile){tile={indices:[],bounds:new THREE.Box3()};tiles.set(key,tile);}
  for(let k=0;k<primitiveSize;k++){const id=i+k;tile.indices.push(id);tile.bounds.expandByPoint(point.set(position.getX(id),position.getY(id),position.getZ(id)));}
 }
 const group=new THREE.Group();group.name=source.name||'land-tiles';
 for(const {indices,bounds} of tiles.values()){
  let part=new THREE.BufferGeometry();for(const [name,attribute] of Object.entries(geometry.attributes))part.setAttribute(name,attribute);
  part.setIndex(new THREE.BufferAttribute(new Uint32Array(indices),1));
  if(primitiveSize===2)part=part.toNonIndexed();
  bounds.expandByScalar(1);part.boundingBox=bounds;part.boundingSphere=bounds.getBoundingSphere(new THREE.Sphere());
  const object=source.clone(false) as THREE.Mesh|THREE.LineSegments;object.geometry=part;object.frustumCulled=true;object.name=primitiveSize===3?'land-tile':'coastline-tile';group.add(object);
 }
 return group;
}

export function wideBorderTiles(source:LineSegments2,side=128):THREE.Group{
 const start=source.geometry.getAttribute('instanceStart'),end=source.geometry.getAttribute('instanceEnd'),tiles=new Map<string,number[]>();
 for(let i=0;i<start.count;i++){
  const key=`${Math.floor((start.getX(i)+end.getX(i))/(side*2))}:${Math.floor((start.getZ(i)+end.getZ(i))/(side*2))}`,points=tiles.get(key)??[];
  points.push(start.getX(i),start.getY(i),start.getZ(i),end.getX(i),end.getY(i),end.getZ(i));tiles.set(key,points);
 }
 const group=new THREE.Group();
 for(const points of tiles.values()){
  const geometry=new LineSegmentsGeometry().setPositions(points);geometry.boundingBox!.expandByScalar(16);geometry.boundingSphere=geometry.boundingBox!.getBoundingSphere(new THREE.Sphere());
  const lines=new LineSegments2(geometry,source.material);lines.name='country-border-tile';group.add(lines);
 }
 return group;
}
