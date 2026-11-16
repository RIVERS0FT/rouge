import assert from 'node:assert/strict';
import test from 'node:test';
import {battleContacts} from '../src/render/battleContacts.ts';

const unit=(id,owner,x,z=0,extra={})=>({id,owner,x,z,hp:100,kind:'infantry',cooldown:0,...extra});
const battles=units=>battleContacts({units,players:[]});
const sides=b=>[b.first,b.second,b.firstCount,b.secondCount];

test('only live local participants are counted, and cooldown is still part of contact',()=>{
 const units=[unit(1,0,0,0,{cooldown:.6}),unit(2,0,.8),unit(3,1,2),unit(4,1,2,.8),unit(5,1,300),
  unit(6,1,1,0,{hp:0}),unit(7,1,.2,0,{transport:{embarked:true}})];
 const [badge]=battles(units);
 assert.deepEqual(sides(badge),[0,1,2,2]);assert.equal(badge.x,1.2);assert.equal(badge.z,.2);
 assert.deepEqual(battles(units.filter(u=>u.owner===0||[5,6,7].includes(u.id))),[]);
});

test('march orders do not create contacts; unrelated encounters get their own anchor',()=>{
 assert.deepEqual(battles([unit(1,0,0,0,{assault:2,target:2}),unit(2,1,50)]),[]);
 const nearby=battles([unit(1,0,0),unit(2,1,1),unit(3,0,40),unit(4,1,41)]);
 assert.deepEqual(nearby.map(b=>[b.x,...sides(b)]),[[.5,0,1,1,1],[40.5,0,1,1,1]]);
});

test('pairs use nearest hostiles and stable unit-ID ties, without adding third parties',()=>{
 const grouped=battles([unit(8,2,2.1,0,{kind:'cavalry'}),unit(9,1,-2),unit(10,0,0)]);
 assert.deepEqual(grouped.map(sides),[[0,1,1,1]]);
 const equallyClose=battles([unit(8,2,2,0,{kind:'cavalry'}),unit(7,1,-2),unit(10,0,0)]);
 assert.deepEqual(equallyClose.map(sides),[[0,1,1,1]]);
 const armed=battles([unit(8,2,2,0,{kind:'cavalry'}),unit(9,1,-2,0,{kind:'cavalry'}),unit(10,0,0)]);
 assert.deepEqual(armed.map(sides),[[0,2,1,1]]);
});

test('actual ranged contact crosses spatial cells but not arbitrary world boundaries',()=>{
 assert.deepEqual(battles([unit(1,0,7.9,0,{kind:'artillery'}),unit(2,1,14.5)]).map(sides),[[0,1,1,1]]);
 assert.deepEqual(battles([unit(1,0,-1799),unit(2,1,1799)]),[]);
});

test('neutral guards count without inventing a nation and casualties update the readout',()=>{
 const attacker=[unit(1,0,1),unit(2,0,1.5)],guards=[unit(3,-1,2),unit(4,-1,2.5)];
 assert.deepEqual(battles([...attacker,...guards]).map(sides),[[-1,0,2,2]]);
 assert.deepEqual(battles([...attacker,guards[0]]).map(sides),[[-1,0,1,2]]);
});

test('close duels between the same two countries contribute to one badge, but distant fronts stay separate',()=>{
 const units=[unit(1,0,0),unit(2,1,1),unit(3,0,0,2),unit(4,1,1,2),unit(5,0,25),unit(6,1,26)];
 const badges=battles(units);
 assert.deepEqual(badges.map(sides),[[0,1,2,2],[0,1,1,1]]);
 assert.deepEqual(badges.map(b=>[b.x,b.z]),[[.5,1],[25.5,0]]);
});
