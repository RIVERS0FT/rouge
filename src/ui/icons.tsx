import type {SVGProps} from 'react';

/**
 * Original line-art icon set for the HUD. Every glyph is drawn on a 24×24 grid
 * with `currentColor`, so the same icon reads on brass medallions, dark plaques
 * and tooltips without any external font or image request.
 */
export type IconName =
 | 'coin' | 'sabres' | 'territory' | 'rank' | 'crown' | 'laurel' | 'military' | 'globe'
 | 'scroll' | 'search' | 'gear' | 'hourglass' | 'focus' | 'hammer' | 'shield' | 'banner'
 | 'chevron' | 'region' | 'alert' | 'income' | 'march' | 'anchor' | 'close' | 'back' | 'archive';

const PATHS: Record<IconName, JSX.Element> = {
 coin: <>
  <ellipse cx="12" cy="7" rx="7" ry="3"/>
  <path d="M5 7v4c0 1.7 3.1 3 7 3s7-1.3 7-3V7"/>
  <path d="M5 11v4c0 1.7 3.1 3 7 3s7-1.3 7-3v-4"/>
  <path d="M5 15v2.5c0 1.7 3.1 3 7 3s7-1.3 7-3V15"/>
 </>,
 sabres: <>
  <path d="M5 4c3.5 4.5 7 9 11.5 13.5"/>
  <path d="M19 4C15.5 8.5 12 13 7.5 17.5"/>
  <path d="m14.5 19.5 4-4m-13 0 4 4"/>
  <path d="m17 20.5 2 2m-12-2-2 2"/>
 </>,
 territory: <>
  <path d="M3 6.5 8.5 4l7 2.5L21 4v13.5L15.5 20l-7-2.5L3 20Z"/>
  <path d="M8.5 4v13.5m7-11V20"/>
 </>,
 rank: <>
  <path d="m5 9 7-5 7 5"/>
  <path d="m5 14 7-5 7 5"/>
  <path d="m5 19 7-5 7 5"/>
 </>,
 crown: <>
  <path d="m3.5 8 4 4L12 5l4.5 7 4-4-2 10.5h-13Z"/>
  <path d="M6 21h12"/>
 </>,
 laurel: <>
  <path d="M12 21c-5-1.5-8-5.5-8-11.5"/>
  <path d="M12 21c5-1.5 8-5.5 8-11.5"/>
  <path d="M5.5 14.5c1.6 0 2.8.5 3.6 1.6m-5-5.3c1.4.2 2.4.9 3 2m-2-6.3c1 .6 1.6 1.5 1.8 2.8"/>
  <path d="M18.5 14.5c-1.6 0-2.8.5-3.6 1.6m5-5.3c-1.4.2-2.4.9-3 2m2-6.3c-1 .6-1.6 1.5-1.8 2.8"/>
  <circle cx="12" cy="9" r="2.6"/>
 </>,
 military: <>
  <path d="M6 13a6 6 0 0 1 12 0v2H6Z"/>
  <path d="M12 3v4m-3.5-2.5L12 7l3.5-2.5"/>
  <path d="M4 15h16l-1.5 3h-13Z"/>
  <path d="M9 18v3m6-3v3"/>
 </>,
 globe: <>
  <circle cx="12" cy="12" r="8.5"/>
  <path d="M3.5 12h17M12 3.5c2.6 2.4 3.8 5.2 3.8 8.5s-1.2 6.1-3.8 8.5c-2.6-2.4-3.8-5.2-3.8-8.5S9.4 5.9 12 3.5Z"/>
 </>,
 scroll: <>
  <path d="M7 4h11a2 2 0 0 1 0 4h-1v10a2 2 0 0 1-2 2H6a2 2 0 0 1 0-4h1Z"/>
  <path d="M7 16V4.5M10 9h4m-4 3.5h4"/>
 </>,
 search: <>
  <circle cx="10.5" cy="10.5" r="6"/>
  <path d="m15 15 5.5 5.5"/>
 </>,
 gear: <>
  <circle cx="12" cy="12" r="3"/>
  <path d="M12 2.8v2.6m0 13.2v2.6M2.8 12h2.6m13.2 0h2.6M5.5 5.5l1.9 1.9m9.2 9.2 1.9 1.9m0-13-1.9 1.9m-9.2 9.2-1.9 1.9"/>
  <circle cx="12" cy="12" r="6.6"/>
 </>,
 hourglass: <>
  <path d="M6 3h12M6 21h12"/>
  <path d="M7.5 3c0 4.5 4.5 5.5 4.5 9s-4.5 4.5-4.5 9m9-18c0 4.5-4.5 5.5-4.5 9s4.5 4.5 4.5 9"/>
 </>,
 focus: <>
  <circle cx="12" cy="12" r="6.5"/>
  <path d="M12 2.5v4m0 11v4M2.5 12h4m11 0h4"/>
  <circle cx="12" cy="12" r="1.2" fill="currentColor"/>
 </>,
 hammer: <>
  <path d="m14 5 5 5-2.5 2.5-5-5Z"/>
  <path d="m11.5 7.5-8 8a1.8 1.8 0 0 0 2.5 2.5l8-8"/>
  <path d="m15.5 3.5 1.5-1.5 5 5-1.5 1.5"/>
 </>,
 shield: <>
  <path d="M12 3 19.5 6v5.5c0 4.6-3.2 8-7.5 9.5-4.3-1.5-7.5-4.9-7.5-9.5V6Z"/>
  <path d="M12 3v18M4.5 11h15"/>
 </>,
 banner: <>
  <path d="M6 21V3"/>
  <path d="M6 4h12l-3 4 3 4H6"/>
 </>,
 chevron: <path d="m8 10 4 4 4-4"/>,
 region: <>
  <path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11Z"/>
  <circle cx="12" cy="10" r="2.4"/>
 </>,
 alert: <>
  <path d="M12 4v10"/>
  <circle cx="12" cy="19" r="1.1" fill="currentColor"/>
 </>,
 income: <path d="m6 15 6-6 6 6"/>,
 march: <>
  <path d="M4 12h12"/>
  <path d="m12 7 5 5-5 5"/>
  <path d="M20 5v14"/>
 </>,
 anchor: <>
  <circle cx="12" cy="5" r="2"/>
  <path d="M12 7v14M8 10h8"/>
  <path d="M4.5 13.5c0 4 3.4 7.5 7.5 7.5s7.5-3.5 7.5-7.5"/>
 </>,
 close: <path d="m6 6 12 12M18 6 6 18"/>,
 back: <path d="m14.5 6-6 6 6 6"/>,
 archive: <>
  <path d="M4 5h16v4H4Z"/>
  <path d="M5.5 9v10h13V9M10 13h4"/>
 </>,
};

export function Icon({name, size = 20, ...rest}: {name: IconName; size?: number} & SVGProps<SVGSVGElement>) {
 return <svg className={`icon icon-${name}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
  strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...rest}>{PATHS[name]}</svg>;
}
