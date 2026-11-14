import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MAP} from '../src/game/map.ts';
import {nationDetails} from '../src/ui/hud/hudModel.ts';

test('nation details separate troop states, count each playable facility once, and expose only own funds',()=>{
 const [a,b,c]=MAP.filter(p=>p.playable).slice(0,3), nonPlayable=MAP.find(p=>!p.playable);
 const province=(region,owner,kind,level)=>({id:region.id,owner,construction:{kind,level}});
 const units=[
  {owner:0,province:a.id,target:null},
  {owner:0,province:a.id,target:b.id},
  {owner:0,province:a.id,target:b.id,transport:{embarked:true}},
  {owner:1,province:c.id,target:null},
 ];
 const state={provinces:[province(a,0,'market',2),province(b,0,'barracks',1),province(c,1,'fortress',1),
  province(nonPlayable,0,'fortress',1)],players:[{funds:70.8},{funds:39}],units};
 const expected={army:{total:3,garrison:1,marching:1,embarked:1},buildings:{market:1,barracks:1,fortress:0},funds:70};
 assert.deepEqual(nationDetails(state,0,0),expected);
 // A temporary group covering both base provinces is not an additional building.
 assert.deepEqual(nationDetails({...state,grouping:{synthetic:[a.id,b.id]}},0,0),expected);
 assert.deepEqual(nationDetails(state,1,0),{army:{total:1,garrison:1,marching:0,embarked:0},
  buildings:{market:0,barracks:0,fortress:1},funds:null});
 assert.equal(nationDetails(state,1,1).funds,39);
});
