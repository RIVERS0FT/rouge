import type {Player} from '../game/types.ts';
/** A command acknowledgement alone is insufficient: wait for authoritative player state. */
export function talentSelectionStatus(player:Pick<Player,'talents'|'drafts'|'choices'>|undefined,pending:string|null):'waiting'|'next'|'done'{
 if(!pending||!player?.talents.includes(pending))return 'waiting';
 return player.drafts>0||player.choices.length>0?'next':'done';
}
