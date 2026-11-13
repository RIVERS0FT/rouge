import {useLayoutEffect, useRef, type ReactNode} from 'react';
import {CLOTH_MARGIN, clothOffset, clothShade, FLAG_HEIGHT, FLAG_WIDTH} from './flagCloth.ts';

/** One shared, throttled loop draws every visible waving flag. Each frame is
 * computed in a single pass over the flag's cached pixels — every pixel column
 * displaced by its wave offset with sub-pixel row blending, folds shaded by the
 * local slope and a key light from the upper left — and written with one
 * putImageData, so the cloth has smooth edges, no strip seams and almost no
 * per-frame drawing cost. */
const FRAME_MS = 1000 / 30;
const flags = new Set<ClothRenderer>();
let loop = 0, last = 0;
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
function tick(time: number) {
 loop = flags.size ? requestAnimationFrame(tick) : 0;
 if(time - last < FRAME_MS - .5) return;
 last = time;
 // A dialog over the battlefield freezes the HUD banner, as before.
 const covered = Boolean(document.querySelector('.is-game .modal-backdrop'));
 for(const flag of flags) flag.draw(time / 1000, covered);
}
function track(flag: ClothRenderer) {flags.add(flag); if(!loop) loop = requestAnimationFrame(tick);}
function untrack(flag: ClothRenderer) {flags.delete(flag); if(!flags.size && loop) {cancelAnimationFrame(loop); loop = 0;}}

// Fold shading strengths and the upper-left key light (a diagonal ramp across the flag).
const FOLD_SHADOW = .22, FOLD_GLINT = .13, KEY_LIGHT = .16, KEY_SHADOW = .2, KEY_NEUTRAL = .42;
/** Signed light at position u (0 = hoist top corner, 1 = fly bottom corner) along the
 * flag's diagonal: positive brightens toward white, negative darkens toward black. */
function keyLight(u: number) {
 return u < KEY_NEUTRAL ? KEY_LIGHT * (1 - Math.max(0, u) / KEY_NEUTRAL) : -KEY_SHADOW * Math.min(1, (u - KEY_NEUTRAL) / (1 - KEY_NEUTRAL));
}

class ClothRenderer {
 private size = '';
 private drawnStatic = '';
 private context: CanvasRenderingContext2D | null = null;
 private scale = 1; private left = 0; private top = 0; private columns = 1; private rows = 1;
 private source: ImageData | null = null; // the flat flag, rasterized once per size
 private frame: ImageData | null = null;
 private raster: HTMLCanvasElement | null = null; // fallback when the SVG raster cannot be read back
 constructor(private host: HTMLElement, private canvas: HTMLCanvasElement, private image: HTMLImageElement) {}
 draw(seconds: number, covered: boolean) {
  if(!this.image.complete || !this.image.naturalWidth) return;
  // Layout size, not getBoundingClientRect(): the gust's skew must never feed back into the canvas size.
  const cssWidth = this.host.offsetWidth, cssHeight = this.host.offsetHeight;
  if(!cssWidth || !cssHeight) return;
  const still = reducedMotion();
  if(covered && this.host.closest('.hud-top') && this.drawnStatic) return;
  const ratio = Math.min(2, window.devicePixelRatio || 1), width = Math.round(cssWidth * ratio), height = Math.round(cssHeight * ratio);
  const size = `${width}x${height}`;
  if(still && this.drawnStatic === size) return;
  if(this.size !== size) this.prepare(width, height, size);
  const t = still ? 0 : seconds;
  if(this.source) this.drawPixels(t); else this.drawColumns(t);
  this.drawnStatic = still || covered ? size : '';
 }
 private prepare(width: number, height: number, size: string) {
  this.size = size;
  this.canvas.width = width; this.canvas.height = height;
  this.context = this.canvas.getContext('2d');
  const scale = this.scale = Math.min(width / CLOTH_MARGIN.width, height / CLOTH_MARGIN.height);
  this.left = Math.round((width - CLOTH_MARGIN.width * scale) / 2 + CLOTH_MARGIN.left * scale);
  this.top = (height - CLOTH_MARGIN.height * scale) / 2 + CLOTH_MARGIN.top * scale;
  this.columns = Math.max(1, Math.round(FLAG_WIDTH * scale)); this.rows = Math.max(1, Math.round(FLAG_HEIGHT * scale));
  const raster = document.createElement('canvas');
  raster.width = this.columns; raster.height = this.rows;
  const context = raster.getContext('2d', {willReadFrequently: true})!;
  context.drawImage(this.image, 0, 0, this.columns, this.rows);
  try {
   this.source = context.getImageData(0, 0, this.columns, this.rows);
   this.frame = new ImageData(width, height);
   this.raster = null;
  } catch {
   // Some browsers taint a canvas that drew an SVG image; then draw column by column.
   this.source = this.frame = null;
   this.raster = raster;
  }
 }
 private drawPixels(t: number) {
  const {columns, rows, scale, left, top} = this, src = this.source!.data, frame = this.frame!, out = frame.data;
  const width = frame.width, height = frame.height;
  const spanX = FLAG_WIDTH * scale, spanY = FLAG_HEIGHT * scale, diagonal = spanX * spanX + spanY * spanY;
  out.fill(0);
  for(let x = 0; x < columns; x++) {
   const ox = left + x;
   if(ox < 0 || ox >= width) continue;
   const flagX = (x + .5) / scale, offset = top + clothOffset(flagX, t) * scale, fold = clothShade(flagX, t);
   const shadow = fold > 0 ? fold * FOLD_SHADOW : 0, glint = fold < 0 ? -fold * FOLD_GLINT : 0;
   const first = Math.max(0, Math.floor(offset)), end = Math.min(height - 1, Math.ceil(offset + rows));
   for(let y = first; y <= end; y++) {
    // The output pixel centre samples the source between rows s0 and s0 + 1.
    const sy = y - offset, s0 = Math.floor(sy), f = sy - s0;
    let r = 0, g = 0, b = 0, a = 0;
    if(s0 >= 0 && s0 < rows) {const i = (s0 * columns + x) * 4, w = (1 - f) * src[i + 3]; r += src[i] * w; g += src[i + 1] * w; b += src[i + 2] * w; a += w;}
    if(s0 + 1 >= 0 && s0 + 1 < rows) {const i = ((s0 + 1) * columns + x) * 4, w = f * src[i + 3]; r += src[i] * w; g += src[i + 1] * w; b += src[i + 2] * w; a += w;}
    if(a <= 0) continue;
    r /= a; g /= a; b /= a;
    if(shadow) {r *= 1 - shadow; g *= 1 - shadow; b *= 1 - shadow;}
    else if(glint) {r += (255 - r) * glint; g += (255 - g) * glint; b += (255 - b) * glint;}
    const light = keyLight(((ox - left) * spanX + (y - top) * spanY) / diagonal);
    if(light > 0) {r += (255 - r) * light; g += (255 - g) * light; b += (255 - b) * light;}
    else {r *= 1 + light; g *= 1 + light; b *= 1 + light;}
    const o = (y * width + ox) * 4;
    out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = a;
   }
  }
  this.context!.putImageData(frame, 0, 0);
 }
 private drawColumns(t: number) {
  const {columns, rows, scale, left, top} = this, context = this.context!, raster = this.raster!;
  const width = this.canvas.width, height = this.canvas.height;
  context.clearRect(0, 0, width, height);
  context.globalCompositeOperation = 'source-over';
  for(let x = 0; x < columns; x++) context.drawImage(raster, x, 0, 1, rows, left + x, top + clothOffset((x + .5) / scale, t) * scale, 1, rows);
  // Shade only where cloth was painted.
  context.globalCompositeOperation = 'source-atop';
  for(let x = 0; x < columns; x++) {
   const fold = clothShade((x + .5) / scale, t), alpha = Math.round(Math.abs(fold) * (fold > 0 ? FOLD_SHADOW : FOLD_GLINT) * 100) / 100;
   if(!alpha) continue;
   context.fillStyle = fold > 0 ? `rgba(0,0,0,${alpha})` : `rgba(255,255,255,${alpha})`;
   context.fillRect(left + x, 0, 1, height);
  }
  const light = context.createLinearGradient(left, top, left + FLAG_WIDTH * scale, top + FLAG_HEIGHT * scale);
  light.addColorStop(0, `rgba(255,255,255,${KEY_LIGHT})`); light.addColorStop(KEY_NEUTRAL, 'rgba(255,255,255,0)'); light.addColorStop(1, `rgba(0,0,0,${KEY_SHADOW})`);
  context.fillStyle = light; context.fillRect(0, 0, width, height);
  context.globalCompositeOperation = 'source-over';
 }
}

/** A waving banner. The flat artwork (also the accessible/testable SVG source)
 * is rasterized once; the canvas animates it. */
export function ClothFlag({id, name, artKey, children}: {id: string; name: string; artKey: string; children: ReactNode}) {
 const host = useRef<HTMLSpanElement>(null), canvas = useRef<HTMLCanvasElement>(null), source = useRef<SVGSVGElement>(null);
 useLayoutEffect(() => {
  if(!host.current || !canvas.current || !source.current) return;
  const image = new Image();
  image.decoding = 'async';
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(source.current))}`;
  const renderer = new ClothRenderer(host.current, canvas.current, image);
  track(renderer);
  return () => untrack(renderer);
 }, [artKey]);
 return <span ref={host} className="player-flag is-cloth" role="img" aria-label={name}>
  <svg ref={source} className="cloth-source" xmlns="http://www.w3.org/2000/svg" width="90" height="60" viewBox="0 0 90 60" aria-hidden="true">
   <g clipPath={`url(#${id}-clip)`}>{children}</g>
   <rect x=".3" y=".3" width="89.4" height="59.4" fill="none" stroke="#fff" strokeOpacity=".14" strokeWidth=".6"/>
   <path d="M.4 0V60" stroke="#f4e2b4" strokeOpacity=".5" strokeWidth=".7"/>
   <defs><clipPath id={`${id}-clip`}><rect width="90" height="60"/></clipPath></defs>
  </svg>
  <canvas ref={canvas} aria-hidden="true"/>
 </span>;
}
