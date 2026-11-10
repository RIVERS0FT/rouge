type Anchor={top:number;bottom:number;left:number;width:number};
type Bounds={top:number;bottom:number};

/** Keep a scrollable tooltip inside the visible unit area and off its trigger. */
export function unitTooltipPosition(anchor:Anchor,height:number,viewport:{width:number;height:number},bounds:Bounds,minimumHeight=34){
 const top=Math.max(12,bounds.top),bottom=Math.min(viewport.height-12,bounds.bottom);
 if(anchor.bottom<=top||anchor.top>=bottom)return null;
 const below=Math.max(0,bottom-anchor.bottom-8),above=Math.max(0,anchor.top-top-8);
 const useBelow=below>=height||below>=above,maxHeight=useBelow?below:above;
 // Padding and borders still take space when max-height is very small.
 if(maxHeight<minimumHeight)return null;
 const width=Math.min(340,viewport.width-24);
 return {width,left:Math.max(12,Math.min(anchor.left+(anchor.width-width)/2,viewport.width-width-12)),
  top:useBelow?anchor.bottom+8:anchor.top-Math.min(height,maxHeight)-8,maxHeight};
}
