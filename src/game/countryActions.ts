import type { ConstructionKind, Kind, Upgrade } from './types.ts';

/** Gameplay commands are the same for humans and AI. The engine obtains the
 * acting country separately from the payload and authorizes every command. */
export type CountryAction =
  | {type:'mergeGroups';groups:string[];expectedRevision:number}
  | {type:'splitGroup';group:string;atoms:string[];expectedRevision:number}
  | {type:'march';from:number;to:number;fraction:1}
  | {type:'construct';province:number;kind:ConstructionKind;expectedLevel:0|1}
  | {type:'production';province:number;kind:Kind}
  | {type:'upgrade';kind:Kind;stat:Upgrade}
  | {type:'talent';id:string}
  | {type:'reroll';expectedCost?:number};

// Keep the explicit full-dispatch marker in the wire format. Other fractions
// are not legal actions, regardless of how an order reaches the engine.
export const countryActions={
  march:(from:number,to:number)=>({type:'march',from,to,fraction:1} satisfies CountryAction),
  upgrade:(kind:Kind,stat:Upgrade)=>({type:'upgrade',kind,stat} satisfies CountryAction),
  talent:(id:string)=>({type:'talent',id} satisfies CountryAction),
};
