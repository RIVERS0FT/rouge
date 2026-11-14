/** Hashed tile URLs survive refreshes even when the dev server revalidates HTTP. */
export async function surfaceAsset(url:string,signal?:AbortSignal):Promise<Blob>{
 let cache:Cache|undefined;
 try{if(typeof caches!=='undefined')cache=await caches.open('rouge-ne2-surfaces-v1');const hit=await cache?.match(url);if(hit)return hit.blob();}catch{/* HTTP remains available. */}
 const response=await fetch(url,{cache:'force-cache',signal});if(!response.ok)throw new Error(`Surface HTTP ${response.status}`);
 if(cache){try{await cache.put(url,response.clone());const keys=await cache.keys();for(const old of keys.slice(0,Math.max(0,keys.length-192)))await cache.delete(old);}catch{/* Quota limits do not block rendering. */}}
 return response.blob();
}
