import {validFlag,type Flag} from '../game/flags.ts';
import {LEADERS} from '../game/content.ts';
import type {Leader} from '../game/types.ts';
export const SETUP_PREFERENCES_KEY='rouge.setup-preferences.v1';
export interface SetupPreferences {leader:Leader;flag:Flag}
export interface PreferenceStorage {getItem(key:string):string|null;setItem(key:string,value:string):void}
const defaults=():SetupPreferences=>({leader:'warden',flag:{type:'preset',id:'cn'}});
function storageOrDefault(storage?:PreferenceStorage):PreferenceStorage|undefined {try{return storage??globalThis.localStorage;}catch{return undefined;}}
export function loadSetupPreferences(storage?:PreferenceStorage):SetupPreferences {
 try{
  const raw=storageOrDefault(storage)?.getItem(SETUP_PREFERENCES_KEY);if(!raw||raw.length>8192)return defaults();
  const value=JSON.parse(raw);
  if(!value||Object.keys(value).length!==3||value.version!==1||!LEADERS.includes(value.leader)||!validFlag(value.flag))return defaults();
  return {leader:value.leader,flag:value.flag};
 }catch{return defaults();}
}
export function saveSetupPreferences(value:SetupPreferences,storage?:PreferenceStorage):boolean {
 try{
  if(!value||!LEADERS.includes(value.leader)||!validFlag(value.flag))return false;
  const target=storageOrDefault(storage);if(!target)return false;
  target.setItem(SETUP_PREFERENCES_KEY,JSON.stringify({version:1,leader:value.leader,flag:value.flag}));return true;
 }catch{return false;}
}
