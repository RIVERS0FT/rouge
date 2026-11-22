import {isMarchFraction,type MarchFraction} from '../game/countryActions.ts';

const key='rouge.dispatch-fraction';
let current:MarchFraction|undefined;

export function dispatchFraction():MarchFraction {
  if(current===undefined){
    current=1;
    try{
      const stored=Number(localStorage.getItem(key));
      if(isMarchFraction(stored))current=stored;
    }catch{/* The session still has a default when storage is unavailable. */}
  }
  return current;
}

export function rememberDispatchFraction(value:MarchFraction):void {
  current=value;
  try{localStorage.setItem(key,String(value));}catch{/* Keep the selection for this session. */}
}
