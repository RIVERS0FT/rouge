import {createElement} from 'react';
import {VERSION} from '../game/content.ts';

/** Non-interactive release label shared by the start menu and settings. */
export function GameVersion({className,testId}: {className: string; testId: string}) {
 return createElement('small',{className,'data-testid':testId},
  createElement('data',{value:VERSION},`v${VERSION}`));
}
