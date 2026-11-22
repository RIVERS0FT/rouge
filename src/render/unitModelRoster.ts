import type {Scene} from 'three';
import type {Kind,Unit} from '../game/types.ts';
import {InfantryBatch} from './infantryBatch.ts';
import {UNIT_GLYPHS} from './unitPresentation.ts';

type ModelKind=Kind|'transport';
const files=import.meta.glob<string>('./assets/local-roster/*.bin',{eager:true,query:'?url',import:'default'});
const pathFor=(kind:ModelKind)=>files[`./assets/local-roster/${kind}.bin`];
const local=UNIT_GLYPHS.every(kind=>Boolean(pathFor(kind)));

export class UnitModelRoster {
  readonly source=local?'victoria-3':'infantry-v11';
  // In the towing pose the horse faces forward and the cannon fires aft.
  readonly attackYawOffsets:Partial<Record<Kind,number>>=local?{horseArtillery:Math.PI}:{};
  private batches=new Map<ModelKind,InfantryBatch>();
  private totals=new Map<ModelKind,number>();
  private previousUnits?:readonly Unit[];
  count=0;
  walking=0;
  shooting=0;
  idling=0;
  constructor(private scene:Scene,private invalidate:()=>void){}
  private key(unit:Unit):ModelKind|undefined{
    if(unit.transport?.embarked)return local?'transport':undefined;
    return local?unit.kind:'infantry';
  }
  begin(visible:boolean,units:readonly Unit[]){
    if(visible&&units!==this.previousUnits){
      this.totals.clear();
      for(const unit of units){
        const kind=this.key(unit);
        if(kind)this.totals.set(kind,(this.totals.get(kind)??0)+1);
      }
      this.previousUnits=units;
    }
    for(const [kind,batch] of this.batches)batch.begin(visible,this.totals.get(kind)??0);
  }
  forUnit(unit:Unit){
    const kind=this.key(unit);
    if(!kind)return;
    let batch=this.batches.get(kind);
    if(!batch){
      batch=new InfantryBatch(this.scene,this.invalidate,local?pathFor(kind):undefined);
      this.batches.set(kind,batch);batch.request();
    }
    return batch.ready?batch:undefined;
  }
  end(){
    this.count=this.walking=this.shooting=this.idling=0;
    for(const batch of this.batches.values()){
      batch.end();
      this.count+=batch.count;this.walking+=batch.walking;
      this.shooting+=batch.shooting;this.idling+=batch.idling;
    }
  }
  renderedKinds(){
    return [...this.batches].filter(([,batch])=>batch.count>0).map(([kind])=>kind).sort().join(',');
  }
  dispose(){for(const batch of this.batches.values())batch.dispose();}
}
