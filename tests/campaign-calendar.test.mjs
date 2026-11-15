import test from 'node:test';
import assert from 'node:assert/strict';
import {campaignDate,campaignDateLabel,campaignDateTime} from '../src/ui/campaignCalendar.ts';
import {t} from '../src/ui/i18n.ts';

test('the campaign begins on 1 January year 1 and only full days advance its date',()=>{
 assert.deepEqual(campaignDate(0),{year:1,month:1,day:1});
 assert.equal(campaignDateLabel(0),'1年1月1日');
 assert.equal(campaignDateLabel(0,'en'),'1 Jan 1');
 assert.equal(campaignDateTime(0),'0001-01-01');
 assert.equal(campaignDateTime(19),'0001-01-01');
 assert.equal(campaignDateTime(20),'0001-01-02');
 assert.equal(campaignDateTime(31*20),'0001-02-01');
 assert.equal(campaignDateTime(365*20),'0002-01-01');
});
test('calendar dates follow Gregorian month lengths, leap days and century exceptions',()=>{
 const start=new Date(0);start.setUTCFullYear(1,0,1);
 for(let days=0;days<365*2400;days+=29){
  const expected=new Date(start.getTime()+days*86400000);
  assert.deepEqual(campaignDate(days*20),{year:expected.getUTCFullYear(),month:expected.getUTCMonth()+1,day:expected.getUTCDate()});
 }
});
test('very long campaigns keep calendar labels beyond the native Date range',()=>{
 const date=campaignDate(Number.MAX_SAFE_INTEGER);
 assert.ok(date.year>275760);assert.ok(date.month>=1&&date.month<=12);assert.ok(date.day>=1&&date.day<=31);
 assert.match(campaignDateTime(Number.MAX_SAFE_INTEGER),/^\d{6,}-\d{2}-\d{2}$/);
});
test('income and other simulation time labels consistently use days in both languages',()=>{
 assert.equal(t('zh','incomePerDay'),'每日收益');assert.equal(t('en','incomePerDay'),'Daily income');
 for(const key of ['perDay','constructionIncome','construction.market.benefit','attacksPerDay','distancePerDay','gameDays','days','objectiveDesc']){
  assert.doesNotMatch(t('zh',key),/秒/);assert.doesNotMatch(t('en',key),/second|\/s\b|game s\b/);
 }
});
