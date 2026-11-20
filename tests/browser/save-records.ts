import type {Page} from '@playwright/test';
import type {GameState} from '../../src/game/types.ts';

export async function savedCampaigns(page:Page,prefix:string):Promise<{key:string;name:string;state:GameState}[]>{
 return page.evaluate(prefix=>new Promise((resolve,reject)=>{
  const open=indexedDB.open('rouge-campaign-saves',1);
  open.onerror=()=>reject(open.error);
  open.onsuccess=()=>{
   const db=open.result;
   const request=db.transaction('slots').objectStore('slots').getAll();
   request.onerror=()=>{db.close();reject(request.error);};
   request.onsuccess=()=>{
    db.close();
    resolve((request.result as {key:string;value:string|null}[]).flatMap(({key,value})=>{
     if(!value||!key.startsWith(prefix)||key.endsWith('.backup'))return [];
     const {name,body}=JSON.parse(value);
     return [{key,name,state:JSON.parse(body)}];
    }));
   };
  };
 }),prefix);
}
