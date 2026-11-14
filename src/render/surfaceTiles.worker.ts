import {surfaceAsset} from './surfaceAsset.ts';
interface Job {key:string;url:string}
const active=new Map<string,AbortController>();let queue:Job[]=[],wanted=new Map<string,Job>();
async function load(job:Job,controller:AbortController){
 let image:ImageBitmap|undefined;
 try{
  image=await createImageBitmap(await surfaceAsset(job.url,controller.signal));if(!wanted.has(job.key))return;
  const canvas=new OffscreenCanvas(image.width,image.height),ctx=canvas.getContext('2d',{willReadFrequently:true})!;ctx.drawImage(image,0,0);
  const rgba=ctx.getImageData(0,0,image.width,image.height).data,pixels=new Uint8Array(image.width*image.height);for(let i=0;i<pixels.length;i++)pixels[i]=rgba[i*4];
  self.postMessage({key:job.key,pixels},{transfer:[pixels.buffer]});
 }catch{if(!controller.signal.aborted&&wanted.has(job.key))self.postMessage({key:job.key,error:true});}
 finally{image?.close();active.delete(job.key);const retry=wanted.get(job.key);if(controller.signal.aborted&&retry)queue.push(retry);pump();}
}
function pump(){while(active.size<4&&queue.length){const job=queue.shift()!;if(active.has(job.key)||!wanted.has(job.key))continue;const controller=new AbortController();active.set(job.key,controller);void load(job,controller);}}
self.onmessage=({data}:{data:Job[]})=>{wanted=new Map(data.map(job=>[job.key,job]));queue=data.filter(job=>!active.has(job.key));for(const [key,controller] of active)if(!wanted.has(key))controller.abort();pump();};
