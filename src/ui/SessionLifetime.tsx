import {useEffect,type MutableRefObject} from 'react';
import type {Session} from '../platform/session.ts';

/** Keep session ownership outside App's effects: Fast Refresh replays those effects. */
export function SessionLifetime({session}:{session:MutableRefObject<Session|null>}){
 useEffect(()=>()=>{session.current?.dispose();session.current=null;},[session]);
 return null;
}
