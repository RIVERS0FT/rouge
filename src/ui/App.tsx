import {InputDeviceTracker,type PointerIntent} from './inputDevice.ts';
import { FlagEditor, FlagImage } from './Flag.tsx';
import type { Flag } from '../game/flags.ts';
import {useEffect,useMemo,useRef,useState} from 'react';
import {createGame} from '../game/engine.ts';
import {MAP,PLAYABLE_COUNT,VISIBLE_COUNT,searchProvinces} from '../game/map.ts';
import {KINDS,LEADERS,STATS,UNITS,UNIT_ATTRIBUTES,stats,type UnitStats,upgradeCost,PROVINCE_CAP} from '../game/content.ts';
import {listSaves,readSave,writeSave,deleteSave,encodeSave,decodeSave,MAX_SAVE_BYTES,type SaveInfo} from '../game/save.ts';
import type {GameState,Kind,Leader,Command,Result,PlayerSetup} from '../game/types.ts';
import {localSession,remoteSession,createRoom,joinRoom,api,type Session,type Ticket,type RoomInfo} from '../platform/session.ts';
import {WorldRenderer,FACTION_COLORS} from '../render/WorldRenderer.ts';
import {World} from './World.tsx';
import {Navigator} from '../game/navigation.ts';
import {regionTroops,destinationRoom,regionReservations} from '../game/capacity.ts';
import {FactionIdentity, CommanderPortrait} from './CommanderHud.tsx';
import {t,timeLabel,type Language} from './i18n.ts';
import {ModalDialog} from './ModalDialog.tsx';
function storedLanguage():Language{try{return localStorage.getItem('rouge.language')==='en'?'en':'zh';}catch{return'zh';}}
function storedTicket():Ticket|null{try{const x=JSON.parse(sessionStorage.getItem('rouge.ticket.state-regions.v1')??'null');return x&&typeof x.code==='string'&&typeof x.token==='string'&&Number.isInteger(x.actor)?x:null;}catch{return null;}}
const SYMBOLS:Record<string,string>={infantry:'Ⅰ',cavalry:'Ⅱ',artillery:'Ⅲ',engineer:'Ⅳ',skirmisher:'Ⅴ',grenadier:'Ⅵ',heavyCavalry:'Ⅶ',horseArtillery:'Ⅷ',warden:'▱',vanguard:'↗',steward:'◇'};
function UnitAttributes({values,language}:{values:UnitStats;language:Language}){
 return <span className="unit-attributes" data-testid="unit-attributes">{UNIT_ATTRIBUTES.map(key=><span className="unit-attribute" key={key} data-stat={key}><span>{t(language,`attribute.${key}`)}</span><strong>{key==='splash'&&values[key]===0?t(language,'singleTarget'):Number(values[key].toFixed(2))}{key==='attackSpeed'?` ${t(language,'attacksPerSecond')}`:key==='train'?` ${t(language,'gameSeconds')}`:key==='speed'||key==='seaSpeed'?` ${t(language,'distancePerSecond')}`:key==='splash'&&values[key]>0||key==='range'?` ${t(language,'mapUnits')}`:''}</strong></span>)}</span>;
}
export function App(){
 const[inputDevice,setInputDevice]=useState<'touch'|'mouse'>('mouse');
 const[mobilePanel,setMobilePanel]=useState<'province'|'intel'|null>(null);
 const[mapQuery,setMapQuery]=useState('');
 const[destinationQuery,setDestinationQuery]=useState('');
 const[language,setLanguage]=useState<Language>(storedLanguage),[screen,setScreen]=useState<'menu'|'game'|'lobby'>('menu');
 const[modal,setModal]=useState<'setupSolo'|'setupLan'|'saves'|'upgrades'|'talents'|'settings'|null>(null);
 const[settingsPage,setSettingsPage]=useState<'general'|'saves'>('general');
 const[game,setGame]=useState<GameState|null>(null),[actor,setActor]=useState(0),[selected,setSelected]=useState(0),[target,setTarget]=useState(8),[fraction,setFraction]=useState(0.75);
 const[leader,setLeader]=useState<Leader>('warden'),[loadout,setLoadout]=useState<Kind[]>(['infantry']),[name,setName]=useState('Commander');
 const [flag,setFlag]=useState<Flag>({type:'preset',id:'cn'});
 const[paused,setPaused]=useState(false),[speed,setSpeed]=useState(1),[near,setNear]=useState(false),[toast,setToast]=useState('');
 const[saves,setSaves]=useState<SaveInfo[]>([]),[saveName,setSaveName]=useState(''),[code,setCode]=useState(''),[room,setRoom]=useState<RoomInfo|null>(null),[ticket,setTicket]=useState<Ticket|null>(storedTicket),[network,setNetwork]=useState<'connected'|'reconnecting'>('connected'),[busy,setBusy]=useState(false);
 const session=useRef<Session|null>(null),world=useRef<WorldRenderer|null>(null),latest=useRef<GameState|null>(null),autoTick=useRef(0),fileInput=useRef<HTMLInputElement>(null);
 latest.current=game;
 const preview=useMemo(()=>createGame([{name:'North',leader:'warden',loadout:['infantry']},{name:'East',leader:'vanguard',loadout:['infantry']},{name:'South',leader:'steward',loadout:['infantry']},{name:'West',leader:'warden',loadout:['infantry']}]),[]);
 const text=(key:string)=>t(language,key),state=game??preview,player=game?.players[actor],province=game?.provinces[selected];
 const inputHint=text(inputDevice==='touch'?'controlsTouch':'controlsMouse');
 const navigator=useMemo(()=>new Navigator(),[]);
 const route=useMemo(()=>navigator.route(state,actor,selected,target),[navigator,actor,selected,target]);
 const destinations=useMemo(()=>MAP.filter(p=>p.playable&&p.id!==selected&&(p.id===target||[...p.name,p.code].some(v=>v.toLocaleLowerCase().includes(destinationQuery.trim().toLocaleLowerCase())))),[selected,target,destinationQuery]);
 const notifyResult=(result:Result)=>{if(!result.ok)setToast(text(`error.${result.error}`));};
 const report=(e:unknown)=>setToast(text(`error.${e instanceof Error?e.message:'generic'}`));
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
 useEffect(()=>{world.current?.setInputContext(screen==='game'&&!modal&&game?.winner===null?'game':'blocked');},[screen,modal,game?.winner]);
 useEffect(()=>{document.documentElement.lang=language==='zh'?'zh-CN':'en';try{localStorage.setItem('rouge.language',language);}catch{/* Language still works without storage. */}},[language]);
 useEffect(()=>()=>session.current?.dispose(),[]);
 useEffect(()=>{if(!toast)return;const id=setTimeout(()=>setToast(''),4500);return()=>clearTimeout(id);},[toast]);
 useEffect(()=>{setTarget(MAP[selected].neighbors.find(id=>game?.provinces[id].owner!==actor)??MAP[selected].neighbors[0]??-1);},[selected,actor]);
 function refreshSaves(){try{setSaves(listSaves(localStorage));}catch{setToast(text('saveFailed'));}}
 function showSaves(){refreshSaves();setModal('saves');}
 function openSettings(){setSettingsPage('general');setModal('settings');}
 function openSettingsSaves(){refreshSaves();setSettingsPage('saves');}
 function closeModal(){setModal(null);}
 // The settings menu pauses only the local simulation, without changing the user's pause intent.
 useEffect(()=>{if(screen==='game'&&session.current?.mode==='solo')session.current.pause?.(paused||modal==='settings');},[paused,modal,screen]);
 function saveCurrent(id:string,displayName:string,quiet=false):boolean{
  if(!latest.current||session.current?.mode!=='solo')return false;
  try{writeSave(localStorage,id,latest.current,displayName);if(!quiet)setToast(text('saveSuccess'));refreshSaves();return true;}catch{setToast(text('saveFailed'));return false;}
 }
 useEffect(()=>{if(game&&session.current?.mode==='solo'&&game.tick-autoTick.current>=1200){autoTick.current=game.tick;saveCurrent(`auto-${game.campaign}`,text('autosave'),true);}},[game?.tick]);
 useEffect(()=>{if(screen==='game'||screen==='menu')world.current?.view('strategic');},[screen,actor]);
 function launchLocal(value:GameState){session.current?.dispose();setActor(0);setGame(value);setSelected(value.provinces.find(p=>p.owner===0)?.id??0);setScreen('game');setModal(null);setPaused(false);setSpeed(1);autoTick.current=value.tick;session.current=localSession(value,setGame,notifyResult);}
 function setup():PlayerSetup{return{name:name.trim(),leader,flag,loadout};}
 function startSolo(){
  try{const seed=crypto.getRandomValues(new Uint32Array(1))[0];launchLocal(createGame([setup(),{name:text('eastAI'),leader:'vanguard',loadout:[KINDS[seed%KINDS.length]],ai:true},{name:text('southAI'),leader:'steward',loadout:[KINDS[(seed%KINDS.length+1+Math.floor(seed/KINDS.length)%(KINDS.length-1))%KINDS.length]],ai:true}],seed,crypto.randomUUID()));}catch(e){report(e);}
 }
 function connect(ticket:Ticket){
  session.current?.dispose();setTicket(ticket);try{sessionStorage.setItem('rouge.ticket.state-regions.v1',JSON.stringify(ticket));}catch{/* Reconnection still works in this tab. */}
  setGame(null);setActor(ticket.actor);setRoom(null);setScreen('lobby');setModal(null);setNetwork('reconnecting');
  let initialized=false;
  session.current=remoteSession(ticket,value=>{setGame(value);setScreen('game');if(!initialized){setSelected(value.provinces.find(p=>p.owner===ticket.actor)?.id??0);initialized=true;}},setRoom,setNetwork,notifyResult);
 }
 async function roomAction(join:boolean){setBusy(true);try{connect(await(join?joinRoom(code,setup()):createRoom(setup())));}catch(e){report(e);}finally{setBusy(false);}}
 async function beginMatch(){if(!ticket)return;setBusy(true);try{await api(`/rooms/${ticket.code}/start`,{},ticket.token);}catch(e){report(e);}finally{setBusy(false);}}
 function issue(command:Command){session.current?.command(command);}
 function selectProvince(id:number,attack:boolean){if(screen!=='game')return;if(attack){setTarget(id);issue({type:'march',from:selected,to:id,fraction});}else setSelected(id);}
 function togglePause(){if(session.current?.mode!=='solo')return;setPaused(!paused);}
 function leave(){if(screen==='game'&&!window.confirm(text('exitConfirm')))return;if(session.current?.mode==='solo'&&latest.current){if(!saveCurrent(`auto-${latest.current.campaign}`,text('autosave'),true)&&!window.confirm(text('saveFailed')))return;}
  session.current?.dispose();session.current=null;setGame(null);setScreen('menu');setRoom(null);setModal(null);setPaused(false);try{sessionStorage.removeItem('rouge.ticket.state-regions.v1');}catch{}setTicket(null);
 }
 function load(id:string){try{const{state,recovered}=readSave(localStorage,id);launchLocal(state);if(recovered)setToast(text('recovered'));}catch(e){report(e);}}
 function exportCurrent(){if(!game)return;const blob=new Blob([encodeSave(game,saveName||text('theatre'))],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`rouge-${game.campaign}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),0);}
 async function importSave(file:File|undefined){if(!file)return;try{if(file.size>MAX_SAVE_BYTES)throw new Error('invalidSave');const decoded=decodeSave(await file.text());writeSave(localStorage,`import-${crypto.randomUUID()}`,decoded.state,decoded.name);refreshSaves();setToast(text('saveSuccess'));}catch(e){report(e);}finally{if(fileInput.current)fileInput.current.value='';}}
 useEffect(()=>{const key=(event:KeyboardEvent)=>{
  if(event.key==='Escape'){
   event.preventDefault();
   if(modal==='settings'&&settingsPage==='saves')setSettingsPage('general');
   else if(modal)closeModal();
   else if(screen==='game'&&game?.winner===null)openSettings();
   return;
  }
  if((event.target as HTMLElement).closest('input,select,textarea,button')||screen!=='game')return;
  if(event.code==='Space'&&!modal){event.preventDefault();togglePause();}
 };window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[paused,modal,screen,settingsPage,game?.winner]);
 const leaderIndex=LEADERS.indexOf(leader),owned=game?.provinces.filter(p=>MAP[p.id].playable&&p.owner===actor).length??0,army=game?.units.filter(u=>u.owner===actor).length??0;
 return <div className={`app ${screen==='menu'?'is-menu':screen==='game'?'is-game':''}`} data-input-device={inputDevice}>
  <World state={state} selected={screen==='game'?selected:-1} language={language} onPick={selectProvince} onMode={setNear} worldRef={world}/>
  <p className="input-hint" data-testid="input-hint" aria-live="polite">{inputHint}</p>
  <div className="map-vignette"/>
  <div className="atlas-credit">STATE REGIONS · MILLER / 74°N–58.64°S · {VISIBLE_COUNT.toLocaleString()} {text('adminAreas')}</div>
  {screen==='game'&&<div className="map-search"><input data-testid="map-search" aria-label={text('mapSearch')} placeholder={text('mapSearch')} value={mapQuery} onChange={e=>setMapQuery(e.target.value)}/>
    {mapQuery.trim().length>0&&<div className="map-search-results">{searchProvinces(mapQuery).map(p=><button key={p.id} onClick={()=>{setSelected(p.id);world.current?.focusProvince(p.id);setMapQuery('');}}><b>{p.name[language==='zh'?0:1]}</b><small>{p.code.replace('STATE_','')}</small></button>)}</div>}
  </div>}

  {screen!=='game'&&<div className="language-switch"><button className={language==='zh'?'active':''} onClick={()=>setLanguage('zh')} aria-label="简体中文">中</button><span>/</span><button className={language==='en'?'active':''} onClick={()=>setLanguage('en')} aria-label="English">EN</button></div>}
  {screen==='menu'&&<main className="main-menu">
    <div className="menu-top"><span className="brand-mark">R</span><span className="eyebrow">RIVERSOFT / STRATEGY LAB</span></div>
    <section className="menu-content"><div className="eyebrow gold">{text('prototype')}</div><h1>ROUGE<span>{text('title')}</span></h1><p className="menu-description">{text('menuBrief')}</p>
      <nav className="menu-actions"><button className="primary large" onClick={()=>setModal('setupSolo')} data-testid="single-player"><span>01</span>{text('single')}<b>↗</b></button><button className="menu-button" onClick={()=>setModal('setupLan')}><span>02</span>{text('multiplayer')}<b>→</b></button><button className="menu-button" onClick={showSaves} data-testid="open-saves"><span>03</span>{text('saves')}<b>→</b></button>{ticket&&<button className="quiet" onClick={()=>connect(ticket)}>{text('resumeLan')} · {ticket.code}</button>}</nav>
      <p className="small muted">{text('offlineHint')}</p><div className="platform-note">{text('platformPending')}</div>
    </section>
    <footer className="menu-footer"><div className="gold-line"/><span>{text('theatre')}</span><p>{text('theatreSub')}</p></footer>
    <div className="map-caption"><span className="map-caption-rule"/><div className="eyebrow">THE FRONTIER / 01</div><h2>{text('subtitle')}</h2><p>{inputHint}</p></div>
  </main>}
  {screen==='lobby'&&<section className="lobby panel">
    <span className="eyebrow gold">{text('lanTitle')}</span><h2>{text('waiting')}</h2><div className="room-code">{ticket?.code}</div><p className="muted">{text('lanHint')}</p>
    <div className="seats">{Array.from({length:4},(_,i)=>{const seat=room?.seats[i];return <div key={i} className="seat"><span className="faction-dot" style={{background:FACTION_COLORS[i]}}/>{seat?.flag&&<FlagImage flag={seat.flag} language={language}/>}<span>{seat?.name??'—'}</span><small>{seat?text(seat.leader):`${i+1} / 4`}</small>{i===0&&seat&&<b>{text('host')}</b>}</div>;})}</div>
    <div className={`connection ${network}`}>● {text(network)}</div><div className="row"><button className="secondary" onClick={leave}>{text('leave')}</button>{ticket?.actor===0?<button className="primary" disabled={busy||(room?.seats.length??0)<2} onClick={beginMatch}>{text('startMatch')} →</button>:<span className="muted">{text('waitingHost')}</span>}</div><p className="small muted">{text('lanOnly')}</p>
  </section>}
  {screen==='game'&&game&&player&&province&&<>
    <header className="hud-top"><FactionIdentity flag={player.flag} actor={actor} language={language} color={FACTION_COLORS[actor]}/><div className="commander-badge"><span className="faction-dot" style={{background:FACTION_COLORS[actor]}}/><div><b>{player.name}</b><small>{text(player.leader)}</small></div></div>
      <div className="resource"><span>{text('gold')}</span><strong>{Math.floor(player.gold).toLocaleString()}</strong></div><div className="resource"><span>{text('army')}</span><strong data-testid="army-total" title={text('noArmyCap')}>{army.toLocaleString()}</strong></div><div className="resource"><span>{text('territory')}</span><strong>{owned}<small> / {PLAYABLE_COUNT}</small></strong></div><div className="resource level-resource"><span>{text('level')}</span><strong>{player.level}<small> / 8</small></strong><div className="micro-progress"><i style={{width:`${Math.min(100,player.xp/(60+player.level*45)*100)}%`}}/></div></div>
      <div className="clock"><time data-testid="game-clock" data-tick={game.tick}>{timeLabel(game.tick)}</time>{session.current?.mode==='solo'?<div className="clock-controls"><button onClick={togglePause} data-testid="toggle-pause" title={text(paused?'resume':'pause')}>{paused?'▶':'Ⅱ'}</button><button onClick={()=>{const s=speed===1?2:1;session.current?.speed?.(s);setSpeed(s);}}>{speed}×</button></div>:<small className={`connection ${network}`}>● {text(network)}</small>}</div>
    </header>
    <button className="settings-trigger" data-testid="open-settings" onClick={openSettings} aria-label={text('settings')} aria-haspopup="dialog"><span aria-hidden="true">⚙</span><span>{text('settings')}</span></button>
    <nav className="army-actions" aria-label={text('armyActions')}><button className="upgrade-trigger" onClick={()=>setModal('upgrades')} data-testid="open-upgrades" aria-haspopup="dialog"><span className="upgrade-icon" aria-hidden="true">↟</span><span>{text('upgrades')}</span><span aria-hidden="true">›</span></button></nav>
    <aside id="province-panel" className={`province-panel panel ${mobilePanel==='province'?'mobile-panel-open':''}`}><div className="panel-kicker"><span>{text('province')} / {MAP[selected].code}</span><button className="icon-button" onClick={()=>world.current?.focusProvince(selected)} title={text('focus')}>⌖</button></div><h2>{MAP[selected].name[language==='zh'?0:1]}</h2><div className="province-meta"><span>{text('managementRegion')}</span><span className="status-dot"/>{text(province.capture>0?'contested':province.recovery>0?'recovering':'stable')}</div>
      <div className="province-owner"><span className="faction-dot" style={{background:province.owner<0?'#929481':FACTION_COLORS[province.owner]}}/>{province.owner<0?text('neutral'):game.players[province.owner].name}<b data-testid="region-capacity">{regionTroops(game,province.owner,selected)} / {PROVINCE_CAP}<small>{text('garrison')}</small></b></div>
      {province.capture>0&&<div className="capture"><span>{text('capture')}</span><div className="progress"><i style={{width:`${province.capture/8*100}%`}}/></div></div>}
      {province.owner===actor?<><label className="field-label">{text('production')}</label><select value={province.kind} onChange={e=>issue({type:'production',province:selected,kind:e.target.value as Kind})}>{player.loadout.map(k=><option key={k} value={k}>{text(k)}</option>)}</select><div className="production-line"><div className="progress"><i style={{width:`${province.production/UNITS[province.kind].train*100}%`}}/></div><span>{Math.floor(province.production)} / {UNITS[province.kind].train}s</span></div>
      <div className="section-divider"/><h3>{text('send')}</h3><label className="field-label" htmlFor="destination">{text('target')}</label><input className="destination-search" data-testid="destination-search" aria-label={text('filterDestination')} placeholder={text('filterDestination')} value={destinationQuery} onChange={e=>setDestinationQuery(e.target.value)}/><select id="destination" data-testid="destination" value={target} onChange={e=>setTarget(Number(e.target.value))}>{target<0&&<option value={-1}>—</option>}{destinations.map(p=><option key={p.id} value={p.id}>{p.name[language==='zh'?0:1]} · {game.provinces[p.id].owner===actor?'○':'◇'}</option>)}</select><div className="route-preview" data-testid="route-preview" data-route={route?.map(id=>MAP[id].code).join(',')??''}><strong>{route?text('routeLegs').replace('{count}',String(route.length-1)):text('noLandRoute')}</strong>{route?.some((id,i)=>i>0&&!MAP[route[i-1]].neighbors.includes(id))&&<small data-testid="sea-route">{text('seaRoute')}</small>}{route&&<small>{route.slice(0,6).map(id=>MAP[id].name[language==='zh'?0:1]).join(' → ')}{route.length>6?' → …':''}</small>}</div><small className="capacity-note" data-testid="destination-capacity">{text('destinationCapacity')} {target>=0?destinationRoom(game,actor,target):0} / {PROVINCE_CAP} · {text('reserved')} {target>=0?regionReservations(game,actor,target):0}</small><div className="fraction-picker">{[0.25,0.5,0.75,1].map(f=><button key={f} className={fraction===f?'active':''} onClick={()=>setFraction(f)}>{f*100}%</button>)}</div><button className="primary full" data-testid="dispatch" disabled={target<0||target===selected||!route||destinationRoom(game,actor,target)<1} onClick={()=>issue({type:'march',from:selected,to:target,fraction})}>{text('dispatch')}<span>↗</span></button><p className="small muted">{text('sendHint')}</p></>:<p className="muted">{text('selectFriendly')}</p>}
    </aside>
    <aside id="strategic-panel" className={`strategic-panel ${mobilePanel==='intel'?'mobile-panel-open':''}`}><section className="panel objective"><span className="eyebrow gold">{text('objective')}</span><h3>{text('theatre')}</h3><p>{text('objectiveDesc').replace('{count}',String(Math.ceil(PLAYABLE_COUNT*0.6)))}</p><div className="faction-bars">{game.players.map(p=><div key={p.id} title={p.name}><span style={{background:FACTION_COLORS[p.id],width:`${game.provinces.filter(v=>MAP[v.id].playable&&v.owner===p.id).length/PLAYABLE_COUNT*100}%`}}/></div>)}</div>{game.domination[actor]>0&&<b className="gold">{text('domination')} {Math.floor(game.domination[actor])} / 30{text('seconds')}</b>}</section>
      <section className="dispatches"><span className="eyebrow">{text('latest')}</span>{game.events.length?game.events.slice(-4).reverse().map((e,i)=><p key={`${e.tick}-${i}`}><time>{timeLabel(e.tick)}</time><span style={{color:FACTION_COLORS[e.player]}}>{game.players[e.player].name}</span> {text(`event.${e.key}`)}{e.province!==undefined?' '+MAP[e.province].name[language==='zh'?0:1]:''}</p>):<p className="muted">{text('noEvents')}</p>}</section>
    </aside>
    <div className="view-controls"><span className="compass">N<br/>✦</span><button className={!near?'active':''} onClick={()=>world.current?.view('strategic')} title={text('worldView')}>2D</button><button className={near?'active':''} onClick={()=>world.current?.view('terrain')}>3D</button><button onClick={()=>world.current?.zoom(-16)} title={text('zoomIn')} aria-label={text('zoomIn')}>＋</button><button onClick={()=>world.current?.zoom(16)} title={text('zoomOut')} aria-label={text('zoomOut')}>−</button><small>{text(near?'terrain':'strategic')}</small></div>
    <nav className="mobile-actions" aria-label={text('mobileActions')}>
      <button data-testid="toggle-province-panel" aria-controls="province-panel" aria-expanded={mobilePanel==='province'} onClick={()=>setMobilePanel(mobilePanel==='province'?null:'province')}>{text(mobilePanel==='province'?'hideProvince':'showProvince')}</button>
      <button data-testid="toggle-strategic-panel" aria-controls="strategic-panel" aria-expanded={mobilePanel==='intel'} onClick={()=>setMobilePanel(mobilePanel==='intel'?null:'intel')}>{text(mobilePanel==='intel'?'hideIntel':'showIntel')}</button>
      <button data-testid="mobile-talents" aria-haspopup="dialog" onClick={()=>setModal('talents')}>{text('talents')}{player.drafts>0?` (${player.drafts})`:''}</button>
    </nav>
    <CommanderPortrait player={player} language={language} color={FACTION_COLORS[actor]} onTalents={()=>setModal('talents')}/>
    {paused&&<div className="pause-banner">Ⅱ {text('paused')}</div>}
    {game.winner!==null&&<div className="modal-backdrop"><section className="modal result-modal"><div className="victory-symbol">✦</div><div className="eyebrow gold">{text('winner')} / {game.players[game.winner].name}</div><h2>{text(game.winner===actor?'victory':'defeat')}</h2><p>{timeLabel(game.tick)} · {owned}/{PLAYABLE_COUNT} {text('territory')} · {player.talents.length} {text('talents')}</p><button className="primary" onClick={leave}>{text('returnMenu')} →</button></section></div>}
  </>}
  {modal&&<ModalDialog className={`${modal.startsWith('setup')?'setup-modal':''} ${modal==='talents'?'talent-modal':''} ${modal==='settings'?'settings-modal':''}`} label={text(modal==='setupSolo'||modal==='setupLan'?'setup':modal)} onClose={closeModal} closeLabel={text('close')} pageKey={modal==='settings'?settingsPage:modal}>
    {modal==='settings'&&settingsPage==='general'&&<>
      <div className="eyebrow gold">ROUGE / {text('campaignSettings')}</div><h2>{text('settings')}</h2>
      <p className="settings-status muted">{text(session.current?.mode==='solo'?'settingsSoloPaused':'settingsLanRunning')}</p>
      <section className="settings-language"><h3>{text('language')}</h3><div className="settings-language-options"><button aria-label="简体中文" aria-pressed={language==='zh'} onClick={()=>setLanguage('zh')}>简体中文</button><button aria-label="English" aria-pressed={language==='en'} onClick={()=>setLanguage('en')}>English</button></div></section>
      <div className="settings-actions">
        <button className="settings-save" data-testid="settings-save" onClick={openSettingsSaves} disabled={session.current?.mode!=='solo'}><span aria-hidden="true">▤</span><div><strong>{text('save')}</strong><small>{text(session.current?.mode==='solo'?'settingsSaveHint':'settingsLanSaveUnavailable')}</small></div><span aria-hidden="true">›</span></button>
        <button className="primary full" data-testid="settings-resume" onClick={closeModal}>{text('returnGame')}<span aria-hidden="true">→</span></button>
        <button className="quiet settings-leave" onClick={leave}>{text('returnMenu')}</button>
      </div>
      <p className="settings-controls muted">{inputHint}<br/>{text('settingsKeyboard')}</p>
    </>}
    {modal==='settings'&&settingsPage==='saves'&&<button className="settings-back" data-testid="settings-back" onClick={()=>setSettingsPage('general')}>← {text('backSettings')}</button>}
    {(modal==='setupSolo'||modal==='setupLan')&&<><div className="eyebrow gold">{text(modal==='setupSolo'?'single':'multiplayer')} / 01</div><h2>{text('chooseLeader')}</h2><div className="leader-grid">{LEADERS.map((l,i)=><button key={l} className={`leader-card ${leader===l?'chosen':''}`} onClick={()=>setLeader(l)}><div className={`leader-art art-${i}`}><div className="leader-insignia">{SYMBOLS[l]}</div><span>0{i+1}</span></div><div className="leader-copy"><b>{text(l)}</b><p>{text(`${l}.desc`)}</p><span className="selected-dot">{leader===l?'●':'○'}</span></div></button>)}</div>
      <div className="setup-subheading"><div><span className="eyebrow">{text('loadout')} / 02</span><h3>{text('chooseUnits')}</h3></div><span className="gold">{loadout.length} / 1</span></div><p className="muted small">{text('chooseHint')} {text('baseStatsHint')} {text('transportStatsHint')}</p><div className="unit-grid">{KINDS.map(k=><button key={k} className={`unit-card ${loadout.includes(k)?'chosen':''}`} aria-pressed={loadout.includes(k)} data-testid={`choose-unit-${k}`} onClick={()=>setLoadout([k])}><span className="unit-mark">{SYMBOLS[k]}</span><div><b>{text(k)}</b><small>{text(`${k}.desc`)}</small><UnitAttributes values={UNITS[k]} language={language}/></div><span>{loadout.includes(k)?'✓':'＋'}</span></button>)}</div>
      <FlagEditor value={flag} onChange={setFlag} language={language}/><div className="setup-footer"><label>{text('commander')}<input data-testid="commander-name" value={name} maxLength={24} onChange={e=>setName(e.target.value)}/></label>{modal==='setupSolo'?<button className="primary" data-testid="begin-campaign" disabled={!name.trim()} onClick={startSolo}>{text('start')} →</button>:<div className="lan-actions"><button className="primary" disabled={busy||!name.trim()} onClick={()=>roomAction(false)}>{text('createRoom')}</button><div className="join-row"><input placeholder={text('roomCode')} value={code} maxLength={6} onChange={e=>setCode(e.target.value.toUpperCase().replace(/[^A-F0-9]/g,''))}/><button className="secondary" disabled={busy||code.length!==6||!name.trim()} onClick={()=>roomAction(true)}>{text('joinRoom')}</button></div></div>}</div>{modal==='setupLan'&&<p className="small muted">{text('lanHint')}<br/>{text('lanOnly')}</p>}
    </>}
    {(modal==='saves'||(modal==='settings'&&settingsPage==='saves'))&&<><div className="eyebrow gold">CAMPAIGN ARCHIVES</div><h2>{text('saves')}</h2><p className="muted">{text('saveHint')}</p>{session.current?.mode==='solo'&&game&&<div className="new-save"><input placeholder={text('saveName')} value={saveName} onChange={e=>setSaveName(e.target.value)} maxLength={64}/><button className="primary" data-testid="create-save" onClick={()=>saveCurrent(`manual-${crypto.randomUUID()}`,saveName||`${text('theatre')} ${timeLabel(game.tick)}`)}>{text('newSave')}</button></div>}
      <div className="save-list">{saves.length?saves.map(s=><article key={s.id} className="save-card"><div className="save-icon">▤</div><div className="save-description"><h3>{s.name}</h3><small>{s.corrupted?text('corrupt'):`${text(s.leader)} · ${timeLabel(s.tick)} · ${new Date(s.savedAt).toLocaleString(language==='zh'?'zh-CN':'en-US')}`}</small></div><div className="save-actions"><button className="secondary" onClick={()=>load(s.id)}>{text('load')}</button>{session.current?.mode==='solo'&&<button className="quiet" onClick={()=>{if(confirm(text('overwriteConfirm')))saveCurrent(s.id,s.name);}}>{text('overwrite')}</button>}<button className="quiet danger" onClick={()=>{if(confirm(text('deleteConfirm'))){deleteSave(localStorage,s.id);refreshSaves();}}}>{text('delete')}</button></div></article>):<div className="empty-state">{text('emptySaves')}</div>}</div><div className="row">{session.current?.mode==='solo'&&game&&<button className="secondary" onClick={exportCurrent}>{text('export')} ↗</button>}<button className="secondary" onClick={()=>fileInput.current?.click()}>{text('import')}</button><input hidden type="file" accept="application/json,.json" ref={fileInput} onChange={e=>importSave(e.target.files?.[0])}/></div>
    </>}
    {modal==='upgrades'&&player&&<><div className="eyebrow gold">ARMY DEVELOPMENT</div><h2>{text('upgrades')}</h2><p className="muted">{text('upgradesHint')}</p><div className="treasury">{text('gold')} <strong>{Math.floor(player.gold)}</strong></div><div className="upgrade-grid">{player.loadout.map(k=><article className="upgrade-card" key={k}><div className="upgrade-title"><span className="unit-mark">{SYMBOLS[k]}</span><h3>{text(k)}</h3></div><UnitAttributes values={stats(player,k)} language={language}/><p className="muted small">{text('currentStatsHint')} {text('transportStatsHint')}</p>{STATS.map(stat=>{const level=player.upgrades[k][stat],cost=upgradeCost(level);return <div className="upgrade-row" key={stat}><div><b>{text(stat)} <span className="gold">{level}/8</span></b><small>{text(`${stat}.desc`)}</small></div><button className="secondary" data-testid={`upgrade-${k}-${stat}`} disabled={level>=8||player.gold<cost} onClick={()=>issue({type:'upgrade',kind:k,stat})}>{level>=8?text('max'):`＋ ${cost}`}</button></div>;})}</article>)}</div></>}
    {modal==='talents'&&player&&<><div className="eyebrow gold">{text('talents')} / {text(player.leader)}</div><h2>{text('talentTitle')}</h2><p className="muted">{text('talentHint')}</p>{player.choices.length?<><div className="talent-grid">{player.choices.map((id,i)=><button className="talent-card" key={id} onClick={()=>{issue({type:'talent',id});setModal(null);}}><span className="talent-number">0{i+1}</span><div className="talent-symbol">{['✧','⌁','◇'][i]}</div><h3>{text(id)}</h3><p>{text(`${id}.desc`)}</p><span className="talent-select">{text('select')} →</span></button>)}</div><button className="secondary" disabled={player.rerolls===0} onClick={()=>issue({type:'reroll'})}>{text('reroll')} · {player.rerolls}</button></>:<div className="empty-state">{text('level')} {player.level}/8 · {Math.floor(player.xp)}/{60+player.level*45} XP</div>}{player.talents.length>0&&<div className="chosen-talents">{player.talents.map(id=><span key={id} title={text(`${id}.desc`)}>✧ {text(id)}</span>)}</div>}</>}
  </ModalDialog>}
  {toast&&<div className="toast" role="status">{toast}<button onClick={()=>setToast('')} aria-label={text('close')}>×</button></div>}
 </div>;
}
