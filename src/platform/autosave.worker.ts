import {encodeSave} from '../game/save.ts';
import type {GameState} from '../game/types.ts';

self.onmessage=({data}:MessageEvent<{state:GameState;name:string}>)=>{
 try{self.postMessage({value:encodeSave(data.state,data.name)});}
 catch(error){self.postMessage({error:error instanceof Error?error.message:'saveStorage'});}
};
self.postMessage({type:'ready'});
