import type {ReactNode} from 'react';
import {SAMPLE_BUILDS} from '../game/talentBuilds.ts';
import {STRINGS, type Language} from './i18n.ts';

/** Condition words shared by talent descriptions. Highlighting them (with a
 * definition) lets players see which cards connect, without the game naming builds. */
const KEYWORDS = ['marching', 'assaulting', 'garrisoned', 'capturing', 'recovery', 'territory', 'encircled', 'secondary', 'resting', 'besieged'] as const;
const matchers = new Map<Language, {pattern: RegExp; tips: Map<string, string>}>();
function matcher(language: Language) {
 let found = matchers.get(language);
 if(found) return found;
 const index = language === 'zh' ? 0 : 1, tips = new Map<string, string>();
 for(const id of KEYWORDS) tips.set(STRINGS[`kw.${id}`][index].toLocaleLowerCase(), STRINGS[`kw.${id}.tip`][index]);
 const terms = [...tips.keys()].sort((a, b) => b.length - a.length).map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
 found = {pattern: new RegExp(`(${terms.join('|')})`, 'giu'), tips};
 matchers.set(language, found);
 return found;
}
export function talentDescription(text: string, language: Language): ReactNode[] {
 const {pattern, tips} = matcher(language);
 return text.split(pattern).map((part, index) => index % 2
  ? <span key={index} className="talent-keyword" title={tips.get(part.toLocaleLowerCase())}>{part}</span>
  : part);
}

const CODEX_KEY = 'rouge.talentCodex.v1';
const BUILD_IDS = new Set(SAMPLE_BUILDS.map(build => build.id));
/** Builds this browser has discovered in any campaign. Storage is optional. */
export function loadCodex(): string[] {
 try {
  const value: unknown = JSON.parse(localStorage.getItem(CODEX_KEY) ?? '[]');
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string' && BUILD_IDS.has(id)) : [];
 } catch {return [];}
}
export function saveCodex(ids: readonly string[]): void {
 try {localStorage.setItem(CODEX_KEY, JSON.stringify(ids));} catch {/* The codex still works for this session. */}
}
