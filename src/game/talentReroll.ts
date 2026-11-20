import {BALANCE} from './balance.ts';
import {TALENTS,talentApplies} from './content.ts';
import type {Player} from './types.ts';

export function talentRerollCost(player:Pick<Player,'rerollsUsed'|'level'>):number{
 const price=BALANCE.reroll;
 return price.base+price.perLevel*Math.max(0,player.level-price.freeLevels)+price.perUse*player.rerollsUsed;
}

/** Unowned talents this country can draw now. Drafts are not weighted by any
 * build: rule-changing talents only wait for a leader level. */
export function availableTalentIds(player:Pick<Player,'talents'|'loadout'>&{level?:number}):string[]{
 const level=player.level??1;
 return TALENTS.filter(t=>!player.talents.includes(t.id)&&talentApplies(t,player.loadout)&&level>=(t.minLevel??1)).map(t=>t.id);
}

/** A reroll may keep one offered card; it must still be able to change another. */
export function canRerollTalent(player:Pick<Player,'talents'|'loadout'|'choices'|'drafts'>&{level?:number},keep?:string):boolean{
 if(player.drafts<=0||!player.choices.length||(keep!==undefined&&!player.choices.includes(keep)))return false;
 return availableTalentIds(player).some(id=>!player.choices.includes(id));
}
