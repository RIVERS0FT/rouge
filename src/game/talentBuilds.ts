import {TALENT_BY_ID} from './content.ts';
import type {GameState,Player} from './types.ts';

/** Designer reference builds made only of ordinary talents. The rules never
 * read this list: it names discoveries in the codex and gives AI countries a plan.
 * Players can form any other combination; see docs/TALENT_BUILDS.md. */
export interface SampleBuild{readonly id:string;readonly cards:readonly string[];readonly need:number}
export const SAMPLE_BUILDS:readonly SampleBuild[]=[
 {id:'fortressWeb',cards:['fortify','bastionGuns','fortressDoctrine'],need:3},
 {id:'humanTide',cards:['pressGang','massedRanks','grandGarrison'],need:3},
 {id:'plunderEconomy',cards:['livingOffLand','bounty','tribute'],need:3},
 {id:'hoarder',cards:['treasury','warChest'],need:2},
 {id:'blitz',cards:['shockAssault','siegeLines','encirclement'],need:3},
 {id:'lastStand',cards:['martyrs','militia','fieldMedicine','logistics'],need:3},
];
/** Sample builds whose required number of cards this talent list holds. */
export function formedBuilds(talents:readonly string[]):string[]{
 return SAMPLE_BUILDS.filter(build=>build.cards.filter(id=>talents.includes(id)).length>=build.need).map(build=>build.id);
}

/** Talents that only pay off for a country that constructs; AI countries never build. */
const AI_SKIP=new Set(['publicWorks','tradeRoutes','academy','conscription','industrialBase']);
/** A stable plan per seat, derived from the campaign seed without consuming its RNG. */
export function aiBuildPlan(state:Pick<GameState,'seed'>,player:Pick<Player,'id'>):SampleBuild{
 let h=Math.imul((state.seed>>>0)^0x9e3779b9,0x85ebca6b)^Math.imul(player.id+1,0xc2b2ae35);
 h^=h>>>16;h=Math.imul(h,0x45d9f3b);h^=h>>>16;
 return SAMPLE_BUILDS[(h>>>0)%SAMPLE_BUILDS.length];
}
/** Prefer the plan's cards, then any building block or signature; ties keep the offer order. */
export function aiTalentChoice(state:Pick<GameState,'seed'>,player:Pick<Player,'id'|'choices'>):string{
 const plan=aiBuildPlan(state,player);let best=player.choices[0],score=-Infinity;
 for(const id of player.choices){
  let value=0;
  if(plan.cards.includes(id))value+=10;
  if(SAMPLE_BUILDS.some(build=>build.cards.includes(id)))value+=2;
  if(TALENT_BY_ID.get(id)?.kinds)value+=3;
  if(AI_SKIP.has(id))value-=20;
  if(value>score){score=value;best=id;}
 }
 return best;
}
