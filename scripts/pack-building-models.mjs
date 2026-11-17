// Repack the four authored Rouge v3 GLBs as one static bundle with one shared
// atlas. No mesh reduction, material replacement or UV transformation.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';

const [directory,output='src/render/assets/modern-buildings.glb']=process.argv.slice(2);
assert.ok(directory,'usage: node scripts/pack-building-models.mjs <directory-with-v3-glbs> [output]');
const kinds={house:'town_house',market:'market',barracks:'barracks',fortress:'fortress'};
const bundle={asset:{version:'2.0',generator:'Rouge exact architecture bundle'},scene:0,scenes:[{nodes:[]}],nodes:[],meshes:[],accessors:[],bufferViews:[],buffers:[{byteLength:0}],materials:[],images:[],textures:[],samplers:[]};
const buffers=[];
let byteLength=0,sharedAtlas;
function view(source,bytes){
 const padding=(-byteLength)&3;
 if(padding){buffers.push(Buffer.alloc(padding));byteLength+=padding;}
 const index=bundle.bufferViews.length;
 bundle.bufferViews.push({...source,buffer:0,byteOffset:byteLength});
 buffers.push(bytes);byteLength+=bytes.length;return index;
}
for(const [kind,file] of Object.entries(kinds)){
 const input=readFileSync(join(directory,file+'.glb')),n=input.readUInt32LE(12);
 assert.equal(input.toString('ascii',0,4),'glTF');assert.equal(input.readUInt32LE(4),2);
 assert.equal(input.readUInt32LE(8),input.length);assert.equal(input.toString('ascii',16,20),'JSON');
 assert.equal(input.toString('ascii',24+n,28+n),'BIN\0');
 const g=JSON.parse(input.toString('utf8',20,20+n)),bytes=input.subarray(28+n);
 assert.equal(g.meshes.length,1);assert.equal(g.nodes.length,1);
 assert.equal(g.nodes[0].mesh,0);assert.ok(!['translation','rotation','scale','matrix'].some(key=>key in g.nodes[0]));
 assert.equal(g.materials.length,1);assert.equal(g.images.length,1);assert.equal(g.textures.length,1);
 const slice=v=>{assert.equal(v.buffer,0);const start=v.byteOffset??0;assert.ok(start>=0&&start+v.byteLength<=bytes.length);return bytes.subarray(start,start+v.byteLength);};
 const image=g.images[0],imageView=g.bufferViews[image.bufferView],atlas=slice(imageView);
 if(sharedAtlas){
  assert.ok(atlas.equals(sharedAtlas),'all models must use byte-identical atlas data');
  assert.deepEqual(g.materials,bundle.materials);assert.deepEqual(g.samplers??[],bundle.samplers);
  assert.deepEqual(g.textures,bundle.textures);assert.equal(image.mimeType,bundle.images[0].mimeType);
 }else{
  sharedAtlas=atlas;
  bundle.images=[{...image,bufferView:view(imageView,atlas)}];
  bundle.samplers=g.samplers??[];bundle.textures=g.textures;bundle.materials=g.materials;
 }
 const [primitive,...extra]=g.meshes[0].primitives;
 assert.equal(extra.length,0);assert.equal(primitive.material,0);assert.ok((primitive.mode??4)===4);
 assert.ok(primitive.attributes.POSITION!==undefined&&primitive.attributes.NORMAL!==undefined&&primitive.attributes.TEXCOORD_0!==undefined);
 const views=new Map(),accessors=new Map();
 const importAccessor=index=>{
  if(accessors.has(index))return accessors.get(index);
  const a=g.accessors[index],i=a.bufferView,v=g.bufferViews[i];assert.ok(!a.sparse&&v);
  if(!views.has(i))views.set(i,view(v,slice(v)));
  const next=bundle.accessors.length;bundle.accessors.push({...a,bufferView:views.get(i)});accessors.set(index,next);return next;
 };
 bundle.scenes[0].nodes.push(bundle.nodes.length);bundle.nodes.push({name:kind,mesh:bundle.meshes.length});
 bundle.meshes.push({name:kind,primitives:[{...primitive,indices:importAccessor(primitive.indices),
  attributes:Object.fromEntries(Object.entries(primitive.attributes).map(([attr,id])=>[attr,importAccessor(id)]))}]});
}
const bufferPadding=(-byteLength)&3;
if(bufferPadding){buffers.push(Buffer.alloc(bufferPadding));byteLength+=bufferPadding;}
bundle.buffers[0].byteLength=byteLength;
const json=Buffer.from(JSON.stringify(bundle),'utf8');
const jsonPadding=(-json.length)&3;
const header=Buffer.alloc(20);header.write('glTF');header.writeUInt32LE(2,4);
header.writeUInt32LE(28+json.length+jsonPadding+byteLength,8);header.writeUInt32LE(json.length+jsonPadding,12);header.write('JSON',16);
const bin=Buffer.alloc(8);bin.writeUInt32LE(byteLength);bin.write('BIN\0',4);
writeFileSync(output,Buffer.concat([header,json,Buffer.alloc(jsonPadding,32),bin,...buffers]));
console.log(output,28+json.length+jsonPadding+byteLength,'bytes, four meshes / one atlas');
