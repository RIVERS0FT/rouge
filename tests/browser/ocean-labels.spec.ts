import {openMapSearch} from './map-search.ts';
import {test,expect} from '@playwright/test';

test('ocean labels are italic in both languages while land labels stay upright',async({page})=>{
 test.setTimeout(180000);
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>{
  localStorage.setItem('rouge.language','zh');
  const original=CanvasRenderingContext2D.prototype.fillText;
  const labels:{name:string;font:string;differsFromUpright:boolean}[]=[];
  Object.assign(window,{__mapLabelDraws:labels});
  CanvasRenderingContext2D.prototype.fillText=function(text,x,y,maxWidth){
   if(maxWidth===undefined)original.call(this,text,x,y);else original.call(this,text,x,y,maxWidth);
   if(this.canvas.width!==512||this.canvas.height!==96||maxWidth!==490)return;
   // Compare the actual ocean texture with an upright rendering. This also
   // catches missing synthetic italics in CJK fallback fonts.
   let differsFromUpright=false;
   if(this.font.startsWith('italic ')){
    const upright=document.createElement('canvas');upright.width=512;upright.height=96;
    const context=upright.getContext('2d')!;context.textAlign=this.textAlign;
    context.font=this.font.replace(/italic\s+/, '');context.fillStyle=this.fillStyle;
    original.call(context,text,x,y,maxWidth);
    const actual=this.getImageData(0,0,512,96).data,normal=context.getImageData(0,0,512,96).data;
    differsFromUpright=actual.some((value,index)=>value!==normal[index]);
   }
   labels.push({name:text,font:this.font,differsFromUpright});
  };
 });
 await page.goto('/');
 await expect(page.locator('canvas[data-ready="true"]')).toBeVisible({timeout:30000});
 await page.getByTestId('single-player').click();await page.getByTestId('begin-campaign').click();
 await expect(page.locator('.app')).toHaveAttribute('data-local-ready','true',{timeout:30000});
 const canvas=page.locator('.world canvas');await canvas.focus();await page.keyboard.press('Space');
 await expect(page.getByTestId('toggle-pause')).toHaveText('▶');
 // The atlas covers (rather than fits) the viewport. At 1440x960 the Pacific
 // and Arctic labels are correctly outside the viewport's label-safe area.
 const visibleOceanNames={zh:['大西洋','印度洋'],en:['ATLANTIC','INDIAN OCEAN']};
 for(const language of ['zh','en','zh'] as const){
  await page.getByTestId('open-settings').click();
  await page.getByRole('button',{name:language==='zh'?'简体中文':'English',exact:true}).click();
  await page.getByTestId('settings-resume').click();
  await canvas.focus();await page.keyboard.press('Home');
  await expect(canvas).toHaveAttribute('data-settled','true',{timeout:20000});
  await expect.poll(()=>page.evaluate(names=>{
   const labels=(window as any).__mapLabelDraws as {name:string;font:string;differsFromUpright:boolean}[];
   return names.every(name=>labels.some(label=>label.name===name&&label.font.startsWith('italic ')&&label.differsFromUpright));
  },visibleOceanNames[language])).toBe(true);
  await page.screenshot({path:`artifacts/ocean-labels-${language}.png`});
  await openMapSearch(page);await page.getByTestId('map-search').fill(language==='zh'?'江苏':'Jiangsu');
  await page.locator('.map-search-results button').first().click();
  await canvas.focus();await page.keyboard.press('End');
  await expect(canvas).toHaveAttribute('data-settled','true',{timeout:20000});
  const province=page.locator('.province-label:visible').filter({hasText:language==='zh'?'江苏':'Jiangsu'}).first();
  await expect(province).toBeVisible();await expect(province).toHaveCSS('font-style','normal');
 }
 expect(errors).toEqual([]);
});
