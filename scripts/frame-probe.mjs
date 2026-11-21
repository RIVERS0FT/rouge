// Instrumentation shared by development probes and the optional benchmark build.
export function installProbe(WorldRenderer,mapUnitsWithShips,stages,drawOnly){
  const update=WorldRenderer.prototype.update;
  window.__frameProbe={active:false,frames:[],updates:[],stages:{},stats:[],longTasks:[],gpuEvents:[],instance:null,mapUnitsWithShips};
  const probe=window.__frameProbe;
  new PerformanceObserver(list=>{if(probe.active)for(const e of list.getEntries())probe.longTasks.push(e.duration);}).observe({type:'longtask',buffered:false});
  function wrap(target,key,label){const original=target[key];target[key]=function(...args){const t=performance.now();try{return original.apply(this,args);}finally{if(probe.active)(probe.stages[label]??=[]).push(performance.now()-t);}};}
  if(!drawOnly)for(const name of ['drawLabels','drawMapNames'])wrap(WorldRenderer.prototype,name,name);
  if(stages)for(const name of ['drawArmyPlaques','drawBattleBadges','drawBuildings'])wrap(WorldRenderer.prototype,name,name);
  WorldRenderer.prototype.update=function(...args){
   if(!probe.instance){
    probe.instance=this;const original=this.frame,self=this;
    const gl=self.renderer.getContext(),timer=!window.__disableGpuQueries&&gl.getExtension('EXT_disjoint_timer_query_webgl2'),pending=[];
    this.frame=function(time){const rev=self.renderRevision,t=performance.now();if(probe.active)self.renderer.info.reset();
     if(timer)for(let i=pending.length-1;i>=0;i--){const {query,label,epoch,issuedAt,target}=pending[i];if(gl.getQueryParameter(query,gl.QUERY_RESULT_AVAILABLE)){
      if(probe.active&&epoch===probe.epoch&&!gl.getParameter(timer.GPU_DISJOINT_EXT)){
       const duration=gl.getQueryParameter(query,gl.QUERY_RESULT)/1e6;(probe.stages[label]??=[]).push(duration);probe.gpuEvents.push({label,issuedAt,duration,target});
      }
      gl.deleteQuery(query);pending.splice(i,1);
     }}
     original(time);
     if(probe.active&&self.renderRevision!==rev){probe.frames.push({time,duration:performance.now()-t});probe.stats.push({...self.renderer.info.render});}
    };
    self.renderer.info.autoReset=false;
    if(stages)wrap(this.routeLayer,'flush','routeFlush');
    if(!drawOnly){wrap(this.renderer,'render','threeRender');wrap(this.coastShadow,'renderMask','coastMask');wrap(this.politicalTint,'render','politicalTint');}
    if(timer){const render=this.renderer.render;this.renderer.render=function(scene,...args){
     if(!probe.active)return render.call(this,scene,...args);
     const query=gl.createQuery(),output=this.getRenderTarget(),label=scene===self.scene?(output?'gpuBackgroundMs':'gpuMainMs'):scene===self.coastShadow.maskScene?'gpuCoastMs':'gpuPoliticalMs';
     const issuedAt=performance.now(),target=output?{width:output.width,height:output.height,viewport:output.viewport.toArray(),scissor:output.scissorTest?output.scissor.toArray():null}:null;
     gl.beginQuery(timer.TIME_ELAPSED_EXT,query);try{return render.call(this,scene,...args);}finally{gl.endQuery(timer.TIME_ELAPSED_EXT);pending.push({query,label,epoch:probe.epoch,issuedAt,target});}
    };}
   }
   const t=performance.now();try{return update.apply(this,args);}finally{if(probe.active)probe.updates.push(performance.now()-t);}
  };
 }
