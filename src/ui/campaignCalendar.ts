import {DT} from '../game/content.ts';

export interface CampaignDate {year:number;month:number;day:number}
/** One former simulation second is one displayed day. The stored tick and
 * economy remain unchanged; dates use the Gregorian calendar from 1 Jan 1. */
export function campaignDate(ticks:number):CampaignDate {
 let days=Math.max(0,Math.floor(Number.isFinite(ticks)?ticks*DT:0));
 const centuries400=Math.floor(days/146097);days-=centuries400*146097;
 const centuries=Math.min(3,Math.floor(days/36524));days-=centuries*36524;
 const years4=Math.floor(days/1461);days-=years4*1461;
 const years=Math.min(3,Math.floor(days/365));days-=years*365;
 const year=centuries400*400+centuries*100+years4*4+years+1;
 const leap=year%4===0&&(year%100!==0||year%400===0),months=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
 let month=0;while(days>=months[month])days-=months[month++];
 return {year,month:month+1,day:days+1};
}
const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
export function campaignDateLabel(ticks:number,language:'zh'|'en'='zh'):string {
 const {year,month,day}=campaignDate(ticks);
 return language==='zh'?`${year}年${month}月${day}日`:`${day} ${MONTHS[month-1]} ${year}`;
}
export function campaignDateTime(ticks:number):string {
 const {year,month,day}=campaignDate(ticks);
 return `${String(year).padStart(4,'0')}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}
