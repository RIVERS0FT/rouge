import assert from 'node:assert/strict';
import test from 'node:test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import pkg from '../package.json' with {type:'json'};
import {VERSION} from '../src/game/content.ts';
import {GameVersion} from '../src/ui/GameVersion.ts';

test('start menu and settings version labels share the package release with readable text and a semantic value',()=>{
 assert.equal(VERSION,pkg.version);
 assert.match(VERSION,/^\d+\.\d+\.\d+$/);
 for(const [className,testId] of [['menu-version','start-menu-version'],['settings-version','game-version']]){
  const badge=renderToStaticMarkup(createElement(GameVersion,{className,testId}));
  assert.equal(badge,`<small class="${className}" data-testid="${testId}"><data value="${pkg.version}">v${pkg.version}</data></small>`);
 }
});
