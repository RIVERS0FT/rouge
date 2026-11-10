import test from 'node:test';
import assert from 'node:assert/strict';
import {unitTooltipPosition} from '../src/ui/unit-tooltip-position.ts';

test('first-row tooltip stays below appearance controls and above setup inputs',()=>{
 const position=unitTooltipPosition({top:356,bottom:488,left:941,width:202},255,{width:1440,height:960},{top:356,bottom:632});
 assert.equal(position.top,496);
 assert.equal(position.maxHeight,136);
 assert.ok(position.top+position.maxHeight<=632);
});

test('last-row tooltip stays above its trigger without crossing the grid header',()=>{
 const position=unitTooltipPosition({top:500,bottom:632,left:941,width:202},255,{width:1440,height:960},{top:356,bottom:632});
 assert.equal(position.top,356);
 assert.equal(position.maxHeight,136);
 assert.ok(position.top+position.maxHeight<=500-8);
});

test('landscape tooltip respects sticky close controls and viewport edges',()=>{
 const position=unitTooltipPosition({top:220,bottom:332,left:740,width:80},255,{width:844,height:390},{top:64,bottom:470});
 assert.equal(position.top,64);
 assert.equal(position.maxHeight,148);
 assert.ok(position.left+position.width<=844-12);
});

test('portrait tooltip fits the viewport and leaves the active card tappable',()=>{
 const anchor={top:264,bottom:376,left:16,width:73};
 const position=unitTooltipPosition(anchor,360,{width:360,height:640},{top:264,bottom:500});
 assert.equal(position.left,12);
 assert.equal(position.width,336);
 assert.equal(position.top,384);
 assert.equal(position.maxHeight,116);
});

test('tooltip is dismissed when scrolling leaves no safe room for its padding',()=>{
 assert.equal(unitTooltipPosition({top:300,bottom:412,left:16,width:73},255,{width:360,height:640},{top:296,bottom:440}),null);
 assert.equal(unitTooltipPosition({top:-120,bottom:-8,left:16,width:73},255,{width:360,height:640},{top:-120,bottom:268}),null);
});
