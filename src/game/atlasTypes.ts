/** Explicit dataset shape prevents TypeScript inferring 500k geographic coordinates. */
export interface AdminAtlas {
 format:number;mapId:string;source:string;sourceRevision:string;
 provinces:{id:string;code:string;sourceId:number;name:[string,string];country:string;center:[number,number];geometry:number[][][][];neighbors:number[]}[];
 gameplayGroups:{id:string;atomIds:string[];legacyHint:number|null;reason:string}[];
 initialGroups:{id:string;atomIds:string[];legacyHint:number|null;reason:string}[];
}
