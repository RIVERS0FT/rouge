import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {MAP,provinceByCode,navigableInProvince,provinceAt} from '../src/game/map.ts';
import {waterSegment,coastSegment} from '../src/game/sea-geometry.ts';
import {seaRoute,seaPorts,hasSeaPort,seaCellCenter,validateSeaLeg,onSeaSegment,SEA_GRAPH} from '../src/game/sea.ts';
const data=JSON.parse(fs.readFileSync(new URL('../data/sea-navigation.json',import.meta.url),'utf8'));
const home=provinceByCode('STATE_HOME_COUNTIES'),normandy=provinceByCode('STATE_NORMANDY');
test('sea graph covers ocean and all declared ports have certified land/coast/water access',()=>{
 assert.equal(SEA_GRAPH.atlas,'854f3b999cce9a0a7f85968cfe0ec95d4c4cb52a8e9c9bb5c5ef8c17b86b8449');
 assert.ok(data.ports.length>500);
 for(const p of data.ports){
  assert.ok(navigableInProvince(p.region,p.land.x,p.land.z));
  assert.equal(provinceAt(p.sea.x,p.sea.z),-1);
  assert.ok(coastSegment(p.land,p.sea,p.shore),`invalid coast crossing in ${MAP[p.region].code}`);
  assert.ok(waterSegment(p.sea,seaCellCenter(p.node)),`invalid port access in ${MAP[p.region].code}`);
 }
});
test('all stored ocean edges avoid every land polygon including small offshore islands',()=>{
 const edges=Buffer.from(data.edges,'base64');let count=0;
 for(let i=0;i<edges.length;i++)for(const [mask,delta,reverse]of [[1,1,4],[2,data.width,8]])if(edges[i]&mask){
  assert.ok(edges[i+delta]&reverse);assert.ok(waterSegment(seaCellCenter(i),seaCellCenter(i+delta)),`cross-land edge ${i}`);count++;
 }
 assert.ok(count>50000);
});
test('cross-channel route contains explicit land, shore, sea stages and is deterministic',()=>{
 const path=seaRoute(home,normandy);assert.ok(path);assert.deepEqual(path.depart,path.waypoints[0]);assert.deepEqual(path.arrive,path.waypoints.at(-1));
 assert.ok(validateSeaLeg(path));assert.deepEqual(path,seaRoute(home,normandy));
 for(let i=3;i<path.waypoints.length-2;i++)assert.ok(waterSegment(path.waypoints[i-1],path.waypoints[i]));
 assert.ok(seaRoute(normandy,home));
 path.waypoints[3].x+=1;assert.equal(validateSeaLeg(path),false);
 assert.ok(validateSeaLeg(seaRoute(home,normandy)),'caller mutation must not corrupt cached canonical paths');
});
test('inland provinces, invalid IDs and same-region orders cannot conjure sea routes',()=>{
 const inland=provinceByCode('STATE_BRANDENBURG');assert.equal(hasSeaPort(inland),false);assert.deepEqual(seaPorts(inland),[]);
 for(const [a,b]of [[inland,home],[home,inland],[-1,home],[home,99999],[home,home]])assert.equal(seaRoute(a,b),null);
 assert.equal(validateSeaLeg(null),false);assert.equal(validateSeaLeg({from:home,to:normandy,waypoints:[]}),false);
});
test('saved transport positions must lie on their actual current certified segment',()=>{
 const path=seaRoute(home,normandy),a=path.waypoints[2],b=path.waypoints[3],mid={x:(a.x+b.x)/2,z:(a.z+b.z)/2};
 assert.ok(onSeaSegment(mid,a,b));assert.equal(onSeaSegment({...mid,x:mid.x+5},a,b),false);
 assert.equal(onSeaSegment({x:NaN,z:0},a,b),false);
});
