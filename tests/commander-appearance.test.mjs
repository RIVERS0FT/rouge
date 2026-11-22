import assert from 'node:assert/strict';
import test from 'node:test';
import {defaultAppearance,validAppearance} from '../src/game/portrait.ts';
import {validateSetup} from '../src/game/content.ts';
import {createGame} from '../src/game/engine.ts';
import {encodeSave,decodeSave} from '../src/game/save.ts';
import {loadSetupPreferences,saveSetupPreferences} from '../src/ui/setupPreferences.ts';

test('custom commander survives preferences and campaign saves independently of player name',()=>{
 const appearance={...defaultAppearance('female'),skin:5,age:62,hair:'',uniform:'female_outfit_chinese_01_mid'};
 const values=new Map(),storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
 const setup={name:'陈宁',flag:{type:'preset',id:'cn'},leader:'warden',loadout:['infantry'],appearance};
 assert.ok(validateSetup(setup));
 assert.ok(saveSetupPreferences(setup,storage));
 assert.deepEqual(loadSetupPreferences(storage).appearance,appearance);
 const game=createGame([setup,{name:'B',leader:'steward',loadout:['infantry']}],73,'appearance');
 const [player,other]=decodeSave(encodeSave(game,'Appearance')).state.players;
 assert.deepEqual(player.appearance,appearance);assert.equal(player.name,setup.name);assert.equal(other.appearance,undefined);
});
test('only compatible catalog parts and supported face values are accepted',()=>{
 const male=defaultAppearance(),female=defaultAppearance('female');
 assert.ok(validAppearance(male));assert.ok(validAppearance(female));
 for(const patch of [{body:'other'},{hair:female.hair},{uniform:''},{hat:'../parts.json'},{skin:-1},{age:4.5},{nose:101},{hairColor:'red'},{extra:1}]){
  assert.equal(validAppearance({...male,...patch}),false);
 }
});
