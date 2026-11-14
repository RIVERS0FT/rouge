import {TALENTS,talentApplies} from './content.ts';
import type {Player} from './types.ts';

export function talentRerollCost(player:Pick<Player,'rerollsUsed'|'level'>):number{
 return 30+10*Math.max(0,player.level-2)+15*player.rerollsUsed;
}

export function availableTalentIds(player:Pick<Player,'talents'|'loadout'>):string[]{
 return TALENTS.filter(t=>!player.talents.includes(t.id)&&talentApplies(t,player.loadout)).map(t=>t.id);
}

export function canRerollTalent(player:Pick<Player,'talents'|'loadout'|'choices'|'drafts'>):boolean{
 return player.drafts>0&&player.choices.length>0&&availableTalentIds(player).some(id=>!player.choices.includes(id));
}
