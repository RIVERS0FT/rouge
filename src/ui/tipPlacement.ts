export type TipPlacement = 'below' | 'above' | 'right' | 'left';
export type TipRect = {top: number; bottom: number; left: number; right: number; width: number; height: number};

/** Keep a tooltip of the given size fully inside the viewport, flipping to the
 * opposite side when the preferred side has no room. */
export function placeTip(anchor: TipRect, size: {width: number; height: number}, viewport: {width: number; height: number}, placement: TipPlacement, gap = 8) {
 const margin = 8, clampX = (x: number) => Math.max(margin, Math.min(x, viewport.width - size.width - margin));
 const clampY = (y: number) => Math.max(margin, Math.min(y, viewport.height - size.height - margin));
 if(placement === 'below' || placement === 'above') {
  const below = anchor.bottom + gap, above = anchor.top - gap - size.height;
  const fitsBelow = below + size.height <= viewport.height - margin, fitsAbove = above >= margin;
  const top = placement === 'below' ? (fitsBelow || !fitsAbove ? below : above) : (fitsAbove || !fitsBelow ? above : below);
  return {top: clampY(top), left: clampX(anchor.left + anchor.width / 2 - size.width / 2)};
 }
 const right = anchor.right + gap, left = anchor.left - gap - size.width;
 const fitsRight = right + size.width <= viewport.width - margin, fitsLeft = left >= margin;
 const x = placement === 'right' ? (fitsRight || !fitsLeft ? right : left) : (fitsLeft || !fitsRight ? left : right);
 return {top: clampY(anchor.top + anchor.height / 2 - size.height / 2), left: clampX(x)};
}
