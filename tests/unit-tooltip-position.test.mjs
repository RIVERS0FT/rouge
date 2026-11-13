import test from 'node:test';
import assert from 'node:assert/strict';
import {unitTooltipPosition} from '../src/ui/unit-tooltip-position.ts';

test('first-row tooltip uses the viewport beyond the grid without limiting its height',()=>{
 const position=unitTooltipPosition({top:356,bottom:488,left:941,width:202},{width:380,height:255},{width:1440,height:960},{top:80,bottom:948});
 assert.equal(position.top,496);
 assert.ok(position.top+255>632);
 assert.ok(position.top+255<=948);
 assert.equal(position.maxHeight,undefined);
});

test('a low card flips the complete panel above its trigger',()=>{
 const position=unitTooltipPosition({top:500,bottom:632,left:941,width:202},{width:380,height:255},{width:1440,height:800},{top:80,bottom:788});
 assert.equal(position.top,237);
 assert.equal(position.top+255,500-8);
});

test('short landscape puts the full panel beside the card below close controls',()=>{
 const position=unitTooltipPosition({top:220,bottom:332,left:740,width:80},{width:380,height:255},{width:844,height:390},{top:64,bottom:378});
 assert.equal(position.top,123);
 assert.equal(position.left,352);
 assert.ok(position.left+380<=740-8);
 assert.ok(position.top+255<=378);
});

test('portrait tooltip fits the viewport and leaves the active card tappable',()=>{
 const anchor={top:264,bottom:376,left:16,width:73};
 const position=unitTooltipPosition(anchor,{width:336,height:240},{width:360,height:640},{top:64,bottom:628});
 assert.equal(position.left,12);
 assert.equal(position.top,384);
 assert.ok(position.top+240<=628);
});

test('a hidden trigger or oversized panel cannot produce an offscreen tooltip',()=>{
 assert.equal(unitTooltipPosition({top:300,bottom:412,left:16,width:73},{width:336,height:600},{width:360,height:640},{top:64,bottom:628}),null);
 assert.equal(unitTooltipPosition({top:-120,bottom:-8,left:16,width:73},{width:336,height:255},{width:360,height:640},{top:64,bottom:628}),null);
});

test('a first landscape row needs no automatic scrolling when side space is available',()=>{
 const viewport={width:844,height:390};
 const anchor={top:250,bottom:362,left:227,width:188};
 const position=unitTooltipPosition(anchor,{width:380,height:255},viewport,{top:64,bottom:378});
 assert.equal(position.left,anchor.left+anchor.width+8);
 assert.equal(position.top,123);
 assert.ok(position.top+255<=viewport.height-12);
});

test('a narrow portrait can reveal enough room without clipping the panel',()=>{
 const viewport={width:360,height:640},size={width:336,height:300},bounds={top:64,bottom:628};
 const anchor={top:264,bottom:376,left:16,width:73};
 assert.equal(unitTooltipPosition(anchor,size,viewport,bounds),null);
 const offset=anchor.bottom+8+size.height-bounds.bottom;
 const position=unitTooltipPosition({...anchor,top:anchor.top-offset,bottom:anchor.bottom-offset},size,viewport,bounds);
 assert.equal(position.top+size.height,bounds.bottom);
});
