import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {t,playerName} from '../src/ui/i18n.ts';
import {MAP} from '../src/game/map.ts';

test('generated names and compact HUD labels follow the selected language',()=>{
 assert.equal(playerName('zh',{name:'AI 2',ai:true}),'电脑玩家 2');
 assert.equal(playerName('en',{name:'AI 2',ai:true}),'Computer player 2');
 for(const language of ['zh','en']){
  assert.equal(playerName(language,{name:'AI 2',ai:false}),'AI 2');
  assert.equal(playerName(language,{name:'Alice 王',ai:false}),'Alice 王');
  assert.equal(playerName(language,{name:'Custom opponent',ai:true}),'Custom opponent');
 }
 assert.equal(t('zh','yourName'),'指挥官');
 assert.equal(t('en','yourName'),'Commander');
 assert.equal(t('zh','levelShort'),'等级');
 assert.equal(t('zh','experience'),'经验');
 assert.equal(t('zh','seconds'),'秒');
 for(const language of ['zh','en'])for(const key of ['error.serverOffline','error.webgl','starting'])assert.doesNotMatch(t(language,key),/npm|WebGL|simulation|模拟|行政区地图/i);
});

test('player-facing components contain no decorative technical or tutorial copy',()=>{
 // The interface is split across many components; check every one of them.
 const root=new URL('../src/ui/',import.meta.url),files=fs.readdirSync(root,{recursive:true}).filter(name=>/\.tsx$/.test(name));
 assert.ok(files.length>10);
 for(const file of files){
  const source=fs.readFileSync(new URL(file.replaceAll('\\','/'),root),'utf8');
  assert.doesNotMatch(source,/STRATEGY LAB|CAMPAIGN ARCHIVES|ARMY DEVELOPMENT|THE FRONTIER|input-hint|atlas-credit|Victoria|Vic3/,file);
  for(const key of ['prototype','theatreSub','platformPending','offlineHint','chooseHint','unitTooltipHint','terrainPreviewHint','sendHint','selectFriendly','settingsKeyboard','aiSoloHint','aiCreateHint','aiRoomHint','identityHint','preferencesHint','lanHint','lanOnly','oldMapSaveNotice','menuBrief','subtitle'])assert.ok(!source.includes(`text('${key}')`),`${file}: ${key}`);
 }
 const territory=fs.readFileSync(new URL('../src/ui/TerritoryManagement.tsx',import.meta.url),'utf8');
 assert.doesNotMatch(territory,/territoryMapDisclaimer|territoryConservation|territoryRevision|territorySplitHint|territoryMergeHint|<small>\{id\}/);
 // Revision and atom codes still exist in authoritative commands/test hooks.
 assert.match(territory,/expectedRevision:grouping.revision/);
 const flags=fs.readFileSync(new URL('../src/ui/FlagEditor.tsx',import.meta.url),'utf8');
 assert.doesNotMatch(flags,/flag-drawing-instructions|Choose a brush and drag/);
});

test('unnamed map areas get localized names instead of internal identifiers',()=>{
 for(const province of MAP){
  assert.match(province.name[0],/\p{Script=Han}/u);
  assert.notEqual(province.name[0],province.code);
  assert.notEqual(province.name[1],province.code);
  assert.doesNotMatch(province.name[1],/\p{Script=Han}/u);
 }
});
