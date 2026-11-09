import test from 'node:test';
import assert from 'node:assert/strict';
import {validFlag,validFlagShape,flagShapeFromDrag,FLAG_SHAPES,MAX_FLAG_SHAPES} from '../src/game/flags.ts';
import {loadSetupPreferences,saveSetupPreferences,SETUP_PREFERENCES_KEY} from '../src/ui/setupPreferences.ts';
import {createGame} from '../src/game/engine.ts';
import {encodeSave,decodeSave} from '../src/game/save.ts';
const base={type:'custom',pattern:'solid',colors:['#123456','#abcdef','#FFFFFF']};
const shape={kind:'rect',x:10,y:10,width:15,height:15,color:'#ffaa00'};
test('drawn shapes are normalized and strictly bounded; legacy flags remain valid',()=>{
 assert.ok(validFlag(base));assert.ok(validFlag({type:'preset',id:'cn'}));
 for(const kind of FLAG_SHAPES)assert.ok(validFlag({...base,shapes:[{...shape,kind}]}));
 for(const bad of [{...shape,kind:'script'},{...shape,color:'url(https://evil)'},{...shape,x:Infinity},{...shape,x:10.123},{...shape,width:0},{...shape,y:59,height:2},{...shape,x:80,width:11},{...shape,kind:'circle',width:14},{...shape,onload:'bad'}])assert.equal(validFlagShape(bad),false);
 assert.equal(validFlag({...base,shapes:[shape],html:'bad'}),false);
 assert.equal(validFlag({...base,shapes:undefined}),false);
 assert.equal(validFlag({...base,shapes:Array.from({length:MAX_FLAG_SHAPES+1},()=>shape)}),false);
 const full={...base,shapes:Array.from({length:MAX_FLAG_SHAPES},()=>shape)};assert.ok(validFlag(full));
 assert.ok(JSON.stringify({setup:{name:'Commander',leader:'warden',flag:full,loadout:['infantry']}}).length<8192);
});
test('drag geometry clamps to 90x60, handles reverse drags and rejects clicks',()=>{
 assert.deepEqual(flagShapeFromDrag('rect','#ffffff',{x:30,y:40},{x:10,y:15}),{kind:'rect',color:'#ffffff',x:10,y:15,width:20,height:25});
 const full=flagShapeFromDrag('triangle','#ffffff',{x:-50,y:-10},{x:140,y:90});assert.deepEqual(full,{kind:'triangle',color:'#ffffff',x:0,y:0,width:90,height:60});
 const circle=flagShapeFromDrag('circle','#ffffff',{x:40,y:40},{x:10,y:20});assert.equal(circle.width,circle.height);assert.ok(validFlagShape(circle));
 assert.equal(flagShapeFromDrag('star','#ffffff',{x:2,y:2},{x:2,y:2}),null);
 assert.equal(flagShapeFromDrag('rect','#ffffff',{x:2,y:2},{x:NaN,y:4}),null);
});
test('shapes survive campaign save roundtrip as independent cosmetic data',()=>{
 const flag={...base,shapes:[shape]},setup={name:'One',leader:'warden',loadout:['infantry'],flag};
 const state=createGame([setup,{...setup,name:'Two'}]);
 flag.shapes[0]={...shape,x:30};assert.equal(state.players[0].flag.shapes[0].x,10);
 assert.deepEqual(decodeSave(encodeSave(state,'Drawn')).state.players[0].flag,{...base,shapes:[shape]});
});
class Storage {data=new Map();getItem(k){return this.data.get(k)??null;}setItem(k,v){this.data.set(k,v);}}
test('preferences persist only validated leader and flag, with corruption and denial fallbacks',()=>{
 const storage=new Storage(),pref={leader:'vanguard',flag:{...base,shapes:[shape]},name:'Do not save',token:'Do not save'};
 assert.equal(saveSetupPreferences(pref,storage),true);assert.deepEqual(loadSetupPreferences(storage),{leader:pref.leader,flag:pref.flag});
 assert.deepEqual(Object.keys(JSON.parse(storage.getItem(SETUP_PREFERENCES_KEY))).sort(),['flag','leader','version']);
 for(const raw of ['broken','null',JSON.stringify({version:2,leader:'vanguard',flag:base}),JSON.stringify({version:1,leader:'evil',flag:base}),JSON.stringify({version:1,leader:'warden',flag:{...base,shapes:[{...shape,width:999}]}}),JSON.stringify({version:1,leader:'warden',flag:base,token:'secret'})]){
  storage.setItem(SETUP_PREFERENCES_KEY,raw);assert.deepEqual(loadSetupPreferences(storage),{leader:'warden',flag:{type:'preset',id:'cn'}});
 }
 const denied={getItem(){throw Error('denied');},setItem(){throw Error('denied');}};
 assert.deepEqual(loadSetupPreferences(denied),{leader:'warden',flag:{type:'preset',id:'cn'}});assert.equal(saveSetupPreferences(pref,denied),false);
 assert.equal(saveSetupPreferences({...pref,leader:'bad'},storage),false);
});
