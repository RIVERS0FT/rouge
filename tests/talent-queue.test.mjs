import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,Engine} from '../src/game/engine.ts';
import {talentSelectionStatus} from '../src/ui/talentSelection.ts';
test('one experience gain can queue multiple upgrades and each choice advances exactly one draft',()=>{
 const e=new Engine(createGame([{name:'A',leader:'warden',loadout:['infantry']},{name:'B',leader:'steward',loadout:['infantry']}],42));
 const a=e.state.units.find(u=>u.owner===0),b=e.state.units.find(u=>u.owner===1);
 Object.assign(b,{x:a.x+0.1,z:a.z,province:a.province,origin:a.province,hp:0.01,cooldown:100});
 e.state.units=[a,b];e.state.players[0].xp=400;e.step();
 const p=e.state.players[0];assert.equal(p.level,3);assert.equal(p.drafts,2);assert.equal(p.choices.length,3);
 const first=p.choices[0];assert.equal(e.command(0,{type:'talent',id:first}).ok,true);assert.equal(p.drafts,1);assert.equal(p.choices.length,3);assert.ok(p.talents.includes(first));
 assert.equal(e.command(0,{type:'talent',id:first}).ok,false);assert.equal(p.drafts,1);
 const second=p.choices[0];assert.equal(e.command(0,{type:'talent',id:second}).ok,true);assert.equal(p.drafts,0);assert.equal(p.choices.length,0);assert.equal(p.talents.length,2);
});

test('UI waits for authoritative LAN state and closes only after the last confirmed selection',()=>{
 assert.equal(talentSelectionStatus(undefined,'industry'),'waiting');
 assert.equal(talentSelectionStatus({talents:[],drafts:2,choices:['industry']},'industry'),'waiting');
 assert.equal(talentSelectionStatus({talents:['industry'],drafts:1,choices:['forcedMarch']},'industry'),'next');
 assert.equal(talentSelectionStatus({talents:['industry'],drafts:1,choices:[]},'industry'),'next');
 assert.equal(talentSelectionStatus({talents:['industry','forcedMarch'],drafts:0,choices:[]},'forcedMarch'),'done');
 assert.equal(talentSelectionStatus({talents:['industry'],drafts:0,choices:[]},null),'waiting');
});
