/** Cloth is a continuous travelling wave across the 90×60 flag artwork. Wind runs
 * from the hoist (x=0) to the fly (x=90): every pixel column of the flag is
 * displaced by y = −A(x)·cos(2π(t/T − x/λ)), so the hoist stays nearly still
 * while the fly swings widest, and the shading follows the local slope.
 * Drawing per pixel column (not per strip) leaves no seams or banding. */
export const FLAG_WIDTH = 90;
export const FLAG_HEIGHT = 60;
export const CLOTH_PERIOD = 2.8;
export const CLOTH_WAVELENGTH = 64;
/** Room around the flag, in flag units, for the swing and the hoist edge. */
export const CLOTH_MARGIN = {left: 4, top: 7, width: 99, height: 74} as const;

/** Swing amplitude in flag units at a position along the flag. */
export function clothAmplitude(x: number): number {
 const u = Math.min(1, Math.max(0, x / FLAG_WIDTH));
 return .2 + 2.3 * Math.pow(u, 1.25);
}
function phase(x: number, seconds: number) {return 2 * Math.PI * (seconds / CLOTH_PERIOD - x / CLOTH_WAVELENGTH);}
/** Vertical displacement (flag units, +down) of the column at x after `seconds`. */
export function clothOffset(x: number, seconds: number): number {
 return -clothAmplitude(x) * Math.cos(phase(x, seconds));
}
/** Shading in [−1, 1] for light from the upper left: positive darkens cloth that
 * falls away to the right (its folds face away from the light), negative is a
 * glint where it rises toward the light. Proportional to the slope, so it rides the wave. */
export function clothShade(x: number, seconds: number): number {
 return -Math.sin(phase(x, seconds)) * Math.min(1, clothAmplitude(x) / 1.6);
}
