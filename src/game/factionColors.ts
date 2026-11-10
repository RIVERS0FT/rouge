/** Preserve established colors, then spread additional factions around the hue wheel. */
export const FACTION_COLORS=['#609baa','#bb6e62','#c0a263','#8a91b5'] as const;
export function factionColor(actor:number):string {
  if(!Number.isSafeInteger(actor)||actor<0)return '#929481';
  if(actor<FACTION_COLORS.length)return FACTION_COLORS[actor];
  // Golden-angle spacing avoids cycling through a short fixed palette. Varying
  // lightness also helps distinguish neighboring hues in large multiplayer games.
  const hue=((actor-4)*137.50776405003785+35)%360,saturation=.58,lightness=.52+(actor%3)*.06;
  const chroma=(1-Math.abs(2*lightness-1))*saturation,x=chroma*(1-Math.abs(hue/60%2-1)),m=lightness-chroma/2;
  const rgb=hue<60?[chroma,x,0]:hue<120?[x,chroma,0]:hue<180?[0,chroma,x]:hue<240?[0,x,chroma]:hue<300?[x,0,chroma]:[chroma,0,x];
  return '#'+rgb.map(v=>Math.round((v+m)*255).toString(16).padStart(2,'0')).join('');
}
