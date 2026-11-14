import fontUrl from '../assets/noto-serif-sc-bold.woff2?url';

/** Local OFL font, shared by layout, SVG fallback and canvas glyph masks. */
export const countryFont=fetch(fontUrl,{cache:'force-cache'}).then(async response=>{
 if(!response.ok)throw new Error('countryFontUnavailable');
 const data=await response.arrayBuffer(),font=new FontFace('ROUGE Country Serif',data,{weight:'700'});
 await font.load();document.fonts.add(font);
 return true;
}).catch(()=>null);
