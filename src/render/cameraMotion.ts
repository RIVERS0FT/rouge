/** Camera easing follows elapsed wall time, including slow/dropped render frames. */
export function advanceCameraDistance(current:number,target:number,elapsedSeconds:number,targetChanged=false):number {
  const elapsed=Number.isFinite(elapsedSeconds)?Math.max(0,elapsedSeconds):0;
  // A stationary strategic map sleeps between invalidations. Its idle time must
  // not be charged to a newly requested zoom, which should still ease in.
  const dt=targetChanged?Math.min(elapsed,0.1):elapsed;
  const next=target+(current-target)*Math.exp(-dt*9);
  return Math.abs(next-target)<0.01?target:next;
}
