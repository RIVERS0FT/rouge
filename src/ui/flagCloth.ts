/** Cloth is a travelling wave across vertical strips of the 90×60 flag artwork.
 * Wind runs from the hoist (x=0) to the fly (x=90): each strip rises and falls
 * one phase later than its neighbour, the hoist stays nearly still while the fly
 * swings widest, and a continuous crease pattern slides one wavelength per
 * period so the shading rides the wave. */
export const FLAG_WIDTH = 90;
export const CLOTH_STRIP_COUNT = 24;
export const CLOTH_STRIP_WIDTH = FLAG_WIDTH / CLOTH_STRIP_COUNT;
/** Neighbouring strips overlap slightly so antialiased edges never show a gap. */
export const CLOTH_SEAM = .12;
export const CLOTH_PERIOD = 2.8;
export const CLOTH_WAVELENGTH = 64;

export interface ClothStrip {index: number; x: number; amplitude: number; delay: number; rest: number}

export function clothStrips(count = CLOTH_STRIP_COUNT): ClothStrip[] {
 const width = FLAG_WIDTH / count, wraps = Math.ceil(FLAG_WIDTH / CLOTH_WAVELENGTH);
 return Array.from({length: count}, (_, index) => {
  const x = index * width, centre = x + width / 2, amplitude = .2 + 2.3 * Math.pow(centre / FLAG_WIDTH, 1.25);
  const phase = centre / CLOTH_WAVELENGTH;
  // A positive phase lag travels toward the fly; whole periods keep every delay negative (no start-up stall).
  const delay = (phase - wraps) * CLOTH_PERIOD;
  // Keyframes run −A → +A → −A, i.e. y = −A·cos(2π(t/T − phase)); reduced motion freezes t = 0.
  return {index, x, amplitude, delay, rest: -amplitude * Math.cos(2 * Math.PI * phase)};
 });
}

/** A sampled cosine for the crease gradient (offset, colour, opacity): shadow on
 * the descending slope, a softer glint on the rising one, and near-zero alpha
 * wherever black meets white so no grey seam appears. */
export const CREASE_STOPS: readonly [number, string, number][] = [
 [0, '#000', .02], [.125, '#000', .13], [.25, '#000', .23], [.375, '#000', .13], [.5, '#000', .02],
 [.55, '#fff', .01], [.625, '#fff', .06], [.75, '#fff', .11], [.875, '#fff', .06], [.95, '#fff', .01], [1, '#000', .02],
];
