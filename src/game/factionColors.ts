/** Original, muted political-map inks inspired by nineteenth-century atlases.
 * These are not sampled game assets or historical-country assignments. */
export const NEUTRAL_LAND_COLOR='#b4b0a2';
export const FACTION_COLORS=[
  '#738a99', // slate blue
  '#a47870', // faded brick
  '#aa986f', // old ochre
  '#91829c', // dusty violet
  '#81977d', // sage
  '#a58091', // antique rose
  '#73958f', // faded teal
  '#9a856d', // umber
  '#879ab0', // mist blue
  '#b29481', // terracotta
  '#949b70', // olive
  '#777f8b', // blue grey
] as const;

export function factionColor(actor:number):string {
  if(!Number.isSafeInteger(actor)||actor<0)return NEUTRAL_LAND_COLOR;
  if(actor<FACTION_COLORS.length)return FACTION_COLORS[actor];
  // Keep large rosters in the same ink family, rather than returning to a
  // saturated rainbow. Hue, lightness and saturation all vary deterministically.
  // Hundreds of factions still need their written names/IDs: color alone cannot
  // make an arbitrarily large roster perceptually distinct or color-blind safe.
  const index=actor-FACTION_COLORS.length;
  const hue=(index*137.50776405003785+26)%360;
  const saturation=.20+(Math.floor(index/9)%4)*.035,lightness=.45+(index%5)*.045;
  const chroma=(1-Math.abs(2*lightness-1))*saturation,x=chroma*(1-Math.abs(hue/60%2-1)),m=lightness-chroma/2;
  const rgb=hue<60?[chroma,x,0]:hue<120?[x,chroma,0]:hue<180?[0,chroma,x]:hue<240?[0,x,chroma]:hue<300?[x,0,chroma]:[chroma,0,x];
  return '#'+rgb.map(v=>Math.round((v+m)*255).toString(16).padStart(2,'0')).join('');
}

/** A lighter ink for small names on the dark HUD, separate from large land fills. */
export function factionTextColor(actor:number):string {
  return '#'+factionColor(actor).slice(1).match(/../g)!.map(v=>
    Math.round(parseInt(v,16)*.6+255*.4).toString(16).padStart(2,'0')).join('');
}
