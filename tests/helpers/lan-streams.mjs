import assert from 'node:assert/strict';
import {MAP_ID,RULES_ID} from '../../src/game/content.ts';
/** Maintain a live, consuming client connection for an admitted human seat. */
export async function connectTicket(base,ticket){
 const controller=new AbortController();
 const response=await fetch(`${base}/rooms/${ticket.code}/events`,{headers:{Authorization:`Bearer ${ticket.token}`,'X-Rouge-Map':MAP_ID,'X-Rouge-Rules':RULES_ID},signal:controller.signal});
 assert.equal(response.status,200);
 const reader=response.body.getReader();
 void(async()=>{try{while(!(await reader.read()).done){}}catch{/* Disconnects are expected during teardown/reconnect. */}})();
 return controller;
}
