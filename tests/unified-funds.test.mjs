import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGame,Engine} from '../src/game/engine.ts';
import {DT,MAP_ID,STATE_VERSION} from '../src/game/content.ts';
import {CAPTURE_REWARD,MAX_FUNDS,STARTING_FUNDS,fundsIncomeRate} from '../src/game/construction.ts';
import {MAP} from '../src/game/map.ts';
import {checksum,decodeSave,encodeSave,listSaves,readSave,SAVE_PREFIX,validateState,writeSave} from '../src/game/save.ts';
import {regionProductionRate} from '../src/game/territoryEconomy.ts';
import {applyFrame,encodeFrame} from '../src/platform/replication.ts';

const fresh=()=>new Engine(createGame([{name:'A',leader:'warden',loadout:['infantry']},{name:'B',leader:'steward',loadout:['infantry']}],1234));
const build=(province)=>({type:'construct',province,kind:'market',expectedLevel:0});
const upgrade={type:'upgrade',kind:'infantry',stat:'attack'};

test('construction, unit upgrades and rerolls draw from one shared funds balance',()=>{
 const e=fresh(),p=e.state.players[0],home=e.state.provinces.find(v=>v.owner===0).id;
 assert.equal(p.funds,184);
 assert.equal(Object.hasOwn(p,'gold'),false);
 assert.equal(Object.hasOwn(p,'constructionFunds'),false);
 Object.assign(p,{funds:100,level:2,drafts:1,choices:['industry','forcedMarch','entrenchment']});
 assert.deepEqual(e.command(0,build(home)),{ok:true});
 assert.equal(p.funds,46);
 assert.deepEqual(e.command(0,upgrade),{ok:true});
 assert.equal(p.funds,16);
 assert.deepEqual(e.command(0,{type:'reroll',expectedCost:30}),{ok:false,error:'noFunds'});
 p.funds=60;
 assert.deepEqual(e.command(0,{type:'reroll',expectedCost:30}),{ok:true});
 assert.equal(p.funds,30);
 assert.deepEqual(e.command(0,{...build(home),expectedLevel:1}),{ok:false,error:'noFunds'});
 assert.equal(p.funds,30);
});

test('owned tiles, markets and captures pay into the same capped balance',()=>{
 const e=fresh(),s=e.state,p=s.players[0],home=s.provinces.find(v=>v.owner===0),target=s.provinces.find(v=>v.owner<0&&MAP[v.id].playable);
 const attacker=s.units.find(u=>u.owner===0&&u.province===home.id);
 const {x,z}=MAP[target.id].center;
 Object.assign(attacker,{x,z,province:target.id,origin:target.id});
 s.units=[attacker];
 target.captor=0;target.capture=7.99;
 assert.deepEqual(e.command(0,build(home.id)),{ok:true});
 const expected=STARTING_FUNDS-54+CAPTURE_REWARD+DT*(1.75*regionProductionRate(home.id)+.375*regionProductionRate(target.id));
 e.step(1);
 assert.equal(target.owner,0);
 assert.ok(Math.abs(p.funds-expected)<1e-8);
 p.funds=MAX_FUNDS;
 e.step(1);assert.equal(p.funds,MAX_FUNDS);
 assert.ok(fundsIncomeRate(home,regionProductionRate(home.id))>0);
});

test('current saves and LAN use v6 funds while isolating v5 storage',()=>{
 const s=fresh().state;
 const legacy=structuredClone(s);
 legacy.version=5;
 for(const p of legacy.players){delete p.funds;p.gold=120;p.constructionFunds=64;}
 const oldSlot='rouge.save.natural-earth-admin1.regions.v5.same',body=JSON.stringify(legacy);
 const old=JSON.stringify({...JSON.parse(encodeSave(s,'New')),name:'Old',body,hash:checksum(body)});
 assert.equal(s.map,MAP_ID);assert.equal(s.version,STATE_VERSION);
 assert.equal(validateState(legacy),false);assert.throws(()=>decodeSave(old),/invalidSave/);
 assert.throws(()=>applyFrame(null,{type:'state',state:legacy}),/incompatibleMap/);
 const data=new Map([[oldSlot,old],[oldSlot+'.backup',old]]);
 const storage={get length(){return data.size;},key:i=>[...data.keys()][i]??null,getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
 assert.deepEqual(listSaves(storage),[]);
 assert.throws(()=>readSave(storage,'same'),/invalidSave/);
 writeSave(storage,'same',s,'New');
 assert.equal(listSaves(storage)[0].name,'New');
 assert.equal(readSave(storage,'same').state.players[0].funds,STARTING_FUNDS);
 assert.equal(data.get(oldSlot),old);assert.equal(data.get(oldSlot+'.backup'),old);assert.ok(data.has(SAVE_PREFIX+'same'));
 assert.deepEqual(applyFrame(null,encodeFrame(s).frame),s);
});
