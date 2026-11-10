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

test('centering a fully visible landscape card reveals space for its tooltip',()=>{
 // CI: the first row was fully visible at y250–362 in an 844×390 viewport.
 // It needed no automatic tap scrolling, but only 8px remained for the tooltip.
 const viewport={width:844,height:390};
 const anchor={top:250,bottom:362,left:227,width:188};
 assert.equal(unitTooltipPosition(anchor,255,viewport,{top:250,bottom:486}),null);
 // Centering the card in the modal (y8–382) scrolls it up by 111px.
 const offset=(anchor.top+anchor.bottom)/2-195;
 const revealed={...anchor,top:anchor.top-offset,bottom:anchor.bottom-offset};
 const position=unitTooltipPosition(revealed,255,viewport,{top:250-offset,bottom:486-offset});
 assert.equal(position.top,259);
 assert.equal(position.maxHeight,116);
 assert.ok(position.top>=revealed.bottom+8);
 assert.ok(position.top+position.maxHeight<=viewport.height-12);
 assert.ok(position.top>184-offset); // Appearance controls remain unobstructed.
 assert.ok(position.top>73); // Sticky close remains unobstructed.
});
