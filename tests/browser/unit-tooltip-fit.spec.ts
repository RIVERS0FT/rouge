import {test,expect} from '@playwright/test';
import {waitForRuntime} from './readiness.ts';

for(const [width,height] of [[1190,1017],[1440,960],[1280,720],[390,844],[360,640],[844,390]]){
 test(`all unit attributes fit without tooltip scrolling at ${width}x${height}`,async({page})=>{
  await page.setViewportSize({width,height});
  await page.goto('/');await waitForRuntime(page);
  for(const language of ['简体中文','English']){
   await page.getByRole('button',{name:language,exact:true}).click();
   await page.getByTestId('single-player').click();
   for(const kind of ['infantry','cavalry','artillery','engineer','skirmisher','grenadier','heavyCavalry','horseArtillery']){
    await page.getByTestId(`choose-unit-${kind}`).click();
    const tooltip=page.getByTestId(`unit-tooltip-${kind}`);
    await expect(tooltip).toBeVisible();
    const layout=await tooltip.evaluate(el=>{
     const rect=el.getBoundingClientRect();
     return {top:rect.top,left:rect.left,right:rect.right,bottom:rect.bottom,scrollHeight:el.scrollHeight,clientHeight:el.clientHeight,scrollWidth:el.scrollWidth,clientWidth:el.clientWidth,
      visibleStats:[...el.querySelectorAll('.unit-attribute')].filter(stat=>{const box=stat.getBoundingClientRect();return box.top>=rect.top&&box.bottom<=rect.bottom;}).length};
    });
    expect(layout.visibleStats).toBe(9);
    expect(layout.scrollHeight).toBeLessThanOrEqual(layout.clientHeight);
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth);
    expect(layout.top).toBeGreaterThanOrEqual(12);expect(layout.left).toBeGreaterThanOrEqual(12);
    expect(layout.right).toBeLessThanOrEqual(width-12);expect(layout.bottom).toBeLessThanOrEqual(height-12);
    if(kind==='heavyCavalry')await page.screenshot({path:`artifacts/unit-tooltip-full-${language==='English'?'en':'zh'}-${width}x${height}.png`});
    await page.keyboard.press('Escape');
   }
   await page.keyboard.press('Escape');
  }
 });
}
