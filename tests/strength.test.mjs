import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,Engine} from '../src/game/engine.ts';
import {MAP,provinceByCode} from '../src/game/map.ts';
import {AHEAD_RATIO,BEHIND_RATIO,STRENGTH_PER_INFANTRY,battleStrengths,countryStrengths,powerRatio,verdict} from '../src/game/strength.ts';

const close=(value,want,epsilon=1e-9)=>assert.ok(Math.abs(value-want)<epsilon,`${value} != ${want}`);
const setups=(kind='infantry',other='infantry')=>[{name:'A',leader:'warden',loadout:[kind]},{name:'B',leader:'warden',loadout:[other]}];
const unit=(id,owner,province,at,kind='infantry',hp=100)=>({id,owner,kind,x:at.x,z:at.z,hp,province,origin:province,target:null,destination:null,route:[],cooldown:0});

test('country strength: a fresh infantry battalion is the unit, and N of them are worth N times one',()=>{
 const s=createGame(setups(),11),region=s.provinces.find(p=>p.owner===0).id,at=MAP[region].center;
 s.units=[unit(1,0,region,at)];
 close(countryStrengths(s)[0].power,STRENGTH_PER_INFANTRY);
 s.units=Array.from({length:7},(_,i)=>unit(i+1,0,region,at));
 close(countryStrengths(s)[0].power,7*STRENGTH_PER_INFANTRY);
 assert.equal(countryStrengths(s)[1].units,0);close(countryStrengths(s)[1].power,0);
 // Neutral garrisons belong to no country.
 s.units.push(unit(99,-1,region,at));assert.equal(countryStrengths(s)[0].units,7);
});

test('country strength follows health, upgrades and stat talents',()=>{
 const s=createGame(setups(),11),region=s.provinces.find(p=>p.owner===0).id,at=MAP[region].center;
 s.units=[unit(1,0,region,at)];const fresh=countryStrengths(s)[0].power;
 s.units[0].hp=25;close(countryStrengths(s)[0].power,fresh/2);// √(¼ health) = ½
 s.units[0].hp=100;s.players[0].upgrades.infantry.attack=3;assert.ok(countryStrengths(s)[0].power>fresh);
 const upgraded=countryStrengths(s)[0].power;s.players[0].talents.push('veterans');assert.ok(countryStrengths(s)[0].power>upgraded);
});

test('battle strength measures the sides present, with losses and situational talent effects',()=>{
 const make=talents=>{
  const e=new Engine(createGame(setups(),42)),s=e.state,region=provinceByCode('DEU-3487'),c=MAP[region].center,at={x:c.x,z:c.z+4};
  Object.assign(s.provinces[region],{owner:1,kind:'infantry'});s.players[1].talents.push(...talents);
  s.units=[unit(1,0,region,at),unit(2,0,region,{x:at.x+.9,z:at.z}),unit(3,1,region,{x:at.x+2,z:at.z}),unit(4,1,region,{x:at.x+2,z:at.z+.9})];s.nextId=10;
  e.step();return {s,region};
 };
 const {s,region}=make([]),[battle]=battleStrengths(s);
 assert.equal(battle.region,region);assert.deepEqual(battle.sides.map(side=>side.units).sort(),[2,2]);
 assert.deepEqual(battleStrengths(s,b=>b.region!==region),[],'include limits the battles measured');
 const losses=s.battles[0].sides.map(side=>side.losses);assert.deepEqual(battle.sides.map(side=>side.losses).sort(),losses.sort());
 assert.ok(battle.sides[0].power>=battle.sides[1].power,'strongest side first');
 // Entrenchment: the region owner's troops take less damage at home, so they count for more there.
 const entrenched=make(['entrenchment']),side=(b,owner)=>b.sides.find(x=>x.owner===owner);
 const [plain]=battleStrengths(make([]).s),[dug]=battleStrengths(entrenched.s);
 assert.ok(side(dug,1).power>side(plain,1).power);close(side(dug,0).power,side(plain,0).power,1e-6);
 // A side that has left the region is not shown; with one side left there is no fight to show.
 s.units=s.units.filter(u=>u.owner===1);assert.deepEqual(battleStrengths(s),[]);
});

test('power ratio and verdict thresholds',()=>{
 const sides=[{owner:0,power:30},{owner:1,power:20},{owner:2,power:10}];
 close(powerRatio(sides,0),1.5);close(powerRatio(sides,2),10/30);
 assert.equal(verdict(AHEAD_RATIO),'ahead');assert.equal(verdict(BEHIND_RATIO),'behind');assert.equal(verdict(1),'even');
 assert.equal(powerRatio([{owner:0,power:5}],0),Infinity);
});
