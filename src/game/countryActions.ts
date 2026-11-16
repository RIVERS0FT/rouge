import type { ConstructionKind, Kind, Upgrade } from './types.ts';

export const MARCH_FRACTIONS=[.25,.5,.75,1] as const;
export type MarchFraction=typeof MARCH_FRACTIONS[number];
export function isMarchFraction(value:unknown):value is MarchFraction {
  return typeof value==='number'&&MARCH_FRACTIONS.some(fraction=>fraction===value);
}
/** Group dispatches sum this authoritative count for each eligible base region. */
export function marchDispatchCount(garrison:number,fraction:MarchFraction):number {
  return garrison>0?Math.max(1,Math.floor(garrison*fraction)):0;
}

/** Gameplay commands are the same for humans and AI. The engine obtains the
 * acting country separately from the payload and authorizes every command. */
export type CountryAction =
  | {type:'mergeGroups';groups:string[];expectedRevision:number}
  | {type:'splitGroup';group:string;atoms:string[];expectedRevision:number}
  | {type:'march';from:number;to:number;fraction:MarchFraction}
  | {type:'construct';province:number;kind:ConstructionKind;expectedLevel:0|1}
  | {type:'production';province:number;kind:Kind}
  | {type:'upgrade';kind:Kind;stat:Upgrade}
  | {type:'talent';id:string}
  | {type:'reroll';expectedCost?:number};

export const countryActions={
  march:(from:number,to:number,fraction:MarchFraction=1)=>({type:'march',from,to,fraction} satisfies CountryAction),
  upgrade:(kind:Kind,stat:Upgrade)=>({type:'upgrade',kind,stat} satisfies CountryAction),
  talent:(id:string)=>({type:'talent',id} satisfies CountryAction),
};
