import type {CommanderAppearance} from '../game/portrait.ts';
import {CommanderImage} from './CommanderAppearance.tsx';
import { memo } from 'react';
import type { Leader } from '../game/types.ts';

/** Original illustrated portraits, bundled locally (no external image requests).
 * Explicit asset URLs let Vite fingerprint each image and respect the Pages base. */
const PORTRAITS: Record<Leader, string> = {
  warden: new URL('../assets/leaders/warden.webp', import.meta.url).href,
  vanguard: new URL('../assets/leaders/vanguard.webp', import.meta.url).href,
  steward: new URL('../assets/leaders/steward.webp', import.meta.url).href,
};
export function preloadPortraits():void{for(const src of Object.values(PORTRAITS)){const image=new Image();image.src=src;}}

export const LeaderBust = memo(function LeaderBust({ leader, label, appearance }: { leader: Leader; label: string; appearance?:CommanderAppearance }) {
  return <CommanderImage className="leader-bust" appearance={appearance} fallback={PORTRAITS[leader]} alt={label} role="img"
    width="720" height="900" draggable={false} decoding="async"
    data-testid="leader-bust" data-leader={leader}/>;
});
