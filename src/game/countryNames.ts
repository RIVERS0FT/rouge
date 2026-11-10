import type {Player, ProvinceDef} from './types.ts';

export type CountryIdentity={origin:string;name:[string,string]};
// Every localized source region is a name root. These forms expand that local
// pool without assigning an unrelated real-world country to a spawn location.
export const COUNTRY_FORMS:readonly (readonly [string,string])[]=[
 ['共和国','Republic of'],['王国','Kingdom of'],['联邦','Federation of'],['共同体','Commonwealth of'],
 ['联盟','Union of'],['邦联','Confederation of'],['公国','Principality of'],['自由邦','Free State of'],
 ['联合邦','United States of'],['同盟','League of'],['自治邦','Dominion of'],['国','State of'],
 ['自由市邦','Free Cities of'],['联合王国','United Kingdom of'],['联邦共和国','Federal Republic of'],['合作邦','Cooperative of'],
];
const key=(value:string)=>value.normalize('NFKC').trim().toLocaleLowerCase('en');
export function validCountryIdentity(value:unknown):value is CountryIdentity{
 if(!value||typeof value!=='object')return false;const c=value as CountryIdentity;
 return typeof c.origin==='string'&&c.origin.length>0&&c.origin.length<=100&&Array.isArray(c.name)&&c.name.length===2&&c.name.every(n=>typeof n==='string'&&n.trim().length>0&&n.length<=160);
}
/** One stable bilingual identity per AI. Never derive it from later conquests.
 * The caller supplies the actual allocated primary spawn region. Repeated
 * roots cycle through local forms, then use an unbounded numeric suffix. */
export function assignCountryNames(players:Player[],origins:readonly (ProvinceDef|undefined)[]):void{
 const used=[new Set<string>(),new Set<string>()],next=new Map<string,number>();
 for(const p of players)for(const i of [0,1]){const name=p.ai?p.country?.name[i]:p.name;if(name)used[i].add(key(name));}
 for(const p of players){
  if(!p.ai||p.country)continue;
  const origin=origins[p.id],raw=origin?.name;
  const root:[string,string]=[raw?.[0]?.trim()&&!raw[0].startsWith('未命名')?raw[0].trim():'新境',raw?.[1]?.trim()&&!raw[1].startsWith('Unnamed')?raw[1].trim():'Newland'];
  // Bound imported source text, not the number of supported factions.
  root[0]=Array.from(root[0]).slice(0,80).join('');root[1]=Array.from(root[1]).slice(0,100).join('');
  const rootKey=JSON.stringify(root);let ordinal=next.get(rootKey)??0,name:[string,string];
  do{
   const form=COUNTRY_FORMS[ordinal%COUNTRY_FORMS.length],cycle=Math.floor(ordinal/COUNTRY_FORMS.length),suffix=cycle?` ${cycle+1}`:'';
   name=[`${root[0]}${form[0]}${suffix}`,`${form[1]} ${root[1]}${suffix}`];ordinal++;
  }while(used.some((set,i)=>set.has(key(name[i]))));
  next.set(rootKey,ordinal);
  p.country={origin:origin?.code??`spawn-${p.id+1}`,name};for(const i of [0,1])used[i].add(key(name[i]));
 }
}
export function countryName(language:'zh'|'en',player:{name:string;ai?:boolean;country?:CountryIdentity}):string{
 return player.ai&&player.country?player.country.name[language==='zh'?0:1]:player.name;
}
