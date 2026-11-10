/** Hashed map assets are identical in the window and simulation worker. Reuse
 * the HTTP cache across these separate module graphs, even on LAN servers that
 * do not set a long max-age. Development passes no-cache for regenerated maps. */
export async function loadSharedMapAsset(url:string,label:string,cache:RequestCache='force-cache'):Promise<unknown>{
  let response:Response;
  try{response=await fetch(url,{cache});}
  catch(cause){throw new Error(`Failed to download ${label}`,{cause});}
  if(!response.ok)throw new Error(`Failed to download ${label}: HTTP ${response.status}`);
  try{return await response.json();}
  catch(cause){throw new Error(`Invalid ${label} data`,{cause});}
}
