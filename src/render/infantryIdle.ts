/** Shoot overrides walking; at rest use one fixed attention pose. */
export function infantryPose(move:number,shot:number,id:number,fps:number,walkFrames:number,shootFrames:number,idleFrame:number){
 const samplesPerMs=fps/1000;
 if(shot>=0&&shot<(shootFrames-1)/samplesPerMs)return {mode:'shoot',frame:walkFrames+Math.floor(shot*samplesPerMs)} as const;
 if(move>0)return {mode:'walk',frame:Math.floor((move*samplesPerMs+id*.618)%(walkFrames-1))} as const;
 return {mode:'idle',frame:idleFrame} as const;
}
