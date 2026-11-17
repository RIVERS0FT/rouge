import {NoBlending,type Material,type Object3D} from 'three';

// Opaque atlas base is drawn first. Transparent queue passes then compose in
// this order, independent of object origin and camera depth. Group ancestors
// retain groupOrder=0 (Three sorts that before a child's renderOrder).
export const MAP_LAYERS={regionBorder:1,countryBorder:2,hoverGlow:3,selectedBorder:4,countryName:5,route:6,entity:7} as const;

/** Queue solid instances above screen overlays while retaining a shared depth
 * buffer for terrain and other entities. Still draws exactly once, without alpha
 * blending or changing the stock material lighting, geometry or culling. */
export function layerMapEntity(mesh:Object3D,material:Material){
 mesh.renderOrder=MAP_LAYERS.entity;
 material.transparent=true;material.blending=NoBlending;
 material.depthTest=material.depthWrite=true;material.forceSinglePass=true;
}
