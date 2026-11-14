import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {LEADERS} from '../game/content.ts';
import {createGame, isEliminated} from '../game/engine.ts';
import {factionColor} from '../game/factionColors.ts';
import type {Flag} from '../game/flags.ts';
import {MAP} from '../game/map.ts';
import {deleteSave, decodeSave, encodeSave, listSaves, MAX_SAVE_BYTES, readSave, writeSave, type SaveInfo} from '../game/save.ts';
import {getSpawnCapacity, makeAISetups} from '../game/spawns.ts';
import type {Command, GameState, Kind, Leader, PlayerSetup, Result} from '../game/types.ts';
import {api, configureRoom, createRoom, joinRoom, localSession, preloadLocalSession, remoteSession, type RoomInfo, type Session, type Ticket} from '../platform/session.ts';
import type {WorldRenderer} from '../render/WorldRenderer.ts';
import {CommanderPortrait} from './CommanderHud.tsx';
import {EliminationBody, VictoryOverlay} from './dialogs/ResultDialogs.tsx';
import {SavesView} from './dialogs/SavesView.tsx';
import {SettingsGeneral} from './dialogs/SettingsDialog.tsx';
import {SetupDialog, validCount} from './dialogs/SetupDialog.tsx';
import {TalentsDialog} from './dialogs/TalentsDialog.tsx';
import {FlagEditor} from './Flag.tsx';
import {Clock} from './hud/Clock.tsx';
import {CommandRail, type Dock} from './hud/CommandRail.tsx';
import {factionFocusRegion, factionSummaries, ownedRegions} from './hud/hudModel.ts';
import {MapSearch, type MapSearchHandle} from './hud/MapSearch.tsx';
import {MilitaryPanel} from './hud/MilitaryPanel.tsx';
import {NationsPanel} from './hud/NationsPanel.tsx';
import {Outliner} from './hud/Outliner.tsx';
import {TopBar} from './hud/TopBar.tsx';
import {Icon} from './icons.tsx';
import {t, timeLabel, type Language} from './i18n.ts';
import {InputDeviceTracker, type PointerIntent} from './inputDevice.ts';
import {LeaderBust, preloadPortraits} from './LeaderBust.tsx';
import {Lobby} from './Lobby.tsx';
import {ModalDialog} from './ModalDialog.tsx';
import {SessionLifetime} from './SessionLifetime.tsx';
import {loadSetupPreferences, saveSetupPreferences} from './setupPreferences.ts';
import {StartMenu, storedLanguage, type StartAction} from './StartMenu.tsx';
import {talentSelectionStatus} from './talentSelection.ts';
import {TerritoryManagement} from './TerritoryManagement.tsx';
import {TerritoryPanel} from './TerritoryPanel.tsx';
import {World} from './World.tsx';

type Modal = 'setupSolo' | 'setupLan' | 'playerLeader' | 'playerFlag' | 'saves' | 'talents' | 'settings' | 'territories';
const TICKET_KEY = 'rouge.ticket.ne-admin1-groups.v1';
/** Compact layouts narrow the desktop HUD and open side panels on demand. Keep in sync with compact.css. */
export const COMPACT_QUERY = '(max-width: 800px), (max-width: 1000px) and (max-height: 500px), (pointer: coarse) and (max-height: 560px)';

function useCompactLayout(): boolean {
 const [compact, setCompact] = useState(() => typeof matchMedia === 'function' && matchMedia(COMPACT_QUERY).matches);
 useEffect(() => {
  if(typeof matchMedia !== 'function') return;
  const query = matchMedia(COMPACT_QUERY), update = () => setCompact(query.matches);
  query.addEventListener('change', update); update();
  return () => query.removeEventListener('change', update);
 }, []);
 return compact;
}
function initialRegion(state: GameState, actor: number): number {
 const occupied = new Set(state.units.filter(u => u.owner === actor && u.target === null && !u.transport?.embarked).map(u => u.province));
 return state.provinces.find(p => p.owner === actor && occupied.has(p.id))?.id ?? state.provinces.find(p => p.owner === actor)?.id ?? 0;
}
function storedTicket(): Ticket | null {
 try {const x = JSON.parse(sessionStorage.getItem(TICKET_KEY) ?? 'null'); return x && typeof x.code === 'string' && typeof x.token === 'string' && Number.isInteger(x.actor) ? x : null;}
 catch {return null;}
}

export function App({initialAction = null, initialFocus = null, initialLanguage}: {initialAction?: StartAction | null; initialFocus?: string | null; initialLanguage?: Language} = {}) {
 const compact = useCompactLayout();
 const [inputDevice, setInputDevice] = useState<'touch' | 'mouse'>('mouse');
 const [language, setLanguage] = useState<Language>(initialLanguage ?? storedLanguage);
 const [screen, setScreen] = useState<'menu' | 'game' | 'lobby'>('menu');
 const [modal, setModal] = useState<Modal | null>(initialAction === 'settingsSaves' ? 'settings' : initialAction === 'resumeLan' ? null : initialAction);
 const [settingsPage, setSettingsPage] = useState<'general' | 'saves'>(initialAction === 'settingsSaves' ? 'saves' : 'general');
 const [dock, setDock] = useState<Dock | null>(null);
 const [outlinerOpen, setOutlinerOpen] = useState(() => !(typeof matchMedia === 'function' && matchMedia(COMPACT_QUERY).matches));
 const [spectating, setSpectating] = useState(false);
 const [localStarting, setLocalStarting] = useState(false);
 const [pendingTalent, setPendingTalent] = useState<string | null>(null);
 const seenTalentRound = useRef<string | null>(null);
 const [game, setGame] = useState<GameState | null>(null), [actor, setActor] = useState(0), [selected, setSelected] = useState(0);
 const [preferences] = useState(() => loadSetupPreferences());
 const [soloAICount, setSoloAICount] = useState('2'), [roomAICount, setRoomAICount] = useState('0'), [lobbyAI, setLobbyAI] = useState('0');
 const [leader, setLeader] = useState<Leader>(preferences.leader), [loadout, setLoadout] = useState<Kind[]>(['infantry']), [name, setName] = useState<string | null>(null);
 const [flag, setFlag] = useState<Flag>(preferences.flag);
 const [paused, setPaused] = useState(false), [speed, setSpeed] = useState(1), [toast, setToast] = useState('');
 const [saves, setSaves] = useState<SaveInfo[]>([]), [saveName, setSaveName] = useState(''), [code, setCode] = useState('');
 const [room, setRoom] = useState<RoomInfo | null>(null), [ticket, setTicket] = useState<Ticket | null>(storedTicket);
 const [network, setNetwork] = useState<'connected' | 'reconnecting'>('connected'), [busy, setBusy] = useState(false);
 const session = useRef<Session | null>(null), world = useRef<WorldRenderer | null>(null), latest = useRef<GameState | null>(null), autoTick = useRef(0);
 const mapSearch = useRef<MapSearchHandle>(null);
 const compactRef = useRef(compact), selectedRef = useRef(selected);
 latest.current = game; compactRef.current = compact; selectedRef.current = selected;
 const factionCapacity = useMemo(() => getSpawnCapacity(), []);
 const preview = useMemo(() => createGame([
  {name: 'North', leader: 'warden', loadout: ['infantry']}, {name: 'East', leader: 'vanguard', loadout: ['infantry']},
  {name: 'South', leader: 'steward', loadout: ['infantry']}, {name: 'West', leader: 'warden', loadout: ['infantry']},
 ]), []);
 const text = (key: string) => t(language, key), state = game ?? preview, player = game?.players[actor], province = game?.provinces[selected];
 const lobbyMaxAI = Math.max(0, (room?.capacity ?? factionCapacity) - (room?.seats.length ?? 1)), setupMaxAI = factionCapacity - 1;
 const eliminated = Boolean(game && isEliminated(game, actor)), showDefeat = eliminated && !spectating && game?.winner === null;
 const commanderName = name ?? text('yourName');
 const solo = session.current?.mode === 'solo';
 const factions = useMemo(() => game ? factionSummaries(game) : [], [game]);
 const regions = useMemo(() => game ? ownedRegions(game, actor) : [], [game, actor]);
 const owned = factions.find(faction => faction.id === actor)?.territory ?? 0;

 const notifyResult = (result: Result) => {if(!result.ok) {setPendingTalent(null); setToast(text(`error.${result.error}`));}};
 const report = (error: unknown) => setToast(text(`error.${error instanceof Error ? error.message : 'generic'}`));
 useEffect(() => setLobbyAI(String(room?.aiCount ?? 0)), [room?.aiCount]);
 useEffect(() => {if(eliminated) {setModal(null); setPendingTalent(null);}}, [eliminated]);
 useEffect(() => {
  const tracker = new InputDeviceTracker();
  const pointer = (event: PointerEvent) => setInputDevice(tracker.pointer(event as PointerEvent & PointerIntent, performance.now()));
  const keyboard = (event: KeyboardEvent) => {
   const target = event.target, editing = target instanceof HTMLElement && (target.isContentEditable || Boolean(target.closest('input,textarea,select,[contenteditable]')));
   setInputDevice(tracker.key(event.key, editing));
  };
  document.addEventListener('pointerdown', pointer, true); document.addEventListener('keydown', keyboard, true);
  return () => {document.removeEventListener('pointerdown', pointer, true); document.removeEventListener('keydown', keyboard, true);};
 }, []);
 // Docks are not modal: the map stays live beside them. Only dialogs block map input.
 useEffect(() => {world.current?.setInputContext(screen === 'game' && !localStarting && !modal && !showDefeat && game?.winner === null ? 'game' : 'blocked');}, [screen, localStarting, modal, showDefeat, game?.winner]);
 useEffect(() => {document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en'; document.title = text('title'); try {localStorage.setItem('rouge.language', language);} catch {/* Language still works without storage. */}}, [language]);
 useEffect(() => {if(!toast) return; const id = setTimeout(() => setToast(''), 4500); return () => clearTimeout(id);}, [toast]);
 // Entering a compact layout closes the side panels; widening restores the region dock and outliner.
 const previousCompact = useRef(compact);
 useEffect(() => {
  if(previousCompact.current === compact) return;
  previousCompact.current = compact;
  setDock(compact ? null : selectedRef.current >= 0 ? 'region' : null);
  setOutlinerOpen(!compact);
 }, [compact]);

 function refreshSaves() {try {setSaves(listSaves(localStorage));} catch {setToast(text('saveFailed'));}}
 function showSaves() {refreshSaves(); setModal('saves');}
 function openSettings() {setSettingsPage('general'); setModal('settings');}
 function openSettingsSaves() {refreshSaves(); setSettingsPage('saves');}
 useEffect(() => {
  const status = talentSelectionStatus(player, pendingTalent);
  if(status !== 'waiting') {setPendingTalent(null); if(status === 'done') setModal(current => current === 'talents' ? null : current);}
 }, [pendingTalent, player?.talents, player?.drafts, player?.choices]);
 const appearanceOrigin = useRef<'setupSolo' | 'setupLan'>('setupSolo');
 const initialFocusRef = useRef(initialFocus);
 function restoreFocus(testId: string | null) {
  if(!testId) return;
  requestAnimationFrame(() => {
   // Never steal focus from a field the player has already started typing into.
   if(document.activeElement?.matches('input,select,textarea,[contenteditable="true"]')) return;
   document.querySelector<HTMLElement>(`[data-testid="${testId}"]`)?.focus({preventScroll: true});
  });
 }
 function openAppearance(next: 'playerLeader' | 'playerFlag') {if(modal === 'setupSolo' || modal === 'setupLan') appearanceOrigin.current = modal; setModal(next);}
 function closeModal() {
  if(modal === 'playerLeader' || modal === 'playerFlag') {setModal(appearanceOrigin.current); restoreFocus(modal === 'playerLeader' ? 'edit-player-leader' : 'edit-player-flag');}
  else {setModal(null); restoreFocus(initialFocusRef.current); initialFocusRef.current = null;}
 }
 const initialized = useRef(false);
 useEffect(() => {
  if(initialized.current) return;
  initialized.current = true;
  preloadLocalSession(); preloadPortraits();
  if(initialAction === 'saves' || initialAction === 'settingsSaves') refreshSaves();
  if(initialAction === 'resumeLan' && ticket) connect(ticket);
  if(!initialAction) {restoreFocus(initialFocusRef.current); initialFocusRef.current = null;}
 }, []);
 // The settings menu pauses only the local simulation, without changing the user's pause intent.
 useEffect(() => {if(screen === 'game' && session.current?.mode === 'solo') session.current.pause?.(paused || modal === 'settings');}, [paused, modal, screen]);
 function saveCurrent(id: string, displayName: string, quiet = false): boolean {
  if(!latest.current || session.current?.mode !== 'solo') return false;
  try {writeSave(localStorage, id, latest.current, displayName); if(!quiet) setToast(text('saveSuccess')); refreshSaves(); return true;}
  catch {setToast(text('saveFailed')); return false;}
 }
 useEffect(() => {if(game && session.current?.mode === 'solo' && game.tick - autoTick.current >= 1200) {autoTick.current = game.tick; saveCurrent(`auto-${game.campaign}`, text('autosave'), true);}}, [game?.tick]);
 useEffect(() => {if(screen === 'game' || screen === 'menu') world.current?.view('strategic');}, [screen, actor]);
 function resetHud(region: number) {setDock(!compactRef.current && region >= 0 ? 'region' : null); setOutlinerOpen(!compactRef.current);}
 function cancelLocalStart() {session.current?.dispose(); session.current = null; setLocalStarting(false); setGame(null); setScreen('menu'); setModal(null);}
 function launchLocal(value: GameState) {
  const region = initialRegion(value, 0);
  setSpectating(false); setPendingTalent(null); session.current?.dispose(); setActor(0); setGame(value); setSelected(region); resetHud(region);
  setScreen('game'); setModal(null); setPaused(false); setSpeed(1); setLocalStarting(true); autoTick.current = value.tick;
  let initialized = false;
  try {
   session.current = localSession(value, next => {initialized = true; setGame(next); setLocalStarting(false);}, result => {if(!result.ok && !initialized) cancelLocalStart(); notifyResult(result);});
  } catch(error) {cancelLocalStart(); report(error);}
 }
 useEffect(() => {saveSetupPreferences({leader, flag});}, [leader, flag]);
 function setup(): PlayerSetup {return {name: commanderName.trim(), leader, flag, loadout};}
 function startSolo() {
  if(!validCount(soloAICount, 1, setupMaxAI)) return;
  try {const seed = crypto.getRandomValues(new Uint32Array(1))[0]; launchLocal(createGame([setup(), ...makeAISetups(Number(soloAICount), seed)], seed, crypto.randomUUID()));}
  catch(error) {report(error);}
 }
 function connect(next: Ticket) {
  setSpectating(false); setPendingTalent(null); session.current?.dispose(); setTicket(next);
  try {sessionStorage.setItem(TICKET_KEY, JSON.stringify(next));} catch {/* Reconnection still works in this tab. */}
  setGame(null); setActor(next.actor); setRoom(null); setScreen('lobby'); setModal(null); setNetwork('reconnecting');
  let initialized = false;
  session.current = remoteSession(next, value => {
   setGame(value); setScreen('game');
   if(!initialized) {const region = initialRegion(value, next.actor); setSelected(region); resetHud(region); initialized = true;}
  }, setRoom, setNetwork, notifyResult);
 }
 async function roomAction(join: boolean) {
  if(!join && !validCount(roomAICount, 0, setupMaxAI)) return;
  setBusy(true);
  try {connect(await (join ? joinRoom(code, setup()) : createRoom(setup(), Number(roomAICount))));} catch(error) {report(error);} finally {setBusy(false);}
 }
 async function changeRoomAI(aiCount: number) {if(!ticket) return; setBusy(true); try {setRoom(await configureRoom(ticket, aiCount));} catch(error) {report(error);} finally {setBusy(false);}}
 async function beginMatch() {if(!ticket) return; setBusy(true); try {await api(`/rooms/${ticket.code}/start`, {}, ticket.token);} catch(error) {report(error);} finally {setBusy(false);}}
 function issue(command: Command) {if(localStarting) return; if(eliminated) {notifyResult({ok: false, error: 'eliminated'}); return;} session.current?.command(command);}
 function selectProvince(id: number, attack: boolean) {
  if(screen !== 'game' || localStarting) return;
  if(attack) {if(eliminated || !MAP[selected] || !MAP[id]) return; issue({type: 'march', from: selected, to: id, fraction: 1});}
  else if(id === -1) {setSelected(-1); setDock(current => current === 'region' ? null : current);}
  else if(MAP[id]) {setSelected(id); if(!compactRef.current) setDock('region');}
 }
 /** Outliner, search, nations and dispatch shortcuts: select, frame and (on wide screens) dock the region. */
 const jumpToRegion = useCallback((id: number) => {
  if(!MAP[id]) return;
  setSelected(id); world.current?.focusProvince(id);
  if(compactRef.current) setOutlinerOpen(false); else setDock('region');
 }, []);
 function focusNation(id: number) {if(game) {const region = factionFocusRegion(game, id); if(region >= 0) jumpToRegion(region);}}
 function toggleDock(next: Dock) {
  if(next === 'region' && selected < 0) return;
  setDock(current => current === next ? null : next);
  if(compact) setOutlinerOpen(false);
 }
 function toggleOutliner() {const next = !outlinerOpen; setOutlinerOpen(next); if(compact && next) setDock(null);}
 function closeDock() {
  const current = dock, panel = document.querySelector('.dock-panel:not([hidden])');
  setDock(null);
  if(current && panel?.contains(document.activeElement)) requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-rail="${current}"]`)?.focus({preventScroll: true}));
 }
 function togglePause() {if(session.current?.mode !== 'solo') return; setPaused(!paused);}
 function changeSpeed(value: number) {session.current?.speed?.(value); setSpeed(value);}
 function leave() {
  if(screen === 'game' && !window.confirm(text('exitConfirm'))) return;
  if(session.current?.mode === 'solo' && latest.current) {if(!saveCurrent(`auto-${latest.current.campaign}`, text('autosave'), true) && !window.confirm(text('saveFailed'))) return;}
  session.current?.dispose(); session.current = null; setGame(null); setScreen('menu'); setRoom(null); setModal(null); setPaused(false); setDock(null);
  try {sessionStorage.removeItem(TICKET_KEY);} catch {/* Nothing to forget. */}
  setTicket(null);
 }
 function load(id: string) {try {const {state: loaded, recovered} = readSave(localStorage, id); launchLocal(loaded); if(recovered) setToast(text('recovered'));} catch(error) {report(error);}}
 function exportCurrent() {
  if(!game) return;
  const blob = new Blob([encodeSave(game, saveName || text('theatre'))], {type: 'application/json'}), url = URL.createObjectURL(blob), anchor = document.createElement('a');
  anchor.href = url; anchor.download = `rouge-${game.campaign}.json`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 0);
 }
 async function importSave(file: File | undefined) {
  if(!file) return;
  try {
   if(file.size > MAX_SAVE_BYTES) throw new Error('invalidSave');
   const decoded = decodeSave(await file.text());
   writeSave(localStorage, `import-${crypto.randomUUID()}`, decoded.state, decoded.name); refreshSaves(); setToast(text('saveSuccess'));
  } catch(error) {report(error);}
 }
 useEffect(() => {
  const key = (event: KeyboardEvent) => {
   if(localStarting) {if(event.key === 'Escape') {event.preventDefault(); cancelLocalStart();} return;}
   if(showDefeat) return;
   if(event.key === 'Escape') {
    event.preventDefault();
    if(modal === 'settings' && settingsPage === 'saves') setSettingsPage('general');
    else if(modal) closeModal();
    // Like a grand-strategy HUD, Escape closes deliberately opened windows before opening the menu.
    else if(screen === 'game' && compact && (dock || outlinerOpen)) {setDock(null); setOutlinerOpen(false);}
    else if(screen === 'game' && dock && dock !== 'region') closeDock();
    else if(screen === 'game' && game?.winner === null) openSettings();
    return;
   }
   if((event.target as HTMLElement).closest('input,select,textarea,button') || screen !== 'game') return;
   if(event.code === 'Space' && !modal) {event.preventDefault(); togglePause();}
  };
  window.addEventListener('keydown', key);
  return () => window.removeEventListener('keydown', key);
 }, [paused, modal, screen, settingsPage, localStarting, showDefeat, game?.winner, dock, outlinerOpen, compact]);

 const modalClass = modal ? [modal.startsWith('setup') ? 'setup-modal' : '', modal === 'playerLeader' || modal === 'playerFlag' ? 'identity-modal' : '',
  modal === 'talents' ? 'talent-modal' : '', modal === 'settings' ? 'settings-modal' : '', modal === 'saves' ? 'saves-modal' : '', modal === 'territories' ? 'territory-modal' : ''].join(' ') : '';
 const modalTitle = modal === 'setupSolo' || modal === 'setupLan' ? text('setup') : modal === 'settings' ? text(settingsPage === 'saves' ? 'saves' : 'settings')
  : modal === 'playerLeader' ? text('playerLeader') : modal === 'playerFlag' ? text('playerFlag') : modal === 'saves' ? text('saves')
  : modal === 'talents' ? text('talents') : modal === 'territories' ? text('territories') : '';
 const modalKicker = modal === 'setupSolo' ? text('single') : modal === 'setupLan' ? text('multiplayer') : modal === 'playerLeader' || modal === 'playerFlag' ? text('playerAppearance')
  : modal === 'talents' && player ? text(player.leader) : modal === 'territories' && game && MAP[selected] ? MAP[selected].name[language === 'zh' ? 0 : 1] : undefined;
 const savesView = <SavesView saves={saves} language={language} canSave={solo && Boolean(game)} canExport={solo && Boolean(game)} saveName={saveName} onSaveName={setSaveName}
  onCreate={() => game && saveCurrent(`manual-${crypto.randomUUID()}`, saveName || `${text('theatre')} ${timeLabel(game.tick)}`)} onLoad={load}
  onOverwrite={save => {if(confirm(text('overwriteConfirm'))) saveCurrent(save.id, save.name);}}
  onDelete={id => {if(confirm(text('deleteConfirm'))) {deleteSave(localStorage, id); refreshSaves();}}} onExport={exportCurrent} onImport={importSave}/>;

 return <div className={`app ${screen === 'menu' ? 'is-menu' : screen === 'game' ? 'is-game' : 'is-lobby'}`} data-layout={compact ? 'compact' : 'wide'} data-dock={dock ?? 'none'}
  data-input-device={inputDevice} data-resource-state="ready" data-local-ready={String(!localStarting)} aria-busy={localStarting} data-eliminated={eliminated}>
  <SessionLifetime session={session}/>
  <World state={state} selected={screen === 'game' ? selected : -1} language={language} onPick={selectProvince} onMode={() => {}} worldRef={world}/>
  <div className="map-vignette"/>
  {screen !== 'game' && <div className="language-switch">
   <button type="button" className={language === 'zh' ? 'active' : ''} onClick={() => setLanguage('zh')} aria-label="简体中文">中</button><span>/</span>
   <button type="button" className={language === 'en' ? 'active' : ''} onClick={() => setLanguage('en')} aria-label="English">EN</button>
  </div>}
  {screen === 'menu' && <StartMenu language={language} resumeCode={ticket?.code} onAction={action => {
   if(action === 'saves') showSaves(); else if(action === 'settings') openSettings(); else if(action === 'resumeLan' && ticket) connect(ticket); else if(action === 'setupSolo' || action === 'setupLan') setModal(action);
  }}/>}
  {screen === 'lobby' && <Lobby room={room} ticket={ticket} network={network} busy={busy} language={language} aiDraft={lobbyAI} maxAI={lobbyMaxAI}
   onAIDraft={setLobbyAI} onApplyAI={changeRoomAI} onLeave={leave} onStart={beginMatch}/>}
  {screen === 'game' && game && player && <>
   <TopBar state={game} actor={actor} owned={owned} language={language} onTalents={() => setModal('talents')}
    clock={<Clock tick={game.tick} solo={solo} paused={paused} speed={speed} network={network} language={language} onPause={togglePause} onSpeed={changeSpeed}
     actions={<><button type="button" className="clock-action all-regions-trigger" data-testid="open-all-regions" onClick={() => mapSearch.current?.open()} disabled={localStarting || showDefeat || game.winner !== null}
      aria-label={text('allRegions')} title={`${text('allRegions')} · F`} aria-keyshortcuts="F"><Icon name="territory" size={21}/></button>
      <button type="button" className="clock-action settings-trigger" data-testid="open-settings" onClick={openSettings} aria-label={text('settings')} title={`${text('settings')} · Esc`} aria-haspopup="dialog">
       <Icon name="gear" size={21}/>
      </button></>}/>}/>
   <MapSearch ref={mapSearch} state={game} language={language} onPick={jumpToRegion} enabled={!localStarting && !modal && !showDefeat && game.winner === null}/>
   <CommandRail language={language} dock={dock} outlinerOpen={outlinerOpen} hasRegion={Boolean(province)} pendingTalents={player.choices.length ? player.drafts + 1 : 0}
    onDock={toggleDock} onTalents={() => setModal('talents')} onOutliner={toggleOutliner}/>
   <div className={`hud-dock${dock ? ' mobile-panel-open' : ''}`} data-dock={dock ?? 'none'}>
    {/* The selected region stays mounted (hidden when another window is docked), so its figures remain readable. */}
    {province && <TerritoryPanel state={game} selected={selected} actor={actor} eliminated={eliminated} language={language} hidden={dock !== 'region'}
     onFocus={() => world.current?.focusProvince(selected)} onManage={() => setModal('territories')} onClose={closeDock} onCommand={issue}/>}
    {dock === 'military' && <MilitaryPanel player={player} eliminated={eliminated} language={language} onCommand={issue} onClose={closeDock}/>}
    {dock === 'nations' && <NationsPanel state={game} actor={actor} factions={factions} language={language} onFocusNation={id => {if(compact) closeDock(); focusNation(id);}} onClose={closeDock}/>}
   </div>
   <Outliner state={game} actor={actor} owned={owned} factions={factions} regions={regions} language={language} open={outlinerOpen}
    onFocusNation={focusNation} onSelectRegion={jumpToRegion} onShowNations={() => {setDock('nations'); if(compact) setOutlinerOpen(false);}}/>
   <CommanderPortrait player={player} language={language} color={factionColor(actor)} onTalents={() => setModal('talents')}/>
   {paused && solo && <div className="pause-banner" role="status"><span aria-hidden="true">Ⅱ</span>{text('paused')}</div>}
   {eliminated && spectating && game.winner === null && <div className="elimination-status" role="status" data-testid="spectating-status">{text('eliminatedSpectating')}</div>}
   {game.winner !== null && <VictoryOverlay state={game} actor={actor} owned={owned} language={language} onLeave={leave}/>}
  </>}
  {showDefeat && <ModalDialog className="result-modal elimination-modal" label={text('eliminatedTitle')} onClose={() => setSpectating(true)} closeLabel={text('spectate')} pageKey="eliminated">
   <EliminationBody language={language} onSpectate={() => setSpectating(true)} onLeave={leave}/>
  </ModalDialog>}
  {modal && <ModalDialog className={modalClass} label={modal === 'setupSolo' || modal === 'setupLan' ? text('setup') : text(modal)} onClose={closeModal} closeLabel={text('close')}
   pageKey={modal === 'settings' ? settingsPage : modal} title={modalTitle} kicker={modalKicker}>
   {modal === 'settings' && settingsPage === 'general' && <SettingsGeneral language={language} inGame={screen === 'game'} solo={solo} onLanguage={setLanguage}
    onSaves={openSettingsSaves} onResume={closeModal} onLeave={leave}/>}
   {modal === 'settings' && settingsPage === 'saves' && <><button type="button" className="settings-back" data-testid="settings-back" onClick={() => setSettingsPage('general')}>
    <Icon name="back" size={16}/>{text('backSettings')}</button>{savesView}</>}
   {modal === 'saves' && savesView}
   {modal === 'playerLeader' && <div className="leader-grid">{LEADERS.map((option, index) => <button type="button" data-testid={`choose-leader-${option}`} aria-pressed={leader === option} key={option}
    className={`leader-card ${leader === option ? 'chosen' : ''}`} onClick={() => setLeader(option)}>
    <div className={`leader-art art-${index}`}><LeaderBust leader={option} label={text(option)}/><span>0{index + 1}</span></div>
    <div className="leader-copy"><b>{text(option)}</b><span className="selected-dot">{leader === option ? '●' : '○'}</span></div>
   </button>)}</div>}
   {modal === 'playerFlag' && <FlagEditor value={flag} onChange={setFlag} language={language}/>}
   {(modal === 'setupSolo' || modal === 'setupLan') && <SetupDialog mode={modal} language={language} flag={flag} leader={leader} loadout={loadout}
    aiCount={modal === 'setupSolo' ? soloAICount : roomAICount} maxAI={setupMaxAI} name={commanderName} code={code} busy={busy}
    onAppearance={openAppearance} onLoadout={kind => setLoadout([kind])} onAICount={value => modal === 'setupSolo' ? setSoloAICount(value) : setRoomAICount(value)}
    onName={setName} onCode={setCode} onStart={startSolo} onCreateRoom={() => roomAction(false)} onJoinRoom={() => roomAction(true)}/>}
   {modal === 'territories' && game && <TerritoryManagement state={game} grouping={game.grouping} selected={selected} actor={actor} eliminated={eliminated} language={language} onCommand={issue}/>}
   {modal === 'talents' && player && game && <TalentsDialog player={player} campaign={game.campaign} seenRound={seenTalentRound} eliminated={eliminated} pending={pendingTalent !== null} language={language}
    onChoose={id => {setPendingTalent(id); issue({type: 'talent', id});}} onReroll={expectedCost => issue({type: 'reroll', expectedCost})}/>}
  </ModalDialog>}
  {localStarting && <ModalDialog label={text('starting')} closeLabel={text('close')} onClose={cancelLocalStart} pageKey="local-starting" className="starting-modal">
   <p role="status" data-testid="local-starting"><Icon name="hourglass" size={18}/>{text('starting')}</p>
  </ModalDialog>}
  {toast && <div className="toast" role="status"><span>{toast}</span><button type="button" onClick={() => setToast('')} aria-label={text('close')}><Icon name="close" size={14}/></button></div>}
 </div>;
}
