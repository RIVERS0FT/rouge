import {test,expect} from '@playwright/test';
import {waitForRuntime} from './readiness.ts';

test('refresh and a new tab reuse versioned maps even with map downloads blocked',async({page,context})=>{
 test.setTimeout(180000);
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/');await waitForRuntime(page,60000);
 const keys=await page.evaluate(async()=>{const cache=await caches.open('rouge-map-assets-v1');return(await cache.keys()).map(key=>key.url);});
 expect(keys).toHaveLength(2);expect(keys.every(url=>{const asset=new URL(url);return asset.pathname.endsWith('.json')&&/^[a-f0-9]+$/.test(asset.searchParams.get('v')??'');})).toBe(true);
 let requests=0;
 await context.route(/\/(?:world|terrain-navigation)(?:-[A-Za-z0-9_-]+)?\.json(?:\?|$)/,route=>{if(route.request().resourceType()!=='fetch')return route.continue();requests++;return route.abort();});
 await page.reload();await waitForRuntime(page,60000);
 expect(requests).toBe(0);
 const tab=await context.newPage();await tab.goto('/');await waitForRuntime(tab,60000);
 expect(requests).toBe(0);
 await tab.getByTestId('single-player').click();await tab.getByTestId('begin-campaign').click();
 await expect(tab.locator('.app')).toHaveAttribute('data-local-ready','true',{timeout:60000});
 await expect(tab.getByTestId('game-clock')).toBeVisible();
 expect(requests).toBe(0);expect(errors).toEqual([]);
});
