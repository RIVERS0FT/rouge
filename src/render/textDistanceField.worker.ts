import {textDistanceField} from './textDistanceField.ts';
import fontUrl from '../assets/noto-serif-sc-bold.woff2?url';
const fontReady=fetch(fontUrl,{cache:'force-cache'}).then(response=>response.arrayBuffer()).then(async data=>{
 const font=new FontFace('ROUGE Country Serif',data,{weight:'700'});await font.load();
 (self as unknown as {fonts:FontFaceSet}).fonts.add(font);
}).catch(()=>{/* Same system-serif fallback as the document. */});
let work=Promise.resolve();
self.onmessage=({data}:{data:{key:string;glyphs:{text:string;x:number;y:number;angle:number}[];font:string;scale:number;width:number;height:number}})=>{work=work.then(async()=>{
 await fontReady;
 const canvas=new OffscreenCanvas(data.width,data.height),ctx=canvas.getContext('2d',{willReadFrequently:true})!;
 ctx.scale(data.scale,data.scale);ctx.font=data.font;ctx.fillStyle='white';
 for(const glyph of data.glyphs){ctx.save();ctx.translate(glyph.x,glyph.y);ctx.rotate(glyph.angle);ctx.fillText(glyph.text,0,0);ctx.restore();}
 const rgba=ctx.getImageData(0,0,data.width,data.height).data,alpha=new Uint8Array(data.width*data.height);
 for(let i=0;i<alpha.length;i++)alpha[i]=rgba[i*4+3];
 const pixels=textDistanceField(alpha,data.width,data.height,16);
 self.postMessage({key:data.key,pixels,width:data.width,height:data.height},{transfer:[pixels.buffer]});
}).catch(()=>{self.postMessage({key:data.key,error:true});});};
