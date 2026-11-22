import parts from './commanderPartIds.json' with {type:'json'};
import type {Leader} from './types.ts';

export const wardrobe=parts;
export type BodyType=keyof typeof parts;
export type PartSlot=keyof typeof parts.male;
export const slots:PartSlot[]=['uniform','trousers','hair','beard','mustache','hat','shoulders'];
export interface CommanderAppearance extends Record<PartSlot,string> {
 version:1; body:BodyType; skin:number; hairColor:string; cheek:number; nose:number; age:number;
}
export const skinColors=['#ffebda','#f5d4bb','#dfb597','#bd9476','#9c7054','#775138'];
export function defaultAppearance(body:BodyType='male'):CommanderAppearance {
 return {version:1,body,skin:1,hairColor:'#786357',cheek:0,nose:0,age:20,
  uniform:body==='male'?'male_coat_gb_admiral':'female_coat_european_military_01',trousers:body+'_legwear_european_military_01',
  hair:body+'_hair_european_01',beard:'',mustache:'',hat:'',shoulders:body==='male'?'male_epaulettes_03':''};
}
export const leaderAppearances:Record<Leader,CommanderAppearance>={
 warden:{...defaultAppearance(),age:78,hairColor:'#b5aea4',beard:'male_beard_asian_02'},
 vanguard:{...defaultAppearance('female'),age:14,hairColor:'#48372c',hair:'female_hair_european_short_haircut_01',uniform:'female_coat_european_greatcoat_01'},
 steward:{...defaultAppearance(),hairColor:'#332b26',mustache:'male_mustache_asian_01',uniform:'male_coat_british_06',shoulders:''},
};
export function validAppearance(value:unknown):value is CommanderAppearance {
 if(!value||typeof value!=='object')return false;
 const a=value as CommanderAppearance;
 if(a.version!==1||(a.body!=='male'&&a.body!=='female')||Object.keys(a).length!==14)return false;
 const range=(n:unknown,min:number,max:number)=>typeof n==='number'&&Number.isInteger(n)&&n>=min&&n<=max;
 return range(a.skin,0,skinColors.length-1)&&typeof a.hairColor==='string'&&/^#[a-f\d]{6}$/i.test(a.hairColor)
  &&range(a.cheek,-100,100)&&range(a.nose,-100,100)&&range(a.age,0,100)
  &&slots.every(slot=>a[slot]===''&&slot!=='uniform'&&slot!=='trousers'||(wardrobe[a.body][slot] as string[]).includes(a[slot]));
}
