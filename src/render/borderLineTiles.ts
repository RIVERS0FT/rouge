/** Transferable, compact line segments. Partition in the border worker so the
 * renderer can install geometry without traversing the global boundary again. */
export interface BorderLineTile {positions:Float32Array}
export function borderLineTiles(positions:Float32Array,side=128):BorderLineTile[]{
 const tiles=new Map<string,number[]>();
 for(let i=0;i<positions.length;i+=6){
  const key=`${Math.floor((positions[i]+positions[i+3])/(2*side))}:${Math.floor((positions[i+2]+positions[i+5])/(2*side))}`;
  let tile=tiles.get(key);if(!tile){tile=[];tiles.set(key,tile);}
  for(let k=0;k<6;k++)tile.push(positions[i+k]);
 }
 return [...tiles.values()].map(points=>({positions:new Float32Array(points)}));
}
