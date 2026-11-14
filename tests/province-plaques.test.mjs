import test from 'node:test';
import assert from 'node:assert/strict';
import {plaqueGarrisons,plaqueTerritories} from '../src/render/provincePlaques.ts';
import {regionGarrison} from '../src/game/capacity.ts';

const region=(id,{visible=true,playable=true}={})=>({id,code:'P'+id,visible,playable,center:{x:id*10,z:0},name:['地块 '+id,'Region '+id]});
const regions=[region(0),region(1),region(2),region(3,{playable:false}),region(4,{visible:false})];

test('playable regions share one stable interior plaque when merged, and have separate plaques after splitting',()=>{
 const merged=plaqueTerritories(regions,{atomToGroup:{P0:'a',P1:'a',P2:'b',P4:'a'}},[3,5,10,0,99]);
 assert.deepEqual(merged.map(({id,members,anchor,name})=>[id,members,anchor,name[0]]),[
  [1,[0,1],regions[1].center,'地块 1'],[2,[2],regions[2].center,'地块 2'],
 ]);
 assert.deepEqual(plaqueTerritories(regions,{atomToGroup:{P0:'a',P1:'b',P2:'c'}},[3,5,10]).map(p=>p.id),[0,1,2]);
 assert.equal(plaqueTerritories([regions[1],regions[0]],{atomToGroup:{P0:'a',P1:'a'}},[5,5])[0].id,0);
});

test('single-pass counts match detail panel for neutral, AI and human owners including empty provinces',()=>{
 const provinces=[{id:0,owner:0},{id:1,owner:0},{id:2,owner:-1},{id:3,owner:1},{id:4,owner:0}];
 const unit=(owner,province,extra={})=>({owner,province,target:null,...extra});
 const state={provinces,units:[unit(0,0),unit(0,1),unit(0,0,{target:1}),unit(0,0,{travel:{}}),unit(0,1,{transport:{embarked:true}}),unit(1,0),unit(-1,2),unit(-1,2),unit(1,3),unit(-1,3)]};
 const counts=[...plaqueGarrisons(state)];
 assert.deepEqual(counts,[1,1,2,1,0]);
 assert.deepEqual(counts,provinces.map(p=>regionGarrison(state,p.owner,p.id)));
 const [{members}]=plaqueTerritories(regions,{atomToGroup:{P0:'a',P1:'a'}},[3,5,10]);
 assert.equal(members.reduce((sum,member)=>sum+counts[member],0),2);
});
