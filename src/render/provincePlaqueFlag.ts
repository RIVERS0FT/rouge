import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import type {Flag} from '../game/flags.ts';
import {FlagImage} from '../ui/Flag.tsx';

export function staticPlaqueFlag(flag:Flag):string {
 const svg=renderToStaticMarkup(createElement(FlagImage,{flag,language:'en',cloth:false}))
  .replace('<svg ','<svg xmlns="http://www.w3.org/2000/svg" ');
 return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
