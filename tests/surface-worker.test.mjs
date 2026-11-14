import test from 'node:test';
import assert from 'node:assert/strict';

test('returning to an aborted relief tile retries it without permanently marking artwork as failed',async()=>{
 const saved={self:globalThis.self,fetch:globalThis.fetch,createImageBitmap:globalThis.createImageBitmap,OffscreenCanvas:globalThis.OffscreenCanvas};
 const messages=[];let calls=0,started;const firstFetch=new Promise(resolve=>{started=resolve;});
 globalThis.self={postMessage:value=>messages.push(value)};
 globalThis.fetch=async(_url,{signal})=>{
  calls++;started();if(signal.aborted)throw new DOMException('aborted','AbortError');
  if(calls===1)await new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError')),{once:true}));
  return new Response(new Blob(['tile']));
 };
 globalThis.createImageBitmap=async()=>({width:1,height:1,close(){}});
 globalThis.OffscreenCanvas=class {getContext(){return {drawImage(){},getImageData(){return {data:new Uint8Array([123,0,0,255])};}};}};
 try{
  await import('../src/render/surfaceTiles.worker.ts');const tile={key:'16384-1-1',url:'https://example.test/tile.webp'};
  self.onmessage({data:[tile]});await firstFetch;self.onmessage({data:[]});self.onmessage({data:[tile]});
  for(let i=0;i<10&&!messages.length;i++)await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls,2);assert.equal(messages.length,1);assert.equal(messages[0].key,tile.key);assert.deepEqual([...messages[0].pixels],[123]);assert.equal(messages[0].error,undefined);
 }finally{for(const [key,value] of Object.entries(saved)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}}
});
