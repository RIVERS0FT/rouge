import {TALENTS,talentApplies} from './content.ts';
import type {Player} from './types.ts';

type History=Pick<Player,'rerollsUsed'|'rerolls'>;

/** Legacy saves offered one free roll: a zero balance means it was used. */
export function talentRerollsUsed(player:History):number{
 return player.rerollsUsed??(player.rerolls===0?1:0);
}

export function talentRerollCost(player:History&Pick<Player,'level'>):number{
 return 30+10*Math.max(0,player.level-2)+15*talentRerollsUsed(player);
}

export function availableTalentIds(player:Pick<Player,'talents'|'loadout'>):string[]{
 return TALENTS.filter(t=>!player.talents.includes(t.id)&&talentApplies(t,player.loadout)).map(t=>t.id);
}

export function canRerollTalent(player:Pick<Player,'talents'|'loadout'|'choices'|'drafts'>):boolean{
 return player.drafts>0&&player.choices.length>0&&availableTalentIds(player).some(id=>!player.choices.includes(id));
}
