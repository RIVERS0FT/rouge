let gh0:usize=0;
let gh1:usize=0;
let gh2:usize=0;
let gh3:i32=0;
let gh4:i32=0;
let gh5:i32=0;
let gh6:i32=0;
let gh7:f64=0;
let gh8:f64=0;
let gh9:f64=0;
let gh10:f64=0;
let gh11:usize=0;
let gt0:usize=0;
let gt1:usize=0;
let gt2:usize=0;
let gt3:usize=0;
let gt4:usize=0;
let gt5:usize=0;
let gt6:usize=0;
let gt7:f64=0;
let gt8:i32=0;
let gt9:i32=0;
let gt10:i32=0;
let gt11:i32=0;
let gt12:f64=0;
let gt13:i32=0;
let gt14:i32=0;
let gt15:i32=0;
let gt16:i32=0;
let gm0:usize=0;
let gm1:usize=0;
let gm2:usize=0;
let gm3:usize=0;
let gm4:usize=0;
let gm5:usize=0;
let gm6:usize=0;
let gm7:usize=0;
let gm8:usize=0;
let gm9:usize=0;
let gm10:usize=0;
let gm11:f64=0;
let gm12:i32=0;
let gm13:i32=0;
let gm14:i32=0;
let gm15:f64=0;
let gm16:i32=0;
let gm17:i32=0;
let gm18:i32=0;
let gm19:f64=0;
let gm20:f64=0;
let gm21:f64=0;
let gm22:f64=0;
let gm23:usize=0;
let gm24:usize=0;
@external("host", "push")
declare function hostPush(index:i32,x:f64,z:f64,amount:f64):f64;

const CELL:f64=1.24;
let capacity:i32=0,count:i32=0,gridCells:i32=0,gridColumns:i32=0,minX:i32=0,minZ:i32=0,epoch:u32=0,unique:i32=0;
let xs:usize=0,zs:usize=0,radii:usize=0,ids:usize=0,mobility:usize=0,remaining:usize=0,attempts:usize=0;
let sizes:usize=0,offsets:usize=0,cursor:usize=0,slots:usize=0,members:usize=0,grid:usize=0,gridKeys:usize=0,groundFreeTerrain:usize=0,groundFreeBuildings:usize=0,groundTriangles:usize=0;
export let candidates:i32=0,contacts:i32=0,limited:i32=0,maxPenetration:f64=0;
@inline function at(base:usize,index:i32):f64{return load<f64>(base+(usize(index)<<3));}
@inline function put(base:usize,index:i32,value:f64):void{store<f64>(base+(usize(index)<<3),value);}
@inline function word(base:usize,index:i32):u32{return load<u32>(base+(usize(index)<<2));}
@inline function setWord(base:usize,index:i32,value:u32):void{store<u32>(base+(usize(index)<<2),value);}
export function prepare(n:i32,cap:i32,cells:i32,columns:i32,left:i32,top:i32):usize {
 const resized=capacity!=cap;
 if(resized){
  capacity=cap;gridCells=cap*2;xs=65536;zs=xs+usize(cap)*8;radii=zs+usize(cap)*8;ids=radii+usize(cap)*8;mobility=ids+usize(cap)*8;
  remaining=mobility+usize(cap)*8;attempts=remaining+usize(cap)*8;
  sizes=attempts+usize(cap)*4;offsets=sizes+usize(cap)*4;cursor=offsets+usize(cap+1)*4;slots=cursor+usize(cap)*4;members=slots+usize(cap)*4;groundMeta=(members+usize(cap)*4+7)&~usize(7);groundClearance=groundMeta+usize(cap)*48;grid=groundClearance+usize(cap)*8;
  gridKeys=grid+usize(gridCells)*4;groundFreeTerrain=gridKeys+usize(gridCells)*4;groundFreeBuildings=groundFreeTerrain+usize(cap);groundTriangles=(groundFreeBuildings+usize(cap)+3)&~usize(3);
  const pages=i32((groundTriangles+usize(cap)*4+65535)>>16),current=memory.size();if(pages>current)memory.grow(pages-current);
  memory.fill(grid,0,usize(gridCells)*4);epoch=0;
 }
 count=n;gridColumns=columns;minX=left;minZ=top;candidates=contacts=limited=0;maxPenetration=0;
 memory.fill(attempts,0,usize(count)*4);memory.fill(groundFreeTerrain,2,usize(count));memory.fill(groundFreeBuildings,2,usize(count));for(let i=0;i<count;i++)store<i32>(groundTriangles+usize(i)*4,-2);
 for(let i=0;i<count;i++)put(remaining,i,.6);
 return xs;
}
export function remainingPointer():usize{return remaining;}
export function attemptsPointer():usize{return attempts;}
@inline function lookup(x:i32,z:i32,create:bool=false):i32 {
 const cell=(z-minZ)*gridColumns+x-minX,mask=gridCells-1;let index=(cell*-1640531535)&mask,entry=word(grid,index);
 while(entry>>20==epoch){if(i32(word(gridKeys,index))==cell)return i32((entry&1048575)-1);index=(index+1)&mask;entry=word(grid,index);}
 if(!create)return -1;const slot=unique++;setWord(gridKeys,index,u32(cell));setWord(grid,index,(epoch<<20)|u32(slot+1));return slot;
}
@inline function fallbackX(direction:i32):f64 {
 if(direction==0)return 1;if(direction==4)return -1;
 if(direction==2||direction==6)return 0;
 return direction==1||direction==7?.7071067811865476:-.7071067811865476;
}
@inline function fallbackZ(direction:i32):f64 {
 if(direction==2)return 1;if(direction==6)return -1;
 if(direction==0||direction==4)return 0;
 return direction==1||direction==3?.7071067811865476:-.7071067811865476;
}
export function solve(tick:u32):void {
 for(let pass=0;pass<4;pass++){
  unique=0;epoch++;if(epoch>=4096){memory.fill(grid,0,usize(gridCells)*4);epoch=1;}
  memory.fill(sizes,0,usize(capacity)*4);
  for(let i=0;i<count;i++){
   const x=i32(Math.floor(at(xs,i)/CELL)),z=i32(Math.floor(at(zs,i)/CELL)),slot=lookup(x,z,true);
   setWord(sizes,slot,word(sizes,slot)+1);setWord(slots,i,u32(slot));
  }
  setWord(offsets,0,0);
  for(let i=0;i<unique;i++){setWord(offsets,i+1,word(offsets,i)+word(sizes,i));setWord(cursor,i,word(offsets,i));}
  for(let i=0;i<count;i++){const slot=i32(word(slots,i)),where=word(cursor,slot);setWord(members,i32(where),u32(i));setWord(cursor,slot,where+1);}
  for(let ai=0;ai<count;ai++){
   const aid=at(ids,ai),bx=i32(Math.floor(at(xs,ai)/CELL)),bz=i32(Math.floor(at(zs,ai)/CELL)),rotation=i32((aid+f64(tick)+f64(pass))%9);
   let visited=0;
   for(let n=0;n<9;n++){
    const cell=(n+rotation)%9,slot=lookup(bx+cell%3-1,bz+cell/3-1),length=slot<0?0:i32(word(sizes,slot));if(!length)continue;
    const start=u32(i32(aid)*31)+tick+u32(pass),offset=i32(word(offsets,slot));let position=i32(start%u32(length));
    for(let k=0;k<length;k++){
     if(visited++>=96){limited++;break;}
     const bi=i32(word(members,offset+position));if(++position==length)position=0;candidates++;
     const bid=at(ids,bi);if(aid>=bid)continue;
     const dx=at(xs,bi)-at(xs,ai),dz=at(zs,bi)-at(zs,ai),min=at(radii,ai)+at(radii,bi),d2=dx*dx+dz*dz;if(d2>=min*min)continue;
     const d=Math.sqrt(d2),overlap=min-d;if(overlap<1e-5)continue;
     contacts++;maxPenetration=Math.max(maxPenetration,overlap);
     if((at(remaining,ai)<1e-7||word(attempts,ai)>=12)&&(at(remaining,bi)<1e-7||word(attempts,bi)>=12))continue;
     let x:f64,z:f64;
     if(d>1e-9){x=dx/d;z=dz/d;}else{const direction=(i32(aid)*73856093^i32(bid)*19349663)&7;x=fallbackX(direction);z=fallbackZ(direction);}
     // Mirrors collision.ts: head-on marching bodies both keep right and slide past.
     const sidestep=groundMode&&headOn(ai,bi,x,z);
     const ma=at(mobility,ai),mb=at(mobility,bi),sum=ma+mb,share=ma/(sum!=0?sum:1);
     const movedA=push(ai,-x,-z,overlap*share),movedB=push(bi,x,z,overlap-movedA);
     if(movedB<overlap-movedA-1e-6)push(ai,-x,-z,overlap-movedA-movedB);
     if(sidestep){const side=overlap*.5;push(ai,z,-x,side);push(bi,-z,x,side);}
    }
    if(visited>=96)break;
   }
  }
 }
}

@external("host", "hypot2")
declare function hypot2(x:f64,z:f64):f64;
let mapConfig:usize=0,terrainConfig:usize=0,buildingConfig:usize=0;
export function setupMap(pointer:usize):void{gm0=usize(at(pointer,0));gm1=usize(at(pointer,1));gm2=usize(at(pointer,2));gm3=usize(at(pointer,3));gm4=usize(at(pointer,4));gm5=usize(at(pointer,5));gm6=usize(at(pointer,6));gm7=usize(at(pointer,7));gm8=usize(at(pointer,8));gm9=usize(at(pointer,9));gm10=usize(at(pointer,10));gm11=f64(at(pointer,11));gm12=i32(at(pointer,12));gm13=i32(at(pointer,13));gm14=i32(at(pointer,14));gm15=f64(at(pointer,15));gm16=i32(at(pointer,16));gm17=i32(at(pointer,17));gm18=i32(at(pointer,18));gm19=f64(at(pointer,19));gm20=f64(at(pointer,20));gm21=f64(at(pointer,21));gm22=f64(at(pointer,22));gm23=usize(at(pointer,23));gm24=usize(at(pointer,24));}
export function setupTerrain(pointer:usize):void{gt0=usize(at(pointer,0));gt1=usize(at(pointer,1));gt2=usize(at(pointer,2));gt3=usize(at(pointer,3));gt4=usize(at(pointer,4));gt5=usize(at(pointer,5));gt6=usize(at(pointer,6));gt7=f64(at(pointer,7));gt8=i32(at(pointer,8));gt9=i32(at(pointer,9));gt10=i32(at(pointer,10));gt11=i32(at(pointer,11));gt12=f64(at(pointer,12));gt13=i32(at(pointer,13));gt14=i32(at(pointer,14));gt15=i32(at(pointer,15));gt16=i32(at(pointer,16));}
export function setupBuildings(pointer:usize):void{gh0=usize(at(pointer,0));gh1=usize(at(pointer,1));gh2=usize(at(pointer,2));gh3=i32(at(pointer,3));gh4=i32(at(pointer,4));gh5=i32(at(pointer,5));gh6=i32(at(pointer,6));gh7=f64(at(pointer,7));gh8=f64(at(pointer,8));gh9=f64(at(pointer,9));gh10=f64(at(pointer,10));gh11=usize(at(pointer,11));}
@inline function m(index:i32):f64{return at(mapConfig,index);}
@inline function t(index:i32):f64{return at(terrainConfig,index);}
@inline function h(index:i32):f64{return at(buildingConfig,index);}
@inline function inMap(x:f64,z:f64):bool{return x>=gm19&&x<=gm20&&z>=gm21&&z<=gm22;}
function ringContains(id:i32,x:f64,z:f64):bool {
 const r=usize(gm0)+usize(id)*72,top=at(r,2),bottom=at(r,3);
 if(z<top||z>bottom)return false;
 const band=i32(Math.min(at(r,8)-1,Math.floor((z-top)/at(r,4)))),coordinates=usize(at(r,5)),offsets=usize(at(r,6)),edges=usize(at(r,7));
 let inside=false;
 for(let i=i32(word(offsets,band)),end=i32(word(offsets,band+1));i<end;i++){
  const k=i32(word(edges,i)),az=at(coordinates,k+1),dz=at(coordinates,k+3);
  if((az>z)!=(at(coordinates,k+4)>z)&&x<at(coordinates,k+2)*(z-az)/dz+at(coordinates,k))inside=!inside;
 }return inside;
}
function partContains(id:i32,x:f64,z:f64):bool {
 const first=i32(word(usize(gm1),id*2)),count=i32(word(usize(gm1),id*2+1)),ring=usize(gm0)+usize(first)*72;
 if(x<at(ring,0)-1e-7||x>at(ring,1)+1e-7||!ringContains(first,x,z))return false;
 for(let i=1;i<count;i++)if(ringContains(first+i,x,z))return false;return true;
}
@inline function mapCell(x:f64,z:f64):i32{return (i32(Math.floor(z/gm15))-i32(gm17))*i32(gm18)+i32(Math.floor(x/gm15))-i32(gm16);}
export function kernelProvinceAt(x:f64,z:f64):i32 {
 if(!inMap(x,z))return -1;
 const cell=mapCell(x,z),boundary=load<u8>(usize(gm8)+usize(cell)),answers=usize(gm9);
 if(!boundary){const answer=load<i16>(answers+usize(cell)*2);if(answer!=-2)return answer;}
 const coarse=(i32(Math.floor(z/gm11))-i32(gm13))*i32(gm14)+i32(Math.floor(x/gm11))-i32(gm12),offsets=usize(gm3),entryIds=usize(gm4),bounds=usize(gm7);let found=-1;
 for(let i=i32(word(offsets,coarse)),end=i32(word(offsets,coarse+1));i<end;i++){
  const entry=i32(word(entryIds,i)),base=entry*4;
  if(x>=at(bounds,base)&&x<=at(bounds,base+1)&&z>=at(bounds,base+2)&&z<=at(bounds,base+3)&&partContains(i32(word(usize(gm5),entry)),x,z)){found=i32(word(usize(gm6),entry));break;}
 }if(!boundary)store<i16>(answers+usize(cell)*2,i16(found));return found;
}
export function kernelPointInProvince(id:i32,x:f64,z:f64):bool {
 if(!inMap(x,z)||!load<u8>(usize(gm10)+usize(id)))return false;
 const cell=mapCell(x,z);if(!load<u8>(usize(gm8)+usize(cell))){let answer:i32=load<i16>(usize(gm9)+usize(cell)*2);if(answer==-2)answer=kernelProvinceAt(x,z);if(answer==id)return true;}
 const offsets=usize(gm2);for(let part=i32(word(offsets,id)),end=i32(word(offsets,id+1));part<end;part++)if(partContains(part,x,z))return true;return false;
}
@inline function insideTriangle(id:i32,x:f64,z:f64):bool {
 const p=usize(gt0),i=id*12,a=at(p,i+2)*(z-at(p,i+1))-at(p,i+3)*(x-at(p,i)),b=at(p,i+6)*(z-at(p,i+5))-at(p,i+7)*(x-at(p,i+4));
 const positive=a>1e-8||b>1e-8,negative=a< -1e-8||b< -1e-8;if(positive&&negative)return false;
 const c=at(p,i+10)*(z-at(p,i+9))-at(p,i+11)*(x-at(p,i+8));return !((positive||c>1e-8)&&(negative||c< -1e-8));
}
export function kernelTerrainAt(x:f64,z:f64,landOnly:bool):i32 {
 const cx=i32(Math.floor(x/gt7))-i32(gt8),cz=i32(Math.floor(z/gt7))-i32(gt9),cols=i32(gt10);if(cx<0||cz<0||cx>=cols||cz>=i32(gt11))return -1;
 const cell=cz*cols+cx,offsets=usize(gt2),ids=usize(gt3),surfaces=usize(gt1);let found=-1;
 for(let i=i32(word(offsets,cell)),end=i32(word(offsets,cell+1));i<end;i++){
  const id=i32(word(ids,i)),land=load<u8>(surfaces+usize(id))==1;if(landOnly&&!land)continue;
  if(insideTriangle(id,x,z)){if(land)return id;found=id;}
 }return found;
}
export function kernelLocalSegment(ax:f64,az:f64,bx:f64,bz:f64,start:i32):bool {
 const id=start==-2?kernelTerrainAt(ax,az,true):start;if(id<0)return false;if(insideTriangle(id,bx,bz))return true;if(kernelTerrainAt(bx,bz,true)<0)return false;
 const dx=bx-ax,dz=bz-az,size=gt12,minX=i32(gt13),minZ=i32(gt14),cols=i32(gt15),rows=i32(gt16);
 const left=i32(Math.max(0,Math.floor(Math.min(ax,bx)/size)-minX)),right=i32(Math.min(cols-1,Math.floor(Math.max(ax,bx)/size)-minX)),top=i32(Math.max(0,Math.floor(Math.min(az,bz)/size)-minZ)),bottom=i32(Math.min(rows-1,Math.floor(Math.max(az,bz)/size)-minZ));
 const offsets=usize(gt5),ids=usize(gt6),walls=usize(gt4);
 for(let x=left;x<=right;x++)for(let z=top;z<=bottom;z++){
  const cell=z*cols+x;for(let i=i32(word(offsets,cell)),end=i32(word(offsets,cell+1));i<end;i++){
   const k=i32(word(ids,i)),wx=at(walls,k+4),wz=at(walls,k+5),det=dx*wz-dz*wx;if(Math.abs(det)<1e-14)continue;
   const qx=at(walls,k)-ax,qz=at(walls,k+1)-az,along=(qx*wz-qz*wx)/det,u=(qx*dz-qz*dx)/det;
   if(along>1e-9&&along<1-1e-9&&u>=-1e-9&&u<=1+1e-9)return false;
  }
 }return true;
}
export function kernelClearance(x:f64,z:f64,radius:f64,knownLand:bool):f64 {
 if(!knownLand&&kernelTerrainAt(x,z,true)<0)return 0;
 let best=radius*radius;const size=gt12,minX=i32(gt13),minZ=i32(gt14),cols=i32(gt15),rows=i32(gt16);
 const left=i32(Math.max(0,Math.floor((x-radius)/size)-minX)),right=i32(Math.min(cols-1,Math.floor((x+radius)/size)-minX)),top=i32(Math.max(0,Math.floor((z-radius)/size)-minZ)),bottom=i32(Math.min(rows-1,Math.floor((z+radius)/size)-minZ));
 const offsets=usize(gt5),ids=usize(gt6),walls=usize(gt4);
 for(let cx=left;cx<=right;cx++)for(let cz=top;cz<=bottom;cz++){
  const cell=cz*cols+cx;for(let i=i32(word(offsets,cell)),end=i32(word(offsets,cell+1));i<end;i++){
   const k=i32(word(ids,i)),a=at(walls,k),b=at(walls,k+1),dx=at(walls,k+4),dz=at(walls,k+5),l=at(walls,k+6),along=l?Math.max(0,Math.min(1,((x-a)*dx+(z-b)*dz)/l)):0;
   const qx=x-a-along*dx,qz=z-b-along*dz;best=Math.min(best,qx*qx+qz*qz);
  }
 }return Math.sqrt(best);
}
export function kernelBuildingSegment(ax:f64,az:f64,bx:f64,bz:f64,radius:f64):bool {
 const reach=radius+gh10,size=gh7,minX=i32(gh3),minZ=i32(gh4),cols=i32(gh5),rows=i32(gh6);
 const left=i32(Math.max(0,Math.floor((Math.min(ax,bx)-reach)/size)-minX)),right=i32(Math.min(cols-1,Math.floor((Math.max(ax,bx)+reach)/size)-minX)),top=i32(Math.max(0,Math.floor((Math.min(az,bz)-reach)/size)-minZ)),bottom=i32(Math.min(rows-1,Math.floor((Math.max(az,bz)+reach)/size)-minZ));
 const offsets=usize(gh2),ids=usize(gh1),houses=usize(gh0),width=gh8+radius,depth=gh9+radius;
 for(let x=left;x<=right;x++)for(let z=top;z<=bottom;z++){
  const cell=z*cols+x;for(let i=i32(word(offsets,cell)),end=i32(word(offsets,cell+1));i<end;i++){
   const k=i32(word(ids,i)),hx=at(houses,k),hz=at(houses,k+1),c=at(houses,k+2),s=at(houses,k+3),aX=ax-hx,aZ=az-hz,bX=bx-hx,bZ=bz-hz;
   const px=c*aX-s*aZ,qx=c*bX-s*bZ,dx=qx-px;let lo:f64=0,hi:f64=1;
   if(Math.abs(dx)<1e-12){if(Math.abs(px)>=width-1e-8)continue;}else{const t1=(-width-px)/dx,t2=(width-px)/dx;lo=Math.max(lo,Math.min(t1,t2));hi=Math.min(hi,Math.max(t1,t2));}
   const pz=s*aX+c*aZ,qz=s*bX+c*bZ,dz=qz-pz;
   if(Math.abs(dz)<1e-12){if(Math.abs(pz)>=depth-1e-8)continue;}else{const t1=(-depth-pz)/dz,t2=(depth-pz)/dz;lo=Math.max(lo,Math.min(t1,t2));hi=Math.min(hi,Math.max(t1,t2));}
   if(lo<hi-1e-9&&hi>1e-9&&lo<1-1e-9)return false;
  }
 }return true;
}
let groundMode:bool=false,groundMeta:usize=0,groundClearance:usize=0;
export let constraints:i32=0;
export function groundPointer():usize{return groundMeta;}
function groundLegal(index:i32,x:f64,z:f64):bool {
 const ax=at(xs,index),az=at(zs,index),radius=at(radii,index),meta=index*6,travel=at(groundMeta,meta+1)!=0;
 if(!kernelBuildingSegment(ax,az,x,z,radius))return false;
 let qx:f64=0,qz:f64=0;
 if(travel){
  const a=at(groundMeta,meta+2),b=at(groundMeta,meta+3),dx=at(groundMeta,meta+4)-a,dz=at(groundMeta,meta+5)-b,l=dx*dx+dz*dz;
  const along=l?Math.max(0,Math.min(1,((x-a)*dx+(z-b)*dz)/l)):0;
  qx=a+along*dx;qz=b+along*dz;
  if(norm2(x-qx,z-qz)>2.5||kernelProvinceAt(x,z)<0)return false;
 }else if(!kernelPointInProvince(i32(at(groundMeta,meta)),x,z))return false;
 if(freeGround(index))return true;
 let triangle=load<i32>(groundTriangles+usize(index)*4);if(triangle==-2){triangle=kernelTerrainAt(ax,az,true);store<i32>(groundTriangles+usize(index)*4,triangle);}if(!kernelLocalSegment(ax,az,x,z,triangle))return false;
 let before=at(groundClearance,index);if(isNaN(before))before=kernelClearance(ax,az,radius,true);
 const after=kernelClearance(x,z,radius,true);if(after+1e-8<before)return false;
 if(travel&&!kernelLocalSegment(x,z,qx,qz,-2))return false;
 put(groundClearance,index,after);store<i32>(groundTriangles+usize(index)*4,kernelTerrainAt(x,z,true));return true;
}
@external("host","atan2") declare function hostAtan2(y:f64,x:f64):f64;
/** Mirrors collision.ts motionAngle. */
@inline function motionAngle(dx:f64,dz:f64):f64 {return dx!=0||dz!=0?hostAtan2(dz,dx):NaN;}
/** Mirrors collision.ts: both marching bodies moved into the contact normal (a to b) within 60 degrees
 * this tick. Ground metadata slot 0 of a marching body holds that direction (NaN when it stood still). */
function headOn(a:i32,b:i32,x:f64,z:f64):bool {
 const ma=a*6,mb=b*6;if(at(groundMeta,ma+1)==0||at(groundMeta,mb+1)==0)return false;
 const motionA=at(groundMeta,ma),motionB=at(groundMeta,mb);
 return x*hostCos(motionA)+z*hostSin(motionA)>.5&&x*hostCos(motionB)+z*hostSin(motionB)< -.5;
}
function push(index:i32,x:f64,z:f64,amount:f64):f64 {
 if(!groundMode)return hostPush(index,x,z,amount);
 amount=Math.min(amount,at(remaining,index));if(amount<1e-7)return 0;
 for(let fraction:f64=1;fraction>=.125;fraction*=.5){
  const tried=word(attempts,index);if(tried>=12)return 0;setWord(attempts,index,tried+1);constraints++;
  const d=amount*fraction,toX=at(xs,index)+x*d,toZ=at(zs,index)+z*d;
  if(groundLegal(index,toX,toZ)){put(xs,index,toX);put(zs,index,toZ);put(remaining,index,at(remaining,index)-d);return d;}
 }return 0;
}
export function solveGround(tick:u32):void {
 groundMode=true;constraints=0;for(let i=0;i<count;i++)put(groundClearance,i,NaN);
 solve(tick);groundMode=false;
}

@external("host", "buildingStep")
declare function hostBuildingStep(index:i32,goalX:f64,goalZ:f64,radius:f64,step:f64):usize;
let unitsBase:usize=0,unitCount:i32=0,pathBase:usize=0,unitCols:i32=0,unitRows:i32=0,unitMinX:i32=0,unitMinZ:i32=0,unitOffsets:usize=0,unitMembers:usize=0,unitOwnerCells:usize=0;
const LANES:i32=32;
@inline function u(index:i32,field:i32):f64{return at(unitsBase,index*LANES+field);}
@inline function setU(index:i32,field:i32,value:f64):void{put(unitsBase,index*LANES+field,value);}
@inline function path(unit:i32,index:i32,field:i32):f64{return at(pathBase,i32(u(unit,11))+index*3+field);}
@inline function firstCellX(x:f64):i32{return max<i32>(0,i32(Math.floor(x/8))-unitMinX-1);}
@inline function lastCellX(x:f64):i32{return min<i32>(unitCols-1,i32(Math.floor(x/8))-unitMinX+1);}
@inline function firstCellZ(z:f64):i32{return max<i32>(0,i32(Math.floor(z/8))-unitMinZ-1);}
@inline function lastCellZ(z:f64):i32{return min<i32>(unitRows-1,i32(Math.floor(z/8))-unitMinZ+1);}
let corridorX:f64=0,corridorZ:f64=0;
function corridor(unit:i32,index:i32,x:f64,z:f64,lookahead:f64=0):void {
 const ax=path(unit,index-1,0),az=path(unit,index-1,1),dx=path(unit,index,0)-ax,dz=path(unit,index,1)-az,l=dx*dx+dz*dz;
 const along=l?Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/l+lookahead/Math.sqrt(l))):0;
 corridorX=ax+along*dx;corridorZ=az+along*dz;
}
function corridorDistance(unit:i32,index:i32,x:f64,z:f64):f64 {corridor(unit,index,x,z);return norm2(x-corridorX,z-corridorZ);}
// Talent lanes (written by talentEffects.ts): 18 mode bits, 30 damage-taken reduction, 31 damage-dealt bonus.
// Bits 0-1: 1 bonus vs marching targets, 2 vs garrisoned targets, 3 point-blank primary target.
// Bits 2-3: secondary splash multiplier .7/.5 instead of .35; bit 4: four secondary targets; bit 5: splash resistant.
function hit(source:i32,target:i32,multiplier:f64,close:bool):void {
 const mode=i32(u(source,18))&3;let bonus=u(source,31);
 if(mode==1){if(u(target,7)>=0)bonus+=.4;}else if(mode==2){if(u(target,7)<0)bonus+=.4;}else if(mode==3){if(close)bonus+=.5;}
 const amount=u(source,26)*multiplier*(1+bonus)*100/(100+u(target,28))*(1-u(target,30));setU(target,20,u(target,20)+amount);setU(target,21,u(source,1));
}
@inline function splashHitMultiplier(base:f64,target:i32):f64 {return base*((i32(u(target,18))&32)!=0?.4:1);}
function halt(unit:i32):void {
 setU(unit,19,i32(u(unit,19))|7);setU(unit,7,-1);setU(unit,9,-1);setU(unit,8,u(unit,6));setU(unit,11,-1);setU(unit,14,0);
}
function moveUnit(unit:i32):void {
 const x=u(unit,2),z=u(unit,3),owner=u(unit,1),range=u(unit,24),radius=u(unit,29),embarked=(i32(u(unit,14))&2)!=0;
 let cooldown=u(unit,10)>0?u(unit,10)-.05:0,enemy=-1,nearest=range*range;
 if(!embarked)for(let cx=firstCellX(x),right=lastCellX(x);cx<=right;cx++)for(let cz=firstCellZ(z),bottom=lastCellZ(z);cz<=bottom;cz++){
  const cell=cz*unitCols+cx;if(load<i32>(unitOwnerCells+usize(cell)*4)==i32(owner))continue;for(let at=i32(word(unitOffsets,cell)),end=i32(word(unitOffsets,cell+1));at<end;at++){
   const other=i32(word(unitMembers,at));if(u(other,1)==owner||(i32(u(other,14))&2)!=0)continue;
   const dx=x-u(other,2),dz=z-u(other,3),d=dx*dx+dz*dz;
   if(d<nearest||(d==nearest&&enemy>=0&&u(other,0)<u(enemy,0))){nearest=d;enemy=other;}
  }
 }
 if(enemy>=0){
  if(cooldown<=1e-9){
   hit(unit,enemy,1,nearest<=9);const splash=u(unit,27);
   if(splash>0){
    const ex=u(enemy,2),ez=u(enemy,3),mode=i32(u(unit,18)),wide=(mode&16)!=0,secondaryMode=(mode>>2)&3,secondary=secondaryMode==1?.7:secondaryMode==2?.5:.35;
    let first=-1,second=-1,third=-1,fourth=-1,firstDistance=Infinity,secondDistance=Infinity,thirdDistance=Infinity,fourthDistance=Infinity;
    for(let cx=firstCellX(ex),right=lastCellX(ex);cx<=right;cx++)for(let cz=firstCellZ(ez),bottom=lastCellZ(ez);cz<=bottom;cz++){
     const cell=cz*unitCols+cx;if(load<i32>(unitOwnerCells+usize(cell)*4)==i32(owner))continue;for(let at=i32(word(unitOffsets,cell)),end=i32(word(unitOffsets,cell+1));at<end;at++){
      const other=i32(word(unitMembers,at));if(other==enemy||u(other,1)==owner||(i32(u(other,14))&2)!=0)continue;
      const dx=u(other,2)-ex,dz=u(other,3)-ez;if(norm2(dx,dz)>splash)continue;const d=dx*dx+dz*dz;
      if(d<firstDistance||(d==firstDistance&&(first<0||u(other,0)<u(first,0)))){fourth=third;fourthDistance=thirdDistance;third=second;thirdDistance=secondDistance;second=first;secondDistance=firstDistance;first=other;firstDistance=d;}
      else if(d<secondDistance||(d==secondDistance&&(second<0||u(other,0)<u(second,0)))){fourth=third;fourthDistance=thirdDistance;third=second;thirdDistance=secondDistance;second=other;secondDistance=d;}
      else if(wide&&(d<thirdDistance||(d==thirdDistance&&(third<0||u(other,0)<u(third,0))))){fourth=third;fourthDistance=thirdDistance;third=other;thirdDistance=d;}
      else if(wide&&(d<fourthDistance||(d==fourthDistance&&(fourth<0||u(other,0)<u(fourth,0))))){fourth=other;fourthDistance=d;}
     }
    }
    if(first>=0)hit(unit,first,splashHitMultiplier(secondary,first),false);if(second>=0)hit(unit,second,splashHitMultiplier(secondary,second),false);
    if(wide){if(third>=0)hit(unit,third,splashHitMultiplier(secondary,third),false);if(fourth>=0)hit(unit,fourth,splashHitMultiplier(secondary,fourth),false);}
   }
   cooldown+=1/u(unit,25);
  }setU(unit,10,cooldown);return;
 }
 setU(unit,10,Math.max(0,cooldown));let currentX=x,currentZ=z;
 if(u(unit,11)<0&&!embarked){
  const center=usize(gm23),province=i32(u(unit,6)),dx=at(center,province*2)-x,dz=at(center,province*2+1)-z,d=norm2(dx,dz),step=Math.min(d,u(unit,22)*.05);
  const toX=d?x+dx/d*step:x,toZ=d?z+dz/d*step:z;let crowded=false;
  for(let cx=firstCellX(x),right=lastCellX(x);cx<=right&&!crowded;cx++)for(let cz=firstCellZ(z),bottom=lastCellZ(z);cz<=bottom&&!crowded;cz++){
   const cell=cz*unitCols+cx;for(let at=i32(word(unitOffsets,cell)),end=i32(word(unitOffsets,cell+1));at<end;at++){
    const other=i32(word(unitMembers,at));if(other==unit)continue;const after=norm2(toX-u(other,2),toZ-u(other,3));
    if(after<radius+u(other,29)-1e-6&&after<norm2(x-u(other,2),z-u(other,3))-1e-8){crowded=true;break;}
   }
  }
  if(!crowded&&kernelPointInProvince(province,toX,toZ)&&kernelLocalSegment(x,z,toX,toZ,-2)&&kernelBuildingSegment(x,z,toX,toZ,radius)&&kernelClearance(toX,toZ,radius,true)+1e-8>=kernelClearance(x,z,radius,true)){currentX=toX;currentZ=toZ;setU(unit,2,toX);setU(unit,3,toZ);}
 }
 const target=i32(u(unit,7));if(target<0)return;
 const provinceOwners=usize(gm24);
 if(u(unit,11)<0){if(load<i32>(provinceOwners+usize(target)*4)==i32(owner))halt(unit);return;}
 const index=i32(u(unit,13)),px=path(unit,index,0),pz=path(unit,index,1),sea=path(unit,index,2)!=0;let steerX=px,steerZ=pz,steering=false;
 if(!sea&&corridorDistance(unit,index,currentX,currentZ)>1e-6){
  corridor(unit,index,currentX,currentZ,1.2);let nextX=corridorX,nextZ=corridorZ;
  if(!kernelLocalSegment(currentX,currentZ,nextX,nextZ,-2)){corridor(unit,index,currentX,currentZ);nextX=corridorX;nextZ=corridorZ;}
  steerX=nextX;steerZ=nextZ;steering=true;
 }
 const dx=steerX-currentX,dz=steerZ-currentZ,d=norm2(dx,dz),goalDistance=norm2(px-currentX,pz-currentZ),move=Math.min(d,(sea?u(unit,23):u(unit,22))*.05);
 let nx=d?currentX+dx/d*move:steerX,nz=d?currentZ+dz/d*move:steerZ;
 if(steering){corridor(unit,index,nx,nz);if(!kernelLocalSegment(nx,nz,corridorX,corridorZ,-2)){
  corridor(unit,index,currentX,currentZ);const qx=corridorX-currentX,qz=corridorZ-currentZ,qd=norm2(qx,qz),step=Math.min(qd,u(unit,22)*.05);
  nx=qd?currentX+qx/qd*step:currentX;nz=qd?currentZ+qz/qd*step:currentZ;
 }}
 const last=index==i32(u(unit,12))-1,aheadScale=goalDistance?Math.min(5/goalDistance,1):0,aheadX=currentX+(px-currentX)*aheadScale,aheadZ=currentZ+(pz-currentZ)*aheadScale;
 let detour=!sea&&(!kernelBuildingSegment(currentX,currentZ,nx,nz,radius)||!kernelBuildingSegment(currentX,currentZ,aheadX,aheadZ,radius)),shadow=false;
 // Corridor steering must not step into a town's shadow: the house planner would
 // walk the unit straight back out on the next tick, forever. It plans this step too.
 if(!detour&&steering){
  const nextDistance=norm2(px-nx,pz-nz),nextScale=nextDistance?Math.min(5/nextDistance,1):0;
  shadow=detour=!kernelBuildingSegment(nx,nz,nx+(px-nx)*nextScale,nz+(pz-nz)*nextScale,radius);
 }
 if(detour){
  nativeBuildingStep(unit,px,pz,radius,move,last?target:-1);
  // Without a planned way past the town, the clear corridor step still beats standing still.
  if(!shadow||buildingX!=currentX||buildingZ!=currentZ){nx=buildingX;nz=buildingZ;}
 }
 const nearbyArrival=last&&!sea&&goalDistance<=2.3&&kernelPointInProvince(target,nx,nz);
 let nearbyWaypoint=false;
 if(!last&&!sea&&path(unit,index+1,2)==0&&goalDistance<=2.5){
  const waypointRadius=kernelBuildingSegment(px,pz,px,pz,radius)?1.2:2.5;
  if(goalDistance<=waypointRadius&&corridorDistance(unit,index+1,nx,nz)<=2.5){corridor(unit,index+1,nx,nz);nearbyWaypoint=kernelLocalSegment(nx,nz,corridorX,corridorZ,-2);}
 }
 const arrived=goalDistance<=move+1e-9||nearbyArrival||nearbyWaypoint,final=arrived&&last;
 setU(unit,2,nx);setU(unit,3,nz);const region=kernelProvinceAt(nx,nz);if(region>=0)setU(unit,6,region);
 if(sea){setU(unit,14,3);setU(unit,15,u(unit,8));setU(unit,16,target);setU(unit,17,index);}else{setU(unit,14,0);setU(unit,19,i32(u(unit,19))|2);}
 if(arrived&&(sea||nearbyArrival||nearbyWaypoint||norm2(nx-px,nz-pz)<=1e-6)){
  if(!nearbyArrival&&!nearbyWaypoint){setU(unit,2,px);setU(unit,3,pz);}setU(unit,13,index+1);
  if(!final&&path(unit,index+1,2)!=0){setU(unit,14,3);setU(unit,15,u(unit,8));setU(unit,16,target);setU(unit,17,index+1);}
  if(final){setU(unit,6,target);setU(unit,11,-1);setU(unit,14,0);setU(unit,19,i32(u(unit,19))|3);if(load<i32>(provinceOwners+usize(target)*4)==i32(owner))halt(unit);}
 }
}
export function prepareUnits(pointer:usize,n:i32,paths:usize,offsets:usize,members:usize,cols:i32,rows:i32,left:i32,top:i32,owners:usize):void {
 unitsBase=pointer;unitCount=n;pathBase=paths;unitOffsets=offsets;unitMembers=members;unitCols=cols;unitRows=rows;unitMinX=left;unitMinZ=top;unitOwnerCells=owners;
}
export function updateBattalions():void {for(let i=0;i<unitCount;i++)moveUnit(i);}

@external("host","sin") declare function hostSin(value:f64):f64;
@external("host","cos") declare function hostCos(value:f64):f64;
let buildingX:f64=0,buildingZ:f64=0;
const graphX:usize=31*1024*1024+64,graphZ:usize=graphX+66*8,graphCost:usize=graphZ+66*8,graphPrevious:usize=graphCost+66*8,graphDone:usize=graphPrevious+66*4,graphTowns:usize=graphDone+66*4;
function detourLegal(unit:i32,ax:f64,az:f64,bx:f64,bz:f64):bool {
 if(!kernelLocalSegment(ax,az,bx,bz,-2)||corridorDistance(unit,i32(u(unit,13)),bx,bz)>2.5)return false;
 corridor(unit,i32(u(unit,13)),bx,bz);return kernelLocalSegment(bx,bz,corridorX,corridorZ,-2);
}
function graphAdvance(x:f64,z:f64,toX:f64,toZ:f64,step:f64):void {
 const dx=toX-x,dz=toZ-z,d=norm2(dx,dz),f=d?Math.min(step/d,1):0;buildingX=x+dx*f;buildingZ=z+dz*f;
}
// Mirrors buildings.ts buildingStep, including the arrival region of a final leg.
function nativeBuildingStep(unit:i32,goalX:f64,goalZ:f64,radius:f64,step:f64,arrival:i32):void {
 const x=u(unit,2),z=u(unit,3),d=norm2(x-goalX,z-goalZ),scale=d?Math.min(5/d,1):0,targetX=x+(goalX-x)*scale,targetZ=z+(goalZ-z)*scale;
 const directDistance=norm2(x-goalX,z-goalZ),f=directDistance?Math.min(step/directDistance,1):0,directX=x+(goalX-x)*f,directZ=z+(goalZ-z)*f;
 const covered=!kernelBuildingSegment(targetX,targetZ,targetX,targetZ,radius),arriving=arrival>=0&&covered;
 if(!arriving&&(covered||kernelBuildingSegment(x,z,targetX,targetZ,radius))&&kernelBuildingSegment(x,z,directX,directZ,radius)&&detourLegal(unit,x,z,directX,directZ)){buildingX=directX;buildingZ=directZ;return;}
 const reach=radius+.5+gh10,size=gh7,minX=i32(gh3),minZ=i32(gh4),cols=i32(gh5),rows=i32(gh6);
 const left=i32(Math.floor((Math.min(x,targetX)-reach)/size))-minX,right=i32(Math.floor((Math.max(x,targetX)+reach)/size))-minX,top=i32(Math.floor((Math.min(z,targetZ)-reach)/size))-minZ,bottom=i32(Math.floor((Math.max(z,targetZ)+reach)/size))-minZ;
 let townCount=0;
 if(arriving){setWord(graphTowns,0,u32(arrival));townCount=1;}
 for(let cx=left;cx<=right&&townCount<4;cx++)for(let cz=top;cz<=bottom&&townCount<4;cz++){
  if(cx<0||cz<0||cx>=cols||cz>=rows)continue;const cell=cz*cols+cx,offsets=usize(gh2),ids=usize(gh1),provinces=usize(gh11);
  for(let i=i32(word(offsets,cell)),end=i32(word(offsets,cell+1));i<end&&townCount<4;i++){
   const house=i32(word(ids,i))/4,province=word(provinces,house);let exists=false;for(let j=0;j<townCount;j++)if(word(graphTowns,j)==province){exists=true;break;}if(!exists)setWord(graphTowns,townCount++,province);
  }
 }
 put(graphX,0,x);put(graphZ,0,z);put(graphX,1,targetX);put(graphZ,1,targetZ);let count=2;
 const centers=usize(gm23),r=.65+gh10+1.4142135623730951*radius+.12;
 for(let town=0;town<townCount;town++){
  const province=i32(word(graphTowns,town)),cx=at(centers,province*2),cz=at(centers,province*2+1);
  for(let i=0;i<16;i++){
   const angle=f64(i)*3.141592653589793/8,px=cx+hostCos(angle)*r,pz=cz+hostSin(angle)*r;
   if(kernelBuildingSegment(px,pz,px,pz,radius)){put(graphX,count,px);put(graphZ,count,pz);count++;}
  }
 }
 for(let i=0;i<count;i++){put(graphCost,i,Infinity);setWord(graphPrevious,i,u32(-1));setWord(graphDone,i,0);}put(graphCost,0,0);let found=-1;
 for(let k=0;k<count;k++){
  let current=-1;for(let i=0;i<count;i++)if(!word(graphDone,i)&&(current<0||at(graphCost,i)<at(graphCost,current)))current=i;
  if(current<0||!isFinite(at(graphCost,current)))break;if(graphReached(current,arriving,arrival,goalX,goalZ)){found=current;break;}setWord(graphDone,current,1);
  const ax=at(graphX,current),az=at(graphZ,current);
  for(let i=1;i<count;i++)if(!word(graphDone,i)){
   const bx=at(graphX,i),bz=at(graphZ,i),cost=at(graphCost,current)+norm2(ax-bx,az-bz);
   if(cost>=at(graphCost,i)-1e-8||!kernelBuildingSegment(ax,az,bx,bz,radius)||!detourLegal(unit,ax,az,bx,bz))continue;
   put(graphCost,i,cost);setWord(graphPrevious,i,u32(current));
  }
 }
 if(found>0){let index=found;while(i32(word(graphPrevious,index))>0)index=i32(word(graphPrevious,index));graphAdvance(x,z,at(graphX,index),at(graphZ,index),step);return;}
 if(arriving&&kernelBuildingSegment(x,z,directX,directZ,radius)&&detourLegal(unit,x,z,directX,directZ)){buildingX=directX;buildingZ=directZ;return;}
 buildingX=x;buildingZ=z;
}
// The local target, or on a final leg any detour node inside the arrival region near its center.
function graphReached(i:i32,arriving:bool,arrival:i32,goalX:f64,goalZ:f64):bool {
 if(i==1)return true;if(!arriving||i<2)return false;
 const x=at(graphX,i),z=at(graphZ,i);return norm2(x-goalX,z-goalZ)<=2.3&&kernelPointInProvince(arrival,x,z);
}
export function solveBattalionPhysics(tick:u32):void {
 // Units without a transport keep their start position in the idle transport lanes (17 = -1 marks it),
 // so the ground solver sees how far each marching body moved (engine.ts records the same).
 for(let i=0;i<unitCount;i++)if(u(i,14)==0){setU(i,15,u(i,2));setU(i,16,u(i,3));setU(i,17,-1);}
 updateBattalions();let n=0,minBX=Infinity,minBZ=Infinity,maxBX=-Infinity,maxBZ=-Infinity;
 const bodyUnits:usize=30*1024*1024;
 for(let i=0;i<unitCount;i++)if(u(i,4)-u(i,20)>0&&(i32(u(i,14))&2)==0){setWord(bodyUnits,n++,u32(i));const x=Math.floor(u(i,2)/1.24),z=Math.floor(u(i,3)/1.24);minBX=Math.min(minBX,x);maxBX=Math.max(maxBX,x);minBZ=Math.min(minBZ,z);maxBZ=Math.max(maxBZ,z);}
 let cap=16;while(cap<n)cap*=2;
 const left=n?i32(minBX)-2:0,top=n?i32(minBZ)-2:0,cols=n?i32(maxBX)-left+3:5,rows=n?i32(maxBZ)-top+3:5;
 prepare(n,cap,cols*rows,cols,left,top);
 for(let i=0;i<n;i++){
  const unit=i32(word(bodyUnits,i)),travel=u(unit,11)>=0,index=i32(u(unit,13)),meta=i*6;
  put(xs,i,u(unit,2));put(zs,i,u(unit,3));put(radii,i,u(unit,29));put(ids,i,u(unit,0));put(mobility,i,travel?.15:1);put(groundMeta,meta+1,travel?1:0);
  put(groundMeta,meta,!travel?u(unit,6):u(unit,17)==-1?motionAngle(u(unit,2)-u(unit,15),u(unit,3)-u(unit,16)):NaN);
  if(travel){put(groundMeta,meta+2,path(unit,index-1,0));put(groundMeta,meta+3,path(unit,index-1,1));put(groundMeta,meta+4,path(unit,index,0));put(groundMeta,meta+5,path(unit,index,1));}
 }
 solveGround(tick);
 for(let i=0;i<n;i++){
  const unit=i32(word(bodyUnits,i)),x=at(xs,i),z=at(zs,i);if(u(unit,2)==x&&u(unit,3)==z)continue;setU(unit,2,x);setU(unit,3,z);if(u(unit,11)>=0)setU(unit,6,kernelProvinceAt(x,z));
 }
}

export function provinceOwnersPointer():usize{return usize(gm24);}

export function collisionBodyCount():i32{return count;}


// Temporary arenas do not overlap collision, routes, or unit columns.
let segmentEpoch:u32=0;
const SEGMENT_SEEN:usize=10*1024*1024,SEGMENT_SPANS:usize=12*1024*1024;
@inline function spanSwap(a:i32,b:i32):void {
 const lo=at(SEGMENT_SPANS,a*2),hi=at(SEGMENT_SPANS,a*2+1);
 put(SEGMENT_SPANS,a*2,at(SEGMENT_SPANS,b*2));put(SEGMENT_SPANS,a*2+1,at(SEGMENT_SPANS,b*2+1));put(SEGMENT_SPANS,b*2,lo);put(SEGMENT_SPANS,b*2+1,hi);
}
function spanSort(left:i32,right:i32):void {
 let a=left,b=right;const mid=(left+right)>>1,lo=at(SEGMENT_SPANS,mid*2),hi=at(SEGMENT_SPANS,mid*2+1);
 while(a<=b){
  while(at(SEGMENT_SPANS,a*2)<lo||(at(SEGMENT_SPANS,a*2)==lo&&at(SEGMENT_SPANS,a*2+1)<hi))a++;
  while(at(SEGMENT_SPANS,b*2)>lo||(at(SEGMENT_SPANS,b*2)==lo&&at(SEGMENT_SPANS,b*2+1)>hi))b--;
  if(a<=b){spanSwap(a,b);a++;b--;}
 }
 if(left<b)spanSort(left,b);if(a<right)spanSort(a,right);
}
export function kernelTerrainSegment(ax:f64,az:f64,bx:f64,bz:f64,sea:bool):i32 {
 segmentEpoch++;if(segmentEpoch==0){memory.fill(SEGMENT_SEEN,0,2*1024*1024);segmentEpoch=1;}
 const size=segmentSize,minX=segmentMinX,minZ=segmentMinZ,cols=segmentCols,rows=segmentRows,left=max<i32>(0,i32(Math.floor(Math.min(ax,bx)/size))-minX),right=min<i32>(cols-1,i32(Math.floor(Math.max(ax,bx)/size))-minX),top=max<i32>(0,i32(Math.floor(Math.min(az,bz)/size))-minZ),bottom=min<i32>(rows-1,i32(Math.floor(Math.max(az,bz)/size))-minZ);
 const offsets=segmentOffsets,ids=segmentIds,surfaces=usize(gt1),planes=usize(gt0);let count=0;
 for(let x=left;x<=right;x++)for(let z=top;z<=bottom;z++){
  const cell=z*cols+x;
  for(let j=i32(word(offsets,cell)),end=i32(word(offsets,cell+1));j<end;j++){
   const id=i32(word(ids,j));if(word(SEGMENT_SEEN,id)==segmentEpoch||load<u8>(surfaces+usize(id))!=(sea?2:1))continue;setWord(SEGMENT_SEEN,id,segmentEpoch);
   const base=id*12,area=at(planes,base+2)*(at(planes,base+9)-at(planes,base+1))-at(planes,base+3)*(at(planes,base+8)-at(planes,base)),orientation:f64=area>=0?1:-1;let lo:f64=0,hi:f64=1;
   for(let k=0;k<3;k++){
    const p=base+k*4,x0=at(planes,p),z0=at(planes,p+1),dx=at(planes,p+2),dz=at(planes,p+3),c=orientation*(dx*(az-z0)-dz*(ax-x0)),d=orientation*(dx*(bz-z0)-dz*(bx-x0))-c;
    if(Math.abs(d)<1e-14){if(c< -1e-8){hi=-1;break;}}else{const along=(-1e-8-c)/d;if(d>0)lo=Math.max(lo,along);else hi=Math.min(hi,along);}
   }
   if(lo<=0&&hi>=1)return 1;
   if(lo<=hi&&hi>=0&&lo<=1){if(count>=65536)return -1;put(SEGMENT_SPANS,count*2,Math.max(0,lo));put(SEGMENT_SPANS,count*2+1,Math.min(1,hi));count++;}
  }
 }
 if(count>1)spanSort(0,count-1);let end:f64=0;
 for(let i=0;i<count;i++){if(at(SEGMENT_SPANS,i*2)>end+1e-8)return 0;end=Math.max(end,at(SEGMENT_SPANS,i*2+1));if(end>=1-1e-8)return 1;}return 0;
}

const PARTITION_PARENTS:usize=12*1024*1024,PARTITION_WEIGHTS:usize=13*1024*1024;
function partitionRoot(id:i32):i32 {while(id!=i32(word(PARTITION_PARENTS,id))){setWord(PARTITION_PARENTS,id,word(PARTITION_PARENTS,i32(word(PARTITION_PARENTS,id))));id=i32(word(PARTITION_PARENTS,id));}return id;}
function partitionUnion(a:i32,b:i32):void {
 a=partitionRoot(a);b=partitionRoot(b);if(a==b)return;
 if(word(PARTITION_WEIGHTS,a)<word(PARTITION_WEIGHTS,b)){const swap=a;a=b;b=swap;}
 setWord(PARTITION_PARENTS,b,u32(a));setWord(PARTITION_WEIGHTS,a,word(PARTITION_WEIGHTS,a)+word(PARTITION_WEIGHTS,b));
}
let partitionSplash:f64=0;
@inline function partitionPair(i:i32,other:i32):void {
 if(partitionRoot(i)==partitionRoot(other))return;
 const dx=Math.abs(u(i,2)-u(other,2)),dz=Math.abs(u(i,3)-u(other,3)),step=Math.max(u(i,22),u(i,23))*.05,otherStep=Math.max(u(other,22),u(other,23))*.05,collision=3.68+step+otherStep;
 if(dx<=collision&&dz<=collision){partitionUnion(i,other);return;}
 const range=u(i,1)!=u(other,1)?Math.max(u(i,24)+otherStep,u(other,24)+step):partitionSplash+step+otherStep;
 if(dx*dx+dz*dz<=range*range)partitionUnion(i,other);
}
function uniformCell(cell:i32):bool {
 const first=i32(word(unitOffsets,cell)),end=i32(word(unitOffsets,cell+1));if(first==end)return true;const root=partitionRoot(i32(word(unitMembers,first)));
 for(let j=first+1;j<end;j++)if(partitionRoot(i32(word(unitMembers,j)))!=root)return false;return true;
}
export function partitionBattalions():usize {
 let maxStep:f64=0,maxRange:f64=0;partitionSplash=0;
 for(let i=0;i<unitCount;i++){setWord(PARTITION_PARENTS,i,u32(i));setWord(PARTITION_WEIGHTS,i,1);partitionSplash=Math.max(partitionSplash,u(i,27));maxStep=Math.max(maxStep,Math.max(u(i,22),u(i,23))*.05);maxRange=Math.max(maxRange,u(i,24));}
 const reach=max<i32>(1,i32(Math.ceil(Math.max(Math.max(3.68+maxStep*2,maxRange+maxStep),partitionSplash+maxStep*2)/8)));
 // Connect each occupied cell first. Dense cells rapidly share one root.
 for(let cell=0;cell<unitCols*unitRows;cell++){
  const first=i32(word(unitOffsets,cell)),end=i32(word(unitOffsets,cell+1));let uniform=true;
  for(let j=first+1;j<end;j++){
   const unit=i32(word(unitMembers,j));
   for(let k=first;k<j;k++){partitionPair(unit,i32(word(unitMembers,k)));if(uniform&&partitionRoot(unit)==partitionRoot(i32(word(unitMembers,first))))break;}
   if(partitionRoot(unit)!=partitionRoot(i32(word(unitMembers,first))))uniform=false;
  }
 }
 for(let x=0;x<unitCols;x++)for(let z=0;z<unitRows;z++){
  const cell=z*unitCols+x,first=i32(word(unitOffsets,cell)),end=i32(word(unitOffsets,cell+1));if(first==end)continue;
  for(let dx=-reach;dx<=reach;dx++)for(let dz=-reach;dz<=reach;dz++){
   const nx=x+dx,nz=z+dz;if(nx<0||nz<0||nx>=unitCols||nz>=unitRows)continue;const otherCell=nz*unitCols+nx;if(otherCell<=cell)continue;
   const otherFirst=i32(word(unitOffsets,otherCell)),otherEnd=i32(word(unitOffsets,otherCell+1));if(otherFirst==otherEnd)continue;
   const uniform=uniformCell(cell)&&uniformCell(otherCell),a=i32(word(unitMembers,first)),b=i32(word(unitMembers,otherFirst));
   if(uniform&&partitionRoot(a)==partitionRoot(b))continue;
   let connected=false;
   for(let i=first;i<end&&!connected;i++)for(let j=otherFirst;j<otherEnd;j++){partitionPair(i32(word(unitMembers,i)),i32(word(unitMembers,j)));if(uniform&&partitionRoot(a)==partitionRoot(b)){connected=true;break;}}
  }
 }
 for(let i=0;i<unitCount;i++)setWord(PARTITION_PARENTS,i,u32(partitionRoot(i)));return PARTITION_PARENTS;
}

const OPEN_KEYS:usize=14*1024*1024,OPEN_FLAGS:usize=OPEN_KEYS+65536*4;
function freeGround(index:i32):bool {
 const cached=load<u8>(groundFreeTerrain+usize(index));if(cached!=2)return cached==1;
 const x=at(xs,index),z=at(zs,index),radius=at(radii,index),travel=at(groundMeta,index*6+1)!=0,cx=i32(Math.floor(x/4)),cz=i32(Math.floor(z/4));
 const code=radius<.49?0:radius<.55?1:radius<.59?2:radius<.61?3:4,key=((cz+4096)*8192+cx+4096)*16+code*2+i32(travel)+1;
 let slot=(key*-1640531535)&65535,probes=0;while(word(OPEN_KEYS,slot)!=0&&i32(word(OPEN_KEYS,slot))!=key){slot=(slot+1)&65535;if(++probes==65536){memory.fill(OPEN_KEYS,0,65536*4);slot=(key*-1640531535)&65535;break;}}
 let result:bool;if(word(OPEN_KEYS,slot)==0){const px=(f64(cx)+.5)*4,pz=(f64(cz)+.5)*4,safety=radius+.6+(travel?2.5:0)+2.8284271247461903+1e-5;result=kernelTerrainAt(px,pz,true)>=0&&kernelClearance(px,pz,safety,true)==safety;setWord(OPEN_KEYS,slot,u32(key));store<u8>(OPEN_FLAGS+usize(slot),u8(result));}else result=load<u8>(OPEN_FLAGS+usize(slot))!=0;
 store<u8>(groundFreeTerrain+usize(index),u8(result));return result;
}


let useNativeNorm:bool=false;
export function configureMath(nativeNorm:bool):void{useNativeNorm=nativeNorm;}
export function scaledNorm(x:f64,z:f64):f64 {
 const a=Math.abs(x),b=Math.abs(z);if(a==Infinity||b==Infinity)return Infinity;
 const scale=Math.max(a,b);if(scale==0||isNaN(scale))return scale;
 const nx=a/scale,nz=b/scale;return Math.sqrt(nx*nx+nz*nz)*scale;
}
@inline function norm2(x:f64,z:f64):f64{return useNativeNorm?scaledNorm(x,z):hypot2(x,z);}


let navNeighbors:usize=0,navCenters:usize=0,navLengths:usize=0,navCount:i32=0,navClock:u32=0;
let NAV_BASE:usize=0,NAV_META:usize=0;
const NAV_CAP:i32=65536;export let navigationCacheSlots:i32=32,navigationBuilds:i32=0;
export function configureNavigationCache(slots:i32):void{navigationCacheSlots=max<i32>(8,min<i32>(128,slots));}
export function reserveNavigationArena(end:usize):void {
 NAV_META=(end+65535)&~usize(65535);NAV_BASE=NAV_META+65536;navClock=0;
 const pages=i32(NAV_BASE>>16);if(pages>memory.size())memory.grow(pages-memory.size());memory.fill(NAV_META,0,65536);
}
export function setupNavigation(pointer:usize):void {navNeighbors=usize(at(pointer,0));navCenters=usize(at(pointer,1));navLengths=usize(at(pointer,2));navCount=i32(at(pointer,3));}
@inline function navMeta(slot:i32):usize{return NAV_META+usize(slot)*64;}
let navDistance:usize=0,navNext:usize=0,navSettled:usize=0,navHeapIds:usize=0,navHeapCosts:usize=0,navHeapLength:i32=0;
function heapPush(id:i32,cost:f64):bool {
 if(navHeapLength>=NAV_CAP)return false;let i=navHeapLength++;
 while(i>0){const p=(i-1)>>1,pc=at(navHeapCosts,p),pi=i32(word(navHeapIds,p));if(!(cost<pc||cost==pc&&id<pi))break;setWord(navHeapIds,i,u32(pi));put(navHeapCosts,i,pc);i=p;}setWord(navHeapIds,i,u32(id));put(navHeapCosts,i,cost);return true;
}
let navPoppedCost:f64=0;
function heapPop():i32 {
 const root=i32(word(navHeapIds,0));navPoppedCost=at(navHeapCosts,0);const length=--navHeapLength,id=i32(word(navHeapIds,length)),cost=at(navHeapCosts,length);
 if(length>0){let i=0;while(i*2+1<length){let c=i*2+1;if(c+1<length&&(at(navHeapCosts,c+1)<at(navHeapCosts,c)||(at(navHeapCosts,c+1)==at(navHeapCosts,c)&&word(navHeapIds,c+1)<word(navHeapIds,c))))c++;if(!(at(navHeapCosts,c)<cost||at(navHeapCosts,c)==cost&&i32(word(navHeapIds,c))<id))break;setWord(navHeapIds,i,word(navHeapIds,c));put(navHeapCosts,i,at(navHeapCosts,c));i=c;}setWord(navHeapIds,i,u32(id));put(navHeapCosts,i,cost);}return root;
}
function prepareNavLengths(id:i32,n:i32,slot:i32):void {
 const planes=usize(gt0);let ax:f64=0,az:f64=0,bx:f64=0,bz:f64=0,found=false;
 for(let k=0;k<3;k++){const p=id*12+k*4,x=at(planes,p),z=at(planes,p+1);for(let j=0;j<3;j++){const q=n*12+j*4;if(x==at(planes,q)&&z==at(planes,q+1)){if(!found){ax=x;az=z;found=true;}else{bx=x;bz=z;}break;}}}
 const mx=(ax+bx)/2,mz=(az+bz)/2;put(navLengths,slot*2,norm2(at(navCenters,id*2)-mx,at(navCenters,id*2+1)-mz));put(navLengths,slot*2+1,norm2(at(navCenters,n*2)-mx,at(navCenters,n*2+1)-mz));
}
export function navigationField(goal:i32,start:i32,sea:bool,landSpeed:f64,seaSpeed:f64,owner:i32):i32 {
 const dataSize=(usize(navCount)*13+7)&~usize(7),stride=dataSize+usize(NAV_CAP)*12;
 let slot=-1,oldest:u32=u32.MAX_VALUE,eviction=0;navClock++;
 for(let i=0;i<navigationCacheSlots;i++){const meta=navMeta(i);if(load<u32>(meta)!=0&&load<i32>(meta+4)==goal&&load<i32>(meta+8)==i32(sea)&&load<i32>(meta+32)==owner&&load<f64>(meta+16)==landSpeed&&load<f64>(meta+24)==seaSpeed){slot=i;break;}const age=load<u32>(meta);if(age<oldest){oldest=age;eviction=i;}}
 const initialize=slot<0;if(initialize)slot=eviction;const required=NAV_BASE+stride*usize(slot+1),pages=i32((required+65535)>>16);if(pages>memory.size())memory.grow(pages-memory.size());const meta=navMeta(slot),base=NAV_BASE+usize(slot)*stride;
 navDistance=base;navNext=base+usize(navCount)*8;navSettled=navNext+usize(navCount)*4;navHeapIds=base+dataSize;navHeapCosts=navHeapIds+usize(NAV_CAP)*4;
 if(initialize){
  navigationBuilds++;store<i32>(meta+32,owner);store<i32>(meta+4,goal);store<i32>(meta+8,i32(sea));store<f64>(meta+16,landSpeed);store<f64>(meta+24,seaSpeed);memory.fill(navSettled,0,usize(navCount));memory.fill(navNext,255,usize(navCount)*4);
  for(let i=0;i<navCount;i++)put(navDistance,i,Infinity);put(navDistance,goal,0);setWord(navNext,goal,u32(goal));navHeapLength=0;heapPush(goal,0);
 }else navHeapLength=load<i32>(meta+12);
 store<u32>(meta,navClock);
 if(load<u8>(navSettled+usize(start))!=0)return i32(navNext);
 const surfaces=usize(gt1);
 while(navHeapLength>0){
  const id=heapPop(),d=navPoppedCost;if(d>at(navDistance,id)+1e-9)continue;
  for(let k=0;k<3;k++){
   const edge=id*3+k,n=load<i32>(navNeighbors+usize(edge)*4);if(n<0||!sea&&load<u8>(surfaces+usize(n))!=1)continue;
   if(isNaN(at(navLengths,edge*2)))prepareNavLengths(id,n,edge);
   const nd=d+at(navLengths,edge*2)/(load<u8>(surfaces+usize(id))==2?seaSpeed:landSpeed)+at(navLengths,edge*2+1)/(load<u8>(surfaces+usize(n))==2?seaSpeed:landSpeed),old=at(navDistance,n);
   if(nd<old-1e-9){put(navDistance,n,nd);setWord(navNext,n,u32(id));if(!heapPush(n,nd)){store<u32>(meta,0);return -2;}}else if(Math.abs(nd-old)<=1e-9&&id<load<i32>(navNext+usize(n)*4))setWord(navNext,n,u32(id));
  }
  store<u8>(navSettled+usize(id),1);if(id==start)break;
 }
 store<i32>(meta+12,navHeapLength);return load<u8>(navSettled+usize(start))!=0?i32(navNext):-1;
}

let segmentOffsets:usize=0,segmentIds:usize=0,segmentSize:f64=8,segmentMinX:i32=0,segmentMinZ:i32=0,segmentCols:i32=0,segmentRows:i32=0;
export function setupSegments(pointer:usize):void{segmentOffsets=usize(at(pointer,0));segmentIds=usize(at(pointer,1));segmentSize=at(pointer,2);segmentMinX=i32(at(pointer,3));segmentMinZ=i32(at(pointer,4));segmentCols=i32(at(pointer,5));segmentRows=i32(at(pointer,6));}


const JOB_HEAP:usize=4*1024*1024,JOB_ORDER:usize=5*1024*1024,JOB_OFFSETS:usize=6*1024*1024,JOB_CURSOR:usize=JOB_OFFSETS+256,JOB_LOADS:usize=JOB_CURSOR+256,ROOT_JOBS:usize=13*1024*1024+512*1024;
@inline function heavier(a:i32,b:i32):bool{return word(PARTITION_WEIGHTS,a)>word(PARTITION_WEIGHTS,b)||(word(PARTITION_WEIGHTS,a)==word(PARTITION_WEIGHTS,b)&&a<b);}
export function assignPhysicsJobs(jobs:i32):usize {
 let length=0;
 for(let root=0;root<unitCount;root++)if(i32(word(PARTITION_PARENTS,root))==root){let i=length++;while(i>0){const p=(i-1)>>1,other=i32(word(JOB_HEAP,p));if(!heavier(root,other))break;setWord(JOB_HEAP,i,u32(other));i=p;}setWord(JOB_HEAP,i,u32(root));}
 memory.fill(JOB_LOADS,0,usize(jobs)*4);memory.fill(JOB_OFFSETS,0,usize(jobs+1)*4);
 while(length>0){
  const root=i32(word(JOB_HEAP,0)),last=i32(word(JOB_HEAP,--length));if(length>0){let i=0;while(i*2+1<length){let c=i*2+1;if(c+1<length&&heavier(i32(word(JOB_HEAP,c+1)),i32(word(JOB_HEAP,c))))c++;if(!heavier(i32(word(JOB_HEAP,c)),last))break;setWord(JOB_HEAP,i,word(JOB_HEAP,c));i=c;}setWord(JOB_HEAP,i,u32(last));}
  let target=0;for(let j=1;j<jobs;j++)if(word(JOB_LOADS,j)<word(JOB_LOADS,target))target=j;setWord(JOB_LOADS,target,word(JOB_LOADS,target)+word(PARTITION_WEIGHTS,root));setWord(ROOT_JOBS,root,u32(target));
 }
 for(let i=0;i<unitCount;i++){const job=i32(word(ROOT_JOBS,i32(word(PARTITION_PARENTS,i))));setWord(JOB_OFFSETS,job+1,word(JOB_OFFSETS,job+1)+1);}
 for(let j=1;j<=jobs;j++)setWord(JOB_OFFSETS,j,word(JOB_OFFSETS,j)+word(JOB_OFFSETS,j-1));memory.copy(JOB_CURSOR,JOB_OFFSETS,usize(jobs)*4);
 for(let i=0;i<unitCount;i++){const job=i32(word(ROOT_JOBS,i32(word(PARTITION_PARENTS,i)))),at=i32(word(JOB_CURSOR,job));setWord(JOB_ORDER,at,u32(i));setWord(JOB_CURSOR,job,u32(at+1));}return JOB_ORDER;
}
export function physicsJobOffsetsPointer():usize{return JOB_OFFSETS;}

export function unitCensus(provinces:i32,players:i32):usize {
 const counts:usize=56*1024*1024,occupants=counts+usize((players+1)*provinces)*4,nearOwner=occupants+usize(provinces)*4,engineers=nearOwner+usize(provinces)*4;
 if(engineers+usize(provinces)>64*1024*1024)return 0;
 memory.fill(counts,0,usize((players+1)*provinces)*4+usize(provinces)*4);memory.fill(engineers,0,usize(provinces));for(let p=0;p<provinces;p++)store<i32>(nearOwner+usize(p)*4,-2);
 const centers=usize(gm23);
 for(let i=0;i<unitCount;i++){
  if(u(i,4)-u(i,20)<=0||(i32(u(i,14))&2)!=0)continue;const p=i32(u(i,6)),owner=i32(u(i,1));if(p<0||p>=provinces)continue;
  setWord(occupants,p,word(occupants,p)+1);const cell=(owner+1)*provinces+p;setWord(counts,cell,word(counts,cell)+1);
  if(norm2(u(i,2)-at(centers,p*2),u(i,3)-at(centers,p*2+1))>=3.7)continue;
  const previous=load<i32>(nearOwner+usize(p)*4);if(previous==-2)store<i32>(nearOwner+usize(p)*4,owner);else if(previous!=owner)store<i32>(nearOwner+usize(p)*4,-3);
  if(u(i,5)==1)store<u8>(engineers+usize(p),1);
 }return counts;
}
export function blockedBuildings(pointer:usize,n:i32,out:usize):i32 {
 let count=0;for(let i=0;i<n;i++){const x=at(pointer,i*3),z=at(pointer,i*3+1),radius=at(pointer,i*3+2);if(radius>=0&&!kernelBuildingSegment(x,z,x,z,radius))setWord(out,count++,u32(i));}return count;
}


export function buildUnitIndex(pointer:usize,n:i32,paths:usize,includeEmbarked:bool):bool {
 let minX=Infinity,minZ=Infinity,maxX=-Infinity,maxZ=-Infinity;
 for(let i=0;i<n;i++){const x=Math.floor(at(pointer,i*32+2)/8),z=Math.floor(at(pointer,i*32+3)/8);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minZ=Math.min(minZ,z);maxZ=Math.max(maxZ,z);}
 const cols=i32(maxX-minX+1),rows=i32(maxZ-minZ+1);if(cols<=0||rows<=0||f64(cols)*f64(rows)>1000000)return false;
 const cells=cols*rows,offsets=pointer+usize(n)*256,members=offsets+usize(cells+1)*4,cursor=members+usize(n)*4,owners=cursor+usize(cells)*4;if(owners+usize(cells)*4>56*1024*1024)return false;
 memory.fill(offsets,0,usize(cells+1)*4);for(let cell=0;cell<cells;cell++)store<i32>(owners+usize(cell)*4,i32.MIN_VALUE);
 for(let i=0;i<n;i++)if(includeEmbarked||(i32(at(pointer,i*32+14))&2)==0){const cell=(i32(Math.floor(at(pointer,i*32+3)/8))-i32(minZ))*cols+i32(Math.floor(at(pointer,i*32+2)/8))-i32(minX),owner=i32(at(pointer,i*32+1)),previous=load<i32>(owners+usize(cell)*4);setWord(offsets,cell+1,word(offsets,cell+1)+1);if(previous==i32.MIN_VALUE)store<i32>(owners+usize(cell)*4,owner);else if(previous!=owner)store<i32>(owners+usize(cell)*4,i32.MAX_VALUE);}
 for(let cell=1;cell<=cells;cell++)setWord(offsets,cell,word(offsets,cell)+word(offsets,cell-1));memory.copy(cursor,offsets,usize(cells)*4);
 for(let i=0;i<n;i++)if(includeEmbarked||(i32(at(pointer,i*32+14))&2)==0){const cell=(i32(Math.floor(at(pointer,i*32+3)/8))-i32(minZ))*cols+i32(Math.floor(at(pointer,i*32+2)/8))-i32(minX),where=i32(word(cursor,cell));setWord(members,where,u32(i));setWord(cursor,cell,u32(where+1));}
 prepareUnits(pointer,n,paths,offsets,members,cols,rows,i32(minX),i32(minZ),owners);return true;
}


export function packPhysicsJob(job:i32,out:usize):i32 {
 const start=i32(word(JOB_OFFSETS,job)),end=i32(word(JOB_OFFSETS,job+1));for(let i=start;i<end;i++)memory.copy(out+usize(i-start)*256,unitsBase+usize(word(JOB_ORDER,i))*256,256);return end-start;
}
export function unpackPhysicsJob(job:i32,input:usize):void {
 const start=i32(word(JOB_OFFSETS,job)),end=i32(word(JOB_OFFSETS,job+1));for(let i=start;i<end;i++)memory.copy(unitsBase+usize(word(JOB_ORDER,i))*256,input+usize(i-start)*256,256);
}

export function spawnNeighbors(x:f64,z:f64,out:usize):i32 {
 let found:i32=0;for(let i=0;i<unitCount;i++)if(u(i,4)-u(i,20)>0&&(i32(u(i,14))&2)==0&&Math.abs(u(i,2)-x)<9&&Math.abs(u(i,3)-z)<9){setWord(out,found,u32(i));found++;}return found;
}
