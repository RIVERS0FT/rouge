import {StartMenu,storedLanguage,type StartAction} from './StartMenu.tsx';
import {UnitAttributes,UnitSelection} from './UnitSelection.tsx';
import {TerritoryPanel} from './TerritoryPanel.tsx';
import {TerritoryManagement} from './TerritoryManagement.tsx';
import {InputDeviceTracker,type PointerIntent} from './inputDevice.ts';
import {talentSelectionStatus} from './talentSelection.ts';
import {LeaderBust,preloadPortraits} from './LeaderBust.tsx';
import {loadSetupPreferences,saveSetupPreferences} from './setupPreferences.ts';
import {makeAISetups,getSpawnCapacity} from '../game/spawns.ts';
import { FlagEditor, FlagImage } from './Flag.tsx';
import type { Flag } from '../game/flags.ts';
import {useEffect,useMemo,useRef,useState} from 'react';
import {createGame,isEliminated} from '../game/engine.ts';
import {MAP,PLAYABLE_COUNT,searchProvinces} from '../game/map.ts';
import {LEADERS,STATS,stats,upgradeCost} from '../game/content.ts';
import {listSaves,readSave,writeSave,deleteSave,encodeSave,decodeSave,MAX_SAVE_BYTES,type SaveInfo} from '../game/save.ts';
import type {GameState,Kind,Leader,Command,Result,PlayerSetup} from '../game/types.ts';
import {localSession,preloadLocalSession,remoteSession,createRoom,joinRoom,configureRoom,api,type Session,type Ticket,type RoomInfo} from '../platform/session.ts';
import {factionColor,factionTextColor} from '../game/factionColors.ts';
import {WorldRenderer} from '../render/WorldRenderer.ts';
import {World} from './World.tsx';
import {FactionIdentity, CommanderPortrait} from './CommanderHud.tsx';
import {t,timeLabel,playerName,type Language} from './i18n.ts';
import {ModalDialog} from './ModalDialog.tsx';
function initialRegion(state:GameState,actor:number):number{
 const occupied=new Set(state.units.filter(u=>u.owner===actor&&u.target===null&&!u.transport?.embarked).map(u=>u.province));
 return state.provinces.find(p=>p.owner===actor&&occupied.has(p.id))?.id??state.provinces.find(p=>p.owner===actor)?.id??0;
}
function storedTicket():Ticket|null{try{const x=JSON.parse(sessionStorage.getItem('rouge.ticket.ne-admin1-groups.v1')??'null');return x&&typeof x.code==='string'&&typeof x.token==='string'&&Number.isInteger(x.actor)?x:null;}catch{return null;}}
const SYMBOLS:Record<string,string>={infantry:'Ⅰ',cavalry:'Ⅱ',artillery:'Ⅲ',engineer:'Ⅳ',skirmisher:'Ⅴ',grenadier:'Ⅵ',heavyCavalry:'Ⅶ',horseArtillery:'Ⅷ',warden:'▱',vanguard:'↗',steward:'◇'};
export function App({initialAction=null,initialFocus=null,initialLanguage}:{initialAction?:StartAction|null;initialFocus?:string|null;initialLanguage?:Language}={}){
 const[inputDevice,setInputDevice]=useState<'touch'|'mouse'>('mouse');
 const[mobilePanel,setMobilePanel]=useState<'province'|'intel'|null>(null);
 const[mapQuery,setMapQuery]=useState('');
 const[language,setLanguage]=useState<Language>(initialLanguage??storedLanguage),[screen,setScreen]=useState<'menu'|'game'|'lobby'>('menu');
 const[modal,setModal]=useState<'setupSolo'|'setupLan'|'playerLeader'|'playerFlag'|'saves'|'upgrades'|'talents'|'settings'|'territories'|null>(initialAction==='settingsSaves'?'settings':initialAction==='resumeLan'?null:initialAction);
 const[spectating,setSpectating]=useState(false);
 const[localStarting,setLocalStarting]=useState(false);
 const[pendingTalent,setPendingTalent]=useState<string|null>(null);
 const[settingsPage,setSettingsPage]=useState<'general'|'saves'>(initialAction==='settingsSaves'?'saves':'general');
 const[game,setGame]=useState<GameState|null>(null),[actor,setActor]=useState(0),[selected,setSelected]=useState(0);
 const[preferences]=useState(()=>loadSetupPreferences());
 const[soloAICount,setSoloAICount]=useState('2'),[roomAICount,setRoomAICount]=useState('0');
 const[lobbyAI,setLobbyAI]=useState('0');
 const factionCapacity=useMemo(()=>getSpawnCapacity(),[]);
 const validCount=(value:string,min:number,max:number)=>/^\d+$/.test(value)&&Number.isSafeInteger(Number(value))&&Number(value)>=min&&Number(value)<=max;
 const[leader,setLeader]=useState<Leader>(preferences.leader),[loadout,setLoadout]=useState<Kind[]>(['infantry']),[name,setName]=useState<string|null>(null);
 const [flag,setFlag]=useState<Flag>(preferences.flag);
 const[paused,setPaused]=useState(false),[speed,setSpeed]=useState(1),[near,setNear]=useState(false),[toast,setToast]=useState('');
 const[saves,setSaves]=useState<SaveInfo[]>([]),[saveName,setSaveName]=useState(''),[code,setCode]=useState(''),[room,setRoom]=useState<RoomInfo|null>(null),[ticket,setTicket]=useState<Ticket|null>(storedTicket),[network,setNetwork]=useState<'connected'|'reconnecting'>('connected'),[busy,setBusy]=useState(false);
 const session=useRef<Session|null>(null),world=useRef<WorldRenderer|null>(null),latest=useRef<GameState|null>(null),autoTick=useRef(0),fileInput=useRef<HTMLInputElement>(null);
 latest.current=game;
 const preview=useMemo(()=>createGame([{name:'North',leader:'warden',loadout:['infantry']},{name:'East',leader:'vanguard',loadout:['infantry']},{name:'South',leader:'steward',loadout:['infantry']},{name:'West',leader:'warden',loadout:['infantry']}]),[]);
 const text=(key:string)=>t(language,key),state=game??preview,player=game?.players[actor],province=game?.provinces[selected];
 const lobbyMaxAI=Math.max(0,(room?.capacity??factionCapacity)-(room?.seats.length??1)),setupMaxAI=factionCapacity-1;
 const countRange=(min:number,max:number)=>text('aiRange').replace('{min}',String(min)).replace('{max}',String(max));
 useEffect(()=>setLobbyAI(String(room?.aiCount??0)),[room?.aiCount]);
 const eliminated=Boolean(game&&isEliminated(game,actor)),showDefeat=eliminated&&!spectating&&game?.winner===null;
 const commanderName=name??text('yourName');
 const notifyResult=(result:Result)=>{if(!result.ok){setPendingTalent(null);setToast(text(`error.${result.error}`));}};
 const report=(e:unknown)=>setToast(text(`error.${e instanceof Error?e.message:'generic'}`));
 useEffect(()=>{if(eliminated){setModal(null);setPendingTalent(null);}},[eliminated]);
 useEffect(()=>{
  const tracker=new InputDeviceTracker();
  const pointer=(event:PointerEvent)=>setInputDevice(tracker.pointer(event as PointerEvent&PointerIntent,performance.now()));
  const keyboard=(event:KeyboardEvent)=>{
   const target=event.target;
   const editing=target instanceof HTMLElement&&(target.isContentEditable||Boolean(target.closest('input,textarea,select,[contenteditable]')));
   setInputDevice(tracker.key(event.key,editing));
  };
  document.addEventListener('pointerdown',pointer,true);document.addEventListener('keydown',keyboard,true);
  return()=>{document.removeEventListener('pointerdown',pointer,true);document.removeEventListener('keydown',keyboard,true);};
 },[]);
 useEffect(()=>{world.current?.setInputContext(screen==='game'&&!localStarting&&!modal&&!showDefeat&&game?.winner===null?'game':'blocked');},[screen,localStarting,modal,showDefeat,game?.winner]);
 useEffect(()=>{document.documentElement.lang=language==='zh'?'zh-CN':'en';document.title=text('title');try{localStorage.setItem('rouge.language',language);}catch{/* Language still works without storage. */}},[language]);
 useEffect(()=>()=>session.current?.dispose(),[]);
 useEffect(()=>{if(!toast)return;const id=setTimeout(()=>setToast(''),4500);return()=>clearTimeout(id);},[toast]);
 function refreshSaves(){try{setSaves(listSaves(localStorage));}catch{setToast(text('saveFailed'));}}
 function showSaves(){refreshSaves();setModal('saves');}
 function openSettings(){setSettingsPage('general');setModal('settings');}
 function openSettingsSaves(){refreshSaves();setSettingsPage('saves');}
 useEffect(()=>{
  const status=talentSelectionStatus(player,pendingTalent);
  if(status!=='waiting'){setPendingTalent(null);if(status==='done')setModal(current=>current==='talents'?null:current);}
 },[pendingTalent,player?.talents,player?.drafts,player?.choices]);
 const appearanceOrigin=useRef<'setupSolo'|'setupLan'>('setupSolo');
 const initialFocusRef=useRef(initialFocus);
 function restoreFocus(testId:string|null){if(testId)requestAnimationFrame(()=>document.querySelector<HTMLElement>(`[data-testid="${testId}"]`)?.focus({preventScroll:true}));}
 function openAppearance(next:'playerLeader'|'playerFlag'){
  if(modal==='setupSolo'||modal==='setupLan')appearanceOrigin.current=modal;
  setModal(next);
 }
 function closeModal(){
  if(modal==='playerLeader'||modal==='playerFlag'){
   setModal(appearanceOrigin.current);restoreFocus(modal==='playerLeader'?'edit-player-leader':'edit-player-flag');
  }else{setModal(null);restoreFocus(initialFocusRef.current);initialFocusRef.current=null;}
 }
 useEffect(()=>{
  preloadLocalSession();preloadPortraits();
  if(initialAction==='saves'||initialAction==='settingsSaves')refreshSaves();
  if(initialAction==='resumeLan'&&ticket)connect(ticket);
  if(!initialAction){restoreFocus(initialFocusRef.current);initialFocusRef.current=null;}
 },[]);
 // The settings menu pauses only the local simulation, without changing the user's pause intent.
 useEffect(()=>{if(screen==='game'&&session.current?.mode==='solo')session.current.pause?.(paused||modal==='settings');},[paused,modal,screen]);
 function saveCurrent(id:string,displayName:string,quiet=false):boolean{
  if(!latest.current||session.current?.mode!=='solo')return false;
  try{writeSave(localStorage,id,latest.current,displayName);if(!quiet)setToast(text('saveSuccess'));refreshSaves();return true;}catch{setToast(text('saveFailed'));return false;}
 }
 useEffect(()=>{if(game&&session.current?.mode==='solo'&&game.tick-autoTick.current>=1200){autoTick.current=game.tick;saveCurrent(`auto-${game.campaign}`,text('autosave'),true);}},[game?.tick]);
 useEffect(()=>{if(screen==='game'||screen==='menu')world.current?.view('strategic');},[screen,actor]);
 function cancelLocalStart(){session.current?.dispose();session.current=null;setLocalStarting(false);setGame(null);setScreen('menu');setModal(null);}
 function launchLocal(value:GameState){
  setSpectating(false);setPendingTalent(null);session.current?.dispose();setActor(0);setGame(value);setSelected(initialRegion(value,0));setScreen('game');setModal(null);setPaused(false);setSpeed(1);setLocalStarting(true);autoTick.current=value.tick;
  let initialized=false;
  try{session.current=localSession(value,next=>{initialized=true;setGame(next);setLocalStarting(false);},result=>{if(!result.ok&&!initialized)cancelLocalStart();notifyResult(result);});}
  catch(error){cancelLocalStart();report(error);}
 }
 useEffect(()=>{saveSetupPreferences({leader,flag});},[leader,flag]);
 function setup():PlayerSetup{return{name:commanderName.trim(),leader,flag,loadout};}
 function startSolo(){
  if(!validCount(soloAICount,1,setupMaxAI))return;
  try{const seed=crypto.getRandomValues(new Uint32Array(1))[0];launchLocal(createGame([setup(),...makeAISetups(Number(soloAICount),seed)],seed,crypto.randomUUID()));}catch(e){report(e);}
 }
 function connect(ticket:Ticket){setSpectating(false);setPendingTalent(null);
  session.current?.dispose();setTicket(ticket);try{sessionStorage.setItem('rouge.ticket.ne-admin1-groups.v1',JSON.stringify(ticket));}catch{/* Reconnection still works in this tab. */}
  setGame(null);setActor(ticket.actor);setRoom(null);setScreen('lobby');setModal(null);setNetwork('reconnecting');
  let initialized=false;
  session.current=remoteSession(ticket,value=>{setGame(value);setScreen('game');if(!initialized){setSelected(initialRegion(value,ticket.actor));initialized=true;}},setRoom,setNetwork,notifyResult);
 }
 async function roomAction(join:boolean){if(!join&&!validCount(roomAICount,0,setupMaxAI))return;setBusy(true);try{connect(await(join?joinRoom(code,setup()):createRoom(setup(),Number(roomAICount))));}catch(e){report(e);}finally{setBusy(false);}}
 async function changeRoomAI(aiCount:number){if(!ticket)return;setBusy(true);try{const next=await configureRoom(ticket,aiCount);setRoom(next);}catch(e){report(e);}finally{setBusy(false);}}
 async function beginMatch(){if(!ticket)return;setBusy(true);try{await api(`/rooms/${ticket.code}/start`,{},ticket.token);}catch(e){report(e);}finally{setBusy(false);}}
 function issue(command:Command){if(localStarting)return;if(eliminated){notifyResult({ok:false,error:'eliminated'});return;}session.current?.command(command);}
 function selectProvince(id:number,attack:boolean){
  if(screen!=='game'||localStarting)return;
  if(attack){if(eliminated||!MAP[selected]||!MAP[id])return;issue({type:'march',from:selected,to:id,fraction:0.75});}
  else if(id===-1){setSelected(-1);setMobilePanel(current=>current==='province'?null:current);}
  else if(MAP[id])setSelected(id);
 }
 function togglePause(){if(session.current?.mode!=='solo')return;setPaused(!paused);}
 function leave(){if(screen==='game'&&!window.confirm(text('exitConfirm')))return;if(session.current?.mode==='solo'&&latest.current){if(!saveCurrent(`auto-${latest.current.campaign}`,text('autosave'),true)&&!window.confirm(text('saveFailed')))return;}
  session.current?.dispose();session.current=null;setGame(null);setScreen('menu');setRoom(null);setModal(null);setPaused(false);try{sessionStorage.removeItem('rouge.ticket.ne-admin1-groups.v1');}catch{}setTicket(null);
 }
 function load(id:string){try{const{state,recovered}=readSave(localStorage,id);launchLocal(state);if(recovered)setToast(text('recovered'));}catch(e){report(e);}}
 function exportCurrent(){if(!game)return;const blob=new Blob([encodeSave(game,saveName||text('theatre'))],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`rouge-${game.campaign}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),0);}
 async function importSave(file:File|undefined){if(!file)return;try{if(file.size>MAX_SAVE_BYTES)throw new Error('invalidSave');const decoded=decodeSave(await file.text());writeSave(localStorage,`import-${crypto.randomUUID()}`,decoded.state,decoded.name);refreshSaves();setToast(text('saveSuccess'));}catch(e){report(e);}finally{if(fileInput.current)fileInput.current.value='';}}
 useEffect(()=>{const key=(event:KeyboardEvent)=>{
  if(localStarting){if(event.key==='Escape'){event.preventDefault();cancelLocalStart();}return;}
  if(showDefeat)return;
  if(event.key==='Escape'){
   event.preventDefault();
   if(modal==='settings'&&settingsPage==='saves')setSettingsPage('general');
   else if(modal)closeModal();
   else if(screen==='game'&&game?.winner===null)openSettings();
   return;
  }
  if((event.target as HTMLElement).closest('input,select,textarea,button')||screen!=='game')return;
  if(event.code==='Space'&&!modal){event.preventDefault();togglePause();}
 };window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[paused,modal,screen,settingsPage,localStarting,showDefeat,game?.winner]);
 const ownershipCounts=useMemo(()=>{const counts=new Map<number,number>();for(const province of game?.provinces??[])if(MAP[province.id].playable&&province.owner>=0)counts.set(province.owner,(counts.get(province.owner)??0)+1);return counts;},[game]);
 const owned=game?.provinces.filter(p=>MAP[p.id].playable&&p.owner===actor).length??0,army=game?.units.filter(u=>u.owner===actor).length??0;
 return <div className={`app ${screen==='menu'?'is-menu':screen==='game'?'is-game':''}`} data-input-device={inputDevice} data-resource-state="ready" data-local-ready={String(!localStarting)} aria-busy={localStarting} data-eliminated={eliminated}>
  <World state={state} selected={screen==='game'?selected:-1} language={language} onPick={selectProvince} onMode={setNear} worldRef={world}/>
  <div className="map-vignette"/>
  {screen==='game'&&<div className="map-search"><input data-testid="map-search" aria-label={text('mapSearch')} placeholder={text('mapSearch')} value={mapQuery} onChange={e=>setMapQuery(e.target.value)}/>
    {mapQuery.trim().length>0&&<div className="map-search-results">{searchProvinces(mapQuery).map(p=><button key={p.id} onClick={()=>{setSelected(p.id);world.current?.focusProvince(p.id);setMapQuery('');}}><b>{p.name[language==='zh'?0:1]}</b></button>)}</div>}
  </div>}

  {screen!=='game'&&<div className="language-switch"><button className={language==='zh'?'active':''} onClick={()=>setLanguage('zh')} aria-label="简体中文">中</button><span>/</span><button className={language==='en'?'active':''} onClick={()=>setLanguage('en')} aria-label="English">EN</button></div>}
  {screen==='menu'&&<StartMenu language={language} resumeCode={ticket?.code} onAction={action=>{if(action==='saves')showSaves();else if(action==='settings')openSettings();else if(action==='resumeLan'&&ticket)connect(ticket);else if(action==='setupSolo'||action==='setupLan')setModal(action);}}/>}
  {screen==='lobby'&&<section className="lobby panel">
    <span className="eyebrow gold">{text('lanTitle')}</span><h2>{text('waiting')}</h2><div className="room-code">{ticket?.code}</div>
    <div className="seats">{Array.from({length:(room?.seats.length??0)+(room?.aiCount??0)},(_,i)=>{const seat=room?.seats[i],isAI=!seat&&i<(room?.seats.length??0)+(room?.aiCount??0);return <div key={i} className="seat"><span className="faction-dot" style={{background:factionColor(i)}}/>{seat?.flag&&<FlagImage flag={seat.flag} language={language}/>}<span>{seat?.name??(isAI?`${text('aiPlayer')} ${i-(room?.seats.length??0)+1}`:'—')}</span><small>{seat?text(seat.leader):text('aiPlayer')}</small>{seat&&<span className="seat-status" data-connected={seat.connected}>{text(seat.connected?'connected':'offline')}</span>}{i===0&&seat&&<b>{text('host')}</b>}</div>;})}</div>
    <div className="ai-count-field"><label htmlFor="lobby-ai-count">{text('aiCount')}</label><input id="lobby-ai-count" type="number" inputMode="numeric" min={0} max={lobbyMaxAI} step={1} placeholder={`0–${lobbyMaxAI}`} data-testid="lobby-ai-count" value={lobbyAI} disabled={busy||ticket?.actor!==0||room?.started} aria-invalid={!validCount(lobbyAI,0,lobbyMaxAI)} aria-describedby="lobby-ai-range" onChange={e=>setLobbyAI(e.target.value)}/><button className="secondary" data-testid="apply-lobby-ai" disabled={busy||ticket?.actor!==0||room?.started||!validCount(lobbyAI,0,lobbyMaxAI)||Number(lobbyAI)===(room?.aiCount??0)} onClick={()=>changeRoomAI(Number(lobbyAI))}>{text('apply')}</button><small id="lobby-ai-range">{countRange(0,lobbyMaxAI)} · {text('aiLoadWarning')}</small></div>
    <p className="muted" data-testid="lobby-human-count">{text('humanMinimum').replace('{count}',String(room?.onlineHumans??0))}</p>
    <div className={`connection ${network}`}>● {text(network)}</div><div className="row"><button className="secondary" onClick={leave}>{text('leave')}</button>{ticket?.actor===0?<button className="primary" disabled={busy||(room?.onlineHumans??0)<2} onClick={beginMatch}>{text('startMatch')} →</button>:<span className="muted">{text('waitingHost')}</span>}</div>
  </section>}
  {screen==='game'&&game&&player&&<>
    <header className="hud-top"><FactionIdentity flag={player.flag} actor={actor} language={language} color={factionColor(actor)}/>
      <div className="resource"><span>{text('gold')}</span><strong>{Math.floor(player.gold).toLocaleString()}</strong></div><div className="resource"><span>{text('army')}</span><strong data-testid="army-total" title={text('noArmyCap')}>{army.toLocaleString()}</strong></div><div className="resource"><span>{text('territory')}</span><strong>{owned}<small> / {PLAYABLE_COUNT}</small></strong></div><div className="resource level-resource"><span>{text('level')}</span><strong>{player.level}<small> / 8</small></strong><div className="micro-progress"><i style={{width:`${Math.min(100,player.xp/(60+player.level*45)*100)}%`}}/></div></div>
      <div className="clock"><time data-testid="game-clock" data-tick={game.tick}>{timeLabel(game.tick)}</time>{session.current?.mode==='solo'?<div className="clock-controls"><button onClick={togglePause} data-testid="toggle-pause" title={text(paused?'resume':'pause')}>{paused?'▶':'Ⅱ'}</button><button onClick={()=>{const s=speed===1?2:1;session.current?.speed?.(s);setSpeed(s);}}>{speed}×</button></div>:<small className={`connection ${network}`}>● {text(network)}</small>}</div>
    </header>
    <button className="settings-trigger" data-testid="open-settings" onClick={openSettings} aria-label={text('settings')} aria-haspopup="dialog"><span aria-hidden="true">⚙</span><span>{text('settings')}</span></button>
    <nav className="army-actions" aria-label={text('armyActions')}><button className="upgrade-trigger" onClick={()=>setModal('upgrades')} data-testid="open-upgrades" aria-haspopup="dialog"><span className="upgrade-icon" aria-hidden="true">↟</span><span>{text('upgrades')}</span><span aria-hidden="true">›</span></button></nav>
    {province&&<TerritoryPanel state={game} selected={selected} actor={actor} eliminated={eliminated} language={language} mobileOpen={mobilePanel==='province'} onFocus={()=>world.current?.focusProvince(selected)} onManage={()=>setModal('territories')} onCommand={issue}/>}
    <aside id="strategic-panel" className={`strategic-panel ${mobilePanel==='intel'?'mobile-panel-open':''}`}><section className="panel objective"><span className="eyebrow gold">{text('objective')}</span><h3>{text('theatre')}</h3><p>{text('objectiveDesc').replace('{count}',String(Math.ceil(PLAYABLE_COUNT*0.6)))}</p><div className="faction-bars">{game.players.map(p=><span key={p.id} title={playerName(language,p)} style={{background:factionColor(p.id),width:`${(ownershipCounts.get(p.id)??0)/PLAYABLE_COUNT*100}%`}}/>)}</div>{game.domination[actor]>0&&<b className="gold">{text('domination')} {Math.floor(game.domination[actor])} / 30{text('seconds')}</b>}</section>
      <section className="dispatches"><span className="eyebrow">{text('latest')}</span>{game.events.length?game.events.slice(-4).reverse().map((e,i)=><p key={`${e.tick}-${i}`}><time>{timeLabel(e.tick)}</time><span style={{color:factionTextColor(e.player)}}>{playerName(language,game.players[e.player])}</span> {text(`event.${e.key}`)}{e.province!==undefined?' '+MAP[e.province].name[language==='zh'?0:1]:''}</p>):<p className="muted">{text('noEvents')}</p>}</section>
    </aside>
    <nav className="mobile-actions" aria-label={text('mobileActions')}>
      <button data-testid="toggle-province-panel" disabled={!province} aria-controls={province?'province-panel':undefined} aria-expanded={Boolean(province)&&mobilePanel==='province'} onClick={()=>setMobilePanel(mobilePanel==='province'?null:'province')}>{text(mobilePanel==='province'?'hideProvince':'showProvince')}</button>
      <button data-testid="toggle-strategic-panel" aria-controls="strategic-panel" aria-expanded={mobilePanel==='intel'} onClick={()=>setMobilePanel(mobilePanel==='intel'?null:'intel')}>{text(mobilePanel==='intel'?'hideIntel':'showIntel')}</button>
      <button data-testid="mobile-talents" aria-haspopup="dialog" onClick={()=>setModal('talents')}>{text('talents')}{player.drafts>0?` (${player.drafts})`:''}</button>
    </nav>
    <CommanderPortrait player={player} language={language} color={factionColor(actor)} onTalents={()=>setModal('talents')}/>
    {paused&&<div className="pause-banner">Ⅱ {text('paused')}</div>}
    {eliminated&&spectating&&game.winner===null&&<div className="elimination-status" role="status" data-testid="spectating-status">{text('eliminatedSpectating')}</div>}
    {game.winner!==null&&<div className="modal-backdrop"><section className="modal result-modal"><div className="victory-symbol">✦</div><div className="eyebrow gold">{text('winner')} / {playerName(language,game.players[game.winner])}</div><h2>{text(game.winner===actor?'victory':'defeat')}</h2><p>{timeLabel(game.tick)} · {owned}/{PLAYABLE_COUNT} {text('territory')} · {player.talents.length} {text('talents')}</p><button className="primary" onClick={leave}>{text('returnMenu')} →</button></section></div>}
  </>}
  {showDefeat&&<ModalDialog className="result-modal elimination-modal" label={text('eliminatedTitle')} onClose={()=>setSpectating(true)} closeLabel={text('spectate')} pageKey="eliminated">
    <div data-testid="elimination-result"><h2>{text('eliminatedTitle')}</h2><p>{text('eliminatedDescription')}</p><div className="elimination-actions"><button className="primary" data-testid="spectate-match" onClick={()=>setSpectating(true)}>{text('spectate')}</button><button className="secondary" data-testid="eliminated-return-menu" onClick={leave}>{text('returnMenu')}</button></div></div>
  </ModalDialog>}
  {modal&&<ModalDialog className={`${modal.startsWith('setup')?'setup-modal':''} ${modal==='playerLeader'||modal==='playerFlag'?'identity-modal':''} ${modal==='talents'?'talent-modal':''} ${modal==='settings'?'settings-modal':''}`} label={text(modal==='setupSolo'||modal==='setupLan'?'setup':modal)} onClose={closeModal} closeLabel={text('close')} pageKey={modal==='settings'?settingsPage:modal}>
    {modal==='settings'&&settingsPage==='general'&&<>
      <h2>{text('settings')}</h2>
      {screen==='game'&&<p className="settings-status muted">{text(session.current?.mode==='solo'?'settingsSoloPaused':'settingsLanRunning')}</p>}
      <section className="settings-language"><h3>{text('language')}</h3><div className="settings-language-options"><button aria-label="简体中文" aria-pressed={language==='zh'} onClick={()=>setLanguage('zh')}>简体中文</button><button aria-label="English" aria-pressed={language==='en'} onClick={()=>setLanguage('en')}>English</button></div></section>
      <div className="settings-actions">
        <button className="settings-save" data-testid="settings-save" onClick={openSettingsSaves} disabled={screen==='game'&&session.current?.mode!=='solo'}><span aria-hidden="true">▤</span><div><strong>{text(screen==='menu'?'saves':'save')}</strong>{screen==='game'&&session.current?.mode!=='solo'&&<small>{text('settingsLanSaveUnavailable')}</small>}</div><span aria-hidden="true">›</span></button>
        <button className="primary full" data-testid="settings-resume" onClick={closeModal}>{text(screen==='game'?'returnGame':'returnMenu')}<span aria-hidden="true">→</span></button>
        {screen==='game'&&<button className="quiet settings-leave" onClick={leave}>{text('returnMenu')}</button>}
      </div>
    </>}
    {modal==='settings'&&settingsPage==='saves'&&<button className="settings-back" data-testid="settings-back" onClick={()=>setSettingsPage('general')}>← {text('backSettings')}</button>}
    {modal==='playerLeader'&&<><div className="eyebrow gold">{text('playerAppearance')}</div><h2>{text('playerLeader')}</h2><div className="leader-grid">{LEADERS.map((l,i)=><button data-testid={`choose-leader-${l}`} aria-pressed={leader===l} key={l} className={`leader-card ${leader===l?'chosen':''}`} onClick={()=>setLeader(l)}><div className={`leader-art art-${i}`}><LeaderBust leader={l} label={text(l)}/><span>0{i+1}</span></div><div className="leader-copy"><b>{text(l)}</b><span className="selected-dot">{leader===l?'●':'○'}</span></div></button>)}</div></>}
    {modal==='playerFlag'&&<><div className="eyebrow gold">{text('playerAppearance')}</div><h2>{text('playerFlag')}</h2><FlagEditor value={flag} onChange={setFlag} language={language}/></>}
    {(modal==='setupSolo'||modal==='setupLan')&&<><div className="eyebrow gold">{text(modal==='setupSolo'?'single':'multiplayer')} / 01</div><h2>{text('setup')}</h2>
      <div className="setup-identity" data-testid="setup-identity">
       <button className="setup-flag-entry" data-testid="edit-player-flag" aria-label={text('editPlayerFlag')} aria-haspopup="dialog" onClick={()=>openAppearance('playerFlag')}><span className="faction-emblem-frame"><FlagImage flag={flag} language={language}/></span><span>{text('playerFlag')}<small>{text('editAppearance')} ↗</small></span></button>
       <button className="setup-leader-entry" data-testid="edit-player-leader" data-leader={leader} aria-label={text('editPlayerLeader')} aria-haspopup="dialog" onClick={()=>openAppearance('playerLeader')}><span className="setup-leader-art"><LeaderBust leader={leader} label={text(leader)}/></span><span>{text(leader)}<small>{text('editAppearance')} ↗</small></span></button>
      </div><h3>{text('chooseUnits')}</h3><UnitSelection value={loadout[0]} onChange={kind=>setLoadout([kind])} language={language}/>
      <div className="ai-count-field"><label htmlFor="setup-ai-count">{text('aiCount')}</label><input id="setup-ai-count" data-testid="setup-ai-count" type="number" inputMode="numeric" min={modal==='setupSolo'?1:0} max={setupMaxAI} step={1} placeholder={`${modal==='setupSolo'?1:0}–${setupMaxAI}`} value={modal==='setupSolo'?soloAICount:roomAICount} aria-invalid={!validCount(modal==='setupSolo'?soloAICount:roomAICount,modal==='setupSolo'?1:0,setupMaxAI)} aria-describedby="setup-ai-range" onChange={e=>modal==='setupSolo'?setSoloAICount(e.target.value):setRoomAICount(e.target.value)}/><small id="setup-ai-range">{countRange(modal==='setupSolo'?1:0,setupMaxAI)} · {text('aiLoadWarning')}</small></div>
      <div className="setup-footer"><label>{text('commander')}<input data-testid="commander-name" value={commanderName} maxLength={24} onChange={e=>setName(e.target.value)}/></label>{modal==='setupSolo'?<button className="primary" data-testid="begin-campaign" disabled={!commanderName.trim()||!validCount(soloAICount,1,setupMaxAI)} onClick={startSolo}>{text('start')} →</button>:<div className="lan-actions"><button className="primary" disabled={busy||!commanderName.trim()||!validCount(roomAICount,0,setupMaxAI)} onClick={()=>roomAction(false)}>{text('createRoom')}</button><div className="join-row"><input placeholder={text('roomCode')} value={code} maxLength={6} onChange={e=>setCode(e.target.value.toUpperCase().replace(/[^A-F0-9]/g,''))}/><button className="secondary" disabled={busy||code.length!==6||!commanderName.trim()} onClick={()=>roomAction(true)}>{text('joinRoom')}</button></div></div>}</div>
    </>}
    {(modal==='saves'||(modal==='settings'&&settingsPage==='saves'))&&<><h2>{text('saves')}</h2><p className="muted">{text('saveHint')}</p>{session.current?.mode==='solo'&&game&&<div className="new-save"><input placeholder={text('saveName')} value={saveName} onChange={e=>setSaveName(e.target.value)} maxLength={64}/><button className="primary" data-testid="create-save" onClick={()=>saveCurrent(`manual-${crypto.randomUUID()}`,saveName||`${text('theatre')} ${timeLabel(game.tick)}`)}>{text('newSave')}</button></div>}
      <div className="save-list">{saves.length?saves.map(s=><article key={s.id} className="save-card"><div className="save-icon">▤</div><div className="save-description"><h3>{s.name}</h3><small>{s.corrupted?text('corrupt'):`${text(s.leader)} · ${timeLabel(s.tick)} · ${new Date(s.savedAt).toLocaleString(language==='zh'?'zh-CN':'en-US')}`}</small></div><div className="save-actions"><button className="secondary" onClick={()=>load(s.id)}>{text('load')}</button>{session.current?.mode==='solo'&&<button className="quiet" onClick={()=>{if(confirm(text('overwriteConfirm')))saveCurrent(s.id,s.name);}}>{text('overwrite')}</button>}<button className="quiet danger" onClick={()=>{if(confirm(text('deleteConfirm'))){deleteSave(localStorage,s.id);refreshSaves();}}}>{text('delete')}</button></div></article>):<div className="empty-state">{text('emptySaves')}</div>}</div><div className="row">{session.current?.mode==='solo'&&game&&<button className="secondary" onClick={exportCurrent}>{text('export')} ↗</button>}<button className="secondary" onClick={()=>fileInput.current?.click()}>{text('import')}</button><input hidden type="file" accept="application/json,.json" ref={fileInput} onChange={e=>importSave(e.target.files?.[0])}/></div>
    </>}
    {modal==='territories'&&game&&<><h2>{text('territories')}</h2><TerritoryManagement state={game} grouping={game.grouping} selected={selected} actor={actor} eliminated={eliminated} language={language} onCommand={issue}/></>}
    {modal==='upgrades'&&player&&<><h2>{text('upgrades')}</h2><div className="treasury">{text('gold')} <strong>{Math.floor(player.gold)}</strong></div><div className="upgrade-grid">{player.loadout.map(k=><article className="upgrade-card" key={k}><div className="upgrade-title"><span className="unit-mark">{SYMBOLS[k]}</span><h3>{text(k)}</h3></div><UnitAttributes values={stats(player,k)} language={language}/>{STATS.map(stat=>{const level=player.upgrades[k][stat],cost=upgradeCost(level);return <div className="upgrade-row" key={stat}><div><b>{text(stat)} <span className="gold">{level}/8</span></b><small>{text(`${stat}.desc`)}</small></div><button className="secondary" data-testid={`upgrade-${k}-${stat}`} disabled={eliminated||level>=8||player.gold<cost} onClick={()=>issue({type:'upgrade',kind:k,stat})}>{level>=8?text('max'):`＋ ${cost}`}</button></div>;})}</article>)}</div></>}
    {modal==='talents'&&player&&<><div className="eyebrow gold">{text('talents')} / {text(player.leader)}</div><h2>{text('talentTitle')}</h2>{player.choices.length?<><div className="talent-grid">{player.choices.map((id,i)=><button className="talent-card" key={id} disabled={eliminated||pendingTalent!==null} onClick={()=>{setPendingTalent(id);issue({type:'talent',id});}}><span className="talent-number">0{i+1}</span><div className="talent-symbol">{['✧','⌁','◇'][i]}</div><h3>{text(id)}</h3><p>{text(`${id}.desc`)}</p><span className="talent-select">{text('select')} →</span></button>)}</div><button className="secondary" disabled={eliminated||player.rerolls===0||pendingTalent!==null} onClick={()=>issue({type:'reroll'})}>{text('reroll')} · {player.rerolls}</button></>:<div className="empty-state">{text('level')} {player.level}/8 · {Math.floor(player.xp)}/{60+player.level*45} {text('experience')}</div>}{player.talents.length>0&&<div className="chosen-talents">{player.talents.map(id=><span key={id} title={text(`${id}.desc`)}>✧ {text(id)}</span>)}</div>}</>}
  </ModalDialog>}
  {localStarting&&<ModalDialog label={text('starting')} closeLabel={text('close')} onClose={cancelLocalStart} pageKey="local-starting"><p role="status" data-testid="local-starting">{text('starting')}</p></ModalDialog>}
  {toast&&<div className="toast" role="status">{toast}<button onClick={()=>setToast('')} aria-label={text('close')}>×</button></div>}
 </div>;
}
