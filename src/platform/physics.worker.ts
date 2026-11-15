import {kernel} from '../game/groundKernel.ts';
const STATIC_BASE=64*1024*1024,DATA_BASE=32*1024*1024,UNITS=32;let pathBase=0,pathCapacity=0,initialized=false;
self.onmessage=({data:message})=>{
 try{
  if(message.type==='init'){
   pathBase=message.geometry.routePointer;pathCapacity=message.geometry.routeCapacity;const end=pathBase+pathCapacity,pages=Math.ceil(end/65536),current=kernel.memory.buffer.byteLength/65536;if(pages>current)kernel.memory.grow(pages-current);
   new Uint8Array(kernel.memory.buffer,STATIC_BASE,message.geometry.memory.byteLength).set(new Uint8Array(message.geometry.memory));
   for(const [name,pointer]of Object.entries(message.geometry.pointers))kernel[name](pointer);
   kernel.reserveNavigationArena(end);initialized=true;self.postMessage({type:'ready'});return;
  }
  if(!initialized||message.type!=='step'||!(message.units instanceof Float64Array)||!message.units.length||message.units.length%UNITS||message.units.length/UNITS>65536||!Number.isInteger(message.pathStart)||message.pathStart<0||(message.pathStart+(message.pathDelta?.length??0))*8>pathCapacity)throw Error('Invalid physics input');
  const started=performance.now(),input:Float64Array=message.units,n=input.length/32,buffer=kernel.memory.buffer,data=new Float64Array(buffer,DATA_BASE,input.length);data.set(input);
  if(message.pathDelta)new Float64Array(buffer,pathBase+message.pathStart*8,message.pathDelta.length).set(message.pathDelta);
  new Int32Array(buffer,kernel.provinceOwnersPointer(),message.owners.length).set(message.owners);
  if(!kernel.buildUnitIndex(DATA_BASE,n,pathBase,false))throw Error('Physics spatial capacity exceeded');
  const packed=performance.now();kernel.solveBattalionPhysics(message.tick);const solved=performance.now();
  input.set(data);let constraintLimited=0;const attempts=new Uint32Array(buffer,kernel.attemptsPointer(),kernel.collisionBodyCount());for(const value of attempts)if(value>=12)constraintLimited++;
  const report={candidates:Number(kernel.candidates.value),contacts:Number(kernel.contacts.value),maxPenetration:Number(kernel.maxPenetration.value),limited:Number(kernel.limited.value),constraints:Number(kernel.constraints.value),constraintLimited};
  (self as unknown as Worker).postMessage({type:'done',id:message.id,units:input,report,times:{prepare:packed-started,solve:solved-packed,total:performance.now()-started}},[input.buffer]);
 }catch(error){self.postMessage({type:'error',error:String(error),stack:(error as Error).stack});}
};
