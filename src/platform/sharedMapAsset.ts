/** Versioned map URLs are shared by the window and simulation worker. Keep
 * their validated responses across reloads; storage failures fall back to HTTP. */
export async function loadSharedMapAsset(url:string,label:string,cache:RequestCache='force-cache'):Promise<unknown>{
  let storage:Cache|undefined;
  if(cache==='force-cache'){
    try{
      if(typeof caches!=='undefined')storage=await caches.open('rouge-map-assets-v1');
      if(storage){
        const cached=await storage.match(url);
        if(cached){
          try{return await cached.json();}
          catch{await storage.delete(url);}
        }
      }
    }catch{/* Private browsing, disabled storage or eviction must not block startup. */}
  }
  let response:Response;
  try{response=await fetch(url,{cache});}
  catch(cause){throw new Error(`Failed to download ${label}`,{cause});}
  if(!response.ok)throw new Error(`Failed to download ${label}: HTTP ${response.status}`);
  const copy=storage?response.clone():undefined;
  let data:unknown;
  try{data=await response.json();}
  catch(cause){throw new Error(`Invalid ${label} data`,{cause});}
  if(storage&&copy){
    try{
      await storage.put(url,copy);
      // Retain the latest revision of each map in this deployment directory.
      const family=(value:string)=>{const key=new URL(value,location.href);return key.origin+key.pathname.replace(/(world|terrain-navigation)(?:-[\w-]+)?\.json$/,'$1.json');};
      for(const key of await storage.keys())if(key.url!==new URL(url,location.href).href&&family(key.url)===family(url))await storage.delete(key);
    }catch{/* Quota limits leave the HTTP cache and the downloaded data usable. */}
  }
  return data;
}
