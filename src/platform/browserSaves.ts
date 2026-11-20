import {AUTOSAVE_ID, SAVE_PREFIX, deleteSave, encodeSave, listSaves, readSave, writeSave, type StorageLike} from '../game/save.ts';
import type {GameState} from '../game/types.ts';

const STORE='slots';
type Slot={key:string;value:string|null};
let opening:Promise<IDBDatabase|null>|undefined;

function database():Promise<IDBDatabase|null> {
 return opening??=new Promise(resolve=>{
  try{
   const request=indexedDB.open('rouge-campaign-saves',1);
   request.onupgradeneeded=()=>request.result.createObjectStore(STORE,{keyPath:'key'});
   request.onsuccess=()=>{
    const db=request.result;
    db.onversionchange=()=>{db.close();opening=undefined;};
    resolve(db);
   };
   request.onerror=()=>resolve(null);
  }catch{resolve(null);}
 });
}

function legacyStorage():Storage|null {
 try{return localStorage;}catch{return null;}
}

async function withSaves<T>(keys:readonly string[]|null,mode:IDBTransactionMode,operation:(storage:StorageLike)=>T):Promise<T> {
 const legacy=legacyStorage(),db=await database();
 if(!db){
  if(mode==='readwrite'||!legacy)throw Error('saveStorage');
  return operation(legacy);
 }
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(STORE,mode),store=tx.objectStore(STORE),persisted=new Map<string,string|null>();
  const pending=new Map<string,string|null>();
  let result:T;
  const run=()=>{
   const getItem=(key:string)=>pending.has(key)?pending.get(key)!:persisted.has(key)?persisted.get(key)!:legacy?.getItem(key)??null;
   let allKeys:string[]|undefined;
   const keysForList=()=>allKeys??=[...new Set([...Object.keys(legacy??{}),...persisted.keys(),...pending.keys()])]
    .filter(key=>(pending.has(key)?pending.get(key):persisted.get(key))!==null);
   try{
    result=operation({
     get length(){return keysForList().length;},key:i=>keysForList()[i]??null,getItem,
     setItem:(key,value)=>{pending.set(key,value);allKeys=undefined;},
     removeItem:key=>{pending.set(key,null);allKeys=undefined;},
    });
    for(const [key,value] of pending)store.put({key,value} satisfies Slot);
   }catch(error){tx.abort();reject(error);}
  };
  tx.oncomplete=()=>{
   if(legacy)for(const [key,value] of pending)if(value===null||value===''){
    try{legacy.removeItem(key);}catch{/* The committed tombstone still hides the legacy slot. */}
   }
   resolve(result);
  };
  tx.onabort=()=>reject(tx.error??Error('saveStorage'));
  if(keys===null){
   const request=store.getAll();
   request.onsuccess=()=>{for(const {key,value} of request.result as Slot[])persisted.set(key,value);run();};
  }else{
   let left=keys.length;
   for(const key of keys){
    const request=store.get(key);
    request.onsuccess=()=>{
     const record=request.result as Slot|undefined;
     if(record)persisted.set(key,record.value);
     if(!--left)run();
    };
   }
  }
 });
}

function slotKeys(id:string):string[]{return [SAVE_PREFIX+id,SAVE_PREFIX+id+'.backup'];}
function encodeAutomatic(state:GameState,name:string):Promise<string>{
 return new Promise((resolve,reject)=>{
  let worker:Worker;
  try{worker=new Worker(new URL('./autosave.worker.ts',import.meta.url),{type:'module'});}
  catch{resolve(encodeSave(state,name));return;}
  const fail=()=>{
   worker.terminate();
   // Some browsers allow construction but block the module during startup.
   // Keep the existing storage path available when that happens.
   try{resolve(encodeSave(state,name));}catch(error){reject(error);}
  };
  worker.onerror=fail;worker.onmessageerror=fail;
  worker.onmessage=({data})=>{
   if(data?.type==='ready'){
    try{worker.postMessage({state,name});}catch{fail();}
    return;
   }
   worker.terminate();if(typeof data?.value==='string')resolve(data.value);else reject(Error(data?.error??'saveStorage'));
  };
 });
}
// Submit slot operations in invocation order, including while an older
// automatic save is encoding. A failed write must not block later writes.
let pending=Promise.resolve();
function ordered<T>(operation:()=>Promise<T>):Promise<T>{
 const next=pending.then(operation);pending=next.then(()=>{},()=>{});return next;
}
export const browserSaves={
 list:()=>ordered(()=>withSaves(null,'readonly',listSaves)),
 read:(id:string)=>ordered(()=>withSaves(slotKeys(id),'readonly',storage=>readSave(storage,id))),
 auto:(state:GameState,name:string)=>ordered(async()=>{
  const value=await encodeAutomatic(state,name),key=SAVE_PREFIX+AUTOSAVE_ID;
  return withSaves([key],'readwrite',storage=>storage.setItem(key,value));
 }),
 write:(id:string,state:GameState,name:string)=>ordered(()=>withSaves(slotKeys(id),'readwrite',storage=>writeSave(storage,id,state,name))),
 delete:(id:string)=>ordered(()=>withSaves([...new Set([...slotKeys(id),SAVE_PREFIX+AUTOSAVE_ID])],'readwrite',storage=>deleteSave(storage,id))),
};
