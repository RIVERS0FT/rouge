import { MAP, provinceAt, pointInProvince, STARTS, PLAYABLE_COUNT } from './map.ts';
import { Navigator, cellAt, cellCenter } from './navigation.ts';
import { DT, MAP_ID, KINDS, STATS, TALENTS, UNITS, PLAYER_CAP, MAX_UNITS, stats, upgradeCost, validateSetup } from './content.ts';
import type { GameState, PlayerSetup, Player, Unit, Kind, Command, Result } from './types.ts';
function random(s:GameState):number{let x=s.rng;x^=x<<13;x^=x>>>17;x^=x<<5;s.rng=x>>>0;return s.rng/4294967296;}
export function createGame(setups:PlayerSetup[],seed=20261108,campaign=`campaign-${seed}`):GameState{
  if(setups.length<2||setups.length>4||!setups.every(validateSetup))throw new Error('invalidSetup');
  if(!Number.isInteger(seed)||seed<0||seed>0xffffffff||campaign.length>100)throw new Error('invalidSetup');
  const s:GameState={version:3,map:MAP_ID,campaign,seed,rng:(seed>>>0)||1,tick:0,nextId:1,topology:0,players:[],provinces:MAP.map(p=>({id:p.id,owner:-1,production:0,kind:'infantry',recovery:0,captor:-1,capture:0})),units:[],events:[],winner:null,domination:setups.map(()=>0)};
  s.players=setups.map((p,id)=>({id,name:p.name.trim(),leader:p.leader,loadout:[...p.loadout],ai:p.ai??false,gold:120,xp:0,level:1,upgrades:Object.fromEntries(KINDS.map(k=>[k,{attack:0,health:0,speed:0}])) as Player['upgrades'],talents:[],choices:[],drafts:0,rerolls:1}));
  // Each commander starts with a real province and one available land neighbor.
  for (let actor=0;actor<setups.length;actor++) {
    const id=STARTS[actor];s.provinces[id].owner=actor;
    const other=MAP[id].neighbors.find(n=>s.provinces[n].owner<0&&!STARTS.includes(n)&&MAP[n].playable);
    if(other!==undefined)s.provinces[other].owner=actor;
  }
  const frontier=new Set(s.provinces.filter(p=>p.owner>=0).flatMap(p=>MAP[p.id].neighbors));
  for(const p of s.provinces) {
    const count=p.owner>=0?5:frontier.has(p.id)?2:0;
    for(let i=0;i<count&&s.units.length<MAX_UNITS;i++)spawn(s,p.id,'infantry');
  }
  return s;
}
function spawn(s:GameState,province:number,kind:Kind):void{
  const p=s.provinces[province],id=s.nextId++,c=MAP[province].center,a=id*2.399963,r=0.6+(id%5)*0.3;
  let x=c.x+Math.cos(a)*r,z=c.z+Math.sin(a)*r;
  if(!pointInProvince(province,x,z)){x=c.x;z=c.z;}
  s.units.push({id,owner:p.owner,kind,x,z,hp:stats(s.players[p.owner],kind).hp,province,target:null,origin:province,cooldown:0});
}
function draft(s:GameState,p:Player):void{
  if(p.choices.length||p.drafts<=0)return;
  const available=TALENTS.filter(t=>!p.talents.includes(t.id)&&(!t.kind||p.loadout.includes(t.kind))).map(t=>t.id);
  for(let i=available.length-1;i>0;i--){const j=Math.floor(random(s)*(i+1));[available[i],available[j]]=[available[j],available[i]];}
  p.choices=available.slice(0,3);if(!p.choices.length)p.drafts=0;
}
function experience(s:GameState,id:number,amount:number):void{
  const p=s.players[id];if(!p)return;p.xp+=amount;
  while(p.level<8&&p.xp>=60+p.level*45){p.xp-=60+p.level*45;p.level++;p.drafts++;s.events.push({tick:s.tick,key:'level',player:id});}draft(s,p);
}
export class Engine{
  state:GameState;navigation=new Navigator();
  constructor(state:GameState){this.state=structuredClone(state);}
  command(actor:number,input:unknown):Result{
    const s=this.state,p=s.players[actor],fail=(error:string):Result=>({ok:false,error});
    if(!p||s.winner!==null)return fail('notPlaying');if(!input||typeof input!=='object')return fail('invalidCommand');const c=input as Command;
    switch(c.type){
      case 'march':{
        if(!Number.isInteger(c.from)||!Number.isInteger(c.to)||!Number.isFinite(c.fraction)||c.fraction<0.25||c.fraction>1)return fail('invalidCommand');
        const from=s.provinces[c.from],to=s.provinces[c.to];if(!from||!to||from.owner!==actor)return fail('notOwner');
        if(!MAP[c.to].playable||!MAP[c.from].neighbors.includes(c.to))return fail('notAdjacent');
        const available=s.units.filter(u=>u.owner===actor&&u.province===c.from&&u.target===null);
        const n=Math.floor(available.length*c.fraction);if(n<1)return fail('noTroops');
        const flow=this.navigation.get(s,actor,c.to,c.from),reachable=available.filter(u=>{const cell=cellAt(u.x,u.z,flow);return cell>=0&&Number.isFinite(flow.distance[cell]);});
        if(!reachable.length)return fail('unreachable');for(const u of reachable.slice(0,n)){u.target=c.to;u.origin=c.from;}return{ok:true};
      }
      case 'production':{
        if(!Number.isInteger(c.province)||!KINDS.includes(c.kind)||!p.loadout.includes(c.kind))return fail('invalidCommand');
        const province=s.provinces[c.province];if(!province||province.owner!==actor)return fail('notOwner');
        // Keep the fractional work when changing the queue; switching never grants a free unit.
        province.production=Math.min(province.production/UNITS[province.kind].train,0.99)*UNITS[c.kind].train;province.kind=c.kind;return{ok:true};
      }
      case 'upgrade':{
        if(!KINDS.includes(c.kind)||!STATS.includes(c.stat)||!p.loadout.includes(c.kind))return fail('invalidCommand');
        const level=p.upgrades[c.kind][c.stat],cost=upgradeCost(level);if(level>=8)return fail('maxLevel');if(p.gold<cost)return fail('noGold');
        const oldHp=stats(p,c.kind).hp;p.gold-=cost;p.upgrades[c.kind][c.stat]++;
        if(c.stat==='health'){const newHp=stats(p,c.kind).hp;for(const u of s.units)if(u.owner===actor&&u.kind===c.kind)u.hp=u.hp/oldHp*newHp;}return{ok:true};
      }
      case 'talent':{
        if(typeof c.id!=='string'||!p.choices.includes(c.id))return fail('invalidChoice');p.talents.push(c.id);p.choices=[];p.drafts--;draft(s,p);return{ok:true};
      }
      case 'reroll':{
        if(!p.choices.length||p.rerolls<1)return fail('noRerolls');p.rerolls--;p.choices=[];draft(s,p);return{ok:true};
      }
      default:return fail('invalidCommand');
    }
  }
  step(count=1):void{for(let n=0;n<count;n++){if(this.state.winner!==null)return;this.tick();}}
  private tick():void{
    const s=this.state;s.tick++;
    const damage=new Map<number,{amount:number;attacker:number}>(),buckets=new Map<string,Unit[]>();
    for(const u of s.units){const key=`${Math.floor(u.x/8)},${Math.floor(u.z/8)}`,b=buckets.get(key)??[];b.push(u);buckets.set(key,b);}
    for(const u of s.units){
      const st=stats(s.players[u.owner],u.kind);u.cooldown=Math.max(0,u.cooldown-DT);let enemy:Unit|undefined,nearest=st.range*st.range;
      const bx=Math.floor(u.x/8),bz=Math.floor(u.z/8);
      for(let x=bx-1;x<=bx+1;x++)for(let z=bz-1;z<=bz+1;z++)for(const v of buckets.get(`${x},${z}`)??[]){if(v.owner===u.owner||(!MAP[u.province].neighbors.includes(v.province)&&u.province!==v.province))continue;const d=(u.x-v.x)**2+(u.z-v.z)**2;if(d<nearest){nearest=d;enemy=v;}}
      if(enemy){
        if(u.cooldown<=0){const defender=s.players[enemy.owner],home=s.provinces[enemy.province]?.owner===enemy.owner,reduction=home?((defender?.leader==='warden'?0.1:0)+(defender?.talents.includes('entrenchment')?0.15:0)):0,old=damage.get(enemy.id);damage.set(enemy.id,{amount:(old?.amount??0)+st.attack*(1-reduction),attacker:u.owner});u.cooldown=1;}continue;
      }
      if(u.target===null)continue;
      // Follow a local flow field; closing with a defender is allowed only along land.
      let goal=MAP[u.target].center;
      if(u.province===u.target){const defenders=s.units.filter(v=>v.owner!==u.owner&&v.province===u.target).sort((a,b)=>Math.hypot(a.x-u.x,a.z-u.z)-Math.hypot(b.x-u.x,b.z-u.z));if(defenders[0])goal=defenders[0];}
      const distance=Math.hypot(goal.x-u.x,goal.z-u.z);
      if(distance<0.35&&pointInProvince(u.target,u.x,u.z)){u.province=u.target;if(s.provinces[u.target].owner===u.owner)u.target=null;continue;}
      const flow=this.navigation.get(s,u.owner,u.target,u.origin),cell=cellAt(u.x,u.z,flow),next=cell<0?-1:flow.next[cell];
      if(next<0){u.target=null;continue;}const direct=this.navigation.canMove(flow,u.x,u.z,goal.x,goal.z),point=(u.province===u.target&&direct)||next===cell?goal:cellCenter(next,flow),dx=point.x-u.x,dz=point.z-u.z,d=Math.hypot(dx,dz);
      if(d>1e-6){const terrain=MAP[u.province].terrain,move=Math.min(d,st.speed*DT/(terrain==='highland'?1.4:1));const nx=u.x+dx/d*move,nz=u.z+dz/d*move;if(this.navigation.canMove(flow,u.x,u.z,nx,nz)){u.x=nx;u.z=nz;const id=pointInProvince(u.target,u.x,u.z)?u.target:provinceAt(u.x,u.z);if(id>=0)u.province=id;}else{u.target=null;}}
    }
    // Apply accumulated damage simultaneously, so entity iteration order cannot prevent retaliation.
    for(const u of s.units){const hit=damage.get(u.id);if(hit){u.hp-=hit.amount;if(u.hp<=0)experience(s,hit.attacker,12);}}s.units=s.units.filter(u=>u.hp>0);
    const counts=s.players.map(p=>s.units.filter(u=>u.owner===p.id).length);
    const byProvince=new Map<number,Unit[]>();
    for(const u of s.units){const group=byProvince.get(u.province)??[];group.push(u);byProvince.set(u.province,group);}
    for(const province of s.provinces){
      const occupants=byProvince.get(province.id)??[];
      if(!MAP[province.id].playable||(province.owner<0&&!occupants.length))continue;
      const center=MAP[province.id].center,nearby=occupants.filter(u=>Math.hypot(u.x-center.x,u.z-center.z)<3.7),owners=[...new Set(nearby.map(u=>u.owner))];
      const attacker=owners.length===1&&owners[0]>=0&&owners[0]!==province.owner?owners[0]:-1;
      if(attacker>=0){
        if(province.captor!==attacker){province.captor=attacker;province.capture=0;}
        const player=s.players[attacker],engineers=nearby.some(u=>u.kind==='engineer');
        province.capture+=DT*(engineers?1.5:1)*(player.talents.includes('conqueror')?1.3:1)*(engineers&&player.talents.includes('sappers')?1.3:1);
        if(province.capture>=8){province.owner=attacker;province.capture=0;province.captor=-1;province.recovery=15;province.production=0;province.kind='infantry';s.topology++;this.navigation.clear();experience(s,attacker,50);player.gold+=30;s.events.push({tick:s.tick,key:'capture',player:attacker,province:province.id});for(const u of nearby)if(u.owner===attacker){u.target=null;u.province=province.id;}}
      }else{province.capture=Math.max(0,province.capture-DT*2);if(!province.capture)province.captor=-1;}
      if(province.owner<0)continue;const owner=s.players[province.owner];owner.gold+=DT*0.5;province.recovery=Math.max(0,province.recovery-DT*(owner.leader==='steward'?1.5:1));
      if(owners.some(id=>id!==province.owner))continue;
      const garrison=occupants.filter(u=>u.owner===province.owner&&u.target===null).length;
      if(garrison>=12||counts[province.owner]>=PLAYER_CAP||s.units.length>=MAX_UNITS)continue;
      province.production+=DT*(province.recovery>0?0.5:1)*(owner.talents.includes('industry')?1.2:1)*(owner.talents.includes('logistics')?1.1:1);
      if(province.production>=UNITS[province.kind].train){province.production-=UNITS[province.kind].train;spawn(s,province.id,province.kind);counts[province.owner]++;}
    }
    if(s.tick%80===0)this.ai();
    for(const p of s.players){
      const owned=s.provinces.filter(v=>v.owner===p.id).length;s.domination[p.id]=owned>=Math.ceil(PLAYABLE_COUNT*0.6)?s.domination[p.id]+DT:0;
      const opponents=s.players.filter(o=>o.id!==p.id);
      if(s.domination[p.id]>=30||(owned>0&&opponents.every(o=>!s.provinces.some(v=>v.owner===o.id)&&!s.units.some(u=>u.owner===o.id)))){s.winner=p.id;s.events.push({tick:s.tick,key:'victory',player:p.id});break;}
    }
    if(s.events.length>32)s.events.splice(0,s.events.length-32);
  }
  private ai():void{
    const s=this.state;
    for(const p of s.players.filter(p=>p.ai)){
      if(p.choices.length)this.command(p.id,{type:'talent',id:p.choices[0]});
      if(p.gold>160)this.command(p.id,{type:'upgrade',kind:p.loadout[Math.floor(random(s)*p.loadout.length)],stat:STATS[Math.floor(random(s)*3)]});
      for(const province of s.provinces.filter(v=>v.owner===p.id)){
        const units=s.units.filter(u=>u.owner===p.id&&u.province===province.id&&u.target===null);if(units.length<4)continue;
        const neighbors=MAP[province.id].neighbors,targets=neighbors.filter(id=>s.provinces[id].owner!==p.id).sort((a,b)=>s.units.filter(u=>u.province===a).length-s.units.filter(u=>u.province===b).length);
        const destination=targets[0]??neighbors.filter(id=>MAP[id].neighbors.some(n=>s.provinces[n].owner!==p.id))[0];
        if(destination!==undefined)this.command(p.id,{type:'march',from:province.id,to:destination,fraction:0.75});
      }
    }
  }
}
