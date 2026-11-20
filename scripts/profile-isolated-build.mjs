import {chromium} from '@playwright/test';

export async function measureIsolatedBuild(url,snapshot,steps=1200){
 const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined});
 try{
  const page=await browser.newPage();
  await page.route('**/__isolated',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Simulation</title>'}));
  await page.goto(url+'/__isolated');
  return await page.evaluate(async({state,steps})=>{
   const manifest=await (await fetch('/benchmark-build.json')).json();
   const {workerUrl,applyLocalFrame}=await import('/'+manifest.isolated);
   const worker=new Worker(workerUrl,{type:'module'}),frames=[];
   return new Promise((resolve,reject)=>{
    let current=null,start=0;
    const fail=error=>{clearTimeout(timeout);worker.terminate();reject(error);};
    const timeout=setTimeout(()=>fail(Error('Fixed tick replay timed out')),600000);
    worker.onerror=e=>fail(Error(e.message));
    worker.onmessage=({data})=>{
     try{
      if(data.type==='ready'){worker.postMessage({type:'init',state,__benchmark:{pausedStart:true}});return;}
      if(data.type==='error')throw Error(data.error);
      if(data.type!=='local')return;
      const arrived=performance.timeOrigin+performance.now();
      current=applyLocalFrame(current,data);
      const applied=performance.timeOrigin+performance.now();
      if(!start){
       if(current.tick!==state.tick)throw Error('Incorrect start tick');
       worker.postMessage({type:'pause',value:true});
       worker.postMessage({type:'benchmarkStopAt',tick:state.tick+steps});
       start=applied;worker.postMessage({type:'pause',value:false});return;
      }
      frames.push({...data.__timing,arrived,applied});
      if(current.tick<state.tick+steps)return;
      if(current.tick!==state.tick+steps)throw Error('Incorrect end tick');
      clearTimeout(timeout);worker.terminate();
      resolve({startTick:state.tick,endTick:current.tick,elapsedMs:applied-start,ticksPerSecond:steps*1000/(applied-start),frames});
     }catch(error){fail(error);}
    };
   });
  },{state:snapshot.state,steps});
 }finally{await browser.close();}
}
