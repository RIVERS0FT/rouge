type Anchor={top:number;bottom:number;left:number;width:number};
type Bounds={top:number;bottom:number};

/** Place the whole panel in the viewport, outside its trigger. The grid is not a boundary. */
export function unitTooltipPosition(anchor:Anchor,size:{width:number;height:number},viewport:{width:number;height:number},bounds:Bounds){
 const margin=12,gap=8,top=Math.max(margin,bounds.top),bottom=Math.min(viewport.height-margin,bounds.bottom);
 if(anchor.bottom<=top||anchor.top>=bottom||size.height>bottom-top||size.width>viewport.width-margin*2)return null;
 const left=Math.max(margin,Math.min(anchor.left+(anchor.width-size.width)/2,viewport.width-size.width-margin));
 if(anchor.bottom+gap+size.height<=bottom)return {left,top:anchor.bottom+gap};
 if(anchor.top-gap-size.height>=top)return {left,top:anchor.top-gap-size.height};
 const sideTop=Math.max(top,Math.min(anchor.top+(anchor.bottom-anchor.top-size.height)/2,bottom-size.height));
 if(anchor.left+anchor.width+gap+size.width<=viewport.width-margin)return {left:anchor.left+anchor.width+gap,top:sideTop};
 if(anchor.left-gap-size.width>=margin)return {left:anchor.left-gap-size.width,top:sideTop};
 return null;
}
