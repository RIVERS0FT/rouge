/** Device mappings emit semantic actions; UI context owns whether they may run. */
export type MapAction = {type:'pan';x:number;z:number}|{type:'zoom';distance:number}|{type:'select';region:number;attack:boolean}|{type:'deselect'};
export type MapInputContext='game'|'blocked';
export class MapInputController {
 private context:MapInputContext='blocked';
 private apply:(action:MapAction)=>void;
 constructor(apply:(action:MapAction)=>void){this.apply=apply;}
 setContext(context:MapInputContext){this.context=context;}
 get active(){return this.context==='game';}
 dispatch(action:MapAction):boolean{
  if(!this.active)return false;
  if(action.type==='pan'&&(!Number.isFinite(action.x)||!Number.isFinite(action.z)))return false;
  if(action.type==='zoom'&&(!Number.isFinite(action.distance)||action.distance<=0))return false;
  if(action.type==='select'&&(!Number.isInteger(action.region)||action.region<0))return false;
  this.apply(action);return true;
 }
}
