import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildBorderEdges,classifyBorder,borderPositions,internalBorderOpacity,COUNTRY_BORDER_WIDTH,SELECTION_BORDER_WIDTH} from '../src/render/territoryBorders.ts';
import {MAP,BOUNDS,INITIAL_TERRITORY_GROUPING} from '../src/game/map.ts';
const edge={a:{x:0,z:0},b:{x:0,z:1},atoms:[0,1]};
test('country borders follow human and AI ownership, not palette or real country',()=>{
 for(const owner of [0,1,15,292]){
  assert.equal(classifyBorder(edge,[owner,owner],['a','b']),'internal');
  assert.equal(classifyBorder(edge,[owner,owner],['merged','merged']),'hidden');
  assert.equal(classifyBorder(edge,[owner,owner+1],['a','b']),'country');
  assert.equal(classifyBorder(edge,[owner,-1],['a','b']),'country');
 }
});
test('each neutral territory is independent, without exposing its hidden atoms',()=>{
 assert.equal(classifyBorder(edge,[-1,-1],['a','b']),'country');
 assert.equal(classifyBorder(edge,[-1,-1],['merged','merged']),'hidden');
 assert.equal(classifyBorder(edge,[-1,-1],[]),'country');
 assert.equal(classifyBorder({...edge,atoms:[0]},[-1],['a']),'coast');
});
test('capture changes country border even without a management revision',()=>{
 const groups=['a','b'],owners=[0,1];
 assert.equal(classifyBorder(edge,owners,groups),'country');owners[1]=0;
 assert.equal(classifyBorder(edge,owners,groups),'internal');owners[1]=-1;
 assert.equal(classifyBorder(edge,owners,groups),'country');
 assert.equal(classifyBorder({...edge,atoms:[0,1,2]},[0,0,1],['a','a','b']),'country');
});
const region=(id,ring,holes=[])=>({id,code:`a${id}`,visible:true,parts:[[ring,...holes]]});
const rect={left:-10,right:10,top:0,bottom:4};
test('shared reversed sides draw once and never as both coast and country',()=>{
 const regions=[region(0,[{x:0,z:0},{x:1,z:0},{x:1,z:1},{x:0,z:1}]),region(1,[{x:1,z:0},{x:2,z:0},{x:2,z:1},{x:1,z:1}])];
 const before=JSON.stringify(regions),edges=buildBorderEdges(regions,rect);
 assert.equal(edges.length,7);assert.equal(edges.filter(e=>e.atoms.length===2).length,1);
 const kinds=edges.map(e=>classifyBorder(e,[0,1],['a','b']));assert.equal(kinds.filter(k=>k==='country').length,1);assert.equal(kinds.filter(k=>k==='coast').length,6);
 assert.equal(JSON.stringify(regions),before);
});
test('holes, islands and cropping preserve original segments, without artificial bridges or wrap seams',()=>{
 const hole=[{x:1,z:1},{x:2,z:1},{x:2,z:2},{x:1,z:2}];
 const p=region(0,[{x:0,z:-1},{x:3,z:-1},{x:3,z:3},{x:0,z:3}],[hole]);
 p.parts.push([[{x:7,z:1},{x:8,z:1},{x:8,z:2},{x:7,z:2}]]);
 const edges=buildBorderEdges([p],rect);
 assert.equal(edges.length,11);assert.equal(edges.some(e=>e.a.z===0&&e.b.z===0),false);
 assert.equal(edges.filter(e=>e.a.x>=7&&e.b.x>=7).length,4);
 assert.equal(edges.filter(e=>e.a.x>=1&&e.b.x<=2&&e.a.z>=1&&e.a.z<=2).length,4);
 const seam=buildBorderEdges([region(0,[{x:-10,z:1},{x:-9,z:1},{x:-9,z:2},{x:-10,z:2}])],rect);
 assert.equal(seam.length,3);assert.ok(seam.every(e=>!(e.a.x===-10&&e.b.x===-10)));
 assert.equal(borderPositions(edges,.28).length,edges.length*6);
});
test('full atlas has unique, finite borders; neutral groups separate and acquired groups become internal',()=>{
 const edges=buildBorderEdges(MAP,BOUNDS),owners=MAP.map(()=>-1),groups=MAP.map(p=>INITIAL_TERRITORY_GROUPING.atomToGroup[p.code]);
 const shared=edges.filter(e=>e.atoms.length>1),country=shared.filter(e=>classifyBorder(e,owners,groups)==='country'),hidden=shared.filter(e=>classifyBorder(e,owners,groups)==='hidden');
 assert.ok(country.length>10000);assert.ok(hidden.length>10000);assert.equal(country.length+hidden.length,shared.length);
 const keys=edges.map(e=>[e.a,e.b].map(p=>`${p.x.toFixed(6)},${p.z.toFixed(6)}`).sort().join('|'));assert.equal(new Set(keys).size,edges.length);
 for(const e of edges){assert.ok(e.atoms.length<=2);for(const p of[e.a,e.b])assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.z)&&p.x>=BOUNDS.left&&p.x<=BOUNDS.right&&p.z>=BOUNDS.top&&p.z<=BOUNDS.bottom);}
 const sample=country[0];for(const id of sample.atoms)owners[id]=17;
 assert.equal(classifyBorder(sample,owners,groups),'internal');
});
test('internal line stays subdued at every zoom and selection remains strongest',()=>{
 for(const distance of [5,90,300,1000,4400])assert.ok(internalBorderOpacity(distance)<=.23);
 assert.ok(COUNTRY_BORDER_WIDTH>2);assert.ok(SELECTION_BORDER_WIDTH>COUNTRY_BORDER_WIDTH);
});

// Keep both acceptance entry points aligned with the intentional visual contract.
test('browser and live HTTPS acceptance assert ownership borders, not the retired no-country mode',()=>{
 for(const path of ['tests/browser/state-regions.spec.ts','.github/scripts/verify-pages.mjs']){
  const source=readFileSync(new URL('../'+path,import.meta.url),'utf8');
  assert.match(source,/data-boundary-mode','ownership-and-management'/);
  assert.match(source,/data-country-borders','true'/);
  assert.match(source,/data-neutral-borders','independent-territories'/);
  assert.doesNotMatch(source,/admin1-management-groups|data-country-borders','false'|no country borders/);
 }
});
