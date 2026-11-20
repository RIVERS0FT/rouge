import test from 'node:test';
import assert from 'node:assert/strict';
import {BALANCE,BALANCE_ID} from '../src/game/balance.ts';
import {LAN_RULES_ID,RULES_ID,MAX_LEADER_LEVEL,MAX_UPGRADE_LEVEL,UNITS,stats} from '../src/game/content.ts';
import {createGame} from '../src/game/engine.ts';
import {checksum,decodeSave} from '../src/game/save.ts';
import {secondaryMultiplier,secondaryTargets,MODE_SECONDARY_HEAVY,MODE_SECONDARY_HALF,MODE_WIDE_SALVO,VS_MARCHING_BONUS,VS_GARRISON_BONUS,POINT_BLANK_RANGE_SQUARED} from '../src/game/talentEffects.ts';
import {balanceText} from '../src/ui/balanceText.ts';
import {STRINGS} from '../src/ui/i18n.ts';

test('LAN peers compare the rules identity together with a fingerprint of every balance number',()=>{
 assert.match(BALANCE_ID,/^[0-9a-f]{8}$/);
 assert.equal(LAN_RULES_ID,`${RULES_ID}+balance-${BALANCE_ID}`);
});

test('the rule modules read their limits and units straight from balance.ts',()=>{
 assert.equal(UNITS,BALANCE.units);
 assert.equal(MAX_LEADER_LEVEL,BALANCE.leader.maxLevel);assert.equal(MAX_UPGRADE_LEVEL,BALANCE.upgrades.maxLevel);
 // Both combat paths (WASM kernel and JS fallback) take these from the same entries.
 assert.equal(VS_MARCHING_BONUS,BALANCE.talents.forwardMarksmen.damageBonus);assert.equal(VS_GARRISON_BONUS,BALANCE.talents.barrage.damageBonus);
 assert.equal(POINT_BLANK_RANGE_SQUARED,BALANCE.talents.pointBlank.range**2);
 assert.equal(secondaryMultiplier(0),BALANCE.combat.splashDamage);
 assert.equal(secondaryMultiplier(MODE_SECONDARY_HEAVY),BALANCE.talents.grenadeVolley.splashDamage);
 assert.equal(secondaryMultiplier(MODE_SECONDARY_HALF),BALANCE.talents.breakthrough.splashDamage);
 assert.equal(secondaryTargets(0),BALANCE.combat.splashTargets);assert.equal(secondaryTargets(MODE_WIDE_SALVO),BALANCE.talents.wideSalvo.targets);
});

test('UI copy fills balance placeholders and leaves runtime placeholders alone',()=>{
 const pct=value=>String(Math.round(value*100*1000)/1000);
 assert.equal(balanceText('{talents.industry.training|up}%'),String(Math.round((BALANCE.talents.industry.training-1)*100*1000)/1000)+'%');
 assert.equal(balanceText('{talents.publicWorks.cost|down}%'),String(Math.round((1-BALANCE.talents.publicWorks.cost)*100*1000)/1000)+'%');
 assert.equal(balanceText('{talents.academy.xpPerDay.0} / {upgrades.speedPerLevel}'),`${BALANCE.talents.academy.xpPerDay[0]} / ${BALANCE.upgrades.speedPerLevel}`);
 assert.equal(balanceText('{count} · {region}'),'{count} · {region}');
 assert.throws(()=>balanceText('{talents.industry.missing}'),/missing balance value/);
 // Loaded copy is already resolved and shows the current numbers.
 for(const [key,pair] of Object.entries(STRINGS))for(const text of pair)assert.doesNotMatch(text,/\{[a-zA-Z]+\.[^}]*\}/,key);
 assert.ok(STRINGS['entrenchment.desc'][0].includes(`${pct(BALANCE.talents.entrenchment.damageReduction)}%`));
 assert.ok(STRINGS['warSpoils.desc'][1].includes(`${BALANCE.talents.warSpoils.captureReward} funds`));
 assert.ok(STRINGS.objectiveDesc[0].includes(`${BALANCE.victory.days} 天`));
});

test('saves from before a retune load with values pulled down to the current limits',()=>{
 const state=createGame(['A','B'].map(name=>({name,leader:'warden',loadout:['infantry']})),7,'balance-retune');
 const unit=state.units.find(u=>u.owner===0),player=state.players[0],home=state.provinces.find(p=>p.owner===0);
 const maximum=stats(player,unit.kind);
 // Values that only an older, more generous balance.ts could have produced.
 unit.hp=maximum.hp*3;unit.cooldown=50;
 Object.assign(player,{level:MAX_LEADER_LEVEL+2,drafts:MAX_LEADER_LEVEL+1});player.upgrades.infantry.attack=MAX_UPGRADE_LEVEL+3;
 Object.assign(home,{recovery:BALANCE.economy.recoveryDays*2,capture:BALANCE.capture.days*2,captor:1});
 state.domination[0]=BALANCE.victory.days*2;
 const body=JSON.stringify(state),envelope=JSON.stringify({version:1,name:'Old balance',savedAt:new Date().toISOString(),hash:checksum(body),body});
 const loaded=decodeSave(envelope).state,again=loaded.units.find(u=>u.id===unit.id),owner=loaded.players[0],region=loaded.provinces[home.id];
 assert.equal(again.hp,maximum.hp);assert.equal(again.cooldown,Math.max(1,1/maximum.attackSpeed));
 assert.equal(owner.level,MAX_LEADER_LEVEL);assert.equal(owner.drafts,MAX_LEADER_LEVEL-1);assert.equal(owner.upgrades.infantry.attack,MAX_UPGRADE_LEVEL);
 assert.equal(region.recovery,BALANCE.economy.recoveryDays);assert.equal(region.capture,BALANCE.capture.days);
 assert.equal(loaded.domination[0],BALANCE.victory.days);
});
