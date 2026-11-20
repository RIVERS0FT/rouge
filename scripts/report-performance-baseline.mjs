import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {parseArgs} from 'node:util';
import {dirname,relative,resolve} from 'node:path';

const {values}=parseArgs({options:{input:{type:'string'},output:{type:'string'},'raw-dir':{type:'string'}}});
if(!values.input||!values.output)throw Error('Provide --input=<matrix JSON> and --output=<Markdown report>');
const matrix=JSON.parse(await readFile(values.input,'utf8'));
const percentile95=xs=>[...xs].sort((a,b)=>a-b)[Math.ceil(xs.length*.95)-1];
const phases=['march','bottleneck','landing','battle'];
for(const r of matrix.results){
 const late=r.scenario==='late2d'||r.scenario==='late3d';
 if(!r.valid||!values['raw-dir']||(!r.collisions&&!late&&!['fixed-worker','input','touch','soak'].includes(r.scenario)))continue;
 const bytes=await readFile(resolve(values['raw-dir'],r.raw??r.file));
 if(createHash('sha256').update(bytes).digest('hex')!==r.rawSha256)throw Error('Raw window hash mismatch: '+r.scenario+' '+r.variant+' '+r.round);
 const data=JSON.parse(bytes);
 if(late){
  const samples=data.results[0].stateSamples;
  const first=samples[0];
  let last=first;
  for(const sample of samples){
   if(sample.units<24000||sample.units>26000)break;
   last=sample;
  }
  const elapsedMs=last.elapsedMs-first.elapsedMs;
  if(elapsedMs>0)r.initialLoad={elapsedMs,first,last,
   fps:(last.draws-first.draws)*1000/elapsedMs,ticksPerSecond:(last.tick-first.tick)*1000/elapsedMs};
 }else if(r.scenario==='soak'){
  for(const [i,minute] of r.minutes.entries()){
   const samples=data.results[i].stateSamples;
   for(const field of ['units','visibleUnits']){
    const values=samples.map(s=>s[field]);minute[field]=[Math.min(...values),Math.max(...values)];
   }
   minute.mode=samples[0].mode;
  }
 }else if(r.scenario==='touch'){
  r.gestures=['pan','pinch'].map(kind=>{
   const samples=data.inputs.filter(e=>e.kind===kind),confirmed=samples.filter(e=>e.ok);
   return {kind,count:samples.length,confirmed:confirmed.length,p95Ms:percentile95(confirmed.map(e=>e.ms))};
  });
 }else if(r.scenario==='input'){
  for(const [kind,g] of Object.entries(r.groups)){
   const samples=data.inputs.filter(e=>e.kind===kind&&e.ok);
   g.domP95Ms=percentile95(samples.map(e=>e.domEventMs).filter(Number.isFinite));
   g.drawWaitP95Ms=percentile95(samples.map(e=>e.drawWaitMs).filter(Number.isFinite));
  }
 }else if(r.scenario==='fixed-worker'){
  const frames=data.frames,steps=frames.flatMap(f=>f.steps??[]);
  const summarize=xs=>xs.length?{mean:xs.reduce((sum,x)=>sum+x,0)/xs.length,p95:percentile95(xs)}:null;
  r.worker={scheduleDelayMs:summarize(steps.map(s=>s.stepStart-s.intended)),computeMs:summarize(steps.map(s=>s.stepFinish-s.stepStart)),
   encodeMs:summarize(frames.map(f=>f.sent-f.encodeStart)),deliveryMs:summarize(frames.map(f=>f.arrived-f.sent)),applyMs:summarize(frames.map(f=>f.applied-f.arrived))};
 }else{
  const window=data.results.at(-1),samples=window.stateSamples,steps=window.workerFrames.flatMap(f=>f.steps??[]);
  if(steps.length!==1200||steps.some((s,i)=>!s.collision||s.tick!==r.initialTick+i+1))throw Error('Incomplete per-tick collision trace: '+r.scenario+' '+r.variant+' '+r.round);
  r.cappedTicks={candidates:steps.filter(s=>s.collision.limited>0).length,constraints:steps.filter(s=>s.collision.constraintLimited>0).length};
  r.formationRanges=phases.map(phase=>{
   const counts=samples.map(s=>s.formations[phase]);return [Math.min(...counts),Math.max(...counts)];
  });
 }
}
const labels={real2d:'真实后期 2D',real3d:'真实后期密集 3D',active2d:'活跃玩家 2D',active3d:'活跃玩家 3D',
 map3d:'纯地图 3D',ai2d:'全图 100 AI 2D',ai3d:'全图 100 AI 3D','fixed-worker':'固定步数 Worker','fixed-2d':'固定步数 2D','fixed-3d':'固定步数 3D',
 double2d:'2× 2D',double3d:'2× 3D',input:'鼠标与键盘',touch:'移动尺寸触控',soak:'30 分钟长局',lan:'局域网双客户端',late2d:'后期约 2.5 万 · 2D',late3d:'后期约 2.5 万 · 3D',
 march:'分散行军',bottleneck:'窄路汇流',landing:'集中登陆',battle:'多军交战'};
const names={select:'选择',drag:'拖出派遣预览',dispatch:'释放与确认派遣',wheel:'滚轮缩放',to2d:'切入 2D',to3d:'切回 3D'};
const label=id=>labels[id]??((labels[id.split('-')[0]]??id)+' · '+id.split('-')[1]+' 支编队');
const f=x=>Number.isFinite(x)?x.toFixed(2):'—';
const speed=r=>r?[f(r.fps),f(r.ticksPerSecond)].join(' / '):'待测';
const latency=r=>r?[f(r.p95GapMs),f(r.maxGapMs)].join(' / '):'待测';
const decision=r=>!r?'待测':!r.valid?'样本无效':r.passed===false?'未达标':r.passed===true?'达标':'对照项';
const valid=matrix.results.filter(r=>r.valid).length;
const version=row=>row.variant==='before'?'冻结版':'集成版';
const tableRow=cells=>'| '+cells.join(' | ')+' |';
const range=xs=>xs?.length===2?(xs[0]===xs[1]?String(xs[0]):xs.join('–')):'—';
const variants=Object.keys(matrix.builds).length;
const planned=variants*matrix.selected.reduce((count,id)=>count+(id==='soak'?1:matrix.rounds),0);
const extra=variants*Object.values(matrix.comparisons).reduce((count,v)=>count+v.extraPairs,0);
const settled=matrix.complete||matrix.results.length>=planned+extra&&Object.keys(matrix.comparisons).length>0;
const status=matrix.measurementStatus?.stopped?'本次测量已停止，整体验收未通过。':matrix.accepted?'整体验收通过。':settled?'本次运行结束，整体验收未通过。':'矩阵尚未完成。';
const lines=['# 集成生产构建实测','','本报告按原始窗口配对。显示精度为两位小数，验收使用未舍入的数据。'+
 '基础轮次计划 '+planned+' 个窗口。'+(extra?'扩展复测追加 '+extra+' 个。':'')+'已记录 '+matrix.results.length+' 个窗口，其中 '+valid+' 个满足样本条件。'+status,'',
 '2D 和纯地图的目标为 60 FPS，P95 帧间隔 ≤33 ms。运行中 3D 的目标为 30 FPS，P95 ≤67 ms。核心画面窗口的最长帧均须 ≤200 ms，运行中的 1× 时钟须在同一窗口达到 20 tick/s，允许发布边界相差 2 tick。纯地图保持暂停。真实密集战区至少 90% 的采样点须有 180 个可见单位。','',
 '后期约 2.5 万单位的正式窗口要求所有逐秒采样点有 23,750–26,250 个单位。2× 模拟的理论步频为 40 tick/s。联机回退检查覆盖服务端步频及两端各自的帧率和指令往返；触控分别检查平移和双指缩放。','',
 '| 场景 | 轮次 | 冻结版 FPS / tick/s | 集成版 FPS / tick/s | 冻结版 P95 / 最长帧（ms） | 集成版 P95 / 最长帧（ms） | 冻结 / 集成 |',
 '|---|---:|---:|---:|---:|---:|---|'];
for(const id of matrix.selected){
 const rows=matrix.results.filter(r=>r.scenario===id);
 for(const round of [...new Set(rows.map(r=>r.round))].sort((a,b)=>a-b)){
  const row=variant=>rows.find(r=>r.round===round&&r.variant===variant),before=row('before'),after=row('after');
  lines.push('| '+[label(id),round,speed(before),speed(after),latency(before),latency(after),decision(before)+' / '+decision(after)].join(' | ')+' |');
 }
 if(!rows.length)lines.push('| '+label(id)+' | — | 待测 | 待测 | — | — | 待测 |');
}
const fixed=matrix.results.filter(r=>r.scenario.startsWith('fixed-')&&r.valid);
if(fixed.length){
 lines.push('','## 同一段 1,200 tick 的耗时','',
  '| 场景 | 轮次 | 版本 | 墙钟（秒） | tick/s |','|---|---:|---|---:|---:|');
 for(const r of fixed)lines.push(tableRow([label(r.scenario),r.round,version(r),f(r.elapsedMs/1000),f(r.ticksPerSecond)]));
}
const workload=matrix.results.filter(r=>r.units);
if(workload.length){
 lines.push('','<details><summary>各窗口的实际负载与时钟</summary>','',
  '| 场景 | 轮次 | 版本 | 总单位 | 可见模型 | 存活 AI | 起止 tick | 墙钟（秒） | 空白页 Hz¹ |',
  '|---|---:|---|---:|---:|---:|---|---:|---:|');
 for(const r of workload)lines.push(tableRow([label(r.scenario),r.round,version(r),range(r.units),range(r.visibleUnits),range(r.activeAI),
  r.initialTick+' → '+r.endTick,f(r.elapsedMs/1000),f(r.refreshHz)]));
 lines.push('','¹ 取测试前后两次空白页校准的较低值。','</details>');
}
const initialLoads=matrix.results.filter(r=>r.initialLoad);
if(initialLoads.length){
 lines.push('','## 后期存档开局的实际负载','',
  '从预热期的首个逐秒采样点起，连续取总单位数在 24,000–26,000 之间的采样点。下表记录该短时段内实际绘帧和模拟进度。预热后的 60 秒表现及其单位数范围见上表。','',
  '| 场景 | 轮次 | 版本 | 起止单位数 | 起止 tick | 墙钟（秒） | FPS | tick/s |','|---|---:|---|---:|---|---:|---:|---:|');
 for(const r of initialLoads){
  const {first,last,elapsedMs,fps,ticksPerSecond}=r.initialLoad;
  lines.push(tableRow([label(r.scenario),r.round,version(r),first.units+' → '+last.units,first.tick+' → '+last.tick,f(elapsedMs/1000),f(fps),f(ticksPerSecond)]));
 }
}
const stages=matrix.results.filter(r=>r.worker);
if(stages.length){
 lines.push('','<details><summary>模拟和快照各阶段耗时</summary>','',
  '表中每格为均值 / P95，单位为毫秒。调度延迟从预定开步时刻计起。2× 的一次调度连续推进两步，计算耗时覆盖两步。编码、投递和应用按快照计。','',
  '| 场景 | 轮次 | 版本 | 调度延迟 | 模拟计算 | 快照编码 | 消息投递 | 主线程应用 |','|---|---:|---|---:|---:|---:|---:|---:|');
 for(const r of stages)lines.push(tableRow([label(r.scenario),r.round,version(r),...['scheduleDelayMs','computeMs','encodeMs','deliveryMs','applyMs'].map(k=>f(r.worker[k]?.mean)+' / '+f(r.worker[k]?.p95))]));
 lines.push('','</details>');
}
const pressure=matrix.results.filter(r=>r.collisions);
if(pressure.length){
 lines.push('','<details><summary>编队压力与碰撞</summary>','',
  '候选、接触、触及搜索上限的次数、约束尝试和耗尽约束预算的单位数均取每步均值。最大穿透取四遍求解中观测到的最高值。末两列给出 1,200 个连续 tick 中出现预算耗尽的步数。','',
  '| 场景 | 轮次 | 版本 | 候选检查 | 接触 | 搜索限次 | 约束尝试 | 约束耗尽单位 | 最大穿透 | 搜索耗尽步数 | 约束耗尽步数 |','|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|');
 for(const r of pressure)lines.push(tableRow([label(r.scenario),r.round,version(r),
  ...['candidates','contacts','limited','constraints','constraintLimited'].map(k=>f(r.collisions[k]?.mean)),f(r.collisions.maxPenetration?.max),r.cappedTicks?.candidates??'—',r.cappedTicks?.constraints??'—']));
 const formations=pressure.filter(r=>r.formationRanges);
 if(formations.length){
  lines.push('','采样点内处于各阶段的编队数范围如下。','',
   '| 场景 | 轮次 | 版本 | 行军 | 阻塞 | 等待登陆 | 交战 |','|---|---:|---|---:|---:|---:|---:|');
  for(const r of formations)lines.push(tableRow([label(r.scenario),r.round,version(r),...r.formationRanges.map(range)]));
 }
 lines.push('','</details>');
}
const inputRows=matrix.results.filter(r=>r.groups||Number.isFinite(r.p95InputMs));
if(inputRows.length){
 lines.push('','## 操作反馈','','| 场景与动作 | 轮次 | 版本 | 有效操作数 | 首次反馈或往返 P95（ms） | 确认或稳定 P95（ms） |','|---|---:|---|---:|---:|---:|');
 for(const row of inputRows){
  const version=row.variant==='before'?'冻结版':'集成版';
  if(row.gestures){for(const g of row.gestures)lines.push(tableRow([g.kind==='pan'?'触控平移':'双指缩放',row.round,version,g.confirmed+' / '+g.count,f(g.p95Ms),'—']));}
  else if(row.groups){for(const [kind,g] of Object.entries(row.groups))lines.push('| '+[names[kind],row.round,version,g.verified+' / '+g.samples,f(g.p95Ms),f(g.p95SettledMs)].join(' | ')+' |');}
  else lines.push('| '+[label(row.scenario),row.round,version,row.valid?'60':'见原始记录',f(row.p95InputMs),'—'].join(' | ')+' |');
 }
 const inputs=inputRows.filter(r=>r.groups&&Object.values(r.groups).some(g=>Number.isFinite(g.domP95Ms)));
 if(inputs.length){
  lines.push('','<details><summary>输入到达页面与画面响应的分段 P95</summary>','',
   '两个分位数分别计算，首个正确反馈的总时长以上表为准。','',
   '| 动作 | 轮次 | 版本 | 事件到达页面（ms） | 到达后等到正确画面（ms） |','|---|---:|---|---:|---:|');
  for(const r of inputs)for(const [kind,g] of Object.entries(r.groups))lines.push(tableRow([names[kind],r.round,version(r),f(g.domP95Ms),f(g.drawWaitP95Ms)]));
  lines.push('','</details>');
 }
}
const missed=matrix.results.filter(r=>r.variant==='after'&&r.valid&&r.passed===false);
if(missed.length){
 lines.push('','## 集成版未达门槛的窗口','','| 场景 | 轮次 | 未达门槛的指标 |','|---|---:|---|');
 for(const r of missed){
  const reasons=[];
  if(r.groups){
   for(const [kind,g] of Object.entries(r.groups)){
    if(g.samples!==g.verified)reasons.push(names[kind]+'确认 '+g.verified+'/'+g.samples);
    if(g.p95Ms>150)reasons.push(names[kind]+' P95 '+f(g.p95Ms)+' ms');
   }
  }else{
   const target=r.scenario==='map3d'||r.scenario.endsWith('2d')?60:30;
   if(!r.refreshEligible)reasons.push('空白页 '+f(r.refreshHz)+' Hz');
   if(r.fps<target)reasons.push('实际绘制 '+f(r.fps)+' FPS');
   if(!r.clockPassed)reasons.push('模拟 '+f(r.ticksPerSecond)+' tick/s');
   if(r.p95GapMs>(target===60?33:67))reasons.push('P95 帧间隔 '+f(r.p95GapMs)+' ms');
   if(r.maxGapMs>200)reasons.push('最长帧 '+f(r.maxGapMs)+' ms');
  }
  lines.push(tableRow([label(r.scenario),r.round,reasons.join('，')]));
 }
}
const lan=matrix.results.filter(r=>r.clients);
if(lan.length){
 lines.push('','## 双端联机','','| 轮次 | 版本 | 客户端 | FPS | 已确认指令 | 指令往返 P95（ms） | 服务端 tick/s | 客户端重连 |',
  '|---:|---|---|---:|---:|---:|---:|---|');
 for(const r of lan)r.clients.forEach((c,i)=>lines.push(tableRow([r.round,version(r),i===0?'房主':'加入者',f(c.fps),c.commands,f(c.p95CommandMs),f(r.ticksPerSecond),r.reconnected?'成功':'失败'])));
}
const soaks=matrix.results.filter(r=>r.minutes);
if(soaks.length){
 lines.push('','## 长局与读档','');
 if(soaks.some(r=>r.refreshChanged))lines.push('本组跨越了显示刷新条件变化，整局 FPS 和 tick/s 无法作同条件比较。逐分钟原始结果及存读档核对保留如下。','');
 for(const r of soaks){
  const auto=r.saves.filter(s=>s.method==='auto'&&s.ok);
  lines.push('### '+version(r),'','冷载入可玩耗时 '+f(r.coldLoadMs)+' ms，手动档重载耗时 '+f(r.reloadMs)+' ms。存入 tick '+r.manualTick+'，恢复 tick '+r.restoredTick+'。旧 Worker 已关闭 '+r.closedWorkers+' / '+r.priorWorkers+'，读档后派遣'+(r.postLoadCommand?'成功':'失败')+'。',
   ...(r.blankRefreshHz?['','空白页校准从 '+f(r.blankRefreshHz[0])+' Hz 到 '+f(r.blankRefreshHz[1])+' Hz。']:[]),
   '','成功自动保存 '+auto.length+' 次。手动存档界面帧间隔 P95 / 最大值为 '+f(r.manualUi?.rafP95Ms)+' / '+f(r.manualUi?.rafMaxMs)+' ms。','',
   '| 分钟 | 视角 | 总单位 | 可见模型 | FPS | tick/s | 帧间隔 P95 / 最大值（ms） | 主线程堆（MiB） |','|---:|---|---:|---:|---:|---:|---:|---:|');
  r.minutes.forEach((m,i)=>lines.push(tableRow([i+1,m.mode?.toUpperCase()??'—',range(m.units),range(m.visibleUnits),f(m.fps),f(m.ticksPerSecond),latency(m),f(r.heapBytes[i]/1048576)])));
  lines.push('','<details><summary>逐次存档耗时与同时段绘帧</summary>','',
   '| 类型 | 保存 tick | 写入结果 | 写入耗时（ms） | 同时段绘帧 P95 / 最大值（ms） |','|---|---:|---|---:|---:|');
  for(const save of r.saves){
   const windows=save.method==='auto'?(r.autosaveFrames??[]).filter(s=>s.tick===save.tick&&s.drawIntervals>0):[];
   lines.push(tableRow([save.method==='auto'?'自动':'手动',save.tick,save.ok?'成功':'失败',f(save.elapsedMs),
    windows.length?windows.map(s=>latency(s)).join('，'):'—']));
  }
  lines.push('','同时段绘帧按采样窗口列出，手动操作的界面停顿见上方帧间隔。','</details>');
 }
}
const invalid=matrix.results.filter(r=>!r.valid);
if(invalid.length){
 lines.push('','## 无效窗口','','| 场景 | 轮次 | 版本 | 原因 |','|---|---:|---|---|');
 for(const r of invalid)lines.push(tableRow([label(r.scenario),r.round,version(r),String(r.error||r.failedChecks?.join('、')||'样本条件未通过，详见原始记录').replaceAll('|','／').replaceAll('\n',' ')]));
}
const comparisons=Object.entries(matrix.comparisons);
if(comparisons.length){
 lines.push('','## 扩展场景配对中位数','','负数表示相对冻结版改善，正数表示恶化。','','| 场景 | 指标 | 冻结版 | 集成版 | 恶化（%） | 追加配对数 |','|---|---|---:|---:|---:|---:|');
 const metricNames={fps:'绘制 FPS',ticksPerSecond:'模拟 tick/s',p95GapMs:'帧间隔 P95（ms）',p95InputMs:'反馈 P95（ms）',hostFps:'房主 FPS',guestFps:'加入者 FPS',hostRttMs:'房主指令往返 P95（ms）',
  guestRttMs:'加入者指令往返 P95（ms）',panP95Ms:'触控平移 P95（ms）',pinchP95Ms:'双指缩放 P95（ms）'};
 for(const [id,c] of comparisons)for(const [key,m] of Object.entries(c.metrics)){
  lines.push('| '+[label(id),metricNames[key]??key,f(m.before),f(m.after),f(m.regression*100),c.extraPairs].join(' | ')+' |');
 }
}
const source=relative(dirname(resolve(values.output)),resolve(values.input)).replaceAll('\\','/');
lines.push('','各窗口的构建和存档哈希、兵力范围及 Worker 分段耗时见[逐窗数据]('+encodeURI(source)+')。','');
await writeFile(values.output+'.tmp',lines.join('\n'));
await rename(values.output+'.tmp',values.output);
