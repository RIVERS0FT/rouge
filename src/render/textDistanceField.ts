/** Exact squared Euclidean distance transform, linear in the number of texels. */
function transform(data:Float64Array,width:number,height:number){
 const size=Math.max(width,height),f=new Float64Array(size),d=new Float64Array(size),v=new Int32Array(size),z=new Float64Array(size+1);
 const line=(n:number)=>{
  let k=0;v[0]=0;z[0]=-Infinity;z[1]=Infinity;
  for(let q=1;q<n;q++){
   let s=((f[q]+q*q)-(f[v[k]]+v[k]*v[k]))/(2*q-2*v[k]);
   while(s<=z[k]&&k>0){k--;s=((f[q]+q*q)-(f[v[k]]+v[k]*v[k]))/(2*q-2*v[k]);}
   k++;v[k]=q;z[k]=s;z[k+1]=Infinity;
  }
  k=0;for(let q=0;q<n;q++){while(z[k+1]<q)k++;d[q]=(q-v[k])**2+f[v[k]];}
 };
 for(let x=0;x<width;x++){for(let y=0;y<height;y++)f[y]=data[y*width+x];line(height);for(let y=0;y<height;y++)data[y*width+x]=d[y];}
 for(let y=0;y<height;y++){for(let x=0;x<width;x++)f[x]=data[y*width+x];line(width);for(let x=0;x<width;x++)data[y*width+x]=d[x];}
}

/** Positive inside ink. Retain fractional coverage at the original glyph edge. */
export function textDistanceField(alpha:Uint8Array,width:number,height:number,spread=8):Uint8Array{
 if(width<1||height<1||width*height!==alpha.length||!(spread>0))throw new Error('invalidTextMask');
 const outer=new Float64Array(alpha.length),inner=new Float64Array(alpha.length);
 for(let i=0;i<alpha.length;i++){
  const a=alpha[i]/255;outer[i]=a===0?1e12:Math.max(0,.5-a)**2;inner[i]=a===1?1e12:Math.max(0,a-.5)**2;
 }
 transform(outer,width,height);transform(inner,width,height);
 const result=new Uint8Array(alpha.length);
 for(let i=0;i<alpha.length;i++)result[i]=Math.round(Math.max(0,Math.min(255,128+(Math.sqrt(inner[i])-Math.sqrt(outer[i]))*127/spread)));
 return result;
}
