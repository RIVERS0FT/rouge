import {chromium} from '@playwright/test';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export async function measureLanBuild(root,dist,snapshot){
 const module=p=>import(pathToFileURL(resolve(root,p)));
 const [{createLanServer},{Engine},{MAP_ID,LAN_RULES_ID}]=await Promise.all([module('server/lan.ts'),module('src/game/engine.ts'),module('src/game/content.ts')]);
 const host=createLanServer({dist}),headers={'Content-Type':'application/json','X-Rouge-Map':MAP_ID,'X-Rouge-Rules':LAN_RULES_ID};
 await new Promise(ok=>host.server.listen(0,'127.0.0.1',ok));
 const url='http://127.0.0.1:'+host.server.address().port;
 const browsers=[];
 try{
  const create=async(path,name)=>{
   const res=await fetch(url+'/api/rooms'+path,{method:'POST',headers,body:JSON.stringify({setup:{name,leader:'warden',loadout:['infantry']}})});
   if(!res.ok)throw Error('LAN setup failed '+res.status);return res.json();
  };
  const first=await create('','Host'),second=await create('/'+first.code+'/join','Guest');
  const room=host.rooms.get(first.code),state=structuredClone(snapshot.state);
  state.players[1].ai=false;
  room.engine=new Engine(state);
  // Keep both clients on the same initial tick while their maps load.
  const step=room.engine.step;
  room.engine.step=()=>{};
  const pages=[];
  for(const ticket of [first,second]){
   const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding']});
   browsers.push(browser);
   const page=await browser.newPage({viewport:{width:1510,height:1090},deviceScaleFactor:1.25});
   page.setDefaultTimeout(90000);
   await page.addInitScript(ticket=>{
    localStorage.setItem('rouge.language','en');sessionStorage.setItem('rouge.ticket.ne-admin1-groups.v1',JSON.stringify(ticket));
    window.__benchmarkSettings={drawOnly:true};window.__disableGpuQueries=true;
   },ticket);
   await page.goto(url);await page.getByTestId('resume-lan').click();await page.getByTestId('game-clock').waitFor();
   await page.waitForFunction(c=>window.__frameProbe?.instance?.state?.campaign===c,state.campaign);
   pages.push(page);
  }
  const started=performance.now(),startTick=room.engine.state.tick;
  room.engine.step=step;
  const clients=await Promise.all(pages.map((page,index)=>page.evaluate(async({index,headers,ticket})=>{
   const probe=window.__frameProbe,r=probe.instance,start=performance.now(),origin=r.focus.x,commandMs=[];
   const gl=r.renderer.getContext(),info=gl.getExtension('WEBGL_debug_renderer_info');
   const environment={gpu:gl.getParameter(info?info.UNMASKED_RENDERER_WEBGL:gl.RENDERER),dpr:r.renderer.getPixelRatio(),width:innerWidth,height:innerHeight,userAgent:navigator.userAgent};
   const measurement=new Promise(resolve=>{
    probe.frames=[];probe.active=true;const startTick=r.state.tick;
    function sample(t){
     if(t-start>=60000){
      probe.active=false;resolve({elapsedMs:t-start,frames:probe.frames.length,fps:probe.frames.length*1000/(t-start),startTick,endTick:r.state.tick});return;
     }
     r.mapInput.dispatch({type:'pan',x:origin+Math.sin((t-start)/800)*35,z:r.desiredFocusZ});
     requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
   });
   for(let i=0;i<30;i++){
    await new Promise(ok=>setTimeout(ok,1000));
    const province=r.state.provinces.find(p=>p.owner===index);
    if(!province)throw Error('LAN seat eliminated during sample');
    const start=performance.now(),res=await fetch('/api/rooms/'+ticket.code+'/command',{method:'POST',headers:{...headers,Authorization:'Bearer '+ticket.token},body:JSON.stringify({command:{type:'production',province:province.id,kind:r.state.players[index].loadout[0]}})});
    if(!(await res.json()).ok)throw Error('LAN command rejected');
    commandMs.push(performance.now()-start);
   }
   return {...await measurement,commandMs,environment};
  },{index,headers,ticket:[first,second][index]})));
  const elapsedMs=performance.now()-started,endTick=room.engine.state.tick;
  await pages[1].reload();await pages[1].getByTestId('resume-lan').click();
  await pages[1].waitForFunction(c=>window.__frameProbe?.instance?.state?.campaign===c,state.campaign);
  return {startTick,endTick,elapsedMs,ticksPerSecond:(endTick-startTick)*1000/elapsedMs,clients,reconnected:room.streams.size===2};
 }finally{for(const browser of browsers)await browser.close();await host.close();}
}
