import {test,expect,type Page} from '@playwright/test';
import {execFileSync} from 'node:child_process';
const fixture=JSON.parse(execFileSync(process.execPath,['--experimental-strip-types','tests/create-dispatch-fixture.mjs'],{encoding:'utf8',maxBuffer:16*1024*1024}));
async function load(page:Page){
 const styles=['style','menu','hud','panels','dialogs','compact','flag-cloth'];
 await page.route('**/calendar-harness',route=>route.fulfill({contentType:'text/html',body:styles.map(name=>`<link rel="stylesheet" href="/src/ui/${name}.css">`).join('')+'<div id="root"></div>'}));await page.goto('/calendar-harness');
 await page.evaluate(async fixture=>{
  const {default:refresh}=await import('/@react-refresh');refresh.injectIntoGlobalHook(window);(window as any).$RefreshReg$=()=>{};(window as any).$RefreshSig$=()=>((type:any)=>type);
  const {default:React}=await import('/node_modules/.vite/deps/react.js'),{default:ReactDOM}=await import('/node_modules/.vite/deps/react-dom_client.js');
  const {Clock}=await import('/src/ui/hud/Clock.tsx'),{TopBar}=await import('/src/ui/hud/TopBar.tsx'),{FieldDispatches}=await import('/src/ui/FieldDispatches.tsx');
  const state=JSON.parse(JSON.parse(fixture.saves[0].value).body),root=ReactDOM.createRoot(document.querySelector('#root')!);
  (window as any).calendarRender=(tick:number,language:'zh'|'en')=>{
   const h=React.createElement,clock=h(Clock,{tick,language,solo:true,paused:true,speed:1,network:'connected',onPause:()=>{},onSpeed:()=>{},actions:h(React.Fragment,null,h('button',{className:'clock-action','data-testid':'calendar-search'},'⌕'),h('button',{className:'clock-action','data-testid':'calendar-settings'},'⚙'))});
   root.render(h('div',{className:'app is-game','data-input-device':'touch','data-layout':innerWidth<=800?'compact':'wide'},h(TopBar,{state:{...state,tick},actor:0,owned:1,language,onTalents:()=>{},clock}),h('aside',{className:'strategic-panel mobile-panel-open',id:'strategic-panel'},h(FieldDispatches,{events:tick>=120060?state.events:[],players:state.players,language}))));
  };(window as any).calendarRender(0,'zh');
 },fixture);
}
test('campaign dates start in year 1 and income tooltips use daily values in both languages',async({page})=>{
 test.setTimeout(90000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await load(page);
 const clock=page.getByTestId('game-clock');await expect(clock).toBeInViewport();await expect(clock).toHaveText('1年1月1日');await expect(clock).toHaveAttribute('datetime','0001-01-01');
 await expect(page.locator('.resource-delta')).toContainText('/日');await page.locator('.resource-treasury').focus();await expect(page.getByRole('tooltip')).toContainText('每日净收益');await expect(page.getByRole('tooltip')).toContainText('军费');
 await page.evaluate(()=>(window as any).calendarRender(20,'zh'));await expect(clock).toHaveText('1年1月2日');
 await page.evaluate(()=>(window as any).calendarRender(120060,'en'));await expect(clock).toHaveText('9 Jun 17');
 await expect(page.locator('.dispatch-time')).toHaveText(['8 Jun 17','7 Jun 17','7 Jun 17','6 Jun 17']);
 await expect(page.locator('.resource-delta')).toContainText('/day');await page.locator('.resource-treasury').focus();await expect(page.getByRole('tooltip')).toContainText('Net daily income');await expect(page.getByRole('tooltip')).toContainText('Upkeep');
 await page.screenshot({path:'artifacts/calendar-en-desktop.png'});expect(errors).toEqual([]);
});
test('calendar dates and actions fit phone and desktop widths',async({page})=>{
 test.setTimeout(90000);await load(page);
 for(const width of [320,390,844,1440]){
  await page.setViewportSize({width,height:844});await page.evaluate(()=>(window as any).calendarRender(120060,'zh'));await expect(page.getByTestId('game-clock')).toBeInViewport();await expect(page.getByTestId('game-clock')).toHaveText('17年6月9日');
  const layout=await page.evaluate(()=>{
   const clock=document.querySelector('.hud-clock')!.getBoundingClientRect(),date=document.querySelector('[data-testid="game-clock"]')!.getBoundingClientRect();
   const ledger=document.querySelector('.hud-ledger')!.getBoundingClientRect();
   return {inside:clock.left>=0&&clock.right<=innerWidth,dateInside:date.left>=clock.left&&date.right<=clock.right,ledgerVisible:ledger.width>=44,overflow:document.documentElement.scrollWidth>innerWidth};
  });expect(layout).toEqual({inside:true,dateInside:true,ledgerVisible:true,overflow:false});
  await page.screenshot({path:`artifacts/calendar-zh-${width}.png`});
 }
});
